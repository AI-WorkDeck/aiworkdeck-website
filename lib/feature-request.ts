import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { inboxBase } from '@/lib/feedback-inbox';
import { sendNotifyMail } from '@/lib/mail-notify';
import { siteConfig } from '@/lib/site-config';

/**
 * 官网「提交需求」表单的服务端逻辑。
 *
 * 不自建一套需求库：提交直接投进云端反馈收件箱（addin.aiworkdeck.com 的
 * `POST /api/feedback/ingest`，公网开放、配额闸门，与桌面端反馈浮窗同一条管道），
 * 由此自动获得三样东西——优化者每日取件分诊、官网后台「用户反馈」分区可见、
 * 处理回执落在同一条记录上。表单只额外做两件事：给优化者发一封即时通知邮件
 * （收件箱本身是拉模式，邮件补时效），以及在收件箱不可达时本地 JSONL 留底。
 *
 * 环境变量：
 * - AWD_FEATURE_REQUEST_NOTIFY_TO  通知邮件收件人（优化者/维护者邮箱）；不配则跳过邮件
 * - AWD_MAIL_RESEND_KEY / AWD_MAIL_FROM  发信凭据，与邮箱验证码同一套
 * - AWD_FEEDBACK_INBOX_BASE  收件箱地址（复用 lib/feedback-inbox.ts 的读取，默认生产地址）
 */

const FALLBACK_FILE = path.join(process.cwd(), 'data', 'feature-requests-fallback.jsonl');

export const TEXT_MAX = 2000;
export const CONTACT_MAX = 120;

export interface FeatureRequestInput {
  text: string;
  contact: string;
  lang: string;
  ip: string;
}

export type SubmitOutcome =
  | { ok: true; id: number | null }
  | { ok: false; error: 'invalid' | 'quota' };

/** 校验失败返回 null，通过返回修剪后的输入。 */
export function normalizeInput(raw: { text?: unknown; contact?: unknown }): { text: string; contact: string } | null {
  const text = typeof raw.text === 'string' ? raw.text.trim() : '';
  const contact = typeof raw.contact === 'string' ? raw.contact.trim() : '';
  if (text.length < 5 || text.length > TEXT_MAX) return null;
  if (contact.length > CONTACT_MAX) return null;
  return { text, contact };
}

/**
 * 收件箱按 installId 计每日配额（20/天）。官网没有安装概念，用 IP 哈希顶上：
 * 同一 IP 一天最多 20 条，恰好也是这张表单想要的反滥用口径。不存原始 IP。
 */
function installIdFor(ip: string): string {
  return `web-${crypto.createHash('sha256').update(ip).digest('hex').slice(0, 32)}`;
}

async function ingestToInbox(input: FeatureRequestInput): Promise<SubmitOutcome | { ok: false; error: 'unreachable' }> {
  const payload = {
    installId: installIdFor(input.ip),
    clientRef: crypto.randomUUID(),
    kind: 'IDEA',
    text: input.contact ? `${input.text}\n\n[联系方式] ${input.contact}` : input.text,
    page: 'website:feature-request',
    appVersion: `website-${siteConfig.id}`,
    platform: 'WEB',
    contextJson: JSON.stringify({
      source: 'website-feature-request',
      site: siteConfig.id,
      lang: input.lang,
      contact: input.contact || null,
    }),
  };
  const form = new FormData();
  form.append('payload', JSON.stringify(payload));

  let res: Response;
  try {
    res = await fetch(`${inboxBase()}/api/feedback/ingest`, {
      method: 'POST',
      body: form,
      signal: AbortSignal.timeout(10_000),
    });
  } catch (e) {
    console.warn('[feature-request] 收件箱不可达:', e instanceof Error ? e.message : e);
    return { ok: false, error: 'unreachable' };
  }

  if (res.status === 429) return { ok: false, error: 'quota' };
  if (!res.ok) {
    console.warn('[feature-request] 收件箱拒收: status=%s', res.status);
    return { ok: false, error: 'unreachable' };
  }
  try {
    const body = await res.json();
    if (body?.code === 0) return { ok: true, id: typeof body?.data?.id === 'number' ? body.data.id : null };
    // code!=0 是请求内容被判不合法（缺字段/格式），不值得留底重放
    console.warn('[feature-request] 收件箱返回业务错误: %s', body?.message);
    return { ok: false, error: 'invalid' };
  } catch {
    return { ok: false, error: 'unreachable' };
  }
}

/** 收件箱不可达时本地留底，人工回捞口径与 failed-submissions.jsonl 一致。 */
function logFallback(input: FeatureRequestInput): void {
  try {
    fs.mkdirSync(path.dirname(FALLBACK_FILE), { recursive: true });
    fs.appendFileSync(
      FALLBACK_FILE,
      JSON.stringify({
        at: new Date().toISOString(),
        site: siteConfig.id,
        lang: input.lang,
        text: input.text,
        contact: input.contact || null,
      }) + '\n',
    );
  } catch (e) {
    console.error('[feature-request] 本地留底也失败了:', e);
  }
}

/** 即时通知邮件，best-effort：没配收件人/凭据、发送失败都只 warn，不影响提交结果。 */
async function notifyByMail(input: FeatureRequestInput, feedbackId: number | null): Promise<void> {
  const to = (process.env.AWD_FEATURE_REQUEST_NOTIFY_TO || '').trim();
  if (!to) return;

  const adminLink = feedbackId == null
    ? 'https://www.aiworkdeck.com/zh/admin?tab=feedback'
    : `https://www.aiworkdeck.com/zh/admin?tab=feedback&fb=${feedbackId}`;
  const subject = `[官网需求] ${siteConfig.id} 站新提交${feedbackId == null ? '' : ` #${feedbackId}`}`;
  const text =
    `官网需求表单收到一条新提交。\n\n` +
    `内容：\n${input.text}\n\n` +
    `联系方式：${input.contact || '（未留）'}\n` +
    `站点/语言：${siteConfig.id} / ${input.lang}\n\n` +
    `后台查看：${adminLink}\n` +
    (feedbackId == null ? '（云端收件箱当时不可达，这条只在官网 data/feature-requests-fallback.jsonl 留底）\n' : '');

  await sendNotifyMail({ to, subject, text });
}

/**
 * 主入口。收件箱成功或本地留底成功都算提交成功（对用户而言诉求已被记录）；
 * 只有配额触顶与内容不合法向用户报错。
 */
export async function submitFeatureRequest(input: FeatureRequestInput): Promise<SubmitOutcome> {
  const outcome = await ingestToInbox(input);
  if (outcome.ok) {
    await notifyByMail(input, outcome.id);
    return outcome;
  }
  if (outcome.error === 'quota' || outcome.error === 'invalid') return outcome;
  // 收件箱不可达：留底 + 邮件（邮件里注明只在本地留底），仍算成功
  logFallback(input);
  await notifyByMail(input, null);
  return { ok: true, id: null };
}
