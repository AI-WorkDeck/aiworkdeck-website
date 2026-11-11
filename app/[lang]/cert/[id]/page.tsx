import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getDictionary } from '@/get-dictionary';
import { Locale, toBaseLocale } from '@/i18n-config';
import { getAward, BADGE_DEFS } from '@/lib/badges';
import { findUserById } from '@/lib/users';
import { CertStylePicker } from './CertStylePicker';
import { NOINDEX } from '@/lib/page-metadata';

/**
 * 徽章证书页（dev-board#300）：证书预览 + 下载。公开页——证书本身就是拿去分享的，
 * 页面同时充当「别人点开证书链接」时的落点（配作者主页入口）。
 */
export const dynamic = 'force-dynamic';

export async function generateMetadata({
    params,
}: {
    params: Promise<{ lang: Locale; id: string }>;
}): Promise<Metadata> {
    const { lang, id } = await params;
    const dict = await getDictionary(lang);
    const award = getAward(id);
    const def = award ? BADGE_DEFS[award.badgeId] : undefined;
    return {
        title: def ? (toBaseLocale(lang) === 'zh' ? def.nameZh : def.nameEn) : dict.certPage.title,
        // 证书是个人分享物，不进搜索索引
        robots: NOINDEX,
    };
}

export default async function CertPage({
    params,
}: {
    params: Promise<{ lang: Locale; id: string }>;
}) {
    const { lang, id } = await params;
    const dict = await getDictionary(lang);
    const t = dict.certPage;

    const award = getAward(id);
    if (!award) notFound();
    const user = findUserById(award.userId);
    if (!user) notFound();
    const def = BADGE_DEFS[award.badgeId];

    return (
        <div className="min-h-screen bg-neutral-gray-pale pt-28 pb-24 md:pt-32">
            <div className="container mx-auto max-w-6xl px-4 md:px-8">
                <CertStylePicker
                    lang={lang}
                    t={t}
                    certId={award.id}
                    badgeName={toBaseLocale(lang) === 'zh' ? def.nameZh : def.nameEn}
                    seq={award.seq}
                    awardedTo={(t.awardedTo as string).replace('{name}', user.displayName || user.username)}
                    profileHref={`/${lang}/u/${encodeURIComponent(user.username)}`}
                />
            </div>
        </div>
    );
}
