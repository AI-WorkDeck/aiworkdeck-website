import { captureServiceFunding } from '@/lib/subscription';
import { NextRequest, NextResponse } from 'next/server';
import { getUserByToken, SESSION_COOKIE } from '@/lib/sessions';
import { getAiConfig } from '@/lib/ai-config';
import { siteConfig } from '@/lib/site-config';
import { resolveAiModel } from '@/lib/ai-models';
import { settleAiUsage } from '@/lib/ai-usage';
import { chatSystemPrompt, extractDraftFromChat, DRAFT_OPEN_MARKER } from '@/lib/skill-draft-shared';
import { toBaseLocale } from '@/i18n-config';
import { SSE_RESPONSE_INIT, connectOpenRouter, relayOpenRouterStream } from '@/lib/ai-stream';
import {
  createChatSession,
  getChatSession,
  listChatSessions,
  saveChatSession,
  countUserTurnsToday,
  MAX_TURNS_PER_SESSION,
  MAX_TURNS_PER_DAY,
  SkillChatMessage,
} from '@/lib/skill-chat-store';

export const dynamic = 'force-dynamic';

/** 与一句话生成同一口径：每用户 60 秒 6 次；对话另有当日总轮数闸（40 轮/天）。 */
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

/** 送上游的历史窗口：只带最近 20 条，防长会话把 prompt 撑爆 */
const HISTORY_WINDOW = 20;

/**
 * 同一会话同时只允许一轮在跑：整存整取的落库模型下，并发写会互相覆盖。
 * 单进程内存锁足够（PM2 单实例，与限流同一前提）。
 */
const busyConversations = new Set<string>();

/** GET：会话列表（暂存的对话从这里找回来） */
export async function GET(request: NextRequest) {
  const user = getUserByToken(request.cookies.get(SESSION_COOKIE)?.value);
  if (!user) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  return NextResponse.json({ conversations: listChatSessions(user.id) });
}

/** POST：发一轮消息，SSE 流式回复；conversationId 缺省时开新会话。 */
export async function POST(request: NextRequest) {
  const user = getUserByToken(request.cookies.get(SESSION_COOKIE)?.value);
  if (!user) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  if (rateLimited(user.id)) {
    return NextResponse.json({ error: 'rate_limited' }, { status: 429 });
  }
  if (countUserTurnsToday(user.id) >= MAX_TURNS_PER_DAY) {
    return NextResponse.json({ error: 'daily_limit' }, { status: 429 });
  }

  const { apiKey } = getAiConfig();
  if (!apiKey) {
    return NextResponse.json({ error: 'ai_not_configured' }, { status: 503 });
  }

  let message = '';
  let lang = 'zh';
  let conversationId = '';
  let requestedModel: unknown;
  try {
    const body = await request.json();
    message = String(body.message || '').trim();
    lang = toBaseLocale(typeof body.lang === 'string' ? body.lang : 'zh');
    conversationId = String(body.conversationId || '');
    requestedModel = body.model;
  } catch {
    return NextResponse.json({ error: 'bad_request' }, { status: 400 });
  }
  if (!message || message.length > 4000) {
    return NextResponse.json({ error: 'invalid_message' }, { status: 400 });
  }
  const model = await resolveAiModel(requestedModel);

  const session = conversationId
    ? getChatSession(user.id, conversationId)
    : createChatSession({
        userId: user.id,
        model: model.id,
        lang,
        // 标题先拿首条消息顶着，前端可改
        title: message.slice(0, 24),
      });
  if (!session) {
    return NextResponse.json({ error: 'not_found' }, { status: 404 });
  }
  const userTurns = session.messages.filter(m => m.role === 'user').length;
  if (userTurns >= MAX_TURNS_PER_SESSION) {
    return NextResponse.json({ error: 'session_limit' }, { status: 400 });
  }
  if (busyConversations.has(session.id)) {
    return NextResponse.json({ error: 'chat_busy' }, { status: 409 });
  }

  // 中途换模型是显式支持的操作：本轮起会话跟随新模型，逐条消息记录各自用的模型
  session.model = model.id;
  const userMsg: SkillChatMessage = {
    role: 'user',
    content: message,
    at: new Date().toISOString(),
  };

  const upstreamMessages = [
    { role: 'system', content: chatSystemPrompt(lang) },
    ...session.messages.slice(-HISTORY_WINDOW).map(m => ({ role: m.role, content: m.content })),
    { role: 'user', content: message },
  ];

  const funding = captureServiceFunding(user.id);
  busyConversations.add(session.id);
  const upstream = await connectOpenRouter(
    {
      apiKey,
      userId: user.id,
      model: model.id,
      messages: upstreamMessages,
      temperature: 0.7,
      maxTokens: model.deep ? 12000 : 4000,
      timeoutMs: model.timeoutMs,
      origin: siteConfig.origin,
    },
    'skill-chat'
  );
  if (!upstream.ok) {
    busyConversations.delete(session.id);
    return NextResponse.json({ error: upstream.error }, { status: 502 });
  }

  const stream = relayOpenRouterStream({
    upstream: upstream.res,
    abortUpstream: upstream.abort,
    logTag: 'skill-chat',
    emitDeltas: true,
    draftOpenMarker: DRAFT_OPEN_MARKER,
    // conversationId 必须开流即达：用户在 done 之前停止时，客户端要靠它续聊，
    // 不然每次停止都会孤儿化一个会话
    preludeEvents: [{ type: 'session', conversationId: session.id, title: session.title }],
    finalize: ({ content, reasoning, usage, completed, send }) => {
      try {
        const draft = extractDraftFromChat(content);
        const bill = upstream.billing ? upstream.billing() : settleAiUsage({
          funding,
          userId: user.id,
          costUsd: Number(usage?.cost) || 0,
        costCny: usage?.cost_currency === 'CNY' ? usage.cost_cny : undefined,
          model: model.id,
          service: 'skill_chat',
          conversationId: session.id,
        });

        // 用户消息与回复一起落库：只存成功往返，半途炸掉的轮次不该占轮数额度。
        // 流被掐断但已有正文时照存——那往往是用户主动停止，聊到的内容不能丢。
        if (content) {
          userMsg.model = model.id;
          session.messages.push(userMsg);
          session.messages.push({
            role: 'assistant',
            content,
            at: new Date().toISOString(),
            model: model.id,
            costCents: bill.costCents,
            charged: bill.charged,
            ...(draft ? { draft } : {}),
          });
          saveChatSession(session);
        } else if (!completed) {
          console.error('[skill-chat] stream interrupted with no content', {
            model: model.id,
            conversationId: session.id,
            reasoningChars: reasoning.length,
          });
          send({ type: 'error', error: 'ai_upstream_error' });
        } else {
          console.error('[skill-chat] empty completion', { model: model.id, conversationId: session.id });
          send({ type: 'error', error: 'ai_bad_output' });
        }

        if (draft) send({ type: 'draft', draft });
        send({ type: 'billing', ...bill });
        send({
          type: 'done',
          conversationId: session.id,
          title: session.title,
          turnsRemainingToday: Math.max(0, MAX_TURNS_PER_DAY - countUserTurnsToday(user.id)),
        });
      } finally {
        busyConversations.delete(session.id);
      }
    },
  });

  return new Response(stream, SSE_RESPONSE_INIT);
}
