import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import fs from 'fs';
import path from 'path';
import { ArrowUpRight, CalendarDays, Crown, Feather, History, Medal, MessageSquare, Package, Plus, Puzzle, ScrollText, Stamp, Star, Trophy, Users } from 'lucide-react';
import { getDictionary } from '@/get-dictionary';
import { Locale, LOCALE_META, toBaseLocale } from '@/i18n-config';
import { findUserByUsername, toPublicUser } from '@/lib/users';
import { listSkills } from '@/lib/skills-store';
import { listPlugins } from '@/lib/plugins-store';
import { getSessionUser } from '@/lib/sessions';
import { SkillCard } from '@/components/skills/SkillCard';
import { Button } from '@/components/ui/button';
import { Avatar } from '@/components/user/Avatar';
import { CountUp } from '@/components/motion/CountUp';
import { Reveal } from '@/components/motion/Reveal';
import { NOINDEX, pageAlternates } from '@/lib/page-metadata';
import { listAwards, BADGE_DEFS, type BadgeId } from '@/lib/badges';
import { getQuizResult } from '@/lib/quiz-results';
import { QUIZ_TYPE_MAP } from '@/lib/quiz-data';
import { getProfileSections } from '@/lib/profile-sections';
import { listPosts } from '@/lib/forum';
import { ProfileEditor } from './ResumeSections';
import { CommentsSection } from './CommentsSection';
import { SchoolLogo } from '@/components/user/SchoolLogo';

/** 徽章图标映射（DESIGN.md 红线：lucide 线性图标，禁 emoji） */
const BADGE_ICONS: Record<BadgeId, typeof Medal> = {
    founder: Stamp,
    'first-skill': Feather,
    'skills-3': Feather,
    'skills-10': ScrollText,
    'skills-25': ScrollText,
    'installs-100': Users,
    'installs-1k': Users,
    'installs-10k': Users,
    featured: Star,
    'skill-1k': Trophy,
    'weekly-no1': Crown,
};

/**
 * 证书扫码计数（dev-board#300）：?from=cert 的访问追加一行流水，
 * 用于评估证书裂变效果。尽力而为，失败不影响页面。
 */
function logCertScan(username: string) {
    try {
        fs.appendFileSync(
            path.join(process.cwd(), 'data', 'cert-scans.jsonl'),
            JSON.stringify({ at: new Date().toISOString(), username }) + '\n'
        );
    } catch { /* 见上 */ }
}

export const dynamic = 'force-dynamic';

function formatDate(iso: string, lang: Locale, withDay = true): string {
    return new Date(iso).toLocaleDateString(LOCALE_META[lang].bcp47, {
        year: 'numeric',
        month: withDay ? 'long' : 'short',
        ...(withDay ? { day: 'numeric' } : {}),
    });
}

export async function generateMetadata({
    params,
}: {
    params: Promise<{ lang: Locale; username: string }>;
}): Promise<Metadata> {
    const { lang, username } = await params;
    // 不发跨站 hreflang：两站账号体系完全独立，同名用户在另一站不是同一个人
    const alternates = pageAlternates(lang, `/u/${username}`);
    const user = findUserByUsername(decodeURIComponent(username));
    if (!user) return { alternates };

    const dict = await getDictionary(lang);
    // 用 displayName 原文：页面 h1 渲染的就是它，metadata 与可见文本必须一致
    const name = user.displayName;
    /**
     * 零作品的主页不进索引。
     *
     * 注册即得一个公开 URL，而没发过东西的主页只有昵称加一串 0——批量产出这种页
     * 就是在给全站堆薄内容。判据与页面自己的 `hasWork` 同源（Skill / 插件），
     * 再加上社区帖：帖子同样是公开作品，页面上就有一整节在陈列它们。
     */
    const hasSkills = listSkills({ authorId: user.id }).length > 0;
    const hasPlugins = listPlugins({ status: 'approved' }).some(p => p.authorId === user.id);
    const hasPosts = listPosts({ authorUserId: user.id, limit: 1 }).posts.length > 0;
    const t = dict.skillsPage;
    return {
        title: t.profileMetaTitle.replace('{name}', name),
        description: t.profileMetaDescription.replace('{name}', name),
        alternates,
        ...(hasSkills || hasPlugins || hasPosts ? {} : { robots: NOINDEX }),
    };
}

export default async function ContributorPage({
    params,
    searchParams,
}: {
    params: Promise<{ lang: Locale; username: string }>;
    searchParams: Promise<{ from?: string }>;
}) {
    const { lang, username } = await params;
    const { from } = await searchParams;
    const dict = await getDictionary(lang);
    const t = dict.skillsPage;

    const user = findUserByUsername(decodeURIComponent(username));
    if (!user) notFound();
    const publicUser = toPublicUser(user);

    // 证书二维码落地（维护者拍板落作者主页）：记一笔扫码，页面顶部挂投稿引导横幅
    const fromCert = from === 'cert';
    if (fromCert) logCertScan(publicUser.username);
    const awards = listAwards(user.id).sort((a, b) => a.awardedAt.localeCompare(b.awardedAt));
    const sections = getProfileSections(user.id);

    const skills = listSkills({ authorId: user.id, sort: 'popular' });
    const totalDownloads = skills.reduce((sum, s) => sum + s.downloads, 0);

    // 插件按 id 去重：plugins.json 每个版本一行，不去重会把「发过 3 个版本」算成 3 个插件
    const pluginIds = new Set(
        listPlugins({ status: 'approved' })
            .filter(p => p.authorId === user.id)
            .map(p => p.id)
    );

    const lastUpdated = skills.reduce<string | null>(
        (latest, s) => (!latest || s.updatedAt > latest ? s.updatedAt : latest),
        null
    );

    // 本人看自己的主页时，空状态要能直接把人送去投稿，而不是劝他去逛广场
    const viewer = await getSessionUser();
    const isOwner = viewer?.id === user.id;
    const hasWork = skills.length > 0 || pluginIds.size > 0;

    const stats = [
        { icon: Package, value: skills.length, label: t.statSkills },
        { icon: null, value: totalDownloads, label: t.downloads },
        { icon: Puzzle, value: pluginIds.size, label: t.statPlugins },
    ];

    // 主页联动（dev-board#318）：TA 在社区发的帖子，空则整节不渲染
    const communityPosts = listPosts({ authorUserId: user.id, limit: 5 }).posts;
    const tc = dict.communityPage;

    const founder = awards.find(a => a.badgeId === 'founder');
    const startHref = `/${lang}/start?ref=u-${encodeURIComponent(publicUser.username)}`;
    const education = sections.education ?? [];
    const contact = sections.contact;
    const hasContact = !!(contact?.phone || contact?.email || contact?.hasWechatQr);
    // 法人格测试结果（dev-board#329）：TA 测过就在侧栏展示，同时给访客一个入口
    const quizResult = getQuizResult(user.id);
    const quizType = quizResult ? QUIZ_TYPE_MAP[quizResult.typeId] : undefined;
    const tq = dict.quizPage;
    const hasAside = hasContact || awards.length > 0 || !!quizType;
    // 主栏正文模块顺序沿用拖拽 order（education 已 hero 化、contact 固定侧栏）
    const bodyOrder = sections.order.filter(x => x === 'highlights' || x === 'positions');

    return (
        <div className="min-h-screen bg-neutral-gray-pale">
            {/* 编辑排版 hero（dev-board#303/#308）：整页是一张名片，右列档案栏盛放教育经历 */}
            {/* 2026-11 全站纸与墨：名片页头改纸面，原深色类名在 .profile-hero-paper 内统一映射为墨色（website-design.css） */}
            <section className="page-hero profile-hero-paper relative overflow-hidden text-[#14261f]">

                <div className="container relative mx-auto max-w-6xl px-4 pt-28 md:px-8 md:pt-32">
                    {fromCert && (
                        <p className="mb-8 inline-flex flex-wrap items-center gap-x-3 gap-y-1 rounded-full border border-king-mint/35 px-4 py-1.5 text-[12.5px] text-king-mint/90">
                            {t.certBannerTitle}
                            <Link href={`/${lang}/skills/submit`} className="font-bold text-king-mint hover:underline">
                                {t.certBannerCta}
                            </Link>
                            <span className="text-white/30">·</span>
                            <Link href={`/${lang}/quiz?from=cert`} className="font-bold text-king-mint hover:underline">
                                {t.certBannerQuiz}
                            </Link>
                        </p>
                    )}

                    <div className="flex flex-col gap-10 lg:flex-row lg:items-start lg:justify-between">
                        <div className="max-w-2xl">
                            {founder && (
                                <p className="mb-6 inline-flex items-center gap-2.5 border border-king-mint/40 px-3.5 py-1.5 text-[11px] uppercase tracking-[0.22em] text-king-mint">
                                    <Stamp className="h-3.5 w-3.5" strokeWidth={1.5} />
                                    {(t.founderChip as string).replace('{n}', String(founder.seq))}
                                </p>
                            )}
                            <h1 className="font-display text-5xl font-black leading-[1.05] tracking-tight md:text-6xl">
                                {publicUser.displayName}
                            </h1>
                            {(sections.practice?.title || sections.practice?.org) && (
                                <p className="mt-6 text-[13px] uppercase tracking-[0.2em] text-king-mint/90">
                                    {[sections.practice?.title, sections.practice?.org].filter(Boolean).join('\u2002\u00b7\u2002')}
                                </p>
                            )}
                            {publicUser.bio && (
                                <p className="mt-6 max-w-xl text-[15px] leading-[1.9] text-white/70">{publicUser.bio}</p>
                            )}
                            {sections.expertise && sections.expertise.length > 0 && (
                                <div className="mt-7 flex flex-wrap gap-2">
                                    {sections.expertise.map(tag => (
                                        <span key={tag}
                                            className="rounded-full border border-white/20 px-3.5 py-1 text-[13px] text-white/85">
                                            {tag}
                                        </span>
                                    ))}
                                </div>
                            )}
                            <div className="mt-10 flex flex-wrap items-center gap-3">
                                <Link href={startHref}
                                    className="inline-flex h-11 items-center gap-2 rounded-lg bg-[#2E5A50] text-[#FAF8F3] border border-white/20 px-6 text-[14.5px] font-bold shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:bg-[#244840]">
                                    {t.heroCta}
                                    <ArrowUpRight className="h-4 w-4" strokeWidth={2} />
                                </Link>
                                <Link href={`/${lang}/skills/submit`}
                                    className="inline-flex h-11 items-center rounded-lg border border-white/25 px-5 text-[14px] font-medium text-white/85 transition-colors hover:border-king-mint/50 hover:text-king-mint">
                                    {t.certBannerCta}
                                </Link>
                                {isOwner && <ProfileEditor t={t.resume} initial={sections} />}
                            </div>
                        </div>

                        {/* 档案栏：头像 + 教育经历（校徽热链），填掉 hero 右侧的真空（dev-board#308） */}
                        <div className="w-full flex-shrink-0 lg:w-[320px]">
                            <div className="rounded-xl border border-white/12 bg-white/[0.05] p-6 backdrop-blur-xl">
                                <div className="flex justify-center">
                                    <div className="inline-block rounded-full p-1.5 ring-2 ring-king-mint/35">
                                        <Avatar
                                            userId={publicUser.id}
                                            displayName={publicUser.displayName}
                                            avatarUpdatedAt={publicUser.avatarUpdatedAt}
                                            size={104}
                                            variant="dark"
                                            shape="circle"
                                        />
                                    </div>
                                </div>
                                {education.length > 0 && (
                                    <ul className="mt-6 flex flex-col divide-y divide-white/10">
                                        {education.map((e, i) => (
                                            <li key={i} className="flex items-center gap-3.5 py-3 first:pt-0 last:pb-0">
                                                <span className="text-king-mint/80">
                                                    <SchoolLogo domain={e.domain} size={26} />
                                                </span>
                                                <span className="min-w-0">
                                                    <span className="block truncate text-[13.5px] font-bold text-white/90">{e.school}</span>
                                                    {(e.degree || e.startYear || e.endYear) && (
                                                        <span className="mt-0.5 block text-[11.5px] text-white/50">
                                                            {[e.degree, [e.startYear, e.endYear].filter(Boolean).join(' \u2013 ')]
                                                                .filter(Boolean).join('\u2002\u00b7\u2002')}
                                                        </span>
                                                    )}
                                                </span>
                                            </li>
                                        ))}
                                    </ul>
                                )}
                                {education.length === 0 && isOwner && (
                                    <p className="mt-5 text-center text-[12px] leading-relaxed text-white/45">{t.resume.heroEduHint}</p>
                                )}
                            </div>
                        </div>
                    </div>

                    {/* 数字带 */}
                    <div className="mt-12 flex flex-wrap items-end gap-x-14 gap-y-6 border-t border-white/10 pb-24 pt-7">
                        {hasWork &&
                            stats.map(stat => (
                                <div key={stat.label}>
                                    <CountUp value={stat.value}
                                        className="font-display text-4xl font-bold tabular-nums text-white" />
                                    <div className="mt-1 text-[11px] uppercase tracking-[0.18em] text-white/45">
                                        {stat.label}
                                    </div>
                                </div>
                            ))}
                        <div className="ml-auto text-right text-[12px] leading-relaxed text-white/45">
                            <p className="flex items-center justify-end gap-1.5">
                                <CalendarDays className="h-3.5 w-3.5" strokeWidth={1.75} />
                                {t.joinedAt} {formatDate(publicUser.createdAt, lang)}
                            </p>
                            {lastUpdated && (
                                <p className="mt-1 flex items-center justify-end gap-1.5">
                                    <History className="h-3.5 w-3.5" strokeWidth={1.75} />
                                    {t.lastPublished} {formatDate(lastUpdated, lang)}
                                </p>
                            )}
                        </div>
                    </div>
                </div>
            </section>

            <div className="container mx-auto max-w-6xl px-4 pb-24 pt-10 md:px-8">
                <div className={hasAside ? 'grid gap-12 lg:grid-cols-12' : ''}>
                    <div className={hasAside ? 'lg:col-span-8' : ''}>
                        {bodyOrder.map(type =>
                            type === 'highlights' && sections.highlights?.length ? (
                                <section key="highlights" className="mb-14">
                                    <SectionRule title={t.resume.sections.highlights} />
                                    <ol className="flex flex-col gap-5">
                                        {sections.highlights.map((item, i) => (
                                            <li key={i} className="flex items-baseline gap-5">
                                                <span className="w-11 flex-shrink-0 font-display text-[26px] font-black leading-none text-king-forest/25">
                                                    {String(i + 1).padStart(2, '0')}
                                                </span>
                                                <span className="text-[15px] leading-relaxed text-neutral-gray-dark">{item}</span>
                                            </li>
                                        ))}
                                    </ol>
                                </section>
                            ) : type === 'positions' && sections.positions?.length ? (
                                <section key="positions" className="mb-14">
                                    <SectionRule title={t.resume.sections.positions} />
                                    <ul className="flex flex-col gap-3">
                                        {sections.positions.map((item, i) => (
                                            <li key={i} className="flex gap-3.5">
                                                <span className="mt-[11px] h-px w-6 flex-shrink-0 bg-king-forest/40" />
                                                <span className="text-[15px] leading-relaxed text-neutral-gray-dark">{item}</span>
                                            </li>
                                        ))}
                                    </ul>
                                </section>
                            ) : null
                        )}

                        {/* 作品 */}
                        <SectionRule title={t.contributorSkills} />
                        {skills.length === 0 ? (
                            <div className="rounded-xl border border-[#dce2de] bg-white px-6 py-14 text-center">
                                <p className="font-display text-lg font-bold text-neutral-dark-bg">
                                    {isOwner ? t.profileEmptyOwnTitle : t.profileEmptyTitle}
                                </p>
                                <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-neutral-gray-medium">
                                    {isOwner ? t.profileEmptyOwnHint : t.profileEmptyHint}
                                </p>
                                <Link href={isOwner ? `/${lang}/skills/submit` : `/${lang}/marketplace`}>
                                    <Button
                                        variant={isOwner ? 'accent' : 'outline'}
                                        className={`mt-6 gap-1.5 font-bold ${isOwner ? '' : 'border-king-forest text-king-forest'}`}
                                    >
                                        {isOwner && <Plus className="h-4 w-4" strokeWidth={1.75} />}
                                        {isOwner ? t.profileEmptyOwnCta : t.profileEmptyCta}
                                    </Button>
                                </Link>
                            </div>
                        ) : (
                            <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
                                {skills.map((skill, i) => (
                                    <Reveal key={skill.id} delay={i * 55}>
                                        <SkillCard lang={lang} dict={dict} skill={skill} author={publicUser} />
                                    </Reveal>
                                ))}
                            </div>
                        )}

                        {/* 社区帖子（dev-board#318）：TA 发起的博客与讨论，落点社区详情页 */}
                        {communityPosts.length > 0 && (
                            <section className="mt-14">
                                <SectionRule title={tc.profileSection.title} />
                                <ul className="flex flex-col divide-y divide-neutral-gray-light/70 overflow-hidden rounded-xl border border-neutral-gray-light bg-white">
                                    {communityPosts.map(post => (
                                        <li key={post.id}>
                                            <Link href={`/${lang}/community/post/${post.id}`}
                                                className="group flex items-center gap-4 px-5 py-3.5 transition-colors hover:bg-neutral-gray-pale/60">
                                                <span className={`flex-shrink-0 rounded-full border px-2 py-px text-[11px] ${
                                                    post.type === 'blog'
                                                        ? 'border-king-forest/30 text-king-forest'
                                                        : 'border-neutral-gray-light text-neutral-gray-medium'
                                                }`}>
                                                    {post.type === 'blog' ? tc.typeBlog : post.tag ? tc.tags[post.tag] : tc.typeThread}
                                                </span>
                                                <span className="min-w-0 flex-1 truncate font-display text-[14.5px] font-bold text-neutral-dark-bg group-hover:text-king-forest">
                                                    {post.title}
                                                </span>
                                                <span className="flex flex-shrink-0 items-center gap-3 text-[12px] text-neutral-gray-medium">
                                                    <span className="inline-flex items-center gap-1">
                                                        <MessageSquare className="h-3.5 w-3.5" strokeWidth={1.75} />
                                                        <span className="font-mono tabular-nums">{post.commentCount}</span>
                                                    </span>
                                                    <span className="whitespace-nowrap">{formatDate(post.createdAt, lang, false)}</span>
                                                </span>
                                            </Link>
                                        </li>
                                    ))}
                                </ul>
                                <p className="mt-3 text-right">
                                    <Link href={`/${lang}/community`}
                                        className="inline-flex items-center gap-1 text-[12.5px] font-medium text-king-forest hover:underline">
                                        {tc.profileSection.viewAll}
                                        <ArrowUpRight className="h-3.5 w-3.5" strokeWidth={1.75} />
                                    </Link>
                                </p>
                            </section>
                        )}
                    </div>

                    {hasAside && (
                        <aside className="lg:col-span-4">
                            <div className="flex flex-col gap-8 lg:sticky lg:top-24">
                                {hasContact && (
                                    <div className="overflow-hidden rounded-xl border border-neutral-gray-light bg-white">
                                        <div className="h-1 bg-gradient-to-r from-king-forest to-king-mint" />
                                        <div className="p-6">
                                            <h2 className="mb-4 text-[12px] uppercase tracking-[0.24em] text-king-forest/80">
                                                {t.resume.sections.contact}
                                            </h2>
                                            <div className="flex flex-col gap-4">
                                                {contact?.phone && (
                                                    <div>
                                                        <p className="text-[11px] uppercase tracking-[0.18em] text-neutral-gray-medium">{t.resume.contactPhone}</p>
                                                        <a href={`tel:${contact.phone}`}
                                                            className="mt-0.5 block font-display text-lg font-bold text-neutral-dark-bg hover:text-king-forest">
                                                            {contact.phone}
                                                        </a>
                                                    </div>
                                                )}
                                                {contact?.email && (
                                                    <div>
                                                        <p className="text-[11px] uppercase tracking-[0.18em] text-neutral-gray-medium">{t.resume.contactEmail}</p>
                                                        <a href={`mailto:${contact.email}`}
                                                            className="mt-0.5 block break-all font-display text-lg font-bold text-neutral-dark-bg hover:text-king-forest">
                                                            {contact.email}
                                                        </a>
                                                    </div>
                                                )}
                                                {contact?.hasWechatQr && (
                                                    <div className="flex items-center gap-4 rounded-xl border border-neutral-gray-light/80 bg-neutral-gray-pale/60 p-3">
                                                        {/* eslint-disable-next-line @next/next/no-img-element */}
                                                        <img src={`/api/u/${encodeURIComponent(publicUser.username)}/wechat-qr`}
                                                            alt={t.resume.contactQrAlt} width={96} height={96} className="rounded-md bg-white" />
                                                        <p className="text-[12px] leading-relaxed text-neutral-gray-medium">{t.resume.contactQrAlt}</p>
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                )}

                                {quizType && (
                                    <div>
                                        <SectionRule title={tq.profileTitle} />
                                        <div className="overflow-hidden rounded-xl border border-neutral-gray-light bg-king-forest-darker text-white">
                                            <div className="bg-gradient-to-br from-king-forest-darker via-king-forest to-king-forest-darker p-6">
                                                <p className="text-[11px] uppercase tracking-[0.22em] text-king-mint/80">
                                                    {tq.resultEyebrow}
                                                </p>
                                                <p className="mt-2 font-display text-2xl font-black text-king-mint-lighter">
                                                    {toBaseLocale(lang) === 'zh' ? quizType.nameZh : quizType.nameEn}
                                                </p>
                                                <p className="mt-2 text-[12.5px] leading-relaxed text-white/65">
                                                    {toBaseLocale(lang) === 'zh' ? quizType.praiseZh : quizType.praiseEn}
                                                </p>
                                            </div>
                                            <div className="border-t border-white/10 px-6 py-3">
                                                <Link href={`/${lang}/quiz?from=profile`}
                                                    className="inline-flex items-center gap-1 text-[12.5px] font-bold text-king-mint hover:underline">
                                                    {tq.profileCta}
                                                    <ArrowUpRight className="h-3.5 w-3.5" strokeWidth={1.75} />
                                                </Link>
                                            </div>
                                        </div>
                                    </div>
                                )}

                                {awards.length > 0 && (
                                    <div>
                                        <SectionRule title={t.badgesTitle} />
                                        <ul className="flex flex-col gap-4">
                                            {awards.map(award => {
                                                const def = BADGE_DEFS[award.badgeId];
                                                const Icon = BADGE_ICONS[award.badgeId];
                                                const founding = def.tier === 'founding';
                                                return (
                                                    <li key={award.id}>
                                                        <Link href={`/${lang}/cert/${award.id}`}
                                                            className="group flex items-center gap-3.5">
                                                            <span className={`relative flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-full border transition-transform duration-200 group-hover:-translate-y-0.5 ${
                                                                founding
                                                                    ? 'border-king-forest bg-king-forest text-king-mint'
                                                                    : 'border-king-forest/35 bg-white text-king-forest'
                                                            }`}>
                                                                <span className="absolute inset-[3px] rounded-full border border-current opacity-30" />
                                                                <Icon className="h-[18px] w-[18px]" strokeWidth={1.5} />
                                                            </span>
                                                            <span className="min-w-0">
                                                                <span className="block font-display text-[14px] font-bold text-neutral-dark-bg group-hover:text-king-forest">
                                                                    {toBaseLocale(lang) === 'zh' ? def.nameZh : def.nameEn}
                                                                </span>
                                                                <span className="block font-mono text-[11px] text-neutral-gray-medium">
                                                                    {award.seq ? `No.${award.seq}` : formatDate(award.awardedAt, lang, false)}
                                                                </span>
                                                            </span>
                                                        </Link>
                                                    </li>
                                                );
                                            })}
                                        </ul>
                                    </div>
                                )}
                            </div>
                        </aside>
                    )}
                </div>

                {/* 讨论区（dev-board#306）：主页即帖子 */}
                <CommentsSection lang={lang} t={t.comments} username={publicUser.username}
                    viewerId={viewer?.id ?? null} viewerIsOwner={isOwner} />
            </div>
        </div>
    );
}

/** 编辑式节标题：caps 眉标 + 细栏线 */
function SectionRule({ title }: { title: string }) {
    return (
        <div className="mb-7 flex items-center gap-4">
            <h2 className="text-[12px] uppercase tracking-[0.24em] text-king-forest/80">{title}</h2>
            <span className="h-px flex-1 bg-neutral-gray-light" />
        </div>
    );
}
