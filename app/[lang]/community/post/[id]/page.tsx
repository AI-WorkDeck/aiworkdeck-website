import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { getDictionary } from '@/get-dictionary';
import { Locale, LOCALE_META } from '@/i18n-config';
import { getSessionUser } from '@/lib/sessions';
import { getPost, publicAuthor } from '@/lib/forum';
import { Avatar } from '@/components/user/Avatar';
import { pageAlternates } from '@/lib/page-metadata';
import { PostComments } from '@/components/community/PostComments';
import { PostActions } from './PostActions';
import { cn } from '@/lib/utils';

/**
 * 帖子详情页（dev-board#316）：博客与讨论帖同一版式——衬线大标题的编辑排版，
 * 正文纯文本按换行分段（v1 不做富文本，排版权交给衬线与行距）。
 * 评论树复用 dict.skillsPage.comments 的既定文案。已删/被隐藏的帖子一律 404。
 */
export const dynamic = 'force-dynamic';

export async function generateMetadata({
    params,
}: {
    params: Promise<{ lang: Locale; id: string }>;
}): Promise<Metadata> {
    const { lang, id } = await params;
    const post = getPost(id);
    if (!post || post.deletedAt || post.hiddenAt) return {};
    return {
        title: post.title,
        description: post.content.replace(/\s+/g, ' ').slice(0, 140),
        alternates: pageAlternates(lang, `/community/post/${id}`),
    };
}

export default async function CommunityPostPage({
    params,
}: {
    params: Promise<{ lang: Locale; id: string }>;
}) {
    const { lang, id } = await params;
    const dict = await getDictionary(lang);
    const t = dict.communityPage;

    const post = getPost(id);
    if (!post || post.deletedAt || post.hiddenAt) notFound();

    const author = publicAuthor(post.authorUserId, lang);
    const viewer = await getSessionUser();
    const when = new Date(post.createdAt).toLocaleString(LOCALE_META[lang].bcp47, {
        year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit',
    });

    return (
        <div className="min-h-screen bg-neutral-gray-pale pt-24 pb-24">
            <div className="container mx-auto px-4 md:px-8 max-w-3xl">
                <Link href={`/${lang}/community`}
                    className="inline-flex items-center gap-1.5 text-[13px] font-medium text-neutral-gray-medium transition-colors hover:text-king-forest">
                    <ArrowLeft className="h-3.5 w-3.5" strokeWidth={1.75} />
                    {t.postPage.backToList}
                </Link>

                <article className="mt-6 rounded-xl border border-neutral-gray-light bg-white px-6 py-8 md:px-10 md:py-10">
                    <p className="flex items-center gap-2">
                        <span className={cn(
                            'rounded-full border px-2.5 py-0.5 text-[11.5px]',
                            post.type === 'blog'
                                ? 'border-king-forest/30 text-king-forest'
                                : 'border-neutral-gray-light text-neutral-gray-medium'
                        )}>
                            {post.type === 'blog' ? t.typeBlog : post.tag ? t.tags[post.tag] : t.typeThread}
                        </span>
                        {post.pinned && (
                            <span className="text-[11px] uppercase tracking-[0.14em] text-king-forest">{t.pinnedBadge}</span>
                        )}
                    </p>

                    <h1 className="mt-4 font-display text-3xl font-black leading-snug tracking-tight text-neutral-dark-bg md:text-4xl">
                        {post.title}
                    </h1>

                    <div className="mt-6 flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-neutral-gray-light pb-6">
                        {author.username ? (
                            <Link href={`/${lang}/u/${encodeURIComponent(author.username)}`}
                                className="group flex items-center gap-2.5">
                                <Avatar userId={author.id} displayName={author.displayName}
                                    avatarUpdatedAt={author.avatarUpdatedAt ?? undefined} size={34} shape="circle" />
                                <span className="text-[14px] font-bold text-neutral-dark-bg group-hover:text-king-forest">
                                    {author.displayName}
                                </span>
                            </Link>
                        ) : (
                            <span className="text-[14px] text-neutral-gray-medium">{author.displayName}</span>
                        )}
                        <span className="text-[12.5px] text-neutral-gray-medium">{when}</span>
                    </div>

                    <div className={cn(
                        'mt-7 whitespace-pre-wrap break-words text-neutral-gray-dark',
                        post.type === 'blog' ? 'text-[16px] leading-[1.95]' : 'text-[15px] leading-[1.85]'
                    )}>
                        {post.content}
                    </div>

                    {/* 治理动作（举报/删除）下沉到正文之后：边缘操作不该占 byline 黄金位（dev-board#328） */}
                    <div className="mt-8 flex justify-end border-t border-neutral-gray-light pt-5">
                        <PostActions lang={lang} t={t.postPage} postId={post.id}
                            viewerId={viewer?.id ?? null} viewerIsAuthor={viewer?.id === post.authorUserId} />
                    </div>
                </article>

                <PostComments lang={lang} t={dict.skillsPage.comments} postId={post.id}
                    viewerId={viewer?.id ?? null} viewerIsPostAuthor={viewer?.id === post.authorUserId} />
            </div>
        </div>
    );
}
