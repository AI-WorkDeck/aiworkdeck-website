'use client';

import { useEffect, useState } from 'react';
import { Locale, LOCALE_META, toBaseLocale } from '@/i18n-config';
import { ShoppingBag, HandCoins } from 'lucide-react';
import { formatSiteAmount } from '@/lib/site-config';

/**
 * 账户页「我的已购」+「创作者收益」（PR-W3）。
 * 收益卡片只有存在收益记录时才渲染。
 */

interface PurchaseItem {
    itemType: 'skill' | 'plugin' | 'feature';
    itemId: string;
    itemName: string;
    itemNameEn?: string;
    priceCents: number;
    orderId: string;
    createdAt: string;
}

interface Earnings {
    totalCents: number;
    pendingCents: number;
    settledCents: number;
}

// 金额一律按**本站币种**格式化（国内站人民币分，国际站美元 cent）
const formatYuan = formatSiteAmount;

export function PurchasesSection({ lang, dict }: { lang: Locale; dict: any }) {
    const t = dict.accountPage;
    const [purchases, setPurchases] = useState<PurchaseItem[] | null>(null);
    const [earnings, setEarnings] = useState<Earnings | null>(null);
    const [error, setError] = useState(false);

    useEffect(() => {
        (async () => {
            try {
                const res = await fetch('/api/account/purchases');
                if (!res.ok) throw new Error('load failed');
                const data = await res.json();
                setPurchases(data.purchases ?? []);
                setEarnings(data.earnings ?? null);
            } catch {
                setError(true);
            }
        })();
    }, []);

    const dateLocale = LOCALE_META[lang].bcp47;

    return (
        <>
            {/* 我的已购 */}
            <div className="bg-white border border-[#dce2de] rounded-xl p-6 md:p-8 shadow-sm mb-10">
                <div className="flex items-center gap-3 mb-6">
                    <ShoppingBag className="w-5 h-5 text-king-forest" strokeWidth={1.75} />
                    <h2 className="font-display text-xl font-semibold text-neutral-dark-bg">{t.purchasesTitle}</h2>
                </div>
                {error ? (
                    <p className="text-sm text-neutral-gray-medium py-6 text-center">{t.loadFailed}</p>
                ) : !purchases || purchases.length === 0 ? (
                    <p className="text-sm text-neutral-gray-medium py-6 text-center">{t.purchasesEmpty}</p>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full min-w-[36rem] text-sm">
                            <thead>
                                <tr className="border-b-2 border-neutral-gray-light text-left text-neutral-gray-medium">
                                    <th className="py-2 pr-4 font-medium">{t.colItem}</th>
                                    <th className="py-2 pr-4 font-medium">{t.colKind}</th>
                                    <th className="py-2 pr-4 font-medium text-right">{t.colPrice}</th>
                                    <th className="py-2 font-medium text-right">{t.colPurchasedAt}</th>
                                </tr>
                            </thead>
                            <tbody>
                                {purchases.map(p => (
                                    <tr key={p.orderId + p.itemId} className="border-b border-neutral-gray-light/60">
                                        <td className="min-w-40 py-2.5 pr-4 text-neutral-dark-bg font-medium">{toBaseLocale(lang) === 'en' ? (p.itemNameEn || p.itemName) : p.itemName}</td>
                                        <td className="py-2.5 pr-4 text-neutral-gray-dark">
                                            {t.itemTypes[p.itemType] ?? p.itemType}
                                        </td>
                                        <td className="py-2.5 pr-4 text-right font-mono text-neutral-dark-bg">
                                            {formatYuan(p.priceCents)}
                                        </td>
                                        <td className="py-2.5 text-right text-neutral-gray-medium whitespace-nowrap">
                                            {new Date(p.createdAt).toLocaleString(dateLocale)}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>

            {/* 创作者收益：有记录才显示 */}
            {earnings && earnings.totalCents > 0 && (
                <div className="bg-white border border-[#dce2de] rounded-xl p-6 md:p-8 shadow-sm mb-10">
                    <div className="flex items-center gap-3 mb-2">
                        <HandCoins className="w-5 h-5 text-king-forest" strokeWidth={1.75} />
                        <h2 className="font-display text-xl font-semibold text-neutral-dark-bg">{t.earningsTitle}</h2>
                    </div>
                    <p className="text-sm text-neutral-gray-medium mb-6">{t.earningsHint}</p>
                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                        <div className="min-w-0 break-words [overflow-wrap:anywhere] bg-neutral-gray-pale/60 rounded-xl p-4">
                            <p className="text-xs text-neutral-gray-medium">{t.earningsTotal}</p>
                            <p className="font-display text-2xl font-bold text-neutral-dark-bg mt-1">
                                {formatYuan(earnings.totalCents)}
                            </p>
                        </div>
                        <div className="min-w-0 break-words [overflow-wrap:anywhere] bg-neutral-gray-pale/60 rounded-xl p-4">
                            <p className="text-xs text-neutral-gray-medium">{t.earningsPending}</p>
                            <p className="font-display text-2xl font-bold text-king-forest mt-1">
                                {formatYuan(earnings.pendingCents)}
                            </p>
                        </div>
                        <div className="min-w-0 break-words [overflow-wrap:anywhere] bg-neutral-gray-pale/60 rounded-xl p-4">
                            <p className="text-xs text-neutral-gray-medium">{t.earningsSettled}</p>
                            <p className="font-display text-2xl font-bold text-neutral-gray-medium mt-1">
                                {formatYuan(earnings.settledCents)}
                            </p>
                        </div>
                    </div>
                </div>
            )}
        </>
    );
}
