'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Locale, LOCALE_META } from '@/i18n-config';
import { Button } from '@/components/ui/button';
import { Wallet } from 'lucide-react';
import { RechargeDialog } from './RechargeDialog';
import { formatSiteAmount } from '@/lib/site-config';
import type { SubscriptionSnapshot } from '@/lib/subscription';

const PAGE_SIZE = 10;

interface LedgerEntry {
    id: number;
    ts: string;
    kind: 'recharge' | 'ai_alloc' | 'purchase' | 'earning' | 'adjust';
    amountCents: number;
    balanceAfterCents: number;
    subscriptionCents?: number;
}

interface WalletData {
    balanceCents: number;
    subscription?: SubscriptionSnapshot;
    /** 一个总数，内部分两类：充值来的不过期可退，奖励来的有有效期 */
    breakdown?: {
        totalCents: number;
        topupCents: number;
        rewardCents: number;
        nextExpiry: { at: string; amountCents: number } | null;
    };
    circleFirm?: {
        code: string;
        country: string;
        name: string;
        suffix: string;
        marginMultiplier: number;
        freeDeepseekCents: number;
        deepseekRemainingCents: number;
    };
    bqtQingtian?: {
        isBqtLawyer: true;
        monthKey: string;
        monthlyCoins: number;
        remainingCoins: number;
        remainingCents: number;
        centsPerCoin: number;
        creditsPerCoin: number;
    };
    billingLine?: 'bqt' | 'circle' | 'standard';
    /** 包晴天律师（积分通道开着）：会员状态与积分折算，契约见 lib/bqt-account.ts */
    bqtMember?: {
        points: string;
        cents: number;
        outstandingCents: number;
        failedCount: number;
        centsPerPoint: number;
        levelCode: 'LIGHT' | 'GROWTH' | null;
        status: 'ACTIVE' | 'EXPIRED';
        aiWorkbench: boolean;
        expireAt: string | null;
        fetchedAt: string;
        rechargeAllowed: false;
    } | null;
    total: number;
    entries: LedgerEntry[];
}

// 金额一律按**本站币种**格式化。formatSiteAmount 自带负号前置处理
// （流水有负数，输出 -$12.00 而不是 $-12.00）。
const formatYuan = formatSiteAmount;

export function WalletSection({ lang, dict }: { lang: Locale; dict: any }) {
    const t = dict.accountPage;
    const router = useRouter();
    const [data, setData] = useState<WalletData | null>(null);
    const [page, setPage] = useState(0);
    const [error, setError] = useState(false);
    const [rechargeOpen, setRechargeOpen] = useState(false);
    const [redeemCode, setRedeemCode] = useState('');
    const [redeemMsg, setRedeemMsg] = useState('');
    const [redeeming, setRedeeming] = useState(false);
    const [savingSubscription, setSavingSubscription] = useState(false);
    const [subscriptionError, setSubscriptionError] = useState('');

    const load = useCallback(async (pageIndex: number) => {
        try {
            const res = await fetch(
                `/api/account/wallet?limit=${PAGE_SIZE}&offset=${pageIndex * PAGE_SIZE}`
            );
            if (!res.ok) throw new Error('load failed');
            setData(await res.json());
            setError(false);
        } catch {
            setError(true);
        }
    }, []);

    useEffect(() => {
        load(page);
    }, [load, page]);

    // 兄弟卡片扣款后广播此事件，钱包余额与流水随之刷新
    useEffect(() => {
        const onChanged = () => {
            setPage(0);
            load(0);
        };
        window.addEventListener('awd:wallet-changed', onChanged);
        return () => window.removeEventListener('awd:wallet-changed', onChanged);
    }, [load]);

    // 兑换码：成功后刷新余额与流水（recharge 类会新增一行 kind=recharge）
    const redeem = async () => {
        setRedeemMsg('');
        setRedeeming(true);
        try {
            const res = await fetch('/api/account/redeem', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ code: redeemCode.trim() }),
            });
            const d = await res.json().catch(() => ({}));
            if (!res.ok) {
                setRedeemMsg(t.redeemErrors[d.error] ?? t.redeemFailed);
                return;
            }
            setRedeemCode('');
            if (d.kind === 'circle_firm') {
                setRedeemMsg(
                    t.circleFirmBound
                        .replace('{firm}', d.firmName ?? '')
                        .replace('{suffix}', d.suffix ?? '')
                        .replace('{amount}', formatYuan(d.amountCents ?? 0))
                );
                router.refresh();
            } else {
                setRedeemMsg(
                    d.kind === 'recharge'
                        ? `${t.redeemSuccess} ${formatYuan(d.amountCents)}`
                        : `${t.redeemSuccessFeature} ${d.feature}`
                );
            }
            setPage(0);
            load(0);
        } catch {
            // 网络失败不清空输入框：兑换可能已成功，让用户刷新页面确认后再重试
            setRedeemMsg(t.redeemFailed);
        } finally {
            setRedeeming(false);
        }
    };

    const setFallback = async (enabled: boolean) => {
        setSavingSubscription(true);
        setSubscriptionError('');
        try {
            const response = await fetch('/api/account/subscription', {
                method: 'PATCH', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ walletFallbackEnabled: enabled }),
            });
            if (!response.ok) throw new Error('sync failed');
        } catch {
            setSubscriptionError(t.quotaSyncFailed);
        } finally {
            await load(page);
            setSavingSubscription(false);
        }
    };
    const dateLocale = LOCALE_META[lang].bcp47;
    const credits = (cents: number) => (cents / 100).toLocaleString(dateLocale, { maximumFractionDigits: 2 });

    const totalPages = data ? Math.max(Math.ceil(data.total / PAGE_SIZE), 1) : 1;
    const isBqt = data?.billingLine === 'bqt';
    const tb = t.bqtMember;
    const bqt = data?.bqtMember;

    return (
        <div className="bg-white border border-[#dce2de] rounded-xl p-6 md:p-8 shadow-sm mb-10">
            <div className="flex flex-col md:flex-row md:items-center gap-4 mb-6">
                <div className="flex items-center gap-3 flex-1">
                    <Wallet className="w-5 h-5 text-king-forest" strokeWidth={1.75} />
                    <h2 className="font-display text-xl font-semibold text-neutral-dark-bg">{t.walletTitle}</h2>
                </div>
                <div className="flex min-w-0 flex-wrap items-center gap-4">
                    <div className="min-w-0 flex-1 text-left md:text-right">
                        <p className="text-xs text-neutral-gray-medium">{t.balanceLabel}</p>
                        <p className="break-words [overflow-wrap:anywhere] font-display text-2xl font-bold text-king-forest">
                            {data ? formatYuan(data.balanceCents) : '—'}
                        </p>
                        {/* 奖励部分会过期，必须在余额旁边就说清楚，别等用户到期了才发现 */}
                        {data?.breakdown && data.breakdown.rewardCents > 0 && (
                            <p className="mt-1 text-[11px] leading-relaxed text-neutral-gray-medium">
                                {t.rewardPortion.replace('{amount}', formatYuan(data.breakdown.rewardCents))}
                                {data.breakdown.nextExpiry && (
                                    <>
                                        {' · '}
                                        {t.nextExpiry
                                            .replace(
                                                '{amount}',
                                                formatYuan(data.breakdown.nextExpiry.amountCents)
                                            )
                                            .replace(
                                                '{date}',
                                                new Date(data.breakdown.nextExpiry.at).toLocaleDateString(
                                                    dateLocale
                                                )
                                            )}
                                    </>
                                )}
                            </p>
                        )}
                    </div>
                    {isBqt ? (
                        <p className="max-w-xs text-xs leading-relaxed text-neutral-gray-medium">{tb.rechargeHint}</p>
                    ) : (
                        <Button
                            onClick={() => setRechargeOpen(true)}
                            className="bg-king-forest hover:bg-king-forest/90 font-bold"
                        >
                            {t.recharge}
                        </Button>
                    )}
                </div>
            </div>

            {isBqt && (
                <section className="mb-6 rounded-xl border border-king-mint bg-king-mint/10 p-5" aria-label={tb.title}>
                    <h3 className="font-semibold text-king-forest">{tb.title}</h3>
                    {!bqt ? (
                        <p className="mt-1.5 text-sm text-neutral-gray-medium">{tb.unavailable}</p>
                    ) : (
                        <>
                            <p className="mt-1.5 text-sm text-neutral-dark-bg">
                                {tb.levelLabel}: {bqt.levelCode ? tb.levels[bqt.levelCode] : tb.levels.none}
                                {' · '}
                                {tb.statusLabel}: {tb.statuses[bqt.status]}
                                {' · '}
                                {bqt.expireAt
                                    ? tb.expires.replace('{date}', new Date(bqt.expireAt).toLocaleDateString(dateLocale, { timeZone: 'Asia/Shanghai' }))
                                    : tb.noExpiry}
                            </p>
                            <p className="mt-2 text-base font-bold text-neutral-dark-bg">
                                {tb.points.replace('{points}', bqt.points)}
                                {' ≈ '}
                                {tb.credits.replace('{amount}', formatYuan(bqt.cents))}
                            </p>
                            {bqt.outstandingCents > 0 && (
                                <p className="mt-1 text-sm text-neutral-gray-dark">{tb.outstanding.replace('{amount}', formatYuan(bqt.outstandingCents))}</p>
                            )}
                            {bqt.failedCount > 0 && (
                                <p role="alert" className="mt-1 text-sm text-red-700">{tb.failed.replace('{count}', String(bqt.failedCount))}</p>
                            )}
                            {bqt.status === 'ACTIVE' && !bqt.aiWorkbench && (
                                <p className="mt-1 text-sm text-neutral-gray-dark">{tb.aiClosed}</p>
                            )}
                            {data?.subscription?.source === 'bqt' && (
                                <p className="mt-1 text-sm text-king-forest">{tb.proRights}</p>
                            )}
                            <p className="mt-2 text-xs text-neutral-gray-medium">
                                {tb.fetchedAt.replace('{time}', new Date(bqt.fetchedAt).toLocaleString(dateLocale))}
                            </p>
                        </>
                    )}
                </section>
            )}

            {data?.circleFirm && (
                <section className="mb-6 rounded-xl border border-king-forest/20 bg-king-forest/5 p-5" aria-label={t.circleFirmBadge}>
                    <h3 className="font-semibold text-king-forest">{t.circleFirmBadge}</h3>
                    <p className="mt-1.5 text-sm text-neutral-dark-bg">
                        {t.circleFirmDesc
                            .replace('{firm}', data.circleFirm.name)
                            .replace('{suffix}', data.circleFirm.suffix)
                            .replace('{deepseekBalance}', formatYuan(data.circleFirm.deepseekRemainingCents))}
                    </p>
                </section>
            )}

            {data?.bqtQingtian?.isBqtLawyer && (
                <section className="mb-6 rounded-xl border border-king-mint bg-king-mint/10 p-5" aria-label={t.qingtianTitle}>
                    <h3 className="font-semibold text-king-forest">{t.qingtianTitle}</h3>
                    <p className="mt-1.5 text-base font-bold text-neutral-dark-bg">
                        {t.qingtianBalance
                            .replace('{remaining}', String(data.bqtQingtian.remainingCoins))
                            .replace('{monthly}', String(data.bqtQingtian.monthlyCoins))}
                    </p>
                    <p className="mt-1 text-xs text-neutral-gray-medium">
                        {t.qingtianRatioHint.replace('{creditsPerCoin}', String(data.bqtQingtian.creditsPerCoin))}
                    </p>
                </section>
            )}

            {data?.subscription?.active && data.subscription.source !== 'bqt' && (
                <section className="mb-6 rounded-xl border border-king-forest/20 bg-king-forest/5 p-5" aria-label={t.proAllowanceTitle}>
                    <h3 className="font-semibold text-king-forest">{t.proAllowanceTitle}</h3>
                    <p className="mt-2 text-sm">{t.proPeriodUsedLabel}: {credits(data.subscription.monthlyUsedCents)} / {credits(data.subscription.monthlyLimitCents)} Credits</p>
                    <p className="mt-1 text-sm">{t.proWeekUsedLabel}: {credits(data.subscription.weeklyUsedCents)} / {credits(data.subscription.weeklyLimitCents)} Credits</p>
                    <p className="mt-1 text-sm">{t.proAvailableNowLabel}: {credits(data.subscription.availableCents)} Credits</p>
                    <p className="mt-2 text-xs text-neutral-gray-medium">{t.proNextWeeklyResetLabel}: {data.subscription.weeklyEnd ? new Date(data.subscription.weeklyEnd).toLocaleString(dateLocale) : '—'} · {t.proPeriodEndsLabel}: {data.subscription.periodEnd ? new Date(data.subscription.periodEnd).toLocaleString(dateLocale) : '—'}</p>
                    <p className="mt-2 text-xs text-neutral-gray-medium">{t.proAllowanceNote}</p>

                </section>
            )}

            {data?.subscription && !isBqt && <div className="mb-6">
                    <label className="mt-4 flex items-start gap-2 text-sm">
                        <input type="checkbox" checked={data.subscription.walletFallbackEnabled} disabled={savingSubscription} onChange={e => setFallback(e.target.checked)} className="mt-1" />
                        <span>{t.proFallbackToggleLabel}</span>
                    </label>
                    {subscriptionError && <p role="alert" className="mt-2 text-sm text-red-700">{subscriptionError}</p>}
            </div>}

            {/* 兑换码：与充值同属「余额来源」，放在流水之上 */}
            <div className="flex flex-wrap items-center gap-3 mb-6 pb-6 border-b border-neutral-gray-light">
                <label className="text-sm font-bold text-neutral-gray-dark">{t.redeemTitle}</label>
                <input
                    value={redeemCode}
                    onChange={e => setRedeemCode(e.target.value)}
                    placeholder={t.redeemPlaceholder}
                    className="h-11 min-w-0 w-full sm:w-64 max-w-full rounded-lg border border-neutral-gray-light bg-white px-3 text-sm font-mono text-neutral-gray-dark"
                />
                <Button
                    variant="outline"
                    size="sm"
                    disabled={!redeemCode.trim() || redeeming}
                    onClick={redeem}
                    className="border-king-forest text-king-forest"
                >
                    {t.redeem}
                </Button>
                {redeemMsg && <span className="text-sm text-neutral-gray-dark">{redeemMsg}</span>}
            </div>

            <h3 className="text-sm font-semibold text-neutral-gray-dark mb-3">{t.ledgerTitle}</h3>
            {error ? (
                <p className="text-sm text-neutral-gray-medium py-6 text-center">{t.loadFailed}</p>
            ) : !data || data.entries.length === 0 ? (
                <p className="text-sm text-neutral-gray-medium py-6 text-center">{t.ledgerEmpty}</p>
            ) : (
                <>
                    <div className="overflow-x-auto">
                        <table className="w-full min-w-[36rem] text-sm">
                            <thead>
                                <tr className="border-b-2 border-neutral-gray-light text-left text-neutral-gray-medium">
                                    <th className="py-2 pr-4 font-medium">{t.colTime}</th>
                                    <th className="py-2 pr-4 font-medium">{t.colKind}</th>
                                    <th className="py-2 pr-4 font-medium text-right">{t.colAmount}</th>
                                    <th className="py-2 font-medium text-right">{t.colBalance}</th>
                                </tr>
                            </thead>
                            <tbody>
                                {data.entries.map(entry => (
                                    <tr key={entry.id} className="border-b border-neutral-gray-light/60">
                                        <td className="py-2.5 pr-4 text-neutral-gray-dark whitespace-nowrap">
                                            {new Date(entry.ts).toLocaleString(dateLocale)}
                                        </td>
                                        <td className="py-2.5 pr-4 text-neutral-gray-dark">
                                            {t.kinds[entry.kind] ?? entry.kind}
                                            {!!entry.subscriptionCents && <span className="block text-xs text-neutral-gray-medium">{t.subscriptionAllowanceEntryLabel}: {credits(entry.subscriptionCents)} Credits</span>}
                                        </td>
                                        <td
                                            className={`py-2.5 pr-4 text-right font-mono ${
                                                entry.amountCents > 0 ? 'text-king-forest' : 'text-neutral-dark-bg'
                                            }`}
                                        >
                                            {entry.amountCents > 0 ? '+' : ''}
                                            {formatYuan(entry.amountCents)}
                                        </td>
                                        <td className="py-2.5 text-right font-mono text-neutral-gray-medium">
                                            {formatYuan(entry.balanceAfterCents)}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                    {totalPages > 1 && (
                        <div className="flex flex-wrap items-center justify-end gap-3 mt-4">
                            <Button
                                variant="outline"
                                size="sm"
                                disabled={page === 0}
                                onClick={() => setPage(p => Math.max(p - 1, 0))}
                            >
                                {t.prevPage}
                            </Button>
                            <span className="text-xs text-neutral-gray-medium font-mono">
                                {page + 1} / {totalPages}
                            </span>
                            <Button
                                variant="outline"
                                size="sm"
                                disabled={page + 1 >= totalPages}
                                onClick={() => setPage(p => p + 1)}
                            >
                                {t.nextPage}
                            </Button>
                        </div>
                    )}
                </>
            )}

            {!isBqt && <RechargeDialog
                open={rechargeOpen}
                onOpenChange={setRechargeOpen}
                dict={dict}
                onPaid={() => {
                    setPage(0);
                    load(0);
                }}
            />}
        </div>
    );
}
