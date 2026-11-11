import type { Metadata } from 'next';
import Link from 'next/link';
import { MessageSquare, MessagesSquare, Pin, Plus } from 'lucide-react';
import { getDictionary } from '@/get-dictionary';
import { Locale, LOCALE_META } from '@/i18n-config';
import { listPosts, listFeaturedBlogs, publicAuthor, THREAD_TAGS, type ForumPost, type PostType, type ThreadTag } from '@/lib/forum';
import { Avatar } from '@/components/user/Avatar';
import { PageHero } from '@/components/layout/PageHero';
import { REPO_URL } from '@/lib/structured-data';
import { pageAlternates } from '@/lib/page-metadata';
import { cn } from '@/lib/utils';

/**
 * 社区信息流（dev-board#310/#316）。维护者拍板的信息架构：扁平一条流 + 固定标签，
 * 置顶优先 + 最新活动 bump 排序（Discourse 式）——不做投票、不做版块，
 * 冷启动期不会满屏 0 分或空版块。博客与讨论帖同流展示，页头陈列管理员精选博客。
 * 全部服务端渲染，筛选与分页走 query（?type= ?tag= ?page=）。
 */
export const dynamic = 'force-dynamic';

const PAGE_SIZE = 20;

export async function generateMetadata({
    params,
}: {
    params: Promise<{ lang: Locale }>;
}): Promise<Metadata> {
    const { lang } = await params;
    const dict = await getDictionary(lang);
    return {
        title: dict.communityPage.title,
        description: dict.communityPage.metaDescription,
        alternates: pageAlternates(lang, '/community'),
    };
}

function formatPostDate(iso: string, lang: Locale): string {
    return new Date(iso).toLocaleDateString(LOCALE_META[lang].bcp47, {
        year: 'numeric', month: 'short', day: 'numeric',
    });
}

export default async function CommunityPage({
    params,
    searchParams,
}: {
    params: Promise<{ lang: Locale }>;
    searchParams: Promise<{ type?: string; tag?: string; page?: string }>;
}) {
    const { lang } = await params;
    const { type: typeRaw, tag: tagRaw, page: pageRaw } = await searchParams;
    const dict = await getDictionary(lang);
    const t = dict.communityPage;

    const type: PostType | undefined = typeRaw === 'blog' || typeRaw === 'thread' ? typeRaw : undefined;
    const tag: ThreadTag | undefined =
        type === 'thread' && THREAD_TAGS.includes(tagRaw as ThreadTag) ? (tagRaw as ThreadTag) : undefined;
    const page = Math.max(1, Number.parseInt(pageRaw ?? '1', 10) || 1);

    const { posts, total } = listPosts({ type, tag, limit: PAGE_SIZE, offset: (page - 1) * PAGE_SIZE });
    const featured = !type && page === 1 ? listFeaturedBlogs(3) : [];
    const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

    const feedHref = (q: { type?: string; tag?: string; page?: number }) => {
        const sp = new URLSearchParams();
        if (q.type) sp.set('type', q.type);
        if (q.tag) sp.set('tag', q.tag);
        if (q.page && q.page > 1) sp.set('page', String(q.page));
        const s = sp.toString();
        return `/${lang}/community${s ? `?${s}` : ''}`;
    };

    const tabs: Array<{ key: string; label: string; href: string; active: boolean }> = [
        { key: 'all', label: t.tabs.all, href: feedHref({}), active: !type },
        { key: 'thread', label: t.tabs.thread, href: feedHref({ type: 'thread' }), active: type === 'thread' },
        { key: 'blog', label: t.tabs.blog, href: feedHref({ type: 'blog' }), active: type === 'blog' },
    ];

    return (
        <div className="min-h-screen bg-neutral-gray-pale pb-24">
            {/* 全站统一深色刊物式页头（dev-board#328）；CTA 走深色底按钮变体 */}
            <PageHero eyebrow={t.eyebrow} title={t.heroTitle} subtitle={t.heroSubtitle} width="5xl">
                <div className="flex flex-wrap items-center gap-3">
                    <Link href={`/${lang}/community/new`}
                        className="inline-flex h-10 items-center gap-1.5 rounded-lg bg-[#1f3b34] px-5 text-[13.5px] font-bold text-[#f6f4ee] shadow-sm transition-colors hover:bg-[#17302a]">
                        <Plus className="h-4 w-4" strokeWidth={2} />
                        {t.newPostCta}
                    </Link>
                    <Link href={`/${lang}/community/chat`}
                        className="inline-flex h-10 items-center gap-1.5 rounded-lg border border-[#e3dccb] bg-[#fffdf8] px-4 text-[13.5px] font-medium text-[#1f3b34] transition-colors hover:border-[#c9bd9f] hover:bg-white">
                        <MessagesSquare className="h-4 w-4" strokeWidth={1.75} />
                        {t.chatroomCta}
                    </Link>
                    <a href={`${REPO_URL}/discussions`} target="_blank" rel="noopener noreferrer"
                        className="inline-flex h-10 items-center gap-1.5 rounded-lg border border-[#e3dccb] bg-[#fffdf8] px-4 text-[13.5px] font-medium text-[#1f3b34] transition-colors hover:border-[#c9bd9f] hover:bg-white">
                        {t.githubCta}
                    </a>
                </div>
            </PageHero>
            <div className="container mx-auto px-4 md:px-8 max-w-5xl pt-10">

                {/* 精选博客（管理员手动精选，无精选则整段不渲染——不灌假数据） */}
                {featured.length > 0 && (
                    <section className="mb-10">
                        <div className="mb-5 flex items-center gap-4">
                            <h2 className="text-[12px] uppercase tracking-[0.24em] text-king-forest/80">{t.featuredTitle}</h2>
                            <span className="h-px flex-1 bg-neutral-gray-light" />
                        </div>
                        <div className={cn('grid gap-5', featured.length > 1 ? 'md:grid-cols-2 lg:grid-cols-3' : '')}>
                            {featured.map(post => {
                                const author = publicAuthor(post.authorUserId, lang);
                                return (
                                    <Link key={post.id} href={`/${lang}/community/post/${post.id}`}
                                        className="group relative overflow-hidden rounded-xl border border-neutral-gray-light bg-white/65 p-6 backdrop-blur-xl transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lg hover:shadow-king-forest/5">
                                        <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-king-forest/30 to-transparent" />
                                        <h3 className="font-display text-lg font-semibold leading-snug text-neutral-dark-bg group-hover:text-king-forest">
                                            {post.title}
                                        </h3>
                                        <p className="mt-2.5 line-clamp-2 text-[13.5px] leading-relaxed text-neutral-gray-medium">
                                            {post.content.replace(/\s+/g, ' ').slice(0, 140)}
                                        </p>
                                        <p className="mt-4 text-[12px] text-neutral-gray-medium">
                                            {author.displayName}
                                            <span className="mx-1.5 text-neutral-gray-light">·</span>
                                            {formatPostDate(post.createdAt, lang)}
                                        </p>
                                    </Link>
                                );
                            })}
                        </div>
                    </section>
                )}

                {/* 页签（编辑式下划线）+ 讨论标签 chips */}
                <div className="mb-6 flex flex-wrap items-center gap-x-6 gap-y-3 border-b border-neutral-gray-light">
                    <nav className="flex items-center gap-6">
                        {tabs.map(tab => (
                            <Link key={tab.key} href={tab.href}
                                className={cn(
                                    '-mb-px border-b-2 pb-2.5 text-[14px] transition-colors',
                                    tab.active
                                        ? 'border-king-forest font-bold text-king-forest'
                                        : 'border-transparent font-medium text-neutral-gray-medium hover:text-neutral-gray-dark'
                                )}>
                                {tab.label}
                            </Link>
                        ))}
                    </nav>
                    {type === 'thread' && (
                        // 标签过滤：细字文本，不做胶囊（DESIGN.md §四）
                        <div className="-mb-px flex items-center gap-4 pb-2.5 text-[12.5px]">
                            {THREAD_TAGS.map(tg => (
                                <Link key={tg} href={feedHref({ type: 'thread', tag: tag === tg ? undefined : tg })}
                                    className={cn(
                                        'transition-colors',
                                        tag === tg
                                            ? 'font-bold text-king-forest'
                                            : 'text-neutral-gray-medium hover:text-king-forest'
                                    )}>
                                    {t.tags[tg]}
                                </Link>
                            ))}
                        </div>
                    )}
                </div>

                {/* 信息流 */}
                {posts.length === 0 ? (
                    <div className="rounded-2xl border border-neutral-gray-light bg-white px-6 py-16 text-center">
                        <p className="font-display text-lg font-bold text-neutral-dark-bg">{t.empty}</p>
                    </div>
                ) : (
                    <div className="overflow-hidden rounded-xl border border-neutral-gray-light bg-white">
                        <ul className="divide-y divide-neutral-gray-light/70">
                            {posts.map(post => (
                                <PostRow key={post.id} lang={lang} t={t} post={post} />
                            ))}
                        </ul>
                    </div>
                )}

                {/* 分页 */}
                {totalPages > 1 && (
                    <div className="mt-8 flex items-center justify-center gap-4 text-[13.5px]">
                        {page > 1 ? (
                            <Link href={feedHref({ type, tag, page: page - 1 })} className="font-medium text-king-forest hover:underline">
                                {t.pagePrev}
                            </Link>
                        ) : (
                            <span className="text-neutral-gray-medium/50">{t.pagePrev}</span>
                        )}
                        <span className="font-mono text-[12.5px] text-neutral-gray-medium">{page} / {totalPages}</span>
                        {page < totalPages ? (
                            <Link href={feedHref({ type, tag, page: page + 1 })} className="font-medium text-king-forest hover:underline">
                                {t.pageNext}
                            </Link>
                        ) : (
                            <span className="text-neutral-gray-medium/50">{t.pageNext}</span>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
}

function PostRow({ lang, t, post }: { lang: Locale; t: any; post: ForumPost }) {
    const author = publicAuthor(post.authorUserId, lang);
    return (
        <li>
            <Link href={`/${lang}/community/post/${post.id}`}
                className="group flex items-center gap-4 px-5 py-4 transition-colors hover:bg-neutral-gray-pale/60 md:px-6">
                <Avatar userId={author.id} displayName={author.displayName}
                    avatarUpdatedAt={author.avatarUpdatedAt ?? undefined} size={38} shape="circle" />
                <div className="min-w-0 flex-1">
                    <p className="flex items-center gap-2">
                        {post.pinned && (
                            <span className="inline-flex flex-shrink-0 items-center gap-1 text-[11px] font-medium uppercase tracking-[0.14em] text-king-forest">
                                <Pin className="h-3 w-3" strokeWidth={1.75} />
                                {t.pinnedBadge}
                            </span>
                        )}
                        <span className="truncate font-display text-[15.5px] font-bold text-neutral-dark-bg group-hover:text-king-forest">
                            {post.title}
                        </span>
                    </p>
                    <p className="mt-1 flex items-center gap-2 text-[12.5px] text-neutral-gray-medium">
                        <span className={cn(
                            'rounded-full border px-2 py-px text-[11px]',
                            post.type === 'blog'
                                ? 'border-king-forest/30 text-king-forest'
                                : 'border-neutral-gray-light text-neutral-gray-medium'
                        )}>
                            {post.type === 'blog' ? t.typeBlog : post.tag ? t.tags[post.tag] : t.typeThread}
                        </span>
                        <span className="truncate">{author.displayName}</span>
                        <span className="text-neutral-gray-light">·</span>
                        <span className="whitespace-nowrap">{formatPostDate(post.lastActivityAt, lang)}</span>
                    </p>
                </div>
                <span className="flex flex-shrink-0 items-center gap-1.5 text-[13px] text-neutral-gray-medium">
                    <MessageSquare className="h-4 w-4" strokeWidth={1.75} />
                    <span className="font-mono tabular-nums">{post.commentCount}</span>
                </span>
            </Link>
        </li>
    );
}
