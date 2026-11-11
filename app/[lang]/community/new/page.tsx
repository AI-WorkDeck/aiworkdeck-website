import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { getDictionary } from '@/get-dictionary';
import { Locale } from '@/i18n-config';
import { getSessionUser } from '@/lib/sessions';
import { NOINDEX, pageAlternates } from '@/lib/page-metadata';
import { Button } from '@/components/ui/button';
import { NewPostForm } from './NewPostForm';

/** 发帖页（dev-board#316）：讨论帖/博客长文同一入口，未登录服务端直接给登录引导。 */
export const dynamic = 'force-dynamic';

export async function generateMetadata({
    params,
}: {
    params: Promise<{ lang: Locale }>;
}): Promise<Metadata> {
    const { lang } = await params;
    const dict = await getDictionary(lang);
    return {
        title: dict.communityPage.composer.title,
        // 纯表单页，未登录时甚至只有一个登录引导——没有可索引的内容
        robots: NOINDEX,
        alternates: pageAlternates(lang, '/community/new'),
    };
}

export default async function NewPostPage({
    params,
}: {
    params: Promise<{ lang: Locale }>;
}) {
    const { lang } = await params;
    const dict = await getDictionary(lang);
    const t = dict.communityPage;
    const viewer = await getSessionUser();

    return (
        <div className="min-h-screen bg-neutral-gray-pale pt-24 pb-24">
            <div className="container mx-auto px-4 md:px-8 max-w-3xl">
                <Link href={`/${lang}/community`}
                    className="inline-flex items-center gap-1.5 text-[13px] font-medium text-neutral-gray-medium transition-colors hover:text-king-forest">
                    <ArrowLeft className="h-3.5 w-3.5" strokeWidth={1.75} />
                    {t.postPage.backToList}
                </Link>

                <header className="mt-6 mb-8">
                    <p className="mb-4 flex items-center gap-3 text-[11px] uppercase tracking-[0.22em] text-king-forest/70">
                        <span className="h-px w-8 bg-king-forest/40" />
                        {t.composer.eyebrow}
                    </p>
                    <h1 className="font-display text-3xl font-black tracking-tight text-neutral-dark-bg md:text-4xl">
                        {t.composer.title}
                    </h1>
                </header>

                {viewer ? (
                    <NewPostForm lang={lang} t={t.composer} tagLabels={t.tags} />
                ) : (
                    // 未登录时「去登录」是本页唯一有效动作，给按钮级权重并带 next 回跳
                    <div className="flex flex-col items-start gap-5 rounded-xl border border-neutral-gray-light bg-white px-6 py-8">
                        <p className="text-sm text-neutral-gray-medium">{t.composer.loginHint}</p>
                        <Button asChild className="font-bold">
                            <Link href={`/${lang}/account?next=/${lang}/community/new`}>
                                {t.composer.loginCta}
                            </Link>
                        </Button>
                    </div>
                )}
            </div>
        </div>
    );
}
