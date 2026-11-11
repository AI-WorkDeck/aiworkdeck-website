import type { Metadata } from 'next';
import Link from 'next/link';
import { Info, Lock } from 'lucide-react';
import { getDictionary } from '@/get-dictionary';
import { Locale } from '@/i18n-config';
import { getSessionUser } from '@/lib/sessions';
import { getSkill } from '@/lib/skills-store';
import { Button } from '@/components/ui/button';
import { PageHero } from '@/components/layout/PageHero';
import { SubmitForm } from './SubmitForm';
import { NOINDEX } from '@/lib/page-metadata';

export const dynamic = 'force-dynamic';

/** 投稿页：未登录访客（含爬虫）看到的永远是登录墙，不进索引。 */
export const metadata: Metadata = { robots: NOINDEX };

export default async function SubmitSkillPage({
    params,
    searchParams,
}: {
    params: Promise<{ lang: Locale }>;
    searchParams: Promise<{ edit?: string }>;
}) {
    const { lang } = await params;
    const { edit } = await searchParams;
    const dict = await getDictionary(lang);
    const t = dict.submitPage;

    const user = await getSessionUser();

    // 编辑模式：只允许作者本人
    const editing = user && edit ? getSkill(edit) : undefined;
    const initial = editing && editing.authorId === user!.id ? editing : undefined;

    return (
        <div className="min-h-screen bg-neutral-gray-pale pb-24">
            {/* 全站统一深色刊物式页头（dev-board#328）：登录墙与表单两态共用，导航配色不打架 */}
            <PageHero
                eyebrow={t.eyebrow}
                title={initial ? t.editTitle : t.title}
                subtitle={t.intro}
                size="compact"
                width="3xl"
            />
            <div className="container mx-auto px-4 md:px-8 max-w-3xl pt-10">
                {!user ? (
                    <div className="mx-auto max-w-md text-center">
                        <div className="bg-white border border-neutral-gray-light rounded-xl p-10">
                            <Lock className="w-9 h-9 mx-auto mb-5 text-king-forest/60" strokeWidth={1.5} />
                            <p className="text-neutral-gray-dark mb-6">{t.loginRequired}</p>
                            <Link href={`/${lang}/account?next=/${lang}/skills/submit`}>
                                <Button className="font-bold">{t.goLogin}</Button>
                            </Link>
                        </div>
                        <p className="mt-5 text-sm leading-relaxed text-neutral-gray-medium">{t.publishNotice}</p>
                    </div>
                ) : (
                    <>
                        {/* 提交机制：Skill 与插件的受理规则差得远（这边即时发布、那边人工审核），
                            不在动手前说清楚，作者会按错误的预期安排时间。 */}
                        <div className="mb-8 flex items-start gap-2.5 rounded-lg border border-neutral-gray-light bg-white px-4 py-3 text-sm leading-relaxed text-neutral-gray-dark">
                            <Info className="mt-0.5 h-4 w-4 shrink-0 text-king-forest/70" strokeWidth={1.75} />
                            <p>{t.publishNotice}</p>
                        </div>
                        <SubmitForm lang={lang} dict={dict} initial={initial} />
                    </>
                )}
            </div>
        </div>
    );
}
