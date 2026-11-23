// SPDX-FileCopyrightText: 2026 北京公富信息技术有限公司 and AI WorkDeck contributors
// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * 发信通道：验证码邮件（mail-auth）与通知邮件（mail-notify）共用的一处「把一封信发出去」。
 *
 * 两个通道，按 env 选：
 * - 默认 Resend（`AWD_MAIL_RESEND_KEY`）。
 * - `AWD_MAIL_PROVIDER=aliyun-dm`：阿里云邮件推送 DirectMail 的 SingleSendMail
 *   （`AWD_MAIL_DM_ACCESS_KEY_ID` / `AWD_MAIL_DM_ACCESS_KEY_SECRET`，可选 `AWD_MAIL_DM_REGION`，默认 cn-hangzhou）。
 *   给另起一个发信域的部署用（例如贴牌站点），Resend 免费档只能挂一个域名。
 * 两者都用 `AWD_MAIL_FROM`（`名称 <地址>` 或纯地址）。
 *
 * 和 mail-auth 原来的取舍一致：不引 SDK、不走 SMTP，一次 HTTPS 调用；签名自己算（RPC 签名 v1，HMAC-SHA1）。
 * 失败只回分类，原始响应只进日志——里面有发信域与内部错误码。
 */
import crypto from 'node:crypto';

export interface OutgoingMail {
  to: string;
  subject: string;
  text: string;
  html?: string;
}

export type MailSendResult =
  | { ok: true }
  | { ok: false; kind: 'unreachable' | 'bad-address' | 'rate-limited' | 'rejected' };

const RESEND_ENDPOINT = 'https://api.resend.com/emails';

/** 阿里云各地域的 DirectMail 接入点。 */
const DM_ENDPOINTS: Record<string, string> = {
  'cn-hangzhou': 'https://dm.aliyuncs.com/',
  'ap-southeast-1': 'https://dm.ap-southeast-1.aliyuncs.com/',
  'ap-southeast-2': 'https://dm.ap-southeast-2.aliyuncs.com/',
};

function provider(): 'resend' | 'aliyun-dm' {
  return (process.env.AWD_MAIL_PROVIDER || '').trim() === 'aliyun-dm' ? 'aliyun-dm' : 'resend';
}

function from(): string {
  return (process.env.AWD_MAIL_FROM || '').trim();
}

/** 本部署是否配好了发信（通道密钥 + 发件人）。 */
export function mailTransportConfigured(): boolean {
  if (!from()) return false;
  if (provider() === 'aliyun-dm') {
    return !!(process.env.AWD_MAIL_DM_ACCESS_KEY_ID && process.env.AWD_MAIL_DM_ACCESS_KEY_SECRET);
  }
  return !!process.env.AWD_MAIL_RESEND_KEY;
}

/** `Example <no-reply@x>` → 名称与地址；纯地址时名称为空。 */
export function parseFrom(value: string): { alias: string; address: string } {
  const m = /^\s*(.*?)\s*<([^>]+)>\s*$/.exec(value);
  if (m) return { alias: m[1].replace(/^"|"$/g, ''), address: m[2].trim() };
  return { alias: '', address: value.trim() };
}

/** 阿里云 RPC 签名要的 RFC 3986 编码（encodeURIComponent 不编 !'()*）。 */
function percentEncode(s: string): string {
  return encodeURIComponent(s).replace(/[!'()*]/g, (c) => '%' + c.charCodeAt(0).toString(16).toUpperCase());
}

/** 阿里云 RPC 签名 v1：对排序后的参数串签 HMAC-SHA1，返回带 Signature 的完整参数。 */
export function signAliyunRpc(params: Record<string, string>, secret: string, method = 'POST'): Record<string, string> {
  const canonical = Object.keys(params)
    .sort()
    .map((k) => `${percentEncode(k)}=${percentEncode(params[k])}`)
    .join('&');
  const toSign = `${method}&${percentEncode('/')}&${percentEncode(canonical)}`;
  const signature = crypto.createHmac('sha1', `${secret}&`).update(toSign).digest('base64');
  return { ...params, Signature: signature };
}

async function sendViaResend(mail: OutgoingMail): Promise<MailSendResult> {
  let status: number;
  let body: string;
  try {
    const res = await fetch(RESEND_ENDPOINT, {
      method: 'POST',
      headers: { Authorization: `Bearer ${process.env.AWD_MAIL_RESEND_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: from(), to: [mail.to], subject: mail.subject, text: mail.text, ...(mail.html ? { html: mail.html } : {}),
      }),
      signal: AbortSignal.timeout(10_000),
    });
    status = res.status;
    body = await res.text();
  } catch (e) {
    console.warn('[mail] Resend 不可达:', e instanceof Error ? e.message : e);
    return { ok: false, kind: 'unreachable' };
  }
  if (status >= 200 && status < 300) return { ok: true };
  console.warn('[mail] Resend 拒绝: status=%s body=%s', status, body.slice(0, 300));
  // 422 是 Resend 对收件地址本身的拒绝（无效地址/被压制）；429 是我们这边打太快
  if (status === 422) return { ok: false, kind: 'bad-address' };
  if (status === 429) return { ok: false, kind: 'rate-limited' };
  return { ok: false, kind: 'rejected' };
}

async function sendViaDirectMail(mail: OutgoingMail): Promise<MailSendResult> {
  const region = (process.env.AWD_MAIL_DM_REGION || 'cn-hangzhou').trim();
  const endpoint = DM_ENDPOINTS[region];
  if (!endpoint) {
    console.warn('[mail] DirectMail 不支持的地域: %s', region);
    return { ok: false, kind: 'rejected' };
  }
  const { alias, address } = parseFrom(from());
  const params: Record<string, string> = {
    Action: 'SingleSendMail',
    Version: '2015-11-23',
    Format: 'JSON',
    RegionId: region,
    AccessKeyId: process.env.AWD_MAIL_DM_ACCESS_KEY_ID || '',
    SignatureMethod: 'HMAC-SHA1',
    SignatureVersion: '1.0',
    SignatureNonce: crypto.randomUUID(),
    Timestamp: new Date().toISOString().replace(/\.\d{3}Z$/, 'Z'),
    AccountName: address,
    AddressType: '1',
    // 用发信地址上配置的回信地址（控制台 / CreateMailAddress 的 ReplyAddress）
    ReplyToAddress: 'true',
    ToAddress: mail.to,
    Subject: mail.subject,
    TextBody: mail.text,
    ...(mail.html ? { HtmlBody: mail.html } : {}),
    ...(alias ? { FromAlias: alias } : {}),
  };
  const signed = signAliyunRpc(params, process.env.AWD_MAIL_DM_ACCESS_KEY_SECRET || '');
  let status: number;
  let body: string;
  try {
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams(signed).toString(),
      signal: AbortSignal.timeout(10_000),
    });
    status = res.status;
    body = await res.text();
  } catch (e) {
    console.warn('[mail] DirectMail 不可达:', e instanceof Error ? e.message : e);
    return { ok: false, kind: 'unreachable' };
  }
  if (status >= 200 && status < 300) return { ok: true };
  console.warn('[mail] DirectMail 拒绝: status=%s body=%s', status, body.slice(0, 300));
  let code = '';
  try { code = String(JSON.parse(body).Code || ''); } catch { /* 非 JSON 响应 */ }
  if (/ToAddress|InvalidMailAddress|InvalidReceiver/i.test(code)) return { ok: false, kind: 'bad-address' };
  if (/Throttling|QuotaExceed|OutOfQuota/i.test(code)) return { ok: false, kind: 'rate-limited' };
  return { ok: false, kind: 'rejected' };
}

/** 发一封信。未配置时回 rejected（调用方应先看 {@link mailTransportConfigured}）。 */
export async function sendTransactionalMail(mail: OutgoingMail): Promise<MailSendResult> {
  if (!mailTransportConfigured()) return { ok: false, kind: 'rejected' };
  return provider() === 'aliyun-dm' ? sendViaDirectMail(mail) : sendViaResend(mail);
}
