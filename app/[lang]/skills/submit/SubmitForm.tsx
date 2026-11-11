'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Sparkles, Lightbulb, ChevronDown, FileSearch, PenLine, ListChecks, Settings2, Loader2, History, MessagesSquare, ClipboardList } from 'lucide-react';
import { pickLocale, type Locale } from '@/i18n-config';
import { SkillEntry } from '@/lib/skills-store';
import { SKILL_ID_RE } from '@/lib/skill-id';
import { SKILL_CATEGORIES } from '@/lib/skill-categories';
import { SKILL_TEMPLATES, getSkillTemplates } from '@/lib/skill-templates';
import { DEFAULT_TOOL_GROUPS, toolsOfGroups } from '@/lib/skill-tools';
import { siteConfig, formatSiteAmount } from '@/lib/site-config';
import { slugFromName } from '@/lib/skill-slug';
import { ToolPicker } from '@/components/skills/ToolPicker';
import { TriggerInput } from '@/components/skills/TriggerInput';
import { ModelSelect, AiModelInfo } from '@/components/skills/ModelSelect';
import { SkillChatPane } from '@/components/skills/SkillChatPane';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { FormNotice } from '@/components/ui/notice';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';

interface SubmitFormProps {
    lang: Locale;
    dict: any;
    initial?: SkillEntry;
}

const TEMPLATE_ICONS = { 'doc-review': FileSearch, 'doc-draft': PenLine, checklist: ListChecks } as const;

/**
 * 未提交草稿的存档键。整张表单序列化成一条，够用——同时写两篇 Skill 不是真实场景，
 * 而按用户分键要先知道用户是谁（这个组件不知道），换来的只是多一条陈旧数据。
 * 版本后缀是给字段增删留的退路：形状变了就换键，别去解析旧结构。
 */
const DRAFT_KEY = 'awd:skill-draft:v1';

interface SkillDraft {
    id: string;
    idTouched: boolean;
    name: string;
    description: string;
    category: string;
    triggers: string[];
    allowedTools: string[];
    output: string;
    prompt: string;
    priceYuan: string;
}

/**
 * 这份草稿值得打断用户吗。
 *
 * 只看人写出来的东西——`allowedTools` 有预置默认值、`priceYuan` 默认 '0'，
 * 拿它们当「动过」的信号会让每个打开过投稿页的人都被问一次要不要恢复空白。
 */
function draftHasContent(d: SkillDraft): boolean {
    return !!(
        d.name?.trim() ||
        d.description?.trim() ||
        d.prompt?.trim() ||
        d.output?.trim() ||
        d.category ||
        d.triggers?.length
    );
}

/** 编号小节标题：把一张长表单读成「四步」，而不是十个并列的空框。 */
function Step({ n, title, hint, children }: { n: number; title: string; hint?: string; children: React.ReactNode }) {
    return (
        <section className="flex flex-col gap-3">
            <div className="flex items-baseline gap-2.5">
                <span className="w-6 h-6 flex-shrink-0 self-center rounded-full bg-king-forest text-white text-xs font-bold flex items-center justify-center">
                    {n}
                </span>
                <h2 className="font-semibold text-neutral-dark-bg">{title}</h2>
                {hint && <span className="text-xs text-neutral-gray-medium">{hint}</span>}
            </div>
            <div className="pl-0 sm:pl-9 flex flex-col gap-4">{children}</div>
        </section>
    );
}

export function SubmitForm({ lang, dict, initial }: SubmitFormProps) {
    const t = dict.submitPage;
    const router = useRouter();
    const isEdit = !!initial;

    const [id, setId] = useState(initial?.id || '');
    const [idTouched, setIdTouched] = useState(false);
    // 后缀在组件生命周期内固定，避免自动生成的 ID 随输入抖动
    const [slugSuffix] = useState(() => Math.random().toString(36).slice(2, 8));
    const [name, setName] = useState(initial?.name || '');
    const [description, setDescription] = useState(initial?.description || '');
    const [category, setCategory] = useState(initial?.category || '');
    const [triggers, setTriggers] = useState<string[]>(initial?.triggers || []);
    // 新投稿预置默认能力：留空不是「不限制」，而是只剩三个基础工具（见 lib/skill-tools.ts）
    const [allowedTools, setAllowedTools] = useState<string[]>(
        initial?.allowedTools ?? toolsOfGroups(DEFAULT_TOOL_GROUPS)
    );
    const [output, setOutput] = useState(initial?.output || '');
    const [prompt, setPrompt] = useState(initial?.prompt || '');
    // 本站是否接受付费投稿。不接受时整个定价字段不渲染，新条目按 0（免费）提交；
    // 编辑既有条目时沿用它原来的标价，不做静默改价。
    const paidAllowed = siteConfig.allowPaidSubmissions;
    // 价格以本币整数单位展示，提交时转最小单位；0 = 免费
    const [priceYuan, setPriceYuan] = useState(
        initial?.priceCents ? (initial.priceCents / 100).toFixed(2).replace(/\.?0+$/, '') : '0'
    );
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState('');
    const [tipsOpen, setTipsOpen] = useState(false);
    const [advancedOpen, setAdvancedOpen] = useState(false);

    // 创建方式两个 Tab：form=四步表单（含一句话生成），chat=对话式创建
    const [activeTab, setActiveTab] = useState<'form' | 'chat'>('form');

    // AI 辅助
    const [brief, setBrief] = useState('');
    // 跨境单独同意（个保法第三十九条）：这段输入会经我们的服务器转发给美国的 OpenRouter。
    // 绝不初始化为 true——预勾选的同意无效。两个 Tab 共用一份勾选状态。
    const [crossBorderOk, setCrossBorderOk] = useState(false);
    const [generating, setGenerating] = useState(false);
    const [aiError, setAiError] = useState('');
    const [aiDone, setAiDone] = useState(false);
    // 进度：已生成字数与已用秒数。慢模型下没有这两个数，界面和卡死没有区别。
    // phase 区分构思期（深推理模型先吐 reasoning）与产出期，两相字数分开报。
    const [aiChars, setAiChars] = useState(0);
    const [aiElapsed, setAiElapsed] = useState(0);
    const [aiPhase, setAiPhase] = useState<'thinking' | 'writing'>('thinking');
    // 明面账：上一轮生成的折算成本与承担方（用户拍板：成本要亮出来）
    const [aiBill, setAiBill] = useState<{ costCents: number; charged: boolean } | null>(null);
    const abortRef = useRef<AbortController | null>(null);

    // 模型菜单（按站点出数据）：真实模型名 + 速度标注，kimi-k3 这类深推理模型单独标注
    const [aiModels, setAiModels] = useState<AiModelInfo[]>([]);
    const [aiModel, setAiModel] = useState('');
    const [balanceCents, setBalanceCents] = useState<number | null>(null);

    useEffect(() => {
        if (isEdit) return;
        fetch('/api/ai/skill-models')
            .then(res => (res.ok ? res.json() : null))
            .then(data => {
                if (!data) return;
                setAiModels(data.models || []);
                setAiModel(data.defaultModel || '');
                if (typeof data.balanceCents === 'number') setBalanceCents(data.balanceCents);
            })
            .catch(() => {
                /* 菜单加载失败不拦生成：服务端会落回默认模型 */
            });
    }, [isEdit]);

    // ---- 未提交草稿 ----
    // 只对新投稿生效：编辑模式下表单里装的是那条 Skill 的真身，拿一份来路不明的
    // 本地草稿去盖掉它是数据事故，不是便利。
    const [draftFound, setDraftFound] = useState<SkillDraft | null>(null);
    // 存档要等「恢复还是丢弃」有了答案才开闸——否则挂载时的空表单会先把草稿写没
    const [draftArmed, setDraftArmed] = useState(false);

    const clearDraft = () => {
        try {
            window.localStorage.removeItem(DRAFT_KEY);
        } catch {
            // 隐私模式下 localStorage 会抛，忽略即可
        }
    };

    useEffect(() => {
        if (isEdit) return;
        let parsed: SkillDraft | null = null;
        try {
            const raw = window.localStorage.getItem(DRAFT_KEY);
            if (raw) parsed = JSON.parse(raw);
        } catch {
            // 隐私模式禁用存储，或存档是坏 JSON：当作没有草稿
            parsed = null;
        }
        if (parsed && draftHasContent(parsed)) setDraftFound(parsed);
        else setDraftArmed(true);
        // 只在挂载时判一次
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    useEffect(() => {
        if (isEdit || !draftArmed) return;
        const timer = setTimeout(() => {
            const draft: SkillDraft = {
                id, idTouched, name, description, category, triggers, allowedTools, output, prompt, priceYuan,
            };
            try {
                window.localStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
            } catch {
                // 配额满或隐私模式：草稿是锦上添花，失败不该惊动正在写东西的人
            }
        }, 800);
        return () => clearTimeout(timer);
    }, [isEdit, draftArmed, id, idTouched, name, description, category, triggers, allowedTools, output, prompt, priceYuan]);

    const restoreDraft = () => {
        const d = draftFound;
        if (!d) return;
        setId(d.id || '');
        setIdTouched(!!d.idTouched);
        setName(d.name || '');
        setDescription(d.description || '');
        setCategory(d.category || '');
        setTriggers(d.triggers || []);
        // 空数组不是「没选工具」而是旧草稿缺字段，落回当前默认更安全
        if (d.allowedTools?.length) setAllowedTools(d.allowedTools);
        setOutput(d.output || '');
        setPrompt(d.prompt || '');
        setPriceYuan(d.priceYuan ?? '0');
        setDraftFound(null);
        setDraftArmed(true);
    };

    const discardDraft = () => {
        clearDraft();
        setDraftFound(null);
        setDraftArmed(true);
    };

    const applyTemplate = (key: string) => {
        const tpl = getSkillTemplates(lang).find(x => x.key === key);
        if (!tpl) return;
        setCategory(tpl.fill.category);
        setTriggers(tpl.fill.triggers);
        setAllowedTools(toolsOfGroups(tpl.fill.toolGroups));
        setOutput(tpl.fill.output);
        setPrompt(tpl.fill.prompt);
    };

    const applyDraft = (d: any) => {
        if (d.name) {
            setName(d.name);
            if (!isEdit && !idTouched) setId(slugFromName(d.name, slugSuffix));
        }
        if (d.description) setDescription(d.description);
        if (d.category) setCategory(d.category);
        if (d.triggers?.length) setTriggers(d.triggers);
        if (d.allowedTools?.length) setAllowedTools(d.allowedTools);
        if (d.output) setOutput(d.output);
        if (d.prompt) setPrompt(d.prompt);
        setAiDone(true);
    };

    const handleCancel = () => abortRef.current?.abort();

    const handleGenerate = async () => {
        if (!brief.trim() || generating || !crossBorderOk) return;
        const ac = new AbortController();
        abortRef.current = ac;
        const startedAt = Date.now();
        setGenerating(true);
        setAiError('');
        setAiDone(false);
        setAiChars(0);
        setAiElapsed(0);
        setAiPhase('thinking');
        setAiBill(null);
        const ticker = setInterval(() => setAiElapsed(Math.floor((Date.now() - startedAt) / 1000)), 1000);
        try {
            const res = await fetch('/api/ai/skill-draft', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ brief: brief.trim(), lang, model: aiModel || undefined }),
                signal: ac.signal,
            });
            // 前置校验失败（未登录/限流/上游拒绝）仍是 JSON，成功才是事件流
            if (!res.ok || !res.headers.get('content-type')?.includes('text/event-stream')) {
                const data = await res.json().catch(() => ({}));
                setAiError(t.aiAssist.errors[data.error] || t.aiAssist.errors.generic);
                return;
            }
            const reader = res.body!.getReader();
            const decoder = new TextDecoder();
            let buffer = '';
            let settled = false;
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
                    if (ev.type === 'progress') {
                        setAiChars(ev.chars || 0);
                        if (ev.phase === 'writing' || ev.phase === 'thinking') setAiPhase(ev.phase);
                    } else if (ev.type === 'draft') {
                        applyDraft(ev.draft);
                        settled = true;
                    } else if (ev.type === 'billing') {
                        if (ev.costCents > 0) setAiBill({ costCents: ev.costCents, charged: !!ev.charged });
                        if (typeof ev.balanceCents === 'number') setBalanceCents(ev.balanceCents);
                    } else if (ev.type === 'error') {
                        setAiError(t.aiAssist.errors[ev.error] || t.aiAssist.errors.generic);
                        settled = true;
                    }
                }
            }
            // 流被中途掐断（网关重启、网络断开）而没有收到任何终局事件
            if (!settled) setAiError(t.aiAssist.errors.ai_interrupted || t.aiAssist.errors.generic);
        } catch (e: any) {
            if (e?.name === 'AbortError') setAiError(t.aiAssist.errors.ai_cancelled || t.aiAssist.errors.generic);
            else setAiError(t.aiAssist.errors.generic);
        } finally {
            clearInterval(ticker);
            abortRef.current = null;
            setGenerating(false);
        }
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        // 触发词换成 chip 输入后没有 required 兜底，空了就地报错而不是等服务端退回
        if (!triggers.length) {
            setError(t.errors.invalid_triggers);
            return;
        }
        // 价格：0 或 0.01~1999 元，就地校验后转分
        const priceCents = Math.round(Number(priceYuan || '0') * 100);
        if (!Number.isInteger(priceCents) || priceCents < 0 || priceCents > 199900) {
            setError(t.errors.invalid_price);
            return;
        }
        setSubmitting(true);
        setError('');
        try {
            const payload = {
                id: id.trim().toLowerCase(),
                name,
                description,
                category: category || undefined,
                triggers,
                allowedTools,
                output,
                prompt,
                priceCents,
            };
            const res = await fetch(isEdit ? `/api/skills/${initial.id}` : '/api/skills', {
                method: isEdit ? 'PUT' : 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
            });
            const data = await res.json();
            if (!res.ok) {
                setError(t.errors[data.error] || t.errors.generic);
                setSubmitting(false);
                return;
            }
            // 已经落库了，草稿再留着只会在下次投稿时冒出来问要不要恢复一份旧的
            clearDraft();
            router.push(`/${lang}/skills/${data.skill.id}`);
            router.refresh();
        } catch {
            setError(t.errors.generic);
            setSubmitting(false);
        }
    };

    const field = 'bg-white';
    const idInvalid = !!id && !SKILL_ID_RE.test(id.trim().toLowerCase());

    return (
        <div className="flex flex-col gap-6">
            {/* 上次写到一半的表单。默认不自动恢复——用户可能是有意重开一篇，
                替他决定会让新写的内容被旧草稿顶掉。 */}
            {draftFound && (
                <div className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-lg border border-neutral-gray-light bg-white px-4 py-3 text-sm text-neutral-gray-dark">
                    <History className="h-4 w-4 shrink-0 text-king-forest/70" strokeWidth={1.75} />
                    <span>{t.draft.found}</span>
                    <span className="ml-auto flex items-center gap-4">
                        <button
                            type="button"
                            onClick={restoreDraft}
                            className="font-medium text-king-forest underline underline-offset-4"
                        >
                            {t.draft.restore}
                        </button>
                        <button
                            type="button"
                            onClick={discardDraft}
                            className="text-neutral-gray-medium underline underline-offset-4 transition-colors hover:text-neutral-gray-dark"
                        >
                            {t.draft.discard}
                        </button>
                    </span>
                </div>
            )}

            {/* 创建方式页签：表单四步曲 / 对话式创建。编辑式下划线（DESIGN.md 版式语言），
                两个面板常驻挂载只切显隐——切页签不该把写了一半的表单或聊到一半的对话打没。 */}
            {!isEdit && (
                <div className="flex items-center gap-6 border-b border-neutral-gray-light">
                    {([
                        { key: 'form' as const, label: t.tabs.form, Icon: ClipboardList },
                        { key: 'chat' as const, label: t.tabs.chat, Icon: MessagesSquare },
                    ]).map(({ key, label, Icon }) => (
                        <button
                            key={key}
                            type="button"
                            onClick={() => setActiveTab(key)}
                            className={`-mb-px inline-flex items-center gap-2 border-b-2 px-1 pb-2.5 pt-1 text-sm font-medium transition-colors ${
                                activeTab === key
                                    ? 'border-king-forest text-king-forest'
                                    : 'border-transparent text-neutral-gray-medium hover:text-neutral-gray-dark'
                            }`}
                        >
                            <Icon className="h-4 w-4" strokeWidth={1.75} />
                            {label}
                        </button>
                    ))}
                </div>
            )}

            {/* Tab B：对话式创建。草稿确认后可直接发布，或填回表单微调。 */}
            {!isEdit && (
                <div className={activeTab === 'chat' ? '' : 'hidden'}>
                    <SkillChatPane
                        lang={lang}
                        t={t.chat}
                        tp={t}
                        models={aiModels}
                        model={aiModel}
                        onModelChange={setAiModel}
                        crossBorderOk={crossBorderOk}
                        onCrossBorderChange={setCrossBorderOk}
                        balanceCents={balanceCents}
                        onBalanceChange={setBalanceCents}
                        onApplyDraft={d => {
                            applyDraft(d);
                            setActiveTab('form');
                        }}
                    />
                </div>
            )}

            <div className={!isEdit && activeTab === 'chat' ? 'hidden' : 'flex flex-col gap-6'}>
            {/* AI 辅助生成 + 起步模板：投稿的主路径，一句话就能出草稿 */}
            {!isEdit && (
                <div className="relative overflow-hidden bg-king-forest-darker rounded-2xl p-6 md:p-7 shadow-sm">
                    <div className="absolute -top-16 -right-16 w-64 h-64 rounded-full bg-king-mint/20 blur-3xl pointer-events-none" />
                    <div className="relative">
                        <h2 className="flex items-center gap-2 font-semibold text-white mb-1">
                            <Sparkles className="w-5 h-5 text-king-mint" />
                            {t.aiAssist.title}
                        </h2>
                        <p className="text-sm text-king-mint-lightest/80 mb-4">{t.aiAssist.subtitle}</p>
                        <div className="flex flex-col sm:flex-row gap-3">
                            <Textarea
                                value={brief}
                                onChange={e => setBrief(e.target.value)}
                                placeholder={t.aiAssist.placeholder}
                                rows={2}
                                className="flex-1 bg-white/95 text-neutral-dark-bg placeholder:text-neutral-gray-medium resize-none"
                            />
                            <Button
                                type="button"
                                variant="accent"
                                onClick={handleGenerate}
                                disabled={generating || !brief.trim() || !crossBorderOk}
                                className="font-bold sm:self-stretch sm:h-auto min-w-32"
                            >
                                {generating ? t.aiAssist.generating : t.aiAssist.generate}
                            </Button>
                        </div>

                        {/* 模型选择：真实模型名+速度标注（用户拍板），按站点出菜单 */}
                        {aiModels.length > 0 && (
                            <div className="mt-3 flex flex-wrap items-center gap-2">
                                <span className="text-[13px] text-king-mint-lightest/80">{t.aiAssist.modelLabel}</span>
                                <ModelSelect
                                    lang={lang}
                                    models={aiModels}
                                    value={aiModel}
                                    onChange={setAiModel}
                                    disabled={generating}
                                    onDark
                                    ariaLabel={t.aiAssist.modelLabel}
                                />
                                {aiModels.find(m => m.id === aiModel)?.deep && (
                                    <span className="text-[12px] text-king-mint-lightest/70">{t.aiAssist.deepHint}</span>
                                )}
                            </div>
                        )}

                        {/* 出境告知与单独同意。放在生成按钮正下方——这里就是内容出境的那一刻。 */}
                        <label className="mt-4 flex cursor-pointer items-start gap-2.5">
                            <input
                                type="checkbox"
                                checked={crossBorderOk}
                                onChange={e => setCrossBorderOk(e.target.checked)}
                                className="mt-0.5 h-4 w-4 flex-shrink-0 accent-king-mint"
                            />
                            <span className="text-[13px] leading-relaxed text-king-mint-lightest/85">
                                {t.aiAssist.consent}{' '}
                                <Link
                                    href={`/${lang}/legal/privacy#cross-border`}
                                    target="_blank"
                                    className="underline decoration-king-mint/50 underline-offset-2 hover:text-white"
                                >
                                    {t.aiAssist.consentLink}
                                </Link>
                            </span>
                        </label>
                        {/* 生成中的进度：字数在涨就说明还活着，用时让用户自己判断要不要等 */}
                        {generating && (
                            <p className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-king-mint-lightest/85">
                                <span className="inline-flex items-center gap-2">
                                    <Loader2 className="w-4 h-4 animate-spin text-king-mint" />
                                    {/* 深推理模型会先想很久（kimi-k3 实测 111 秒才吐第一个正文字），
                                        构思期报推理字数——只报正文字数的话，这段时间和卡死没有区别。 */}
                                    {(aiPhase === 'writing'
                                        ? t.aiAssist.progress
                                        : aiChars > 0
                                          ? t.aiAssist.progressReasoning
                                          : t.aiAssist.progressThinking)
                                        .replace('{chars}', String(aiChars))
                                        .replace('{seconds}', String(aiElapsed))}
                                </span>
                                <button
                                    type="button"
                                    onClick={handleCancel}
                                    className="underline decoration-king-mint/50 underline-offset-2 hover:text-white"
                                >
                                    {t.aiAssist.cancel}
                                </button>
                            </p>
                        )}
                        {aiError && <p className="mt-3 text-sm text-red-300">{aiError}</p>}
                        {aiDone && <p className="mt-3 text-sm text-king-mint-lighter">{t.aiAssist.done}</p>}
                        {/* 明面账：本轮真实成本与承担方。免费不等于没成本，账要亮出来。 */}
                        {aiBill && (
                            <p className="mt-1.5 text-[12px] text-king-mint-lightest/70">
                                {(aiBill.charged ? t.aiAssist.billingCharged : t.aiAssist.billingOnHouse).replace(
                                    '{amount}',
                                    formatSiteAmount(aiBill.costCents)
                                )}
                                {balanceCents !== null &&
                                    ' · ' + t.aiAssist.billingBalance.replace('{balance}', formatSiteAmount(balanceCents))}
                            </p>
                        )}

                        <div className="mt-5 pt-4 border-t border-white/10 flex items-center flex-wrap gap-2">
                            <span className="text-sm text-king-mint-lightest/70 mr-1">{t.templates.label}</span>
                            {SKILL_TEMPLATES.map(tpl => {
                                const TplIcon = TEMPLATE_ICONS[tpl.key as keyof typeof TEMPLATE_ICONS] || FileSearch;
                                return (
                                    <button
                                        key={tpl.key}
                                        type="button"
                                        onClick={() => applyTemplate(tpl.key)}
                                        className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-sm rounded-md bg-white/10 border border-white/15 text-white hover:bg-white/20 transition-colors"
                                        title={pickLocale(tpl.hint, lang)}
                                    >
                                        <TplIcon className="w-3.5 h-3.5" strokeWidth={1.75} />
                                        {pickLocale(tpl.label, lang)}
                                    </button>
                                );
                            })}
                        </div>
                    </div>
                </div>
            )}

            {/* 写作要点（skill-creator 方法论） */}
            <div className="bg-king-mint-lightest/50 border border-king-mint-lighter/60 rounded-2xl">
                <button
                    type="button"
                    onClick={() => setTipsOpen(!tipsOpen)}
                    className="w-full flex items-center justify-between px-5 py-3.5 text-sm font-medium text-king-forest"
                >
                    <span className="flex items-center gap-2">
                        <Lightbulb className="w-4 h-4" />
                        {t.tips.title}
                    </span>
                    <ChevronDown className={`w-4 h-4 transition-transform ${tipsOpen ? 'rotate-180' : ''}`} />
                </button>
                {tipsOpen && (
                    <ul className="px-5 pb-4 flex flex-col gap-2 text-sm text-neutral-gray-dark">
                        {t.tips.items.map((tip: string, i: number) => (
                            <li key={i} className="flex gap-2">
                                <span className="text-king-forest font-bold flex-shrink-0">{i + 1}.</span>
                                {tip}
                            </li>
                        ))}
                    </ul>
                )}
            </div>

            <form onSubmit={handleSubmit} className="bg-white border border-neutral-gray-light rounded-2xl p-6 md:p-8 shadow-sm flex flex-col gap-9">
                <Step n={1} title={t.steps.basics}>
                    <div className="grid grid-cols-1 md:grid-cols-[1fr_220px] gap-4">
                        <div className="flex flex-col gap-2">
                            <Label className="text-neutral-gray-dark" htmlFor="skill-name">{t.fields.name}</Label>
                            <Input
                                id="skill-name"
                                value={name}
                                onChange={e => {
                                    setName(e.target.value);
                                    if (!isEdit && !idTouched) setId(slugFromName(e.target.value, slugSuffix));
                                }}
                                placeholder={t.fields.namePlaceholder}
                                required
                                className={field}
                            />
                        </div>
                        <div className="flex flex-col gap-2">
                            <Label className="text-neutral-gray-dark" htmlFor="skill-category">{t.fields.category}</Label>
                            <select
                                id="skill-category"
                                value={category}
                                onChange={e => setCategory(e.target.value)}
                                className="h-10 rounded-md border border-neutral-gray-light bg-white px-3 text-sm text-neutral-gray-dark focus:outline-none focus:ring-2 focus:ring-king-mint"
                            >
                                <option value="">{t.fields.categoryNone}</option>
                                {SKILL_CATEGORIES.map(c => (
                                    <option key={c.id} value={c.id}>{pickLocale(c, lang)}</option>
                                ))}
                            </select>
                        </div>
                    </div>
                    <div className="flex flex-col gap-2">
                        <Label className="text-neutral-gray-dark" htmlFor="skill-description">{t.fields.description}</Label>
                        <Input
                            id="skill-description"
                            value={description}
                            onChange={e => setDescription(e.target.value)}
                            placeholder={t.fields.descriptionPlaceholder}
                            required
                            className={field}
                        />
                    </div>
                    {paidAllowed ? (
                        <div className="flex flex-col gap-2 max-w-xs">
                            <Label className="text-neutral-gray-dark" htmlFor="skill-price">{t.fields.price}</Label>
                            <Input
                                id="skill-price"
                                type="number"
                                min="0"
                                max="1999"
                                step="0.01"
                                value={priceYuan}
                                onChange={e => setPriceYuan(e.target.value)}
                                placeholder={t.fields.pricePlaceholder}
                                className={field}
                            />
                            <p className="text-xs text-neutral-gray-medium">{t.fields.priceHint}</p>
                        </div>
                    ) : (
                        // 说明放在原本填价格的位置：别让人写完整篇 prompt 才发现不支持收费
                        <FormNotice variant="info">{t.fields.priceUnavailable}</FormNotice>
                    )}
                </Step>

                <Step n={2} title={t.steps.triggers} hint={t.steps.triggersHint}>
                    <TriggerInput
                        value={triggers}
                        onChange={setTriggers}
                        placeholder={t.fields.triggersPlaceholder}
                        addHint={t.fields.triggersHint}
                    />
                </Step>

                <Step n={3} title={t.steps.tools} hint={t.steps.toolsHint}>
                    <FormNotice variant="info">{t.tools.notice}</FormNotice>
                    <ToolPicker lang={lang} value={allowedTools} onChange={setAllowedTools} t={t.tools} />
                </Step>

                <Step n={4} title={t.steps.prompt} hint={t.steps.promptHint}>
                    <div className="flex flex-col gap-2">
                        <Label className="text-neutral-gray-dark" htmlFor="skill-prompt">{t.fields.prompt}</Label>
                        <Textarea
                            id="skill-prompt"
                            value={prompt}
                            onChange={e => setPrompt(e.target.value)}
                            placeholder={t.fields.promptPlaceholder}
                            rows={12}
                            required
                            className={`${field} font-mono text-sm`}
                        />
                        <p className="text-xs text-neutral-gray-medium">{t.fields.promptHint}</p>
                    </div>
                    <div className="flex flex-col gap-2">
                        <Label className="text-neutral-gray-dark" htmlFor="skill-output">{t.fields.output}</Label>
                        <Textarea
                            id="skill-output"
                            value={output}
                            onChange={e => setOutput(e.target.value)}
                            placeholder={t.fields.outputPlaceholder}
                            rows={3}
                            className={field}
                        />
                    </div>
                </Step>

                {/* 高级设置：Skill ID 由名称自动生成，绝大多数人不需要看见 */}
                <div className="border-t border-neutral-gray-light pt-5">
                    <button
                        type="button"
                        onClick={() => setAdvancedOpen(!advancedOpen)}
                        className="flex items-center gap-2 text-sm text-neutral-gray-medium hover:text-king-forest transition-colors"
                    >
                        <Settings2 className="w-4 h-4" />
                        {t.advanced.title}
                        <ChevronDown className={`w-4 h-4 transition-transform ${advancedOpen ? 'rotate-180' : ''}`} />
                    </button>
                    {(advancedOpen || idInvalid) && (
                        <div className="mt-4 flex flex-col gap-2 max-w-md">
                            <Label className="text-neutral-gray-dark" htmlFor="skill-id">{t.fields.id}</Label>
                            <Input
                                id="skill-id"
                                value={id}
                                onChange={e => {
                                    setId(e.target.value);
                                    // 手工改过就不再跟随名称自动生成；清空则恢复跟随
                                    setIdTouched(e.target.value !== '');
                                }}
                                placeholder={t.fields.idPlaceholder}
                                disabled={isEdit}
                                required
                                className={`${field}${idInvalid ? ' border-red-400' : ''}`}
                            />
                            <p className={`text-xs ${idInvalid ? 'text-red-600' : 'text-neutral-gray-medium'}`}>
                                {t.fields.idHint}
                            </p>
                        </div>
                    )}
                </div>

                {error && (
                    <FormNotice variant="error">{error}</FormNotice>
                )}

                <div className="flex justify-end">
                    <Button type="submit" disabled={submitting} className="font-bold min-w-40">
                        {submitting ? t.submitting : isEdit ? t.updateBtn : t.submitBtn}
                    </Button>
                </div>
            </form>
            </div>
        </div>
    );
}
