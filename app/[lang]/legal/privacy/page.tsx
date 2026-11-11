import type { Metadata } from 'next';
import { Locale } from '@/i18n-config';
import { LegalDoc } from '@/components/legal/LegalDoc';
import { loadLegalDoc } from '@/content/legal';
import { mobilePrivacyLinks } from '@/content/legal/mobile-privacy';
import { pageAlternates } from '@/lib/page-metadata';

/**
 * 先按站点、再按语言。两站的数据控制者、法律框架（个人信息保护法 / GDPR）
 * 与跨境传输事实都不同——`generateMetadata` 与页面本体必须走同一个出口。
 *
 * 四份文本的 section id 跨站点保持一致，尤其 `cross-border`：
 * `app/[lang]/skills/submit/SubmitForm.tsx` 有 `/legal/privacy#cross-border` 的锚点硬依赖。
 */
export async function generateMetadata({
    params,
}: {
    params: Promise<{ lang: Locale }>;
}): Promise<Metadata> {
    const { lang } = await params;
    const { doc } = await loadLegalDoc('privacy', lang);
    return {
        title: doc.title,
        description: doc.intro.slice(0, 160),
        // 同 terms：两站的隐私政策适用不同法域，不是互为译本
        alternates: pageAlternates(lang, '/legal/privacy'),
    };
}

export default async function PrivacyPage({
    params,
}: {
    params: Promise<{ lang: Locale }>;
}) {
    const { lang } = await params;
    const { doc, referenceNotice } = await loadLegalDoc('privacy', lang);
    const links = mobilePrivacyLinks(lang);
    return <LegalDoc doc={doc} referenceNotice={referenceNotice} relatedResources={
        <nav aria-label={links.related} className="flex flex-wrap gap-x-6 gap-y-2 text-sm text-king-forest">
            <a className="underline" href={`/${lang}/legal/mobile-privacy`}>{links.mobile}</a>
            <a className="underline" href={`/${lang}/legal/mobile-account-deletion`}>{links.deletion}</a>
        </nav>
    } />;
}
