import type { Metadata } from 'next';
import Link from 'next/link';
import { Lock } from 'lucide-react';
import { Locale } from '@/i18n-config';
import { getDictionary } from '@/get-dictionary';
import { getSessionUser } from '@/lib/sessions';
import { Button } from '@/components/ui/button';
import { PageHero } from '@/components/layout/PageHero';
import { getDeveloper } from '@/lib/developers';
import { SubmitTabs } from './SubmitTabs';
import { NOINDEX } from '@/lib/page-metadata';

export const dynamic = 'force-dynamic';

/** 投稿页：未登录访客（含爬虫）看到的永远是登录墙，不进索引。 */
export const metadata: Metadata = { robots: NOINDEX };

export default async function SubmitPluginPage({ params }: { params: Promise<{ lang: Locale }> }) {
    const { lang } = await params;
    const dict = await getDictionary(lang);
    const t = dict.pluginSubmitPage;
    const packT = dict.packSubmitPage;
    const user = await getSessionUser();

    return (
        <div className="min-h-screen bg-neutral-gray-pale pb-24">
            {/* 全站统一深色刊物式页头（dev-board#328）。页级标题是静态的；
                JAR 插件 / 原生资源包的分叉标题与说明在页签组件里随选择切换 */}
            <PageHero
                eyebrow={t.eyebrow}
                title={t.pageTitle}
                subtitle={t.pageLead}
                size="compact"
                width="3xl"
            />
            <div className="container mx-auto max-w-3xl px-4 md:px-8 pt-10">
                {!user ? (
                    <div className="mx-auto max-w-md text-center">
                        <div className="rounded-xl border border-neutral-gray-light bg-white p-10">
                            <Lock className="mx-auto mb-5 h-9 w-9 text-king-forest/60" strokeWidth={1.5} />
                            <p className="mb-6 text-neutral-gray-dark">{t.loginRequired}</p>
                            <Link href={`/${lang}/account?next=/${lang}/plugins/submit`}>
                                <Button className="font-bold">{t.goLogin}</Button>
                            </Link>
                        </div>
                        <ul className="mt-6 space-y-1 text-start text-sm text-neutral-gray-medium">
                            <li>· {t.rule1}</li>
                            <li>· <code className="font-mono">id</code>{t.rule2}</li>
                            <li>· {t.rule3a}<code className="font-mono">version</code>{t.rule3b}</li>
                            <li>
                                · {t.rule4a}<code className="font-mono">backendJars</code>{t.rule4b}
                                <code className="font-mono">frontendEntry</code>{t.rule4c}
                            </li>
                        </ul>
                        <p className="mt-4 text-start text-sm leading-relaxed text-neutral-gray-medium">{t.reviewNotice}</p>
                    </div>
                ) : (
                    <SubmitTabs developerApproved={getDeveloper(user.id)?.status === 'approved'} lang={lang} pluginT={t} packT={packT} />
                )}
            </div>
        </div>
    );
}
