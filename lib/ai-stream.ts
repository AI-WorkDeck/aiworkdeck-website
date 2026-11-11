import { postpaidPolicy,POSTPAID_VERSION } from './postpaid';
import { platformProvider } from './platform-ai/config';
import { connectBailianSkill } from './platform-ai/skill';
import type { AiUsageSettleResult } from './ai-usage';
/**
 * 官网 AI 生成的流式 Harness（对齐桌面端 harness 的四件套：重试 / 心跳 / 看门狗 / 错误显性化）。
 *
 * Skill 帮写与对话式创建两条路由共用。要点：
 * - **连接重试**：北京出口连 openrouter.ai 偶发 TCP 超时（2026-08-30 实测撞到），
 *   网络层失败自动重试一次；HTTP 层错误（429/403）不重试，原样报给用户。
 * - **心跳**：10s 一帧 progress。深推理模型构思期可以几十秒不吐正文，
 *   没有心跳 nginx 会按读超时掐流（2026-08-17 的 504 就是这么来的）。
 * - **停滞看门狗**：上游 90s 没有任何字节（连 reasoning 都没有）判定挂死，
 *   主动报错收流，不让用户干等到总超时。
 * - **构思/产出分相**：推理模型先吐 reasoning 再落笔。进度事件带 phase，
 *   构思期报 reasoning 字数——「no output yet 挂 66 秒」的观感问题即源于只数正文。
 * - **错误必落日志**：此前 ai_bad_output / 流中断不打日志，pm2 里一条不留，
 *   排障只能翻 nginx。现在所有失败路径都带 logTag 落 console.error。
 *
 * 事件协议（两条路由一致）：
 *   {type:'progress', phase:'thinking'|'writing', chars, elapsedMs}
 *   {type:'delta', text}                        仅对话路由：正文增量
 *   {type:'draft', draft}                       解析出的 Skill 草稿
 *   {type:'billing', costCents, charged, balanceCents}
 *   {type:'done', ...}                          对话路由的收尾信息
 *   {type:'error', error}
 */

const HEARTBEAT_MS = 10_000;
const STALL_MS = 90_000;
/** 网络层重试前的退避 */
const RETRY_DELAY_MS = 1_000;

export const SSE_RESPONSE_INIT: ResponseInit = {
  headers: {
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    // nginx 默认 proxy_buffering 会把整条 SSE 攒到最后一起吐，进度与保活全部失效
    'X-Accel-Buffering': 'no',
  },
};

export interface UpstreamRequest {
  apiKey: string;
  userId?: string;
  model: string;
  messages: Array<{ role: string; content: string }>;
  maxTokens: number;
  temperature: number;
  timeoutMs: number;
  origin: string;
}

export type UpstreamResult =
  | { ok: true; res: Response; abort: () => void; billing?: () => AiUsageSettleResult }
  | { ok: false; error: 'ai_busy' | 'ai_upstream_error' | 'ai_usage_pending'; status?: number; detail?: string };

/**
 * 连上游并处理好两类失败：网络层（重试一次）与 HTTP 层（映射成用户可读错误码）。
 * 上游状态在流开始前已知，429/403 让调用方走 JSON 错误响应，不塞进流里。
 */
export async function connectOpenRouter(req: UpstreamRequest, logTag: string): Promise<UpstreamResult> {
  if(req.userId&&postpaidPolicy(req.userId)?.version===POSTPAID_VERSION) {
    const {connectPostpaidSkill}=await import('./platform-ai/postpaid-skill');
    return connectPostpaidSkill(req,platformProvider()!=='bailian');
  }
  if (platformProvider() === 'bailian') return connectBailianSkill(req,logTag);
  const body = JSON.stringify({
    model: req.model,
    messages: req.messages,
    temperature: req.temperature,
    max_tokens: req.maxTokens,
    stream: true,
    // 最后一块随流带回真实成本，明面记账靠它
    usage: { include: true },
  });
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), req.timeoutMs);

  const attempt = () =>
    fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${req.apiKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': req.origin,
        'X-Title': 'AI WorkDeck Skill Plaza',
      },
      body,
      signal: ac.signal,
    });

  let res: Response;
  try {
    res = await attempt();
  } catch (e) {
    if (ac.signal.aborted) {
      clearTimeout(timer);
      console.error(`[${logTag}] upstream connect timed out`);
      return { ok: false, error: 'ai_upstream_error' };
    }
    // 网络层失败（北京出口偶发 TCP 超时）：退避 1s 重试一次
    console.error(`[${logTag}] upstream connect failed, retrying once`, e);
    await new Promise(r => setTimeout(r, RETRY_DELAY_MS));
    try {
      res = await attempt();
    } catch (e2) {
      clearTimeout(timer);
      console.error(`[${logTag}] upstream connect failed after retry`, e2);
      return { ok: false, error: 'ai_upstream_error' };
    }
  }

  if (!res.ok || !res.body) {
    clearTimeout(timer);
    const detail = await res.text().catch(() => '');
    console.error(`[${logTag}] openrouter error`, res.status, detail.slice(0, 500));
    return {
      ok: false,
      error: res.status === 429 ? 'ai_busy' : 'ai_upstream_error',
      status: res.status,
      detail: detail.slice(0, 200),
    };
  }
  // 计时器此后守的是整条流：读挂起时由看门狗先动手，这里的总时限是最后防线
  return { ok: true, res, abort: () => { clearTimeout(timer); ac.abort(); } };
}

export interface RelayContext {
  /** 模型正文全文（对话回复 / 草稿 JSON） */
  content: string;
  /** 推理全文（只统计不外发） */
  reasoning: string;
  /** OpenRouter usage（含 cost），上游没给则为 null */
  usage: any | null;
  /** 是否正常读到上游流末尾（false=看门狗/异常收场，终局事件已由 harness 发过 error） */
  completed: boolean;
  send: (payload: unknown) => void;
}

export interface RelayOptions {
  upstream: Response;
  /** 撤单钩子：客户端断开或看门狗触发时掐掉上游 fetch */
  abortUpstream: () => void;
  logTag: string;
  /** 对话路由 true：把正文增量转发给客户端（草稿标记块除外） */
  emitDeltas?: boolean;
  /**
   * 草稿标记：正文里出现 openMarker 后的内容不再作为 delta 外发（草稿 JSON 不该
   * 以原文形式闪现在聊天气泡里），但仍然累积进 content 供 finalize 解析。
   */
  draftOpenMarker?: string;
  /** 终局：解析草稿、记账、落库、发 done——全部在这里做，抛错会被兜住并报 error 事件 */
  finalize: (ctx: RelayContext) => void | Promise<void>;
  /**
   * 开流即发的事件（在首帧 progress 之前）。对话路由用它把 conversationId 第一时间
   * 交给客户端——不然用户在收到 done 前停止，新会话的 id 就丢了，续聊会开出第二个会话。
   */
  preludeEvents?: unknown[];
}

/** 把 OpenRouter 的 SSE 转成本站事件流，带心跳与停滞看门狗。 */
export function relayOpenRouterStream(opts: RelayOptions): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  const decoder = new TextDecoder();
  const startedAt = Date.now();
  let content = '';
  let reasoning = '';
  let usage: any | null = null;
  let lastByteAt = Date.now();
  let closed = false;
  // 草稿标记的截流状态：suppress 后不再外发 delta；pending 是防标记跨块劈开的回看缓冲
  let suppressDeltas = false;
  let pendingDelta = '';
  const marker = opts.draftOpenMarker || '';

  return new ReadableStream({
    async start(controller) {
      const send = (payload: unknown) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(payload)}\n\n`));
        } catch {
          closed = true; // 客户端已断开
        }
      };
      const progress = () => {
        const phase = content.length > 0 ? 'writing' : 'thinking';
        send({
          type: 'progress',
          phase,
          chars: phase === 'writing' ? content.length : reasoning.length,
          elapsedMs: Date.now() - startedAt,
        });
      };
      const flushDelta = (text: string) => {
        if (!opts.emitDeltas || suppressDeltas || !text) return;
        pendingDelta += text;
        if (marker) {
          const idx = pendingDelta.indexOf(marker);
          if (idx !== -1) {
            const visible = pendingDelta.slice(0, idx);
            if (visible) send({ type: 'delta', text: visible });
            suppressDeltas = true;
            pendingDelta = '';
            return;
          }
          // 留住可能是半个标记的尾巴，其余外发
          const hold = Math.min(marker.length - 1, pendingDelta.length);
          const cut = pendingDelta.length - hold;
          // 尾巴里若不含标记首字符则整段放行，避免正常文本被无谓扣住
          const tail = pendingDelta.slice(cut);
          const safeCut = tail.includes(marker[0]!)
            ? cut + tail.indexOf(marker[0]!)
            : pendingDelta.length;
          if (safeCut > 0) {
            send({ type: 'delta', text: pendingDelta.slice(0, safeCut) });
            pendingDelta = pendingDelta.slice(safeCut);
          }
        } else {
          send({ type: 'delta', text: pendingDelta });
          pendingDelta = '';
        }
      };

      for (const ev of opts.preludeEvents || []) send(ev);
      // 立刻发一帧：首字节落地后 nginx 的读超时才按「块间隔」计算
      progress();
      const heartbeat = setInterval(progress, HEARTBEAT_MS);
      const watchdog = setInterval(() => {
        if (Date.now() - lastByteAt > STALL_MS) {
          console.error(`[${opts.logTag}] upstream stalled ${STALL_MS}ms, aborting`);
          opts.abortUpstream();
        }
      }, 5_000);

      const reader = opts.upstream.body!.getReader();
      let buffer = '';
      let completed = false;
      try {
        for (;;) {
          const { done, value } = await reader.read();
          if (done) {
            completed = true;
            break;
          }
          lastByteAt = Date.now();
          buffer += decoder.decode(value, { stream: true });
          const frames = buffer.split('\n\n');
          buffer = frames.pop() || '';
          let gotText = false;
          for (const frame of frames) {
            for (const line of frame.split('\n')) {
              if (!line.startsWith('data:')) continue; // ": OPENROUTER PROCESSING" 保活注释
              const data = line.slice(5).trim();
              if (!data || data === '[DONE]') continue;
              try {
                const parsed = JSON.parse(data);
                if(parsed?.error){send({type:'error',error:parsed.error.code==='usage_pending'?'ai_usage_pending':'ai_upstream_error'});continue;}
                const delta = parsed?.choices?.[0]?.delta;
                if (delta?.reasoning) reasoning += delta.reasoning;
                if (delta?.content) {
                  content += delta.content;
                  flushDelta(delta.content);
                  gotText = true;
                }
                if (parsed?.usage) usage = parsed.usage;
              } catch {
                /* 半帧或非 JSON，跳过 */
              }
            }
          }
          if (gotText || content.length === 0) progress();
        }
      } catch (e) {
        // 看门狗 abort 也走到这里；completed 保持 false
        console.error(`[${opts.logTag}] stream read failed`, e);
      } finally {
        clearInterval(heartbeat);
        clearInterval(watchdog);
        reader.releaseLock();
      }

      // 截流缓冲里没等到标记的余文补发出去
      if (!suppressDeltas && pendingDelta) {
        send({ type: 'delta', text: pendingDelta });
        pendingDelta = '';
      }

      try {
        await opts.finalize({ content, reasoning, usage, completed, send });
      } catch (e) {
        console.error(`[${opts.logTag}] finalize failed`, e);
        send({ type: 'error', error: e instanceof Error&&e.message==='usage_pending'?'ai_usage_pending':'ai_upstream_error' });
      }
      closed = true;
      try {
        controller.close();
      } catch {
        /* 客户端断开时 controller 可能已经关了 */
      }
    },
    cancel() {
      // 客户端断开（停止按钮/关页）：掐掉上游，别让平台继续为没人看的 token 付钱
      closed = true;
      opts.abortUpstream();
    },
  });
}
