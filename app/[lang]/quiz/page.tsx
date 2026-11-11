import type { Metadata } from 'next';
import { headers } from 'next/headers';
import { getDictionary } from '@/get-dictionary';
import { Locale } from '@/i18n-config';
import { getSessionUser } from '@/lib/sessions';
import { logQuizEvent, quizCompletionStats } from '@/lib/quiz-results';
import { siteConfig } from '@/lib/site-config';
import { PageHero } from '@/components/layout/PageHero';
import { pageAlternates } from '@/lib/page-metadata';
import { QuizFlow } from './QuizFlow';
import { WeChatGate } from './WeChatGate';

/**
 * 「法人格」测试（dev-board#329）：徽章/证书海报扫码的裂变承接页。
 *
 * 微信裁决（维护者 2026-08-31 拍板，权衡记录见卡）：测试内容**永不出现在微信
 * webview 里**——任何 MicroMessenger UA（含桌面微信，从严）只渲染引导页，
 * 答题只发生在外部浏览器。性格测试类外链在微信禁止列表内，主站域名不能赌连坐；
 * 独立传播域名留作三率数据跑通后的升级项。
 */
export const dynamic = 'force-dynamic';

export async function generateMetadata({
    params,
}: {
    params: Promise<{ lang: Locale }>;
}): Promise<Metadata> {
    const { lang } = await params;
    const dict = await getDictionary(lang);
    return {
        title: dict.quizPage.metaTitle,
        description: dict.quizPage.metaDesc,
        alternates: pageAlternates(lang, '/quiz'),
    };
}

export default async function QuizPage({
    params,
    searchParams,
}: {
    params: Promise<{ lang: Locale }>;
    searchParams: Promise<{ from?: string }>;
}) {
    const { lang } = await params;
    const { from } = await searchParams;
    const dict = await getDictionary(lang);
    const t = dict.quizPage;

    const ua = (await headers()).get('user-agent') ?? '';
    const isWeChat = /MicroMessenger/i.test(ua);
    logQuizEvent('visit', { from: isWeChat ? `${from ?? ''}+wx` : from });

    const user = await getSessionUser();
    const stats = quizCompletionStats();

    return (
        <div className="min-h-screen bg-neutral-gray-pale pb-24">
            <PageHero eyebrow={t.eyebrow} title={t.title} subtitle={t.lead} size="compact" width="3xl" />
            <div className="container mx-auto max-w-xl px-4 pt-10 md:px-8">
                {isWeChat ? (
                    <WeChatGate t={t.wechatGate} url={`${siteConfig.origin}/${lang}/quiz`} />
                ) : (
                    <QuizFlow
                        lang={lang}
                        t={t}
                        tStyle={dict.certPage}
                        from={from ?? ''}
                        loggedIn={!!user}
                        username={user?.username ?? ''}
                        completes={stats.total}
                        typeCounts={stats.byType}
                    />
                )}
            </div>
        </div>
    );
}
