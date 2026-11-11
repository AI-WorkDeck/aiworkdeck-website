import { captureServiceFunding } from '@/lib/subscription';
import { NextRequest, NextResponse } from 'next/server';
import { getUserByToken, SESSION_COOKIE } from '@/lib/sessions';
import { getAiConfig } from '@/lib/ai-config';
import { siteConfig } from '@/lib/site-config';
import { resolveAiModel } from '@/lib/ai-models';
import { settleAiUsage } from '@/lib/ai-usage';
import { draftSystemPrompt, parseDraft } from '@/lib/skill-draft-shared';
import { toBaseLocale } from '@/i18n-config';
import { SSE_RESPONSE_INIT, connectOpenRouter, relayOpenRouterStream } from '@/lib/ai-stream';

export const dynamic = 'force-dynamic';

/** 每用户 60 秒内最多 6 次，防止公共站被刷爆密钥额度（单进程内存即可，PM2 单实例） */
const RATE_WINDOW_MS = 60_000;
const RATE_MAX = 6;
const hits = new Map<string, number[]>();

function rateLimited(userId: string): boolean {
  const now = Date.now();
  const list = (hits.get(userId) || []).filter(t => now - t < RATE_WINDOW_MS);
  if (list.length >= RATE_MAX) return true;
  list.push(now);
  hits.set(userId, list);
  return false;
}

export async function POST(request: NextRequest) {
  const user = getUserByToken(request.cookies.get(SESSION_COOKIE)?.value);
  if (!user) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  if (rateLimited(user.id)) {
    return NextResponse.json({ error: 'rate_limited' }, { status: 429 });
  }

  const { apiKey } = getAiConfig();
  if (!apiKey) {
    return NextResponse.json({ error: 'ai_not_configured' }, { status: 503 });
  }

  let brief = '';
  let lang = 'zh';
  let requestedModel: unknown;
  try {
    const body = await request.json();
    brief = String(body.brief || '').trim();
    lang = toBaseLocale(typeof body.lang === 'string' ? body.lang : 'zh');
    requestedModel = body.model;
  } catch {
    return NextResponse.json({ error: 'bad_request' }, { status: 400 });
  }
  if (!brief || brief.length > 1000) {
    return NextResponse.json({ error: 'invalid_brief' }, { status: 400 });
  }
  const model = await resolveAiModel(requestedModel);

  const funding = captureServiceFunding(user.id);
  const upstream = await connectOpenRouter(
    {
      apiKey,
      userId: user.id,
      model: model.id,
      messages: [
        { role: 'system', content: draftSystemPrompt(lang) },
        { role: 'user', content: brief },
      ],
      temperature: 0.7,
      // 深推理模型的 reasoning 也计入 completion tokens，预算得给足，
      // 否则思考就把额度吃光，正文被截断成解析失败
      maxTokens: model.deep ? 12000 : 4000,
      timeoutMs: model.timeoutMs,
      origin: siteConfig.origin,
    },
    'skill-draft'
  );
  // 上游状态在流开始前就已知，限流/区域封禁仍走 JSON 错误响应，用户第一时间看到原因
  if (!upstream.ok) {
    return NextResponse.json({ error: upstream.error }, { status: 502 });
  }

  const stream = relayOpenRouterStream({
    upstream: upstream.res,
    abortUpstream: upstream.abort,
    logTag: 'skill-draft',
    finalize: ({ content, reasoning, usage, completed, send }) => {
      const draft = completed ? parseDraft(content) : null;
      if (draft) {
        send({ type: 'draft', draft });
      } else {
        // 此前这条路径不落日志，pm2 里查无此事，排障只能翻 nginx——必须留现场
        console.error(`[skill-draft] ${completed ? 'bad output' : 'stream interrupted'}`, {
          model: model.id,
          contentChars: content.length,
          reasoningChars: reasoning.length,
          head: content.slice(0, 200),
        });
        send({ type: 'error', error: completed ? 'ai_bad_output' : 'ai_upstream_error' });
      }
      // 成败都记账：失败的轮次也真实花了钱，账要亮给用户
      const bill = upstream.billing ? upstream.billing() : settleAiUsage({
          funding,
        userId: user.id,
        costUsd: Number(usage?.cost) || 0,
        costCny: usage?.cost_currency === 'CNY' ? usage.cost_cny : undefined,
        model: model.id,
        service: 'skill_draft',
      });
      send({ type: 'billing', ...bill });
    },
  });

  return new Response(stream, SSE_RESPONSE_INIT);
}
