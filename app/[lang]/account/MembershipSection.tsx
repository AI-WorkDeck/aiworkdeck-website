'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Locale, LOCALE_META, toBaseLocale } from '@/i18n-config';
import { Award } from 'lucide-react';

interface MembershipTier {
    key: string;
    level: number;
    nameZh: string;
    nameEn: string;
    threshold: number;
    bonusPermille: number;
}

interface MembershipData {
    growthPoints: number;
    topupCents: number;
    spendCents: number;
    tier: { key: string; level: number; nameZh: string; nameEn: string; bonusPermille: number };
    nextTier: (MembershipTier & { remainingPoints: number }) | null;
    tiers: MembershipTier[];
}

/** 等级中英文名：跟随语言取 nameZh / nameEn，两者都来自 API，不在前端维护第二份翻译。 */
function tierName(t: { nameZh: string; nameEn: string }, lang: Locale): string {
    return toBaseLocale(lang) === 'zh' ? t.nameZh : t.nameEn;
}

export function MembershipSection({ lang, dict }: { lang: Locale; dict: any }) {
    const t = dict.accountPage;
    const [data, setData] = useState<MembershipData | null>(null);
    const [error, setError] = useState(false);

    useEffect(() => {
        let cancelled = false;
        (async () => {
            try {
                const res = await fetch('/api/account/membership');
                if (!res.ok) throw new Error('load failed');
                const json = await res.json();
                if (!cancelled) {
                    setData(json);
                    setError(false);
                }
            } catch {
                if (!cancelled) setError(true);
            }
        })();
        return () => {
            cancelled = true;
        };
    }, []);

    // 当前档在 tiers 里的门槛，用来算「到下一档」的进度条起点（不是从 0 起算）
    const currentThreshold = data?.tiers.find(tr => tr.key === data.tier.key)?.threshold ?? 0;
    const progress =
        data && data.nextTier
            ? Math.min(
                  100,
                  Math.max(
                      0,
                      ((data.growthPoints - currentThreshold) /
                          (data.nextTier.threshold - currentThreshold)) *
                          100
                  )
              )
            : 100;

    return (
        <div className="bg-white border border-[#dce2de] rounded-xl p-6 md:p-8 shadow-sm mb-10">
            <div className="flex items-center gap-3 mb-6">
                <Award className="w-5 h-5 text-king-forest" strokeWidth={1.75} />
                <h2 className="font-display text-xl font-semibold text-neutral-dark-bg">{t.membershipTitle}</h2>
            </div>

            {error ? (
                <p className="text-sm text-neutral-gray-medium py-6 text-center">{t.loadFailed}</p>
            ) : !data ? (
                <p className="text-sm text-neutral-gray-medium py-6 text-center">—</p>
            ) : (
                <>
                    <div className="flex flex-col md:flex-row md:items-center gap-6 mb-5">
                        <div>
                            <p className="text-xs text-neutral-gray-medium mb-1">{t.membershipLevelLabel}</p>
                            <span className="inline-block rounded-lg border border-king-forest/25 bg-king-forest/5 px-3 py-1 font-display text-lg font-bold text-king-forest">
                                {tierName(data.tier, lang)}
                            </span>
                        </div>
                        <div>
                            <p className="text-xs text-neutral-gray-medium mb-1">{t.membershipGrowthLabel}</p>
                            <p className="font-display text-2xl font-bold text-king-forest">
                                {data.growthPoints.toLocaleString(LOCALE_META[lang].bcp47)}
                            </p>
                        </div>
                        {data.tier.bonusPermille > 0 && (
                            <div>
                                <p className="text-xs text-neutral-gray-medium mb-1">{t.membershipBonusLabel}</p>
                                <p className="text-sm font-bold text-neutral-dark-bg">+{data.tier.bonusPermille}‰</p>
                            </div>
                        )}
                    </div>

                    <div className="mb-2">
                        <div className="h-2 rounded-full bg-neutral-gray-light overflow-hidden">
                            <div
                                className="h-full rounded-full bg-king-forest transition-[width]"
                                style={{ width: `${progress}%` }}
                            />
                        </div>
                        <p className="mt-2 text-xs text-neutral-gray-medium">
                            {data.nextTier
                                ? t.membershipProgressToNext
                                      .replace('{name}', tierName(data.nextTier, lang))
                                      .replace(
                                          '{points}',
                                          data.nextTier.remainingPoints.toLocaleString(
                                              LOCALE_META[lang].bcp47
                                          )
                                      )
                                : t.membershipMaxTier}
                        </p>
                    </div>

                    <Link
                        href={`/${lang}/membership`}
                        className="inline-block mt-2 text-sm font-medium text-king-forest hover:underline"
                    >
                        {t.membershipViewRules}
                    </Link>
                </>
            )}
        </div>
    );
}
