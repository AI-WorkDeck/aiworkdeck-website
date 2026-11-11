'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Locale, LOCALE_META, toBaseLocale } from '@/i18n-config';

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
    tier: { key: string; level: number; nameZh: string; nameEn: string; bonusPermille: number };
    nextTier: (MembershipTier & { remainingPoints: number }) | null;
    tiers: MembershipTier[];
}

function tierName(t: { nameZh: string; nameEn: string }, lang: Locale): string {
    return toBaseLocale(lang) === 'zh' ? t.nameZh : t.nameEn;
}

/**
 * 本页公开、不需要登录即可访问。这张卡片是唯一因人而异的部分：
 * 登录了就叠加显示「你的当前等级」，没登录就什么都不渲染——不报错、不占位，
 * 静默跳过（未登录访问 GET /api/account/membership 会 401，属预期）。
 */
export function MembershipYourStatus({ lang, dict }: { lang: Locale; dict: any }) {
    const t = dict.membership;
    const [data, setData] = useState<MembershipData | null>(null);
    const [guest, setGuest] = useState(false);

    useEffect(() => {
        let cancelled = false;
        (async () => {
            try {
                const res = await fetch('/api/account/membership');
                if (!res.ok) {
                    // 401 = 未登录：给一行提示让访客知道登录后这里有个人化进度，其余失败仍静默
                    if (res.status === 401 && !cancelled) setGuest(true);
                    return;
                }
                const json = await res.json();
                if (!cancelled) setData(json);
            } catch {
                // 静默跳过：网络失败不打扰这个公开页
            }
        })();
        return () => {
            cancelled = true;
        };
    }, []);

    if (!data) {
        return guest ? (
            <p className="mb-10 text-sm text-neutral-gray-medium">
                <Link
                    href={`/${lang}/account?next=/${lang}/membership`}
                    className="text-king-forest underline underline-offset-4 hover:text-king-forest-darker"
                >
                    {t.yourStatusLoginHint}
                </Link>
            </p>
        ) : null;
    }

    const currentThreshold = data.tiers.find(tr => tr.key === data.tier.key)?.threshold ?? 0;
    const progress = data.nextTier
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
        <div className="mb-10 rounded-xl border border-king-forest/25 bg-king-forest/5 p-6">
            <p className="text-[11px] tracking-[0.22em] uppercase text-king-forest font-medium mb-3">
                {t.yourStatusTitle}
            </p>
            <div className="flex flex-col md:flex-row md:items-center gap-6">
                <div>
                    <p className="text-xs text-neutral-gray-medium mb-1">{t.yourStatusLevel}</p>
                    <span className="inline-block rounded-lg border border-king-forest/25 bg-white px-3 py-1 font-display text-lg font-bold text-king-forest">
                        {tierName(data.tier, lang)}
                    </span>
                </div>
                <div>
                    <p className="text-xs text-neutral-gray-medium mb-1">{t.yourStatusGrowth}</p>
                    <p className="font-display text-2xl font-bold text-king-forest">
                        {data.growthPoints.toLocaleString(LOCALE_META[lang].bcp47)}
                    </p>
                </div>
                <div className="flex-1 min-w-[180px]">
                    <div className="h-2 rounded-full bg-neutral-gray-light overflow-hidden">
                        <div
                            className="h-full rounded-full bg-king-forest transition-[width]"
                            style={{ width: `${progress}%` }}
                        />
                    </div>
                    <p className="mt-2 text-xs text-neutral-gray-medium">
                        {data.nextTier
                            ? t.yourStatusNext
                                  .replace('{name}', tierName(data.nextTier, lang))
                                  .replace(
                                      '{points}',
                                      data.nextTier.remainingPoints.toLocaleString(
                                          LOCALE_META[lang].bcp47
                                      )
                                  )
                            : t.yourStatusMax}
                    </p>
                </div>
            </div>
        </div>
    );
}
