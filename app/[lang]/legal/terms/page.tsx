import type { Metadata } from 'next';
import { Locale } from '@/i18n-config';
import { LegalDoc } from '@/components/legal/LegalDoc';
import { loadLegalDoc } from '@/content/legal';
import { pageAlternates } from '@/lib/page-metadata';

/**
 * 先按站点、再按语言。两站的缔约主体、适用法与争议解决机构都不同，
 * 不是同一份文本的翻译问题——`generateMetadata` 与页面本体必须走同一个出口。
 */
export async function generateMetadata({
    params,
}: {
    params: Promise<{ lang: Locale }>;
}): Promise<Metadata> {
    const { lang } = await params;
    const { doc } = await loadLegalDoc('terms', lang);
    return {
        title: doc.title,
        description: doc.intro.slice(0, 160),
        // 不发跨站 hreflang：两站的条款是不同缔约主体、不同适用法的两份文书，
        // 互指等于告诉搜索引擎它们是同一份合同的翻译版本
        alternates: pageAlternates(lang, '/legal/terms'),
    };
}

export default async function TermsPage({
    params,
}: {
    params: Promise<{ lang: Locale }>;
}) {
    const { lang } = await params;
    const { doc, referenceNotice } = await loadLegalDoc('terms', lang);
    return <LegalDoc doc={doc} referenceNotice={referenceNotice} />;
}
