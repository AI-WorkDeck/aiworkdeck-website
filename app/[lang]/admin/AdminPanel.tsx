'use client';

import { useAdminSite } from './AdminWorkspace';

import { useCallback, useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import {
    Star,
    Trash2,
    RefreshCw,
    ShieldCheck,
    LogOut,
    Inbox,
    Users,
    FileWarning,
    Receipt,
    Wallet,
    Ticket,
    BarChart3,
    ArrowUpRight,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { DeveloperReview } from './DeveloperReview';
import { PluginReview } from './PluginReview';
import { PackReview } from './PackReview';
import { FeedbackInbox } from './FeedbackInbox';
import { CommunityModeration } from './CommunityModeration';
import { CostLedger } from './CostLedger';
import { Transparency } from './Transparency';
import { QuizGrowth } from './QuizGrowth';
import {
    ConfigStatus,
    EmptyState,
    Eyebrow,
    Field,
    MetricTile,
    Notice,
    Panel,
    SectionHeader,
    Skeleton,
    StatusDot,
    TableShell,
    TableSkeleton,
    Thead,
    TD,
    TD_NUM,
    TH,
    TH_RIGHT,
    TR,
    type Tone,
} from './ui';

/** 管理后台为维护者专用，不走 i18n 词典，界面固定中文。 */

interface Overview {
    stats: { skills: number; users: number; downloads: number; failedSubmissions: number };
    skills: any[];
    users: any[];
    failedSubmissions: any[];
    ai: {
        provider?: string;
        configured: boolean;
        keyMasked: string;
        model: string;
        keySource: string;
        exchangeRate: number;
        marginMultiplier: number;
        fx: FxAdminView;
    };
}

/** 汇率三级裁决的后台视图（dev-board#853），字段见 lib/ai-config.ts getExchangeRateAdminView */
interface FxAdminView {
    rate: number;
    source: 'live' | 'manual' | 'default';
    updatedAt: string | null;
    mode: 'auto' | 'manual';
    provider: string | null;
    asOf: string | null;
    liveEnabled: boolean;
    defaultRate: number;
    manualRate: number | null;
    live: { rate: number; sourceName: string; asOf: string | null; fetchedAt: string } | null;
    lastAttemptAt: string | null;
    lastRejected: { rate: number; source: string; reason: 'out_of_range' | 'jump'; at: string } | null;
}

const FX_SOURCE_LABEL: Record<FxAdminView['source'], string> = { live: '即时', manual: '手动', default: '站点默认值' };

interface AiPool {
    provisioningConfigured: boolean;
    encryptionConfigured: boolean;
    allocatedLimitUsd: number;
    credits: { totalCreditsUsd: number; totalUsageUsd: number; remainingUsd: number } | null;
    creditsError?: boolean;
    accounts?: {
        currentAccount: string | null;
        retiredAccount: string | null;
        activeKeys: { account: string | null; role: string; count: number }[];
        pendingRetiredKeys: number;
    };
}

type TabKey = 'skills' | 'developers' | 'plugins' | 'packs' | 'community' | 'feedback' | 'users' | 'failed' | 'ai' | 'commerce' | 'earnings' | 'gift' | 'pricing' | 'costs' | 'transparency' | 'growth';

const TAB_KEYS: TabKey[] = ['skills', 'developers', 'plugins', 'packs', 'community', 'feedback', 'users', 'failed', 'ai', 'commerce', 'earnings', 'gift', 'pricing', 'costs', 'transparency', 'growth'];

/** 左栏按职能分组：运营 / 商业化 / 配置，八个平铺胶囊换成有层级的导航 */
const NAV_GROUPS: Array<{ group: string; items: Array<{ key: TabKey; label: string }> }> = [
    {
        group: '内容运营',
        items: [
            { key: 'skills', label: 'Skill 管理' },
            { key: 'plugins', label: '插件审核' },
            { key: 'developers', label: '开发者资格' },
            { key: 'packs', label: '资源包审核' },
            { key: 'community', label: '社区论坛' },
            { key: 'feedback', label: '用户反馈' },
            { key: 'growth', label: '法人格增长' },
        ],
    },
    {
        group: '商业化',
        items: [
            { key: 'commerce', label: '商品与购买' },
            { key: 'earnings', label: '收益结算' },
            { key: 'pricing', label: '服务定价' },
            { key: 'costs', label: '成本台账' },
            { key: 'transparency', label: '账目公开' },
            { key: 'gift', label: '兑换码' },
        ],
    },
    {
        group: '配置与用户',
        items: [
            { key: 'ai', label: 'AI 与定价' },
            { key: 'users', label: '用户' },
            { key: 'failed', label: '流失提交' },
        ],
    },
];

interface GiftCodeView {
    code: string;
    kind: 'recharge' | 'entitlement';
    amountCents: number | null;
    feature: string | null;
    note: string | null;
    createdAt: string;
    status: 'available' | 'redeemed' | 'revoked';
    redeemedBy: string | null;
    redeemedAt: string | null;
}

interface GiftData {
    codes: GiftCodeView[];
    stats: { total: number; available: number; redeemed: number; revoked: number };
    /** codes 只有最新这么多行；stats 是全表口径 */
    pageLimit: number;
    features: Array<{ key: string; name: string }>;
}

interface CommerceData {
    purchases: Array<{
        id: number;
        itemType: string;
        itemId: string;
        itemName: string;
        priceCents: number;
        creatorShareCents: number | null;
        platformShareCents: number | null;
        buyer: string;
        creator: string | null;
        createdAt: string;
    }>;
    earnings: Array<{
        creatorUserId: string;
        username: string;
        displayName: string;
        pendingCents: number;
        pendingCount: number;
        settledCents: number;
    }>;
    products: Array<{ key: string; name: string; priceCents: number; defaultPriceCents: number }>;
}

interface PricingRowView {
    service: string;
    op: string;
    unit: string;
    costCentsPerUnit: number;
    marginMultiplier: number;
    creditsPerUnit: number;
    maxUnitsPerCall: number;
    enabled: boolean;
    updatedAt: string;
}

interface PricingData {
    pricing: PricingRowView[];
    signupGrant: {
        amountCents: number;
        startAt: string | null;
        endAt: string | null;
        active: boolean;
        granted: { count: number; totalCents: number };
    };
}

/** 表单里一行的可改字段（全存字符串：输入框允许中间态，如刚删空的 "" 或 "1."） */
interface PricingDraft {
    cost: string;
    margin: string;
    maxUnits: string;
    enabled: boolean;
}

const UNIT_LABEL: Record<string, string> = {
    minute: '分钟',
    page: '页',
    call: '次',
    kchar: '千字符',
    gb: 'GB',
};

/**
 * 派生单价：与服务端 `lib/gateway/pricing.ts` 的 `deriveCreditsPerUnit` **必须一致**。
 *
 * 不能直接 import 那个函数：它所在的模块连着 better-sqlite3，进不了浏览器包。
 * 这里抄一份的代价是可能漂移，所以 verify-gateway 有一条静态护栏钉住「这里也得是
 * Math.ceil」——改回 Math.round 会让后台显示的单价比实际扣的少一分，
 * 而调价的人只会相信自己屏幕上那个数。
 */
function derivedCredits(cost: number, margin: number): number {
    return Math.max(0, Math.ceil(cost * margin));
}

/** 毛利率 = (单价 − 成本) / 单价。单价为 0（如列音色）时无意义，回 null。 */
function grossMarginRate(cost: number, credits: number): number | null {
    if (credits <= 0) return null;
    return (credits - cost) / credits;
}

const GIFT_STATUS: Record<GiftCodeView['status'], { tone: Tone; label: string }> = {
    available: { tone: 'ok', label: '未核销' },
    redeemed: { tone: 'muted', label: '已核销' },
    revoked: { tone: 'danger', label: '已撤销' },
};

export function AdminPanel({ bailianManaged }: { bailianManaged: string }) {
    const { fetch, pageUrl, config, copy, locale } = useAdminSite();
    const fmtYuan = (cents: number) => new Intl.NumberFormat(locale, { style: 'currency', currency: config.currency }).format(cents / 100);
    const [loadError, setLoadError] = useState('');
    const params = useParams<{ lang: string }>();
    const lang = params?.lang ?? 'zh';
    const [authed, setAuthed] = useState<boolean | null>(null);
    const [token, setToken] = useState('');
    const [loginError, setLoginError] = useState('');
    const [data, setData] = useState<Overview | null>(null);
    const [tab, setTab] = useState<TabKey>('users');
    // 深链定位的反馈 id（?tab=feedback&fb=N，优化者邮件里的「后台直达」链接）
    const [feedbackFocus, setFeedbackFocus] = useState<number | undefined>(undefined);

    // 深链只在挂载后读一次：SSR 阶段读不到 location，放 useEffect 里避免水合不一致
    useEffect(() => {
        const qs = new URLSearchParams(window.location.search);
        const wanted = qs.get('tab');
        if (wanted && (TAB_KEYS as string[]).includes(wanted)) setTab(wanted as TabKey);
        const fb = qs.get('fb');
        if (fb && /^\d+$/.test(fb)) setFeedbackFocus(Number(fb));
    }, []);
    const [busy, setBusy] = useState('');
    const [aiKey, setAiKey] = useState('');
    const [aiModel, setAiModel] = useState('');
    const [aiRate, setAiRate] = useState('');
    const [aiRateMode, setAiRateMode] = useState<'auto' | 'manual'>('auto');
    const [aiMargin, setAiMargin] = useState('');
    const [aiMsg, setAiMsg] = useState('');
    const [pool, setPool] = useState<AiPool | null>(null);
    // 商品与购买 / 收益结算（PR-W3）
    const [commerce, setCommerce] = useState<CommerceData | null>(null);
    const [settleNotes, setSettleNotes] = useState<Record<string, string>>({});
    const [settleMsg, setSettleMsg] = useState('');
    const [productPrices, setProductPrices] = useState<Record<string, string>>({});
    const [priceMsg, setPriceMsg] = useState('');
    // 兑换码（PR-W4）
    const [gift, setGift] = useState<GiftData | null>(null);
    const [giftKind, setGiftKind] = useState<'recharge' | 'entitlement'>('recharge');
    const [giftCount, setGiftCount] = useState('10');
    const [giftAmount, setGiftAmount] = useState('50');
    const [giftFeature, setGiftFeature] = useState('');
    const [giftNote, setGiftNote] = useState('');
    const [giftMsg, setGiftMsg] = useState('');
    const [giftBatch, setGiftBatch] = useState<string[]>([]);
    // 平台服务定价
    const [pricing, setPricing] = useState<PricingData | null>(null);
    const [pricingDrafts, setPricingDrafts] = useState<Record<string, PricingDraft>>({});
    const [pricingMsg, setPricingMsg] = useState('');

    const loadPricing = useCallback(async () => {
        const res = await fetch('/api/admin/pricing');
        if (!res.ok) {
            setPricing(null);
            return;
        }
        const d: PricingData = await res.json();
        setPricing(d);
        setPricingDrafts(
            Object.fromEntries(
                d.pricing.map(r => [
                    `${r.service}/${r.op}`,
                    {
                        cost: String(r.costCentsPerUnit),
                        margin: String(r.marginMultiplier),
                        maxUnits: String(r.maxUnitsPerCall),
                        enabled: r.enabled,
                    },
                ])
            )
        );
    }, []);

    const loadGift = useCallback(async () => {
        const res = await fetch('/api/admin/gift-codes');
        if (!res.ok) {
            setGift(null);
            return;
        }
        const d: GiftData = await res.json();
        setGift(d);
        setGiftFeature(prev => prev || d.features[0]?.key || '');
    }, []);

    const loadCommerce = useCallback(async () => {
        const res = await fetch('/api/admin/commerce');
        if (!res.ok) {
            setCommerce(null);
            return;
        }
        const d: CommerceData = await res.json();
        setCommerce(d);
        setProductPrices(Object.fromEntries(d.products.map(p => [p.key, (p.priceCents / 100).toFixed(2)])));
    }, []);

    const load = useCallback(async () => {
        setLoadError('');
        try {
            const res = await fetch('/api/admin/overview');
            if (res.status === 401) {
                setAuthed(false);
                setData(null);
                return;
            }
            if (!res.ok) {
                setData(null);
                setLoadError(res.status === 503 ? copy.notConnected : copy.unavailable);
                return;
            }
            const d = await res.json();
            setData(d);
            setAiModel(d.ai.model);
            // 输入框只承载「手动值」，不回填生效值：旧后台把生效值回填进来、保存时再原样写回，
            // 这正是线上文件里那个 7.3 的来历（dev-board#853）
            setAiRate(d.ai.fx?.manualRate != null ? String(d.ai.fx.manualRate) : '');
            setAiRateMode(d.ai.fx?.mode === 'manual' ? 'manual' : 'auto');
            setAiMargin(String(d.ai.marginMultiplier ?? ''));
            setAuthed(true);
        } catch { setData(null); setLoadError(copy.networkError); }
    }, []);

    // AI 额度池概览：进入 AI tab 时拉取（含外呼 OpenRouter，不进 overview）
    useEffect(() => {
        if (tab !== 'ai' || !authed) return;
        setPool(null);
        fetch('/api/admin/ai')
            .then(res => (res.ok ? res.json() : null))
            .then(setPool)
            .catch(() => setPool(null));
    }, [tab, authed]);

    // 商品与购买 / 收益结算 / 商品定价（AI tab 里）共用一份数据
    useEffect(() => {
        if (!authed || (tab !== 'commerce' && tab !== 'earnings' && tab !== 'ai')) return;
        loadCommerce();
    }, [tab, authed, loadCommerce]);

    useEffect(() => {
        if (!authed || tab !== 'gift') return;
        loadGift();
    }, [tab, authed, loadGift]);

    useEffect(() => {
        if (!authed || tab !== 'pricing') return;
        loadPricing();
    }, [tab, authed, loadPricing]);

    useEffect(() => {
        load();
    }, [load]);

    const handleLogin = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoginError('');
        const res = await fetch('/api/admin/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ token }),
        });
        if (!res.ok) {
            const d = await res.json().catch(() => ({}));
            setLoginError(d.error === 'admin_not_configured' ? '服务器未配置 AWD_ADMIN_TOKEN' : '口令不正确');
            return;
        }
        setToken('');
        load();
    };

    const handleLogout = async () => {
        await fetch('/api/admin/login', { method: 'DELETE' });
        setAuthed(false);
        setData(null);
    };

    const toggleFeatured = async (id: string, featured: boolean) => {
        setBusy(id);
        await fetch(`/api/admin/skills/${id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ featured }),
        });
        await load();
        setBusy('');
    };

    const removeSkill = async (id: string, name: string) => {
        if (!window.confirm(`确认从广场下架「${name}」(${id})？已安装的桌面端不受影响。`)) return;
        setBusy(id);
        await fetch(`/api/admin/skills/${id}`, { method: 'DELETE' });
        await load();
        setBusy('');
    };

    const saveAi = async () => {
        setAiMsg('');
        setBusy('ai');
        const body: any = data?.ai.provider === 'bailian' ? {} : { model: aiModel };
        if (aiKey.trim()) body.apiKey = aiKey.trim();
        if (data?.ai.fx?.liveEnabled) {
            body.exchangeRateMode = aiRateMode;
            if (aiRateMode === 'manual' && aiRate.trim()) body.exchangeRate = Number(aiRate);
        }
        if (aiMargin.trim()) body.marginMultiplier = Number(aiMargin);
        const res = await fetch('/api/admin/ai', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
        });
        const d = await res.json().catch(() => ({}));
        setBusy('');
        if (!res.ok) {
            const errMap: Record<string, string> = {
                invalid_key_format: '密钥格式不对（应以 sk-or- 开头）',
                invalid_exchange_rate: '汇率需在 0.5 到 100 之间',
                invalid_exchange_rate_mode: '汇率来源只能是自动或手动',
                manual_rate_required: '切到手动前先填一个手动汇率',
                invalid_margin: '毛利乘数需在 1 到 10 之间（低于 1 是亏本卖）',
            };
            setAiMsg(errMap[d.error] || '保存失败');
            return;
        }
        setAiKey('');
        setAiMsg('已保存');
        load();
    };

    const testAi = async () => {
        setAiMsg('测试中…');
        setBusy('ai');
        const res = await fetch('/api/admin/ai', { method: 'POST' });
        const d = await res.json().catch(() => ({}));
        setBusy('');
        if (!res.ok) {
            setAiMsg(`测试失败：${d.status || ''} ${d.detail || d.error || ''}`);
            return;
        }
        setAiMsg(`连通正常（${d.model} 回复：${d.reply}）`);
    };

    // 收益结算：钱相关操作，二次确认 + settleNote 必填（转账凭证说明）
    const settleEarnings = async (creatorUserId: string, displayName: string, pendingCents: number) => {
        const note = (settleNotes[creatorUserId] || '').trim();
        setSettleMsg('');
        if (!note) {
            setSettleMsg('补结算需要填写说明（为什么会有历史欠账），再执行。');
            return;
        }
        if (
            !window.confirm(
                `确认给「${displayName}」补发 ${fmtYuan(pendingCents)} 的 Credits（reward 批次）并标记已结算？\n说明：${note}`
            )
        ) {
            return;
        }
        setBusy(`settle-${creatorUserId}`);
        const res = await fetch('/api/admin/commerce', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ creatorUserId, settleNote: note }),
        });
        const d = await res.json().catch(() => ({}));
        setBusy('');
        if (!res.ok) {
            setSettleMsg(d.error === 'nothing_to_settle' ? '该创作者没有待结算收益' : '结算失败，请重试');
            return;
        }
        setSettleMsg(`已补发 ${d.settledCount} 笔，合计 ${fmtYuan(d.settledCents)} Credits`);
        setSettleNotes(prev => ({ ...prev, [creatorUserId]: '' }));
        loadCommerce();
    };

    /**
     * 保存一行服务定价。**一行一存**，不做整表批量保存：定价是钱，
     * 一次点击改动八行的话，出错时说不清是哪一行、也没法只回滚那一行。
     */
    const savePricingRow = async (row: PricingRowView) => {
        const id = `${row.service}/${row.op}`;
        const draft = pricingDrafts[id];
        if (!draft) return;
        setPricingMsg('');
        const cost = Number(draft.cost);
        const margin = Number(draft.margin);
        const maxUnits = Number(draft.maxUnits);
        if (!Number.isFinite(cost) || cost < 0) {
            setPricingMsg(`${id}：成本需是不小于 0 的数字`);
            return;
        }
        if (!Number.isFinite(margin) || margin <= 0) {
            setPricingMsg(`${id}：加价率需大于 0`);
            return;
        }
        if (!Number.isInteger(maxUnits) || maxUnits <= 0) {
            setPricingMsg(`${id}：单次上限需是正整数`);
            return;
        }
        setBusy(`pricing-${id}`);
        const res = await fetch('/api/admin/pricing', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                service: row.service,
                op: row.op,
                costCentsPerUnit: cost,
                marginMultiplier: margin,
                maxUnitsPerCall: maxUnits,
                enabled: draft.enabled,
            }),
        });
        const d = await res.json().catch(() => ({}));
        setBusy('');
        if (!res.ok) {
            setPricingMsg(`${id} 保存失败${d.field ? `（${d.field} 不合法）` : ''}`);
            return;
        }
        setPricingMsg(`${id} 已保存：${d.row.creditsPerUnit} 分/${UNIT_LABEL[d.row.unit] ?? d.row.unit}`);
        loadPricing();
    };

    // 商品定价（feature SKU）：走 /api/admin/ai 的 featurePrices，与 AI 配置同一存储
    const saveProductPrices = async () => {
        setPriceMsg('');
        const featurePrices: Record<string, number> = {};
        for (const [key, value] of Object.entries(productPrices)) {
            const cents = Math.round(Number(value) * 100);
            if (!Number.isInteger(cents) || cents < 1 || cents > 199900) {
                setPriceMsg(copy.priceRange.replace('{unit}', config.currency));
                return;
            }
            featurePrices[key] = cents;
        }
        setBusy('product-prices');
        const res = await fetch('/api/admin/ai', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ featurePrices }),
        });
        setBusy('');
        if (!res.ok) {
            setPriceMsg('保存失败');
            return;
        }
        setPriceMsg('已保存');
        loadCommerce();
    };

    // 兑换码生成：recharge 类等于凭空造钱，必须二次确认；生成结果只在本次响应里出现，
    // 列表页之后也能看到码本身（未核销的码没有保密价值上的必要遮挡，运营要能补发）。
    const generateGift = async () => {
        setGiftMsg('');
        setGiftBatch([]);
        const count = Number(giftCount);
        if (!Number.isInteger(count) || count < 1 || count > 200) {
            setGiftMsg('数量需为 1 到 200 之间的整数');
            return;
        }
        const body: Record<string, unknown> = { count, kind: giftKind, note: giftNote.trim() };
        let summary: string;
        if (giftKind === 'recharge') {
            const cents = Math.round(Number(giftAmount) * 100);
            if (!Number.isInteger(cents) || cents < 1 || cents > 1000000) {
                setGiftMsg(copy.giftRange.replace('{unit}', config.currency));
                return;
            }
            body.amountCents = cents;
            summary = `${count} 枚充值码，每枚面额 ${fmtYuan(cents)}`;
        } else {
            if (!giftFeature.trim()) {
                setGiftMsg('请选择或填写权益名');
                return;
            }
            body.feature = giftFeature.trim();
            summary = `${count} 枚权益码，权益 ${giftFeature.trim()}`;
        }
        if (!window.confirm(`确认生成 ${summary}？生成后可单独撤销未核销的码。`)) return;
        setBusy('gift-generate');
        try {
            const res = await fetch('/api/admin/gift-codes', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body),
            });
            const d = await res.json().catch(() => ({}));
            if (!res.ok) {
                setGiftMsg(d.message || '生成失败');
                return;
            }
            setGiftBatch(d.codes);
            setGiftMsg(`已生成 ${d.codes.length} 枚`);
            loadGift();
        } catch {
            // 请求本身失败时码可能已经生成，让运营刷新确认，不要暗示「没生成」
            setGiftMsg('请求失败，请刷新列表确认是否已生成，避免重复生成');
        } finally {
            setBusy('');
        }
    };

    const revokeGift = async (code: string) => {
        if (!window.confirm(`确认撤销 ${code}？撤销后不可再兑换，且无法恢复。`)) return;
        setGiftMsg('');
        setBusy(`gift-${code}`);
        try {
            const res = await fetch('/api/admin/gift-codes', {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ code }),
            });
            const d = await res.json().catch(() => ({}));
            if (!res.ok) {
                setGiftMsg(d.message || '撤销失败');
                return;
            }
            loadGift();
        } catch {
            setGiftMsg('请求失败，请刷新列表确认撤销是否生效');
        } finally {
            setBusy('');
        }
    };

    // 导出为文本：一行一码，交给运营贴进微信/邮件
    const exportGiftBatch = (codes: string[], filename: string) => {
        const blob = new Blob([codes.join('\n') + '\n'], { type: 'text/plain;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        a.click();
        URL.revokeObjectURL(url);
    };

    // 导出未核销码走服务端全量端点：列表本身有分页，按当页过滤会漏发剩下的码
    const exportAvailableGift = async () => {
        setGiftMsg('');
        setBusy('gift-export');
        try {
            const res = await fetch('/api/admin/gift-codes?export=available');
            const d = await res.json().catch(() => ({}));
            if (!res.ok || !Array.isArray(d.codes)) {
                setGiftMsg('导出失败，请重试');
                return;
            }
            exportGiftBatch(d.codes, `gift-codes-available-${Date.now()}.txt`);
            setGiftMsg(`已导出 ${d.codes.length} 枚未核销码`);
        } catch {
            setGiftMsg('导出失败，请检查网络后重试');
        } finally {
            setBusy('');
        }
    };

    if (loadError) return <Notice><p>{loadError}</p><Button onClick={load} variant="outline" className="mt-3">{copy.retry}</Button></Notice>;

    if (authed === null) {
        return (
            <div className="flex flex-col gap-8">
                <Skeleton className="h-10 w-56" />
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                    {[0, 1, 2, 3].map(i => (
                        <Skeleton key={i} className="h-28 rounded-xl" />
                    ))}
                </div>
                <Skeleton className="h-96 rounded-xl" />
            </div>
        );
    }

    if (!authed) {
        return (
            <div className="flex items-start justify-center pt-10 pb-24">
                <div className="w-full max-w-sm bg-white/70 backdrop-blur-xl border border-neutral-gray-light/90 rounded-xl p-8 shadow-[0_18px_40px_-24px_rgba(18,58,38,0.28)]">
                    <Eyebrow>Console</Eyebrow>
                    <h1 className="font-display text-2xl font-semibold text-neutral-dark-bg mt-3 flex items-center gap-2.5">
                        <ShieldCheck className="w-5 h-5 text-king-forest" strokeWidth={1.75} />
                        维护者登录
                    </h1>
                    <p className="text-sm leading-relaxed text-neutral-gray-medium mt-2 mb-6">
                        {copy.loginHint}
                    </p>
                    <form onSubmit={handleLogin} className="flex flex-col gap-3">
                        <Input
                            type="password"
                            value={token}
                            onChange={e => setToken(e.target.value)}
                            placeholder="管理口令"
                            className="bg-white text-neutral-gray-dark"
                            autoFocus
                        />
                        {loginError && <p className="text-sm text-red-600">{loginError}</p>}
                        <Button type="submit" className="font-bold" disabled={!token.trim()}>
                            进入后台
                        </Button>
                    </form>
                </div>
            </div>
        );
    }

    if (!data) return null;

    const navCount: Partial<Record<TabKey, number>> = {
        skills: data.stats.skills,
        users: data.stats.users,
        failed: data.stats.failedSubmissions,
    };

    return (
        <div className="flex flex-col gap-8">
            {/* 页头 */}
            <header className="flex flex-wrap items-end justify-between gap-4">
                <div>
                    <Eyebrow>AI WorkDeck Console</Eyebrow>
                    <h1 className="font-display text-4xl font-semibold text-neutral-dark-bg mt-3">站点后台</h1>
                    <p className="text-neutral-gray-medium mt-2">内容运营 · 商业化结算 · AI 与定价配置</p>
                </div>
                <div className="flex items-center gap-2">
                    <Button
                        variant="outline"
                        size="sm"
                        onClick={load}
                        className="gap-1.5 border-neutral-gray-light bg-white/70 text-neutral-gray-dark"
                    >
                        <RefreshCw className="w-3.5 h-3.5" strokeWidth={1.75} />
                        刷新
                    </Button>
                    <Button
                        variant="outline"
                        size="sm"
                        onClick={handleLogout}
                        className="gap-1.5 border-neutral-gray-light bg-white/70 text-neutral-gray-dark"
                    >
                        <LogOut className="w-3.5 h-3.5" strokeWidth={1.75} />
                        退出
                    </Button>
                </div>
            </header>

            {/* 概览数字 */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                <MetricTile label="Skill 总数" value={data.stats.skills} />
                <MetricTile label="注册用户" value={data.stats.users} />
                <MetricTile label="累计安装" value={data.stats.downloads} />
                <MetricTile
                    label="流失提交"
                    value={data.stats.failedSubmissions}
                    hint={data.stats.failedSubmissions > 0 ? '有校验失败的提交待回捞' : undefined}
                />
            </div>

            <div className="grid lg:grid-cols-[13rem_minmax(0,1fr)] gap-6 lg:gap-8 items-start">
                {/* 左栏导航：编辑式竖排，激活项用品牌色细线标记，不用胶囊 */}
                <nav className="lg:sticky lg:top-28 flex flex-col gap-6">
                    {NAV_GROUPS.map(g => (
                        <div key={g.group}>
                            <p className="px-3 mb-2 text-[11px] font-medium tracking-[0.2em] uppercase text-neutral-gray-medium">
                                {g.group}
                            </p>
                            <div className="flex flex-col">
                                {g.items.map(item => {
                                    const active = tab === item.key;
                                    const count = navCount[item.key];
                                    return (
                                        <button
                                            key={item.key}
                                            onClick={() => setTab(item.key)}
                                            className={`group flex items-center justify-between gap-2 border-l-2 px-3 py-2 text-sm text-left transition-colors ${
                                                active
                                                    ? 'border-king-forest bg-white/70 font-medium text-king-forest'
                                                    : 'border-neutral-gray-light/80 text-neutral-gray-medium hover:border-king-forest/40 hover:text-neutral-gray-dark'
                                            }`}
                                        >
                                            <span className="truncate">{item.label}</span>
                                            {count != null && (
                                                <span
                                                    className={`font-mono text-xs tabular-nums ${
                                                        item.key === 'failed' && count > 0
                                                            ? 'text-red-600'
                                                            : 'text-neutral-gray-medium/70'
                                                    }`}
                                                >
                                                    {count}
                                                </span>
                                            )}
                                        </button>
                                    );
                                })}
                            </div>
                        </div>
                    ))}
                    {/* 使用统计是独立子页（图表多），不做面板内 tab */}
                    <div>
                        <p className="px-3 mb-2 text-[11px] font-medium tracking-[0.2em] uppercase text-neutral-gray-medium">
                            数据
                        </p>
                        <a
                            href={pageUrl(`/${lang}/admin/telemetry`)}
                            className="group flex items-center justify-between gap-2 border-l-2 border-neutral-gray-light/80 px-3 py-2 text-sm text-neutral-gray-medium transition-colors hover:border-king-forest/40 hover:text-neutral-gray-dark"
                        >
                            <span className="flex items-center gap-2 truncate">
                                <BarChart3 className="w-3.5 h-3.5 flex-shrink-0" strokeWidth={1.75} />
                                使用统计
                            </span>
                            <ArrowUpRight
                                className="w-3.5 h-3.5 flex-shrink-0 text-neutral-gray-medium/50 group-hover:text-king-forest transition-colors"
                                strokeWidth={1.75}
                            />
                        </a>
                    </div>
                </nav>

                <div className="min-w-0 flex flex-col gap-6">
                    {/* Skill 管理 */}
                    {tab === 'skills' && (
                        <>
                            <SectionHeader
                                eyebrow="内容运营"
                                title="Skill 管理"
                                description="广场在架的全部 Skill。精选会进广场首屏推荐位；下架只从广场移除，已安装的桌面端不受影响。"
                            />
                            <Panel padded={false}>
                                {data.skills.length === 0 ? (
                                    <EmptyState icon={Inbox} title="还没有 Skill" hint="等待社区提交，或从策展账号导入精选条目。" />
                                ) : (
                                    <TableShell>
                                        <Thead>
                                            <tr>
                                                <th className={TH}>Skill</th>
                                                <th className={TH}>作者</th>
                                                <th className={TH}>分类</th>
                                                <th className={TH_RIGHT}>安装</th>
                                                <th className={TH}>来源</th>
                                                <th className={TH_RIGHT}>操作</th>
                                            </tr>
                                        </Thead>
                                        <tbody>
                                            {data.skills.map(s => (
                                                <tr key={s.id} className={TR}>
                                                    <td className={TD}>
                                                        <span className="font-medium text-neutral-dark-bg">{s.name}</span>
                                                        <span className="block font-mono text-[11px] text-neutral-gray-medium mt-0.5">
                                                            {s.id}
                                                        </span>
                                                    </td>
                                                    <td className={TD}>{s.author?.displayName || '—'}</td>
                                                    <td className={TD}>{s.category || '—'}</td>
                                                    <td className={TD_NUM}>{s.downloads}</td>
                                                    <td className={TD}>
                                                        {s.origin ? (
                                                            <a
                                                                href={s.origin.url}
                                                                target="_blank"
                                                                rel="noopener noreferrer"
                                                                className="text-xs text-king-forest underline-offset-2 hover:underline"
                                                            >
                                                                {s.origin.author}
                                                            </a>
                                                        ) : (
                                                            <span className="text-xs text-neutral-gray-medium">原创</span>
                                                        )}
                                                    </td>
                                                    <td className={`${TD} text-right`}>
                                                        <div className="flex items-center justify-end gap-1">
                                                            <button
                                                                onClick={() => toggleFeatured(s.id, !s.featured)}
                                                                disabled={busy === s.id}
                                                                title={s.featured ? '取消精选' : '设为精选'}
                                                                className={`p-1.5 rounded-md transition-colors disabled:opacity-40 ${
                                                                    s.featured
                                                                        ? 'text-king-forest hover:bg-king-forest-lightest'
                                                                        : 'text-neutral-gray-medium hover:text-king-forest hover:bg-king-forest-lightest'
                                                                }`}
                                                            >
                                                                <Star
                                                                    className={`w-4 h-4 ${s.featured ? 'fill-current' : ''}`}
                                                                    strokeWidth={1.75}
                                                                />
                                                            </button>
                                                            <button
                                                                onClick={() => removeSkill(s.id, s.name)}
                                                                disabled={busy === s.id}
                                                                title="下架"
                                                                className="p-1.5 rounded-md text-neutral-gray-medium transition-colors hover:text-red-600 hover:bg-red-50 disabled:opacity-40"
                                                            >
                                                                <Trash2 className="w-4 h-4" strokeWidth={1.75} />
                                                            </button>
                                                        </div>
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </TableShell>
                                )}
                            </Panel>
                        </>
                    )}

                    {tab === 'developers' && <DeveloperReview />}

                    {/* 插件审核：可执行代码，必须人工逐个过，见 PluginReview 组件注释 */}
                    {tab === 'plugins' && (
                        <>
                            <SectionHeader
                                eyebrow="内容运营"
                                title="插件审核"
                                description="插件是可执行代码，与桌面端宿主同权限。通过即对该版本签名，因此不提供批量通过。"
                            />
                            <PluginReview />
                        </>
                    )}

                    {/* 社区论坛：举报处置 + 帖子开关 + 聊天删除，见 CommunityModeration 组件注释 */}
                    {tab === 'community' && (
                        <>
                            <SectionHeader
                                eyebrow="内容运营"
                                title="社区论坛"
                                description="博客与讨论帖的置顶/精选/隐藏/删除，用户举报处置，以及聊天室发言管理。"
                            />
                            <CommunityModeration />
                        </>
                    )}

                    {/* 用户反馈：数据在云端收件箱，经服务端代理取回，见 FeedbackInbox 组件注释 */}
                    {tab === 'feedback' && (
                        <>
                            <SectionHeader
                                eyebrow="内容运营"
                                title="用户反馈"
                                description="桌面端右下角浮窗提交的反馈。截图与语音直接在这里看和听；优化者邮件里的直达链接也落到本分区。"
                            />
                            <FeedbackInbox focusId={feedbackFocus} />
                        </>
                    )}

                    {/* 原生资源包审核：包里是会被 spawn 的脚本与原生二进制，见 PackReview 组件注释 */}
                    {tab === 'packs' && (
                        <>
                            <SectionHeader
                                eyebrow="内容运营"
                                title="资源包审核"
                                description="原生资源包装的是被宿主 spawn 的脚本与二进制。通过即签名并生成发布件，推镜像与切指针仍是服务器侧的人工动作。"
                            />
                            <PackReview />
                        </>
                    )}

                    {/* 用户 */}
                    {tab === 'users' && (
                        <>
                            <SectionHeader eyebrow="配置与用户" title="用户" description="官网账户体系的注册用户，用于 Skill 提交、购买与额度归属。只列境内站有手机号、国际站有邮箱的用户，不含系统种子账号与已注销账户。" />
                            <Panel padded={false}>
                                {data.users.length === 0 ? (
                                    <EmptyState icon={Users} title="还没有用户" hint="用户从官网注册或桌面端连接账户后出现在这里。" />
                                ) : (
                                    <TableShell>
                                        <Thead>
                                            <tr>
                                                <th className={TH}>序号</th>
                                                <th className={TH}>用户名</th>
                                                <th className={TH}>昵称</th>
                                                <th className={TH}>邮箱</th>
                                                <th className={TH}>手机号</th>
                                                <th className={TH}>注册时间</th>
                                                <th className={TH} title={copy.lastLoginHint}>{copy.lastLoginAt}</th>
                                            </tr>
                                        </Thead>
                                        <tbody>
                                            {data.users.map((u, i) => (
                                                <tr key={u.username} className={TR}>
                                                    <td className={`${TD} font-mono tabular-nums text-neutral-gray-medium`}>{i + 1}</td>
                                                    <td className={`${TD} font-mono text-neutral-dark-bg`}>{u.username}</td>
                                                    <td className={TD}>{u.displayName}</td>
                                                    <td className={TD}>{u.email || '—'}</td>
                                                    <td className={`${TD} font-mono whitespace-nowrap`}>
                                                        {/* 3-4-4 分组便于读号；非 11 位的原样显示 */}
                                                        {u.phone ? u.phone.replace(/^(\d{3})(\d{4})(\d{4})$/, '$1 $2 $3') : '—'}
                                                    </td>
                                                    <td className={`${TD} text-neutral-gray-medium whitespace-nowrap`}>
                                                        {new Date(u.createdAt).toLocaleString('zh-CN')}
                                                    </td>
                                                    <td className={`${TD} text-neutral-gray-medium whitespace-nowrap`} title={copy.lastLoginHint}>
                                                        {u.lastLoginAt ? new Date(u.lastLoginAt).toLocaleString(locale) : copy.lastLoginUnknown}
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </TableShell>
                                )}
                            </Panel>
                        </>
                    )}

                    {/* 流失投稿 */}
                    {tab === 'failed' && (
                        <>
                            <SectionHeader
                                eyebrow="配置与用户"
                                title="流失提交"
                                description="校验失败、没能进广场的提交原文。每一条背后都是一个愿意贡献但被挡在门外的作者，值得逐条回捞。"
                            />
                            {data.failedSubmissions.length === 0 ? (
                                <Panel padded={false}>
                                    <EmptyState icon={FileWarning} title="没有校验失败的提交记录" hint="提交表单当前没有把任何人挡在门外。" />
                                </Panel>
                            ) : (
                                data.failedSubmissions.map((f, i) => (
                                    <Panel key={i}>
                                        <div className="flex items-center gap-3 text-xs text-neutral-gray-medium mb-3 flex-wrap">
                                            <span>{new Date(f.at).toLocaleString('zh-CN')}</span>
                                            <span className="w-px h-3 bg-neutral-gray-light" />
                                            <StatusDot tone="danger">{f.error}</StatusDot>
                                            <span className="w-px h-3 bg-neutral-gray-light" />
                                            <span className="font-mono">userId: {f.userId}</span>
                                        </div>
                                        <pre className="text-xs text-neutral-gray-dark bg-neutral-gray-pale rounded-lg p-4 whitespace-pre-wrap break-words max-h-64 overflow-y-auto">
                                            {JSON.stringify(f.input, null, 2)}
                                        </pre>
                                    </Panel>
                                ))
                            )}
                        </>
                    )}

                    {/* AI 与定价 */}
                    {tab === 'ai' && (
                        <>
                            <SectionHeader
                                eyebrow="配置与用户"
                                title="AI 与定价"
                                description="平台 AI 通道的额度池、站内 AI 辅助的模型配置，以及桌面端功能解锁 SKU 的售价。"
                            />

                            {/* AI 额度池（PR-W2）：主账户 credits 是所有 provisioned key 的共享池 */}
                            {data.ai.provider === 'bailian' ? <Notice>{bailianManaged}</Notice> : <Panel
                                title="AI 额度池"
                                description="用户额度以 OpenRouter 子 Key 的 limit 形式下发，实际消耗都从主账户扣。"
                            >
                                {!pool ? (
                                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                                        {[0, 1, 2].map(i => (
                                            <Skeleton key={i} className="h-20 rounded-lg" />
                                        ))}
                                    </div>
                                ) : (
                                    <div className="flex flex-col gap-5">
                                        <div className="divide-y divide-neutral-gray-light/70 border-y border-neutral-gray-light/70">
                                            <ConfigStatus
                                                ok={pool.provisioningConfigured}
                                                label="Management Key（OPENROUTER_PROVISIONING_KEY）"
                                                detail={
                                                    <>
                                                        用来给每个用户签发独立子 Key 的「供应密钥」，
                                                        <strong className="font-medium text-neutral-gray-dark">
                                                            与下面对话用的 OpenRouter API Key 不是同一把
                                                        </strong>
                                                        ，需在 OpenRouter 后台的 Provisioning Keys 页单独创建。它只从服务器环境变量读取，
                                                        不能在本页面填写：改完 <code className="font-mono">.env.local</code> 后执行{' '}
                                                        <code className="font-mono">pm2 restart aiworkdeck-website --update-env</code> 才生效。
                                                    </>
                                                }
                                            />
                                            <ConfigStatus
                                                ok={pool.encryptionConfigured}
                                                label="加密密钥（AWD_KEY_ENCRYPTION_SECRET）"
                                                detail="用于加密落库的用户子 Key，缺失时额度签发功能整体不可用。"
                                            />
                                        </div>
                                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                                            <div className="bg-neutral-gray-pale/70 rounded-lg px-4 py-3.5">
                                                <p className="text-[11px] font-medium tracking-[0.14em] uppercase text-neutral-gray-medium">
                                                    主账户余额
                                                </p>
                                                <p className="text-xl font-bold text-neutral-dark-bg font-mono tabular-nums mt-1.5">
                                                    {pool.credits
                                                        ? `$${pool.credits.remainingUsd.toFixed(2)}`
                                                        : pool.creditsError
                                                          ? '查询失败'
                                                          : '—'}
                                                </p>
                                            </div>
                                            <div className="bg-neutral-gray-pale/70 rounded-lg px-4 py-3.5">
                                                <p className="text-[11px] font-medium tracking-[0.14em] uppercase text-neutral-gray-medium">
                                                    已分配 limit 总和
                                                </p>
                                                <p className="text-xl font-bold text-neutral-dark-bg font-mono tabular-nums mt-1.5">
                                                    ${pool.allocatedLimitUsd.toFixed(2)}
                                                </p>
                                            </div>
                                            <div className="bg-neutral-gray-pale/70 rounded-lg px-4 py-3.5">
                                                <p className="text-[11px] font-medium tracking-[0.14em] uppercase text-neutral-gray-medium">
                                                    差值（余额 − 已分配）
                                                </p>
                                                <p className="text-xl font-bold text-neutral-dark-bg font-mono tabular-nums mt-1.5">
                                                    {pool.credits
                                                        ? `$${(pool.credits.remainingUsd - pool.allocatedLimitUsd).toFixed(2)}`
                                                        : '—'}
                                                </p>
                                            </div>
                                        </div>
                                        {pool.accounts && (
                                            <p className="text-xs text-neutral-gray-medium font-mono">
                                                OpenRouter 账号：当前 {pool.accounts.currentAccount ?? '未配置'}
                                                {pool.accounts.retiredAccount ? ` / 旧账号 ${pool.accounts.retiredAccount}` : ''}
                                                {' · 有效 key '}
                                                {pool.accounts.activeKeys.length
                                                    ? pool.accounts.activeKeys.map(k => `${k.role}=${k.count}`).join('，')
                                                    : '0'}
                                                {` · 待回读的退役 key ${pool.accounts.pendingRetiredKeys}`}
                                            </p>
                                        )}
                                        {pool.credits &&
                                            pool.credits.remainingUsd - pool.allocatedLimitUsd <
                                                pool.allocatedLimitUsd * 0.2 && (
                                                <Notice tone="danger">
                                                    分配总额已接近主账户余额：limit 是共享池口径，用户实际消耗时从主账户扣。请尽快在
                                                    OpenRouter 充值或开启 Auto Top-Up，避免用户额度未用完但池子先枯。
                                                </Notice>
                                            )}
                                    </div>
                                )}
                            </Panel>}

                            {/* AI 配置 */}
                            <Panel
                                title="站内 AI 辅助"
                                description={data.ai.provider === 'bailian' ? bailianManaged : '提交页「AI 帮写」用的对话通道，与上面的额度签发是两套凭据。'}
                            >
                                <div className="flex flex-col gap-5">
                                    <div className="border-y border-neutral-gray-light/70 py-3">
                                        <ConfigStatus
                                            ok={data.ai.configured}
                                            label={data.ai.provider === 'bailian' ? 'Bailian API Key' : 'OpenRouter API Key'}
                                            okText={`已配置（${data.ai.keyMasked}，来源${
                                                data.ai.keySource === 'env' ? '环境变量' : '后台保存'
                                            }）`}
                                            failText="未配置 —— 提交页 AI 辅助不可用"
                                            detail={
                                                data.ai.provider === 'bailian' ? bailianManaged : data.ai.keySource === 'env'
                                                    ? '环境变量 OPENROUTER_API_KEY 优先于此处保存的密钥。'
                                                    : undefined
                                            }
                                        />
                                    </div>
                                    {data.ai.provider !== 'bailian' && <Field label="OpenRouter API Key">
                                        <Input
                                            type="password"
                                            value={aiKey}
                                            onChange={e => setAiKey(e.target.value)}
                                            placeholder="sk-or-…（留空则不修改）"
                                            className="bg-white text-neutral-gray-dark font-mono"
                                        />
                                    </Field>}
                                    <Field label="模型" hint={data.ai.provider === 'bailian' ? bailianManaged : 'OpenRouter 模型 ID；模型下线会导致 404，换个可用的即可。'}>
                                        <Input
                                            value={aiModel}
                                            readOnly={data.ai.provider === 'bailian'}
                                            onChange={e => setAiModel(e.target.value)}
                                            placeholder="anthropic/claude-sonnet-4.5"
                                            className="bg-white text-neutral-gray-dark font-mono"
                                        />
                                    </Field>
                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                        {data.ai.fx?.liveEnabled ? (
                                            <>
                                                <div className="sm:col-span-2 border-y border-neutral-gray-light/70 py-3 text-sm text-neutral-gray-dark leading-relaxed">
                                                    <p>
                                                        当前生效汇率
                                                        <span className="ml-2 font-mono font-bold tabular-nums">{data.ai.fx.rate}</span>
                                                        <span className="ml-2 text-neutral-gray-medium">
                                                            来源：{FX_SOURCE_LABEL[data.ai.fx.source]}
                                                            {data.ai.fx.updatedAt
                                                                ? ` · 更新于 ${new Date(data.ai.fx.updatedAt).toLocaleString('zh-CN')}`
                                                                : ''}
                                                        </span>
                                                    </p>
                                                    <p className="text-xs text-neutral-gray-medium mt-1">
                                                        {data.ai.fx.live
                                                            ? `即时汇率 ${data.ai.fx.live.rate}，数据源：${data.ai.fx.live.sourceName}${
                                                                  data.ai.fx.live.asOf ? `（${data.ai.fx.live.asOf}）` : ''
                                                              }，取数于 ${new Date(data.ai.fx.live.fetchedAt).toLocaleString('zh-CN')}`
                                                            : `尚未取到即时汇率，自动模式下暂用站点默认值 ${data.ai.fx.defaultRate}（首次读取会在后台去取，稍后刷新本页）`}
                                                    </p>
                                                    {data.ai.fx.lastRejected && (
                                                        <p className="text-xs text-amber-800 mt-1">
                                                            最近一次被拒的取数：{data.ai.fx.lastRejected.rate}（{data.ai.fx.lastRejected.source}，
                                                            {data.ai.fx.lastRejected.reason === 'jump' ? '较上次有效值变动超过 5%' : '不在 5–10 区间内'}，
                                                            {new Date(data.ai.fx.lastRejected.at).toLocaleString('zh-CN')}）。
                                                            若真实汇率确已大幅变动，请切到手动。
                                                        </p>
                                                    )}
                                                </div>
                                                <Field label="汇率来源">
                                                    <select
                                                        value={aiRateMode}
                                                        onChange={e => setAiRateMode(e.target.value as 'auto' | 'manual')}
                                                        className="h-10 rounded-lg border border-neutral-gray-light bg-white px-3 text-sm text-neutral-gray-dark focus:outline-none focus:ring-2 focus:ring-king-mint"
                                                    >
                                                        <option value="auto">自动（跟随即时汇率，每 12 小时刷新）</option>
                                                        <option value="manual">手动（以右侧数值为准）</option>
                                                    </select>
                                                </Field>
                                                <Field label="手动汇率（CNY/USD）">
                                                    <Input
                                                        value={aiRate}
                                                        onChange={e => setAiRate(e.target.value)}
                                                        disabled={aiRateMode !== 'manual'}
                                                        placeholder={String(data.ai.fx.defaultRate)}
                                                        className="bg-white text-neutral-gray-dark font-mono disabled:opacity-60"
                                                    />
                                                </Field>
                                            </>
                                        ) : (
                                            <p className="sm:col-span-2 text-sm text-neutral-gray-dark">
                                                汇率恒为 1：本站本币即美元，不拉取即时汇率，也不接受手动覆盖。
                                            </p>
                                        )}
                                        <Field label="毛利乘数">
                                            <Input
                                                value={aiMargin}
                                                onChange={e => setAiMargin(e.target.value)}
                                                placeholder="1.2"
                                                className="bg-white text-neutral-gray-dark font-mono"
                                            />
                                        </Field>
                                        <p className="sm:col-span-2 text-xs leading-relaxed text-neutral-gray-medium">
                                            {copy.conversion.replace('{currency}', config.currency)}
                                        </p>
                                    </div>
                                    {aiMsg && <Notice>{aiMsg}</Notice>}
                                    <div className="flex gap-3">
                                        <Button onClick={saveAi} disabled={busy === 'ai'} className="font-bold">
                                            保存
                                        </Button>
                                        <Button
                                            onClick={testAi}
                                            disabled={busy === 'ai'}
                                            variant="outline"
                                            className="border-king-forest text-king-forest hover:bg-king-forest-lightest"
                                        >
                                            测试连通性
                                        </Button>
                                    </div>
                                </div>
                            </Panel>

                            {/* 商品定价（PR-W3）：feature SKU 的一次性解锁价，存 data/ai-config.json 同机制 */}
                            <Panel
                                title="商品定价"
                                description={copy.productDescription.replace('{unit}', config.currency)}
                            >
                                {!commerce ? (
                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                        {[0, 1, 2, 3].map(i => (
                                            <Skeleton key={i} className="h-16 rounded-lg" />
                                        ))}
                                    </div>
                                ) : (
                                    <div className="flex flex-col gap-5">
                                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                            {commerce.products.map(p => (
                                                <Field
                                                    key={p.key}
                                                    label={p.name}
                                                    suffix={p.key}
                                                    hint={`默认 ${fmtYuan(p.defaultPriceCents)}`}
                                                >
                                                    <Input
                                                        value={productPrices[p.key] ?? ''}
                                                        onChange={e =>
                                                            setProductPrices(prev => ({ ...prev, [p.key]: e.target.value }))
                                                        }
                                                        placeholder={(p.defaultPriceCents / 100).toFixed(2)}
                                                        className="bg-white text-neutral-gray-dark font-mono"
                                                    />
                                                </Field>
                                            ))}
                                        </div>
                                        {priceMsg && <Notice>{priceMsg}</Notice>}
                                        <div>
                                            <Button
                                                onClick={saveProductPrices}
                                                disabled={busy === 'product-prices'}
                                                className="font-bold"
                                            >
                                                保存定价
                                            </Button>
                                        </div>
                                    </div>
                                )}
                            </Panel>
                        </>
                    )}

                    {/* 商品与购买（PR-W3）：近 50 笔购买流水 */}
                    {tab === 'commerce' && (
                        <>
                            <SectionHeader
                                eyebrow="商业化"
                                title="商品与购买"
                                description="最近 50 笔成交流水，含创作者与平台的七三分成拆账。"
                            />
                            <Panel padded={false}>
                                {!commerce ? (
                                    <TableSkeleton rows={5} cols={5} />
                                ) : commerce.purchases.length === 0 ? (
                                    <EmptyState icon={Receipt} title="还没有购买记录" hint="用户在广场或桌面端完成付费后，流水会出现在这里。" />
                                ) : (
                                    <TableShell>
                                        <Thead>
                                            <tr>
                                                <th className={TH}>时间</th>
                                                <th className={TH}>商品</th>
                                                <th className={TH}>类型</th>
                                                <th className={TH}>买家</th>
                                                <th className={TH}>创作者</th>
                                                <th className={TH_RIGHT}>成交价</th>
                                                <th className={TH_RIGHT}>创作者分成</th>
                                                <th className={TH_RIGHT}>平台分成</th>
                                            </tr>
                                        </Thead>
                                        <tbody>
                                            {commerce.purchases.map(p => (
                                                <tr key={p.id} className={TR}>
                                                    <td className={`${TD} text-neutral-gray-medium whitespace-nowrap`}>
                                                        {new Date(p.createdAt).toLocaleString('zh-CN')}
                                                    </td>
                                                    <td className={TD}>
                                                        <span className="font-medium text-neutral-dark-bg">{p.itemName}</span>
                                                        <span className="block font-mono text-[11px] text-neutral-gray-medium mt-0.5">
                                                            {p.itemId}
                                                        </span>
                                                    </td>
                                                    <td className={TD}>
                                                        {p.itemType === 'skill'
                                                            ? 'Skill'
                                                            : p.itemType === 'plugin'
                                                              ? '插件'
                                                              : '功能解锁'}
                                                    </td>
                                                    <td className={`${TD} font-mono`}>{p.buyer}</td>
                                                    <td className={`${TD} font-mono`}>{p.creator ?? '—'}</td>
                                                    <td className={`${TD_NUM} text-neutral-dark-bg font-medium`}>
                                                        {fmtYuan(p.priceCents)}
                                                    </td>
                                                    <td className={TD_NUM}>
                                                        {p.creatorShareCents ? fmtYuan(p.creatorShareCents) : '—'}
                                                    </td>
                                                    <td className={TD_NUM}>
                                                        {p.platformShareCents != null ? fmtYuan(p.platformShareCents) : '—'}
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </TableShell>
                                )}
                            </Panel>
                        </>
                    )}

                    {/* 收益结算：Credits 重构 P2 起分成在履约事务里即时入账，此处退化为对账视图；
                        「补结算」只用于 P2 之前遗留或人工改数据造成的 settledAt 为空 */}
                    {tab === 'earnings' && (
                        <>
                            <SectionHeader
                                eyebrow="商业化"
                                title="收益结算"
                                description="分成已改为即时入账：成交时按 70% 直接发为创作者的 Credits（reward 批次，不可提现、24 个月有效），无需人工打款。下表为对账视图；若因历史遗留出现「待结算」，「补结算」会一次性把该创作者的欠账补发成 Credits 并写入 admin_audit。"
                            />
                            {settleMsg && <Notice>{settleMsg}</Notice>}
                            {!commerce ? (
                                <Panel padded={false}>
                                    <TableSkeleton rows={3} cols={3} />
                                </Panel>
                            ) : commerce.earnings.length === 0 ? (
                                <Panel padded={false}>
                                    <EmptyState icon={Wallet} title="还没有创作者收益记录" hint="付费条目产生成交后，创作者分成会在这里聚合。" />
                                </Panel>
                            ) : (
                                commerce.earnings.map(e => (
                                    <Panel key={e.creatorUserId}>
                                        <div className="flex flex-wrap items-center gap-4">
                                            <div className="min-w-0 flex-1">
                                                <p className="font-medium text-neutral-dark-bg">
                                                    {e.displayName}
                                                    <span className="ml-2 font-mono text-xs text-neutral-gray-medium">
                                                        @{e.username}
                                                    </span>
                                                </p>
                                                <p className="text-sm text-neutral-gray-medium mt-1">
                                                    待结算{' '}
                                                    <span className="font-mono tabular-nums font-bold text-king-forest">
                                                        {fmtYuan(e.pendingCents)}
                                                    </span>
                                                    （{e.pendingCount} 笔） · 已结算{' '}
                                                    <span className="font-mono tabular-nums">{fmtYuan(e.settledCents)}</span>
                                                </p>
                                            </div>
                                            {e.pendingCents > 0 && (
                                                <div className="flex items-center gap-2">
                                                    <Input
                                                        value={settleNotes[e.creatorUserId] ?? ''}
                                                        onChange={ev =>
                                                            setSettleNotes(prev => ({
                                                                ...prev,
                                                                [e.creatorUserId]: ev.target.value,
                                                            }))
                                                        }
                                                        placeholder="结算说明（转账凭证）"
                                                        className="w-56 bg-white text-neutral-gray-dark"
                                                    />
                                                    <Button
                                                        onClick={() =>
                                                            settleEarnings(e.creatorUserId, e.displayName, e.pendingCents)
                                                        }
                                                        disabled={busy === `settle-${e.creatorUserId}`}
                                                        className="font-bold"
                                                    >
                                                        标记已结算
                                                    </Button>
                                                </div>
                                            )}
                                        </div>
                                    </Panel>
                                ))
                            )}
                        </>
                    )}

                    {/* 法人格增长（dev-board#329）：测试漏斗/类型分布/来源/测后转化，维护者自助看数 */}
                    {tab === 'growth' && (
                        <>
                            <SectionHeader
                                eyebrow="内容运营"
                                title="法人格增长"
                                description="「测测你是哪种法律人」的转化漏斗、类型分布与来源。口径：数据来自 quiz-events.jsonl 逐事件流水，按北京时间归日；测后注册引导计 start-refs 里 quiz-* 来源。"
                            />
                            <QuizGrowth />
                        </>
                    )}

                    {/* 成本台账：外部服务余额与「还能撑几天」，防「用户充了钱、我们没给上游充值」 */}
                    {tab === 'costs' && (
                        <>
                            <SectionHeader
                                eyebrow="商业化"
                                title="成本台账"
                                description="外部服务（OpenRouter / 阿里云 / 法宝 / 企查查等）的余额、估算日耗与可用天数。OpenRouter 与阿里云余额自动拉取，其余到对应控制台抄一次数字手动记账。"
                            />
                            <CostLedger />
                        </>
                    )}

                    {/* 账目公开：半年一期的对外账目与使用情况（dev-board#611 / #612） */}
                    {tab === 'transparency' && (
                        <>
                            <SectionHeader
                                eyebrow="商业化"
                                title="账目公开"
                                description="每半年公布一次账目与使用情况（官网 /transparency + GitHub）。先「自动取数」把能查的数字填满，再补渠道费、发起人前期垫付与捐赠，上传凭证后发布，最后导出 Markdown 贴到仓库。"
                            />
                            <Transparency />
                        </>
                    )}

                    {/* 平台服务定价：service_pricing 全表在线调，改价不发版 */}
                    {tab === 'pricing' && (
                        <>
                            <SectionHeader
                                eyebrow="商业化"
                                title="服务定价"
                                description="平台代采的外部服务（语音转写 / OCR / 搜索 / 企业数据…）折算成 Credits 的单价。保存即生效，下一次调用就按新价扣。"
                            />

                            {!pricing ? (
                                <Panel padded={false}>
                                    <TableSkeleton rows={6} cols={6} />
                                </Panel>
                            ) : (
                                <>
                                    <Panel
                                        title="注册赠额"
                                        description="新用户建号即得的一笔 Credits，走 reward 批次（24 个月有效期、不可退现）。金额与活动窗口在服务器配置里改（GW_SIGNUP_GRANT_CENTS / GW_SIGNUP_GRANT_START_AT / GW_SIGNUP_GRANT_END_AT 或 data/gateway-config.json）。"
                                    >
                                        <div className="flex flex-col gap-5">
                                            <div className="border-y border-neutral-gray-light/70 py-3">
                                                <ConfigStatus
                                                    ok={pricing.signupGrant.active}
                                                    label="活动状态"
                                                    okText="进行中（新注册即发）"
                                                    failText={
                                                        pricing.signupGrant.amountCents <= 0
                                                            ? '未开启（赠额配成 0）'
                                                            : '不在活动窗口内（新注册不发）'
                                                    }
                                                    detail={
                                                        <>
                                                            单笔 {fmtYuan(pricing.signupGrant.amountCents)}；窗口{' '}
                                                            {pricing.signupGrant.startAt
                                                                ? new Date(pricing.signupGrant.startAt).toLocaleString('zh-CN')
                                                                : '不限起'}{' '}
                                                            至{' '}
                                                            {pricing.signupGrant.endAt
                                                                ? new Date(pricing.signupGrant.endAt).toLocaleString('zh-CN')
                                                                : '不限止'}
                                                            。同一账户只发一次，重复注册与重放都不会重复发。
                                                        </>
                                                    }
                                                />
                                            </div>
                                            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                                                <div className="bg-neutral-gray-pale/70 rounded-lg px-4 py-3.5">
                                                    <p className="text-[11px] font-medium tracking-[0.14em] uppercase text-neutral-gray-medium">
                                                        单笔金额
                                                    </p>
                                                    <p className="text-xl font-bold text-neutral-dark-bg font-mono tabular-nums mt-1.5">
                                                        {fmtYuan(pricing.signupGrant.amountCents)}
                                                    </p>
                                                </div>
                                                <div className="bg-neutral-gray-pale/70 rounded-lg px-4 py-3.5">
                                                    <p className="text-[11px] font-medium tracking-[0.14em] uppercase text-neutral-gray-medium">
                                                        本次活动已发放
                                                    </p>
                                                    <p className="text-xl font-bold text-neutral-dark-bg font-mono tabular-nums mt-1.5">
                                                        {pricing.signupGrant.granted.count} 笔
                                                    </p>
                                                </div>
                                                <div className="bg-neutral-gray-pale/70 rounded-lg px-4 py-3.5">
                                                    <p className="text-[11px] font-medium tracking-[0.14em] uppercase text-neutral-gray-medium">
                                                        已发放金额
                                                    </p>
                                                    <p className="text-xl font-bold text-neutral-dark-bg font-mono tabular-nums mt-1.5">
                                                        {fmtYuan(pricing.signupGrant.granted.totalCents)}
                                                    </p>
                                                </div>
                                            </div>
                                        </div>
                                    </Panel>

                                    <Panel padded={false}>
                                        <TableShell>
                                            <Thead>
                                                <tr>
                                                    <th className={TH}>服务 / 操作</th>
                                                    <th className={TH_RIGHT}>采购成本（分）</th>
                                                    <th className={TH_RIGHT}>加价率</th>
                                                    <th className={TH_RIGHT}>单次上限</th>
                                                    <th className={TH_RIGHT}>售价（分）</th>
                                                    <th className={TH_RIGHT}>毛利率</th>
                                                    <th className={TH}>开放</th>
                                                    <th className={TH_RIGHT}>操作</th>
                                                </tr>
                                            </Thead>
                                            <tbody>
                                                {pricing.pricing.map(r => {
                                                    const id = `${r.service}/${r.op}`;
                                                    const draft = pricingDrafts[id];
                                                    if (!draft) return null;
                                                    const cost = Number(draft.cost);
                                                    const margin = Number(draft.margin);
                                                    const valid = Number.isFinite(cost) && Number.isFinite(margin) && cost >= 0 && margin > 0;
                                                    // 派生单价与毛利率跟着输入实时走：调价的人当场看到「这个价我赚多少」，
                                                    // 而不是保存完再回头算——按分取整之后，名义加价率和实际毛利常常不是一回事。
                                                    const credits = valid ? derivedCredits(cost, margin) : null;
                                                    const rate = credits === null ? null : grossMarginRate(cost, credits);
                                                    const dirty =
                                                        String(r.costCentsPerUnit) !== draft.cost ||
                                                        String(r.marginMultiplier) !== draft.margin ||
                                                        String(r.maxUnitsPerCall) !== draft.maxUnits ||
                                                        r.enabled !== draft.enabled;
                                                    const patch = (p: Partial<PricingDraft>) =>
                                                        setPricingDrafts(prev => ({ ...prev, [id]: { ...prev[id], ...p } }));
                                                    return (
                                                        <tr key={id} className={TR}>
                                                            <td className={TD}>
                                                                <span className="font-medium text-neutral-dark-bg">{r.service}</span>
                                                                <span className="block font-mono text-[11px] text-neutral-gray-medium mt-0.5">
                                                                    {r.op} · 每{UNIT_LABEL[r.unit] ?? r.unit}
                                                                </span>
                                                            </td>
                                                            <td className={TD_NUM}>
                                                                <Input
                                                                    value={draft.cost}
                                                                    onChange={e => patch({ cost: e.target.value })}
                                                                    className="w-24 ml-auto bg-white text-right text-neutral-gray-dark font-mono"
                                                                />
                                                            </td>
                                                            <td className={TD_NUM}>
                                                                <Input
                                                                    value={draft.margin}
                                                                    onChange={e => patch({ margin: e.target.value })}
                                                                    className="w-20 ml-auto bg-white text-right text-neutral-gray-dark font-mono"
                                                                />
                                                            </td>
                                                            <td className={TD_NUM}>
                                                                <Input
                                                                    value={draft.maxUnits}
                                                                    onChange={e => patch({ maxUnits: e.target.value })}
                                                                    className="w-20 ml-auto bg-white text-right text-neutral-gray-dark font-mono"
                                                                />
                                                            </td>
                                                            <td className={TD_NUM}>
                                                                <span className="font-bold text-neutral-dark-bg">
                                                                    {credits ?? '—'}
                                                                </span>
                                                                {credits !== null && credits !== r.creditsPerUnit && (
                                                                    <span className="block text-[11px] text-neutral-gray-medium mt-0.5">
                                                                        原 {r.creditsPerUnit}
                                                                    </span>
                                                                )}
                                                            </td>
                                                            <td className={TD_NUM}>
                                                                {rate === null ? (
                                                                    <span className="text-neutral-gray-medium">—</span>
                                                                ) : (
                                                                    <span className={rate <= 0 ? 'text-red-600' : ''}>
                                                                        {(rate * 100).toFixed(1)}%
                                                                    </span>
                                                                )}
                                                            </td>
                                                            <td className={TD}>
                                                                <button
                                                                    onClick={() => patch({ enabled: !draft.enabled })}
                                                                    className="text-sm"
                                                                >
                                                                    <StatusDot tone={draft.enabled ? 'ok' : 'muted'}>
                                                                        {draft.enabled ? '开放' : '未开放'}
                                                                    </StatusDot>
                                                                </button>
                                                            </td>
                                                            <td className={`${TD} text-right`}>
                                                                <Button
                                                                    size="sm"
                                                                    onClick={() => savePricingRow(r)}
                                                                    disabled={!dirty || !valid || busy === `pricing-${id}`}
                                                                    className="font-bold"
                                                                >
                                                                    保存
                                                                </Button>
                                                            </td>
                                                        </tr>
                                                    );
                                                })}
                                            </tbody>
                                        </TableShell>
                                    </Panel>

                                    {pricingMsg && <Notice>{pricingMsg}</Notice>}
                                    <Notice tone="warn">
                                        售价 = 采购成本 × 加价率，<strong className="font-medium">向上</strong>取整到分。
                                        不是四舍五入：成本 2 分、加价率 1.2 得 2.4，四舍五入回 2 分就是零毛利。
                                        按分取整意味着低价项的实际毛利率会高于名义加价率，以「毛利率」这一列的真实数字为准。
                                    </Notice>
                                </>
                            )}
                        </>
                    )}

                    {/* 兑换码（PR-W4）：批量生成 + 核销状态列表 + 撤销未核销码 */}
                    {tab === 'gift' && (
                        <>
                            <SectionHeader
                                eyebrow="商业化"
                                title="兑换码"
                                description="码格式 AWDG-XXXX-XXXX-XXXX，一码一次、核销后不可复用。与试用码（AWD-T- 前缀，离线解锁应用）是两回事，不要混发给用户。"
                            />

                            <Panel title="批量生成" description="单次最多 200 枚。充值码等于凭空造钱，生成前会二次确认。">
                                <div className="flex flex-col gap-5">
                                    <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
                                        <Field label="类型">
                                            <select
                                                value={giftKind}
                                                onChange={e => setGiftKind(e.target.value as 'recharge' | 'entitlement')}
                                                className="h-10 rounded-lg border border-neutral-gray-light bg-white px-3 text-sm text-neutral-gray-dark focus:outline-none focus:ring-2 focus:ring-king-mint"
                                            >
                                                <option value="recharge">充值（入钱包余额）</option>
                                                <option value="entitlement">权益（直接发功能解锁）</option>
                                            </select>
                                        </Field>
                                        <Field label="数量">
                                            <Input
                                                value={giftCount}
                                                onChange={e => setGiftCount(e.target.value)}
                                                placeholder="10"
                                                className="bg-white text-neutral-gray-dark font-mono"
                                            />
                                        </Field>
                                        {giftKind === 'recharge' ? (
                                            <Field label={copy.giftLabel.replace('{unit}', config.currency)}>
                                                <Input
                                                    value={giftAmount}
                                                    onChange={e => setGiftAmount(e.target.value)}
                                                    placeholder="50"
                                                    className="bg-white text-neutral-gray-dark font-mono"
                                                />
                                            </Field>
                                        ) : (
                                            <Field
                                                label="权益"
                                                hint="也可填 skill:<id> 或 plugin:<id> 赠送付费条目。赠送不产生购买记录、不给创作者分成，成本由平台承担。"
                                            >
                                                <Input
                                                    value={giftFeature}
                                                    onChange={e => setGiftFeature(e.target.value)}
                                                    list="gift-feature-options"
                                                    placeholder="clipboard.unlimited"
                                                    className="bg-white text-neutral-gray-dark font-mono"
                                                />
                                                <datalist id="gift-feature-options">
                                                    {(gift?.features ?? []).map(f => (
                                                        <option key={f.key} value={f.key}>
                                                            {f.name}
                                                        </option>
                                                    ))}
                                                </datalist>
                                            </Field>
                                        )}
                                        <Field label="备注">
                                            <Input
                                                value={giftNote}
                                                onChange={e => setGiftNote(e.target.value)}
                                                placeholder="用途说明，如「2026 春季线下沙龙」"
                                                className="bg-white text-neutral-gray-dark"
                                            />
                                        </Field>
                                    </div>
                                    {giftMsg && <Notice>{giftMsg}</Notice>}
                                    <div className="flex gap-3">
                                        <Button onClick={generateGift} disabled={busy === 'gift-generate'} className="font-bold">
                                            生成
                                        </Button>
                                        {giftBatch.length > 0 && (
                                            <Button
                                                variant="outline"
                                                onClick={() => exportGiftBatch(giftBatch, `gift-codes-${Date.now()}.txt`)}
                                                className="border-king-forest text-king-forest hover:bg-king-forest-lightest"
                                            >
                                                导出本批为文本
                                            </Button>
                                        )}
                                    </div>
                                    {giftBatch.length > 0 && (
                                        <pre className="text-xs font-mono text-neutral-gray-dark bg-neutral-gray-pale rounded-lg p-4 max-h-64 overflow-y-auto">
                                            {giftBatch.join('\n')}
                                        </pre>
                                    )}
                                </div>
                            </Panel>

                            <Panel padded={false}>
                                <div className="flex flex-wrap items-center justify-between gap-4 px-6 py-4 border-b border-neutral-gray-light/70">
                                    <div className="text-sm text-neutral-gray-medium">
                                        {gift ? (
                                            <p className="flex flex-wrap items-center gap-x-4 gap-y-1">
                                                <span className="font-mono tabular-nums text-neutral-gray-dark">
                                                    共 {gift.stats.total} 枚
                                                </span>
                                                <StatusDot tone="ok">未核销 {gift.stats.available}</StatusDot>
                                                <StatusDot tone="muted">已核销 {gift.stats.redeemed}</StatusDot>
                                                <StatusDot tone="danger">已撤销 {gift.stats.revoked}</StatusDot>
                                            </p>
                                        ) : (
                                            <Skeleton className="h-3.5 w-48" />
                                        )}
                                        {gift && gift.stats.total > gift.codes.length && (
                                            <p className="mt-1.5 text-xs">
                                                下表只显示最新 {gift.codes.length} 枚；导出按钮取的是全部未核销码，不受此限制。
                                            </p>
                                        )}
                                    </div>
                                    {gift && gift.stats.available > 0 && (
                                        <Button
                                            variant="outline"
                                            size="sm"
                                            onClick={exportAvailableGift}
                                            disabled={busy === 'gift-export'}
                                            className="border-neutral-gray-light bg-white text-neutral-gray-dark"
                                        >
                                            导出全部未核销码
                                        </Button>
                                    )}
                                </div>
                                {!gift ? (
                                    <TableSkeleton rows={4} cols={5} />
                                ) : gift.codes.length === 0 ? (
                                    <EmptyState icon={Ticket} title="还没有生成过兑换码" hint="用上面的表单批量生成，导出后分发给运营。" />
                                ) : (
                                    <TableShell>
                                        <Thead>
                                            <tr>
                                                <th className={TH}>兑换码</th>
                                                <th className={TH}>内容</th>
                                                <th className={TH}>备注</th>
                                                <th className={TH}>状态</th>
                                                <th className={TH}>核销人</th>
                                                <th className={TH}>生成时间</th>
                                                <th className={TH_RIGHT}>操作</th>
                                            </tr>
                                        </Thead>
                                        <tbody>
                                            {gift.codes.map(c => (
                                                <tr key={c.code} className={TR}>
                                                    <td className={`${TD} font-mono text-neutral-dark-bg whitespace-nowrap`}>
                                                        {c.code}
                                                    </td>
                                                    <td className={TD}>
                                                        {c.kind === 'recharge'
                                                            ? `充值 ${c.amountCents != null ? fmtYuan(c.amountCents) : '—'}`
                                                            : `权益 ${c.feature ?? '—'}`}
                                                    </td>
                                                    <td className={`${TD} text-neutral-gray-medium`}>{c.note || '—'}</td>
                                                    <td className={TD}>
                                                        <StatusDot tone={GIFT_STATUS[c.status].tone}>
                                                            {GIFT_STATUS[c.status].label}
                                                        </StatusDot>
                                                    </td>
                                                    <td className={`${TD} font-mono`}>
                                                        {c.redeemedBy ?? '—'}
                                                        {c.redeemedAt && (
                                                            <span className="block text-[11px] text-neutral-gray-medium font-sans mt-0.5">
                                                                {new Date(c.redeemedAt).toLocaleString('zh-CN')}
                                                            </span>
                                                        )}
                                                    </td>
                                                    <td className={`${TD} text-neutral-gray-medium whitespace-nowrap`}>
                                                        {new Date(c.createdAt).toLocaleString('zh-CN')}
                                                    </td>
                                                    <td className={`${TD} text-right`}>
                                                        {c.status === 'available' && (
                                                            <Button
                                                                variant="outline"
                                                                size="sm"
                                                                onClick={() => revokeGift(c.code)}
                                                                disabled={busy === `gift-${c.code}`}
                                                                className="border-neutral-gray-light bg-white text-neutral-gray-dark hover:text-red-600 hover:border-red-200"
                                                            >
                                                                撤销
                                                            </Button>
                                                        )}
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </TableShell>
                                )}
                            </Panel>
                        </>
                    )}
                </div>
            </div>
        </div>
    );
}
