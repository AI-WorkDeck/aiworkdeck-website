'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Loader2,
  Square,
  SendHorizonal,
  Plus,
  History,
  Trash2,
  FileCheck2,
  PenLine,
  ChevronDown,
} from 'lucide-react';
import { Locale } from '@/i18n-config';
import { formatSiteAmount } from '@/lib/site-config';
import { slugFromName } from '@/lib/skill-slug';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { ModelSelect, AiModelInfo } from '@/components/skills/ModelSelect';

/**
 * 对话式创建 Skill（投稿页 Tab B，dev-board#293）。
 *
 * 与 Tab A 的一句话生成互补：这里 AI 通过追问把需求聊清楚再产稿。
 * - 对话记录服务端自动暂存（skill_chat_sessions），历史列表可续聊、可删；
 * - 模型逐轮可换；生成中可停止（停止即保存已产出的部分）；
 * - 草稿以卡片出现在对话里，用户确认后直接发布，或转到表单微调；
 * - 每轮消耗明面显示（用户拍板：账要亮出来，哪怕平台承担）。
 */

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  draft?: any;
  costCents?: number;
  charged?: boolean;
  model?: string;
  /** 流式进行中的占位消息 */
  streaming?: boolean;
  /** 被用户手动停止 */
  stopped?: boolean;
}

interface ConversationSummary {
  id: string;
  title: string;
  model: string;
  status: string;
  messageCount: number;
  updatedAt: string;
}

interface SkillChatPaneProps {
  lang: Locale;
  /** dict.submitPage.chat */
  t: any;
  /** dict.submitPage：复用 aiAssist 的错误文案与出境同意条款 */
  tp: any;
  models: AiModelInfo[];
  model: string;
  onModelChange: (id: string) => void;
  crossBorderOk: boolean;
  onCrossBorderChange: (ok: boolean) => void;
  balanceCents: number | null;
  onBalanceChange: (cents: number) => void;
  /** 把草稿填进 Tab A 表单并切过去 */
  onApplyDraft: (draft: any) => void;
}

export function SkillChatPane({
  lang,
  t,
  tp,
  models,
  model,
  onModelChange,
  crossBorderOk,
  onCrossBorderChange,
  balanceCents,
  onBalanceChange,
  onApplyDraft,
}: SkillChatPaneProps) {
  const router = useRouter();
  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [activeId, setActiveId] = useState('');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [phase, setPhase] = useState<'thinking' | 'writing'>('thinking');
  const [phaseChars, setPhaseChars] = useState(0);
  const [elapsed, setElapsed] = useState(0);
  const [error, setError] = useState('');
  const [publishingIdx, setPublishingIdx] = useState(-1);
  const [publishedId, setPublishedId] = useState('');
  const abortRef = useRef<AbortController | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const [slugSuffix] = useState(() => Math.random().toString(36).slice(2, 8));

  const errText = (code: string) => t.errors[code] || tp.aiAssist.errors[code] || tp.aiAssist.errors.generic;

  const loadConversations = async () => {
    try {
      const res = await fetch('/api/ai/skill-chat');
      if (!res.ok) return;
      const data = await res.json();
      setConversations(data.conversations || []);
    } catch {
      /* 列表加载失败不拦着聊天 */
    }
  };

  useEffect(() => {
    loadConversations();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 新消息落地后贴底
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [messages]);

  const openConversation = async (id: string) => {
    setHistoryOpen(false);
    setError('');
    setPublishedId('');
    try {
      const res = await fetch(`/api/ai/skill-chat/${id}`);
      if (!res.ok) {
        setError(errText('generic'));
        return;
      }
      const data = await res.json();
      setActiveId(id);
      setMessages(
        (data.conversation.messages || []).map((m: any) => ({
          role: m.role,
          content: m.content,
          draft: m.draft,
          costCents: m.costCents,
          charged: m.charged,
          model: m.model,
        }))
      );
      if (data.conversation.model && models.some(m => m.id === data.conversation.model)) {
        onModelChange(data.conversation.model);
      }
    } catch {
      setError(errText('generic'));
    }
  };

  const newConversation = () => {
    setHistoryOpen(false);
    setActiveId('');
    setMessages([]);
    setError('');
    setPublishedId('');
  };

  const removeConversation = async (id: string) => {
    try {
      await fetch(`/api/ai/skill-chat/${id}`, { method: 'DELETE' });
    } catch {
      /* 删失败就留着，下次再删 */
    }
    if (id === activeId) newConversation();
    loadConversations();
  };

  const handleStop = () => abortRef.current?.abort();

  const handleSend = async () => {
    const text = input.trim();
    if (!text || sending || !crossBorderOk) return;
    const ac = new AbortController();
    abortRef.current = ac;
    const startedAt = Date.now();
    setSending(true);
    setError('');
    setInput('');
    setPhase('thinking');
    setPhaseChars(0);
    setElapsed(0);
    setMessages(prev => [
      ...prev,
      { role: 'user', content: text, model },
      { role: 'assistant', content: '', streaming: true, model },
    ]);
    const ticker = setInterval(() => setElapsed(Math.floor((Date.now() - startedAt) / 1000)), 1000);

    // 流事件只改最后一条（占位的助手消息）
    const patchLast = (patch: Partial<ChatMessage> | ((m: ChatMessage) => ChatMessage)) => {
      setMessages(prev => {
        const next = [...prev];
        const last = next[next.length - 1];
        if (!last || last.role !== 'assistant') return prev;
        next[next.length - 1] = typeof patch === 'function' ? patch(last) : { ...last, ...patch };
        return next;
      });
    };

    let gotTerminal = false;
    try {
      const res = await fetch('/api/ai/skill-chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ conversationId: activeId || undefined, message: text, model, lang }),
        signal: ac.signal,
      });
      if (!res.ok || !res.headers.get('content-type')?.includes('text/event-stream')) {
        const data = await res.json().catch(() => ({}));
        setError(errText(data.error || 'generic'));
        // 撤掉这轮占位气泡，把输入还给用户
        setMessages(prev => prev.slice(0, -2));
        setInput(text);
        return;
      }
      const reader = res.body!.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const frames = buffer.split('\n\n');
        buffer = frames.pop() || '';
        for (const frame of frames) {
          const line = frame.split('\n').find(l => l.startsWith('data:'));
          if (!line) continue;
          let ev: any;
          try {
            ev = JSON.parse(line.slice(5).trim());
          } catch {
            continue;
          }
          if (ev.type === 'session') {
            // 开流即达：停止/断线后续聊全靠它
            setActiveId(ev.conversationId);
          } else if (ev.type === 'progress') {
            setPhase(ev.phase === 'writing' ? 'writing' : 'thinking');
            setPhaseChars(ev.chars || 0);
          } else if (ev.type === 'delta') {
            patchLast(m => ({ ...m, content: m.content + ev.text }));
          } else if (ev.type === 'draft') {
            patchLast({ draft: ev.draft });
          } else if (ev.type === 'billing') {
            patchLast({ costCents: ev.costCents, charged: ev.charged });
            if (typeof ev.balanceCents === 'number') onBalanceChange(ev.balanceCents);
          } else if (ev.type === 'done') {
            gotTerminal = true;
          } else if (ev.type === 'error') {
            gotTerminal = true;
            setError(errText(ev.error));
          }
        }
      }
      if (!gotTerminal) setError(errText('ai_interrupted'));
    } catch (e: any) {
      if (e?.name === 'AbortError') {
        // 主动停止：已产出的部分服务端照存，界面标注即可
        patchLast({ stopped: true });
      } else {
        setError(errText('generic'));
      }
    } finally {
      clearInterval(ticker);
      abortRef.current = null;
      setSending(false);
      patchLast({ streaming: false });
      // 空回复的占位气泡不留（报错场景已单独处理文案）
      setMessages(prev => {
        const last = prev[prev.length - 1];
        return last && last.role === 'assistant' && !last.content && !last.draft ? prev.slice(0, -1) : prev;
      });
      loadConversations();
    }
  };

  /** 从草稿卡直接发布：走与表单同一个 POST /api/skills，成功后跳详情页 */
  const publishDraft = async (draft: any, idx: number) => {
    if (publishingIdx !== -1) return;
    if (!draft?.name || !draft?.prompt || !draft?.triggers?.length) {
      // 关键字段缺失的草稿只能走表单补齐
      onApplyDraft(draft);
      return;
    }
    setPublishingIdx(idx);
    setError('');
    try {
      const res = await fetch('/api/skills', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: slugFromName(draft.name, slugSuffix),
          name: draft.name,
          description: draft.description,
          category: draft.category || undefined,
          triggers: draft.triggers,
          allowedTools: draft.allowedTools || [],
          output: draft.output || '',
          prompt: draft.prompt,
          priceCents: 0,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(tp.errors[data.error] || tp.errors.generic);
        return;
      }
      if (activeId) {
        // 标记会话已发布；失败不影响主流程
        fetch(`/api/ai/skill-chat/${activeId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ status: 'published' }),
        }).catch(() => {});
      }
      setPublishedId(data.skill.id);
      router.push(`/${lang}/skills/${data.skill.id}`);
      router.refresh();
    } catch {
      setError(tp.errors.generic);
    } finally {
      setPublishingIdx(-1);
    }
  };

  const activeModel = models.find(m => m.id === model);

  return (
    <div className="bg-white border border-neutral-gray-light rounded-2xl shadow-sm flex flex-col overflow-hidden">
      {/* 顶栏：历史会话 / 新对话 / 模型 */}
      <div className="flex flex-wrap items-center gap-2 border-b border-neutral-gray-light px-4 py-2.5">
        <div className="relative">
          <button
            type="button"
            onClick={() => setHistoryOpen(!historyOpen)}
            className="inline-flex items-center gap-1.5 rounded-md border border-neutral-gray-light bg-white px-2.5 py-1.5 text-[13px] text-neutral-gray-dark hover:border-king-forest/40 transition-colors"
          >
            <History className="h-3.5 w-3.5" strokeWidth={1.75} />
            {t.history}
            <ChevronDown className={`h-3.5 w-3.5 transition-transform ${historyOpen ? 'rotate-180' : ''}`} />
          </button>
          {historyOpen && (
            <div className="absolute left-0 top-full z-20 mt-1 w-72 max-h-80 overflow-y-auto rounded-lg border border-neutral-gray-light bg-white py-1 shadow-lg">
              {conversations.length === 0 && (
                <p className="px-3 py-2.5 text-[13px] text-neutral-gray-medium">{t.historyEmpty}</p>
              )}
              {conversations.map(c => (
                <div
                  key={c.id}
                  className={`group flex items-center gap-2 px-3 py-2 text-[13px] hover:bg-neutral-gray-pale cursor-pointer ${c.id === activeId ? 'bg-king-mint-lightest/40' : ''}`}
                  onClick={() => openConversation(c.id)}
                >
                  <span className="flex-1 truncate text-neutral-gray-dark">{c.title}</span>
                  {c.status === 'published' && (
                    <span className="shrink-0 text-[11px] text-king-forest">{t.publishedTag}</span>
                  )}
                  <button
                    type="button"
                    aria-label={t.deleteConversation}
                    onClick={e => {
                      e.stopPropagation();
                      removeConversation(c.id);
                    }}
                    className="shrink-0 opacity-0 group-hover:opacity-100 text-neutral-gray-medium hover:text-red-600 transition-opacity"
                  >
                    <Trash2 className="h-3.5 w-3.5" strokeWidth={1.75} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
        <button
          type="button"
          onClick={newConversation}
          className="inline-flex items-center gap-1.5 rounded-md border border-neutral-gray-light bg-white px-2.5 py-1.5 text-[13px] text-neutral-gray-dark hover:border-king-forest/40 transition-colors"
        >
          <Plus className="h-3.5 w-3.5" strokeWidth={1.75} />
          {t.newConversation}
        </button>
        <span className="ml-auto flex items-center gap-2">
          <ModelSelect
            lang={lang}
            models={models}
            value={model}
            onChange={onModelChange}
            disabled={sending}
            ariaLabel={t.modelLabel}
          />
        </span>
      </div>

      {/* 消息区 */}
      <div ref={scrollRef} className="flex flex-col gap-4 overflow-y-auto px-4 py-5 md:px-6" style={{ minHeight: '20rem', maxHeight: '34rem' }}>
        {messages.length === 0 && (
          <div className="my-8 flex flex-col items-center gap-3 text-center">
            <p className="max-w-md text-sm leading-relaxed text-neutral-gray-medium">{t.intro}</p>
            <div className="flex flex-wrap justify-center gap-2">
              {(t.starters as string[]).map((s, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => setInput(s)}
                  className="rounded-md border border-neutral-gray-light bg-white px-3 py-1.5 text-[13px] text-neutral-gray-dark hover:border-king-forest/40 transition-colors"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}
        {messages.map((m, i) => (
          <div key={i} className={m.role === 'user' ? 'flex justify-end' : 'flex justify-start'}>
            <div className={`max-w-[85%] flex flex-col gap-2 ${m.role === 'user' ? 'items-end' : 'items-start'}`}>
              {(m.content || m.streaming) && (
                <div
                  className={
                    m.role === 'user'
                      ? 'rounded-xl rounded-br-sm bg-king-forest px-4 py-2.5 text-sm leading-relaxed text-white whitespace-pre-wrap'
                      : 'rounded-xl rounded-bl-sm border border-neutral-gray-light bg-neutral-gray-pale/60 px-4 py-2.5 text-sm leading-relaxed text-neutral-gray-dark whitespace-pre-wrap'
                  }
                >
                  {m.content}
                  {m.streaming && !m.content && (
                    <span className="inline-flex items-center gap-2 text-neutral-gray-medium">
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      {(phase === 'writing' ? t.progressWriting : t.progressThinking)
                        .replace('{chars}', String(phaseChars))
                        .replace('{seconds}', String(elapsed))}
                    </span>
                  )}
                </div>
              )}

              {/* 草稿卡：对话的产出物，确认后直接发布或转表单微调 */}
              {m.draft && (
                <div className="w-full rounded-xl border border-king-forest/25 bg-white p-4 shadow-sm">
                  <p className="text-[11px] uppercase tracking-[0.22em] text-king-forest mb-2">{t.draftCard.eyebrow}</p>
                  <p className="font-display font-bold text-neutral-dark-bg">{m.draft.name || '—'}</p>
                  <p className="mt-1 text-sm text-neutral-gray-dark">{m.draft.description}</p>
                  <p className="mt-2 text-xs text-neutral-gray-medium">
                    {t.draftCard.meta
                      .replace('{triggers}', String(m.draft.triggers?.length || 0))
                      .replace('{tools}', String(m.draft.allowedTools?.length || 0))}
                  </p>
                  {m.draft.prompt && (
                    <pre className="mt-3 max-h-40 overflow-y-auto whitespace-pre-wrap rounded-lg bg-neutral-gray-pale/70 p-3 font-mono text-xs leading-relaxed text-neutral-gray-dark">
                      {m.draft.prompt}
                    </pre>
                  )}
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    <Button
                      type="button"
                      size="sm"
                      className="font-bold"
                      disabled={publishingIdx !== -1 || sending}
                      onClick={() => publishDraft(m.draft, i)}
                    >
                      {publishingIdx === i ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <FileCheck2 className="h-3.5 w-3.5" strokeWidth={1.75} />
                      )}
                      {t.draftCard.publish}
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      disabled={publishingIdx !== -1 || sending}
                      onClick={() => onApplyDraft(m.draft)}
                    >
                      <PenLine className="h-3.5 w-3.5" strokeWidth={1.75} />
                      {t.draftCard.refine}
                    </Button>
                    <span className="text-xs text-neutral-gray-medium">{t.draftCard.publishHint}</span>
                  </div>
                </div>
              )}

              {/* 明面账：本轮消耗与承担方，成本可见是口径而不是装饰 */}
              {m.role === 'assistant' && typeof m.costCents === 'number' && m.costCents > 0 && (
                <p className="text-[11px] text-neutral-gray-medium">
                  {(m.charged ? t.billing.charged : t.billing.onHouse).replace(
                    '{amount}',
                    formatSiteAmount(m.costCents)
                  )}
                </p>
              )}
              {m.stopped && <p className="text-[11px] text-neutral-gray-medium">{t.stoppedNote}</p>}
            </div>
          </div>
        ))}
      </div>

      {/* 输入区 */}
      <div className="border-t border-neutral-gray-light px-4 py-3 md:px-6">
        {error && <p className="mb-2 text-sm text-red-600">{error}</p>}
        {publishedId && (
          <p className="mb-2 text-sm text-king-forest">
            {t.publishedNote}{' '}
            <Link href={`/${lang}/skills/${publishedId}`} className="underline underline-offset-4">
              {publishedId}
            </Link>
          </p>
        )}
        <div className="flex items-end gap-2">
          <Textarea
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
                e.preventDefault();
                handleSend();
              }
            }}
            placeholder={t.inputPlaceholder}
            rows={2}
            className="flex-1 resize-none bg-white"
          />
          {sending ? (
            <Button type="button" variant="outline" onClick={handleStop} className="shrink-0">
              <Square className="h-3.5 w-3.5" strokeWidth={1.75} />
              {t.stop}
            </Button>
          ) : (
            <Button
              type="button"
              onClick={handleSend}
              disabled={!input.trim() || !crossBorderOk}
              className="shrink-0 font-bold"
            >
              <SendHorizonal className="h-3.5 w-3.5" strokeWidth={1.75} />
              {t.send}
            </Button>
          )}
        </div>

        {/* 生成中的全局进度（气泡里已有细节，这里给深推理模型的长构思兜底） */}
        {sending && activeModel?.deep && phase === 'thinking' && (
          <p className="mt-2 flex items-center gap-2 text-[13px] text-neutral-gray-medium">
            <Loader2 className="h-3.5 w-3.5 animate-spin text-king-forest" />
            {t.deepThinkingNote.replace('{chars}', String(phaseChars)).replace('{seconds}', String(elapsed))}
          </p>
        )}

        {/* 出境告知与单独同意：与 Tab A 同一份勾选状态，勾一次两边都算数 */}
        <label className="mt-3 flex cursor-pointer items-start gap-2.5">
          <input
            type="checkbox"
            checked={crossBorderOk}
            onChange={e => onCrossBorderChange(e.target.checked)}
            className="mt-0.5 h-4 w-4 flex-shrink-0 accent-king-forest"
          />
          <span className="text-xs leading-relaxed text-neutral-gray-medium">
            {tp.aiAssist.consent}{' '}
            <Link
              href={`/${lang}/legal/privacy#cross-border`}
              target="_blank"
              className="underline underline-offset-2 hover:text-neutral-gray-dark"
            >
              {tp.aiAssist.consentLink}
            </Link>
          </span>
        </label>
        {balanceCents !== null && (
          <p className="mt-2 text-[11px] text-neutral-gray-medium">
            {t.balanceLine.replace('{balance}', formatSiteAmount(balanceCents))}
          </p>
        )}
      </div>
    </div>
  );
}
