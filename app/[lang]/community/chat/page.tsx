import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { getDictionary } from '@/get-dictionary';
import { Locale } from '@/i18n-config';
import { getSessionUser } from '@/lib/sessions';
import { NOINDEX, pageAlternates } from '@/lib/page-metadata';
import { ChatRoom } from './ChatRoom';

/** 聊天室页（dev-board#317）：全站一间房。游客可看，登录可发言。 */
export const dynamic = 'force-dynamic';

export async function generateMetadata({
    params,
}: {
    params: Promise<{ lang: Locale }>;
}): Promise<Metadata> {
    const { lang } = await params;
    const dict = await getDictionary(lang);
    return {
        title: dict.communityPage.chat.title,
        description: dict.communityPage.chat.metaDescription,
        // 聊天室只留最近 500 条消息、内容随时被冲掉，索引它等于把一页不断变化的
        // 碎片当正式内容收录。canonical 与 description 仍给，进不了索引也要能被
        // 分享出去时显示正确的标题。
        robots: NOINDEX,
        alternates: pageAlternates(lang, '/community/chat'),
    };
}

export default async function ChatPage({
    params,
}: {
    params: Promise<{ lang: Locale }>;
}) {
    const { lang } = await params;
    const dict = await getDictionary(lang);
    const t = dict.communityPage;
    const viewer = await getSessionUser();

    return (
        <div className="flex min-h-screen flex-col bg-neutral-gray-pale pt-24 pb-10">
            <div className="container mx-auto flex w-full max-w-3xl flex-1 flex-col px-4 md:px-8">
                <div className="mb-5 flex items-end justify-between gap-4">
                    <div>
                        <p className="mb-3 flex items-center gap-3 text-[11px] uppercase tracking-[0.22em] text-king-forest/70">
                            <span className="h-px w-8 bg-king-forest/40" />
                            {t.chat.eyebrow}
                        </p>
                        <h1 className="font-display text-3xl font-black tracking-tight text-neutral-dark-bg">
                            {t.chat.title}
                        </h1>
                        <p className="mt-4 text-[13.5px] leading-7 text-neutral-gray-medium">{t.chat.subtitle}</p>
                    </div>
                    <Link href={`/${lang}/community`}
                        className="inline-flex flex-shrink-0 items-center gap-1.5 text-[13px] font-medium text-neutral-gray-medium transition-colors hover:text-king-forest">
                        <ArrowLeft className="h-3.5 w-3.5" strokeWidth={1.75} />
                        {t.postPage.backToList}
                    </Link>
                </div>

                <ChatRoom lang={lang} t={t.chat} viewerId={viewer?.id ?? null} />
            </div>
        </div>
    );
}
