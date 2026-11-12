import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft, Download, Lock, Monitor, PencilLine, Wrench } from 'lucide-react';
import { getDictionary } from '@/get-dictionary';
import { Locale, LOCALE_META } from '@/i18n-config';
import { getSkill } from '@/lib/skills-store';
import { localizeSkill, localizeDisplayName } from '@/lib/skill-en';
import { categoryLabel } from '@/lib/skill-categories';
import { toolLabel } from '@/lib/skill-tools';
import { CategoryIcon } from '@/components/skills/CategoryIcon';
import { findUserById } from '@/lib/users';
import { Avatar } from '@/components/user/Avatar';
import { getSessionUser } from '@/lib/sessions';
import { CopyButton } from '@/components/skills/CopyButton';
import { hasEntitlement } from '@/lib/purchases';
import { BuyButton } from '@/components/purchase/BuyButton';
import { formatPrice } from '@/lib/price';
import { pageAlternates } from '@/lib/page-metadata';
import { JsonLd } from '@/components/seo/JsonLd';
import { PageHero } from '@/components/layout/PageHero';
import { skillJsonLd } from '@/lib/structured-data';

export const dynamic = 'force-dynamic';

function formatDate(iso: string, lang: Locale) {
    return new Date(iso).toLocaleDateString(LOCALE_META[lang].bcp47, {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
    });
}

export async function generateMetadata({
    params,
}: {
    params: Promise<{ lang: Locale; id: string }>;
}): Promise<Metadata> {
    const { lang, id } = await params;
    const dict = await getDictionary(lang);
    const alternates = pageAlternates(lang, `/skills/${id}`);
    // 不发跨站 hreflang：两站的 Skill 落点各自独立，同一个 id 在另一站多半不存在
    const skill = getSkill(id);
    if (!skill) return { alternates };
    // 广场是站内最大的长尾资产（数十页），此前这些页的 title 全部落回布局层的裸品牌名，
    // 等于几十个 URL 共用一个标题。标题与描述改从 Skill 数据本身生成——
    // 与页面 h1、简介逐字一致，不另编文案。
    const display = localizeSkill(skill, lang);
    const t = dict.skillsPage;
    return {
        title: t.detailMetaTitle.replace('{name}', display.name),
        description: `${display.description} ${t.detailMetaSuffix}`,
        alternates,
    };
}

export default async function SkillDetailPage({
    params,
}: {
    params: Promise<{ lang: Locale; id: string }>;
}) {
    const { lang, id } = await params;
    const dict = await getDictionary(lang);
    const t = dict.skillsPage;

    const skill = getSkill(id);
    if (!skill) notFound();

    // 展示层本地化：EN 页覆盖 name/description/triggers 显示；订单 itemName 仍用规范中文名
    const display = localizeSkill(skill, lang);
    const author = findUserById(skill.authorId);
    const authorName = author && localizeDisplayName(author, lang);
    const me = await getSessionUser();
    // 包晴天律师（积分通道开着）：购买按钮改为扣包晴天积分
    const isAuthor = me?.id === skill.authorId;
    const priceCents = skill.priceCents ?? 0;
    const owned = priceCents > 0 && !!me && hasEntitlement(me.id, `skill:${skill.id}`);
    // 付费 Skill 的 prompt 只对作者与已购用户展示（与 detail API、bundle 402 闸门同口径）
    const canViewPrompt = priceCents === 0 || isAuthor || owned;

    return (
        <div className="min-h-screen bg-neutral-gray-pale pb-24">
            {/* 这条 Skill 本身的结构化数据：name/description/version 全部取自页面可见字段 */}
            <JsonLd
                data={skillJsonLd(lang, {
                    id: skill.id,
                    name: display.name,
                    description: display.description,
                    version: skill.version,
                })}
            />
            {/* 名称与简介进共享深色页头，与下方正文同一 max-w-6xl 轴；头卡只留元数据与操作 */}
            <PageHero size="compact" width="6xl" eyebrow={t.detailEyebrow} title={display.name} subtitle={display.description} />
            <div className="container mx-auto px-4 md:px-8 max-w-6xl pt-8">
                <Link
                    href={`/${lang}/marketplace`}
                    className="inline-flex items-center gap-1.5 text-sm text-neutral-gray-medium hover:text-king-forest transition-colors mb-6"
                >
                    <ArrowLeft className="w-4 h-4" />
                    {t.detailBack}
                </Link>

                {/* Header card：元数据与操作（名称/简介已在 PageHero） */}
                <div className="bg-white border border-[#dce2de] rounded-xl p-6 md:p-8 shadow-sm mb-6">
                    <div className="flex flex-col md:flex-row md:items-center gap-6">
                        <div className="w-18 h-18 flex-shrink-0 rounded-xl bg-king-forest-lightest/60 border border-king-forest/15 flex items-center justify-center">
                            <CategoryIcon category={skill.category} className="w-8 h-8 text-king-forest" />
                        </div>
                        <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-3 flex-wrap">
                                <span className="px-2 py-0.5 text-xs font-mono rounded-md bg-neutral-gray-pale border border-neutral-gray-light text-neutral-gray-medium">
                                    v{skill.version}
                                </span>
                                {categoryLabel(skill.category, lang) && (
                                    <span className="px-2 py-0.5 text-xs rounded-md bg-king-mint-lightest text-king-forest border border-king-mint-lighter/50">
                                        {categoryLabel(skill.category, lang)}
                                    </span>
                                )}
                                {/* 价格签走品牌色系（amber 在本站语义是警告/待审），与元数据签区分权重 */}
                                <span
                                    className={
                                        priceCents > 0
                                            ? 'px-2 py-0.5 text-xs font-bold rounded-md bg-king-mint-lightest text-king-forest border border-king-mint-lighter/50'
                                            : 'px-2 py-0.5 text-xs rounded-md bg-neutral-gray-pale border border-neutral-gray-light text-neutral-gray-medium'
                                    }
                                >
                                    {priceCents > 0 ? formatPrice(priceCents) : t.free}
                                </span>
                            </div>
                            <div className="flex items-center gap-4 mt-3 text-sm text-neutral-gray-medium flex-wrap">
                                {author && (
                                    <Link
                                        href={`/${lang}/u/${author.username}`}
                                        className="flex items-center gap-2 hover:text-king-forest transition-colors"
                                    >
                                        <Avatar
                                            userId={author.id}
                                            displayName={authorName || author.displayName}
                                            avatarUpdatedAt={author.avatarUpdatedAt}
                                            size={24}
                                            shape="circle"
                                            variant="brand"
                                            className="font-sans"
                                        />
                                        {authorName || author.displayName}
                                    </Link>
                                )}
                                <span className="flex items-center gap-1">
                                    <Download className="w-4 h-4" />
                                    {skill.downloads} {t.downloads}
                                </span>
                                <span>
                                    {t.updated} {formatDate(skill.updatedAt, lang)}
                                </span>
                                {isAuthor && (
                                    <Link
                                        href={`/${lang}/skills/submit?edit=${skill.id}`}
                                        className="flex items-center gap-1 text-king-forest hover:text-king-forest-lighter font-medium"
                                    >
                                        <PencilLine className="w-4 h-4" />
                                        {t.edit}
                                    </Link>
                                )}
                            </div>
                        </div>
                        {priceCents > 0 && !isAuthor && (
                            <div className="flex-shrink-0">
                                <BuyButton
                                    lang={lang}
                                    labels={dict.purchase}
                                    skuId={`skill:${skill.id}`}
                                    priceCents={priceCents}
                                    itemName={display.name}
                                    owned={owned}
                                    loggedIn={!!me}
                                />
                            </div>
                        )}
                    </div>

                    {/* 触发词：引号排版替代胶囊（DESIGN.md §四，与 SkillCard 同款写法） */}
                    <p className="mt-6 pt-6 border-t border-neutral-gray-light/70 text-sm leading-relaxed">
                        <span className="font-medium text-neutral-gray-dark mr-2">{t.triggers}:</span>
                        <span className="text-king-forest/80">
                            {display.triggers.map(trigger => `${dict.common.quotes.open}${trigger}${dict.common.quotes.close}`).join(' ')}
                        </span>
                    </p>

                    {skill.origin && (
                        <p className="mt-4 text-xs text-neutral-gray-medium/80">
                            {t.originNote}{' '}
                            <a
                                href={skill.origin.url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="underline decoration-dotted underline-offset-2 hover:text-king-forest transition-colors"
                            >
                                {skill.origin.author}
                            </a>
                            {skill.origin.license ? ` · ${skill.origin.license}` : ''}
                        </p>
                    )}
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                    {/* Main column */}
                    <div className="lg:col-span-2 flex flex-col gap-6">
                        <div className="bg-white border border-[#dce2de] rounded-xl shadow-sm overflow-hidden">
                            <div className="flex items-center justify-between px-6 py-4 border-b border-[#dce2de]/70 bg-neutral-gray-pale/60">
                                <h2 className="font-semibold text-neutral-dark-bg">{t.prompt}</h2>
                                {canViewPrompt && (
                                    <CopyButton text={skill.prompt} label={t.copyPrompt} copiedLabel={t.copied} />
                                )}
                            </div>
                            {canViewPrompt ? (
                                <pre className="p-6 text-sm text-neutral-gray-dark whitespace-pre-wrap break-words font-mono leading-relaxed max-h-[560px] overflow-y-auto">
                                    {skill.prompt}
                                </pre>
                            ) : (
                                <div className="p-10 flex flex-col items-center text-center gap-3">
                                    <Lock className="w-7 h-7 text-neutral-gray-medium/70" strokeWidth={1.5} />
                                    <p className="text-sm text-neutral-gray-medium">{t.promptLocked}</p>
                                    {/* 购买意愿产生在撞锁点，行动点必须跟到这里（头卡的 BuyButton 已滚出视口） */}
                                    {priceCents > 0 && !isAuthor && (
                                        <div className="mt-2">
                                            <BuyButton
                                                lang={lang}
                                                labels={dict.purchase}
                                                skuId={`skill:${skill.id}`}
                                                priceCents={priceCents}
                                                itemName={display.name}
                                                owned={owned}
                                                loggedIn={!!me}
                                            />
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>

                        {skill.output && (
                            <div className="bg-white border border-[#dce2de] rounded-xl shadow-sm overflow-hidden">
                                <div className="px-6 py-4 border-b border-[#dce2de]/70 bg-neutral-gray-pale/60">
                                    <h2 className="font-semibold text-neutral-dark-bg">{t.output}</h2>
                                </div>
                                <p className="p-6 text-sm text-neutral-gray-dark whitespace-pre-wrap leading-relaxed">
                                    {skill.output}
                                </p>
                            </div>
                        )}
                    </div>

                    {/* Sidebar */}
                    <div className="flex flex-col gap-6">
                        <div className="bg-king-forest-darker text-white rounded-xl p-6 shadow-sm relative overflow-hidden border border-king-forest/20">
                            <h2 className="flex items-center gap-2 font-semibold mb-4 relative">
                                <Monitor className="w-5 h-5 text-king-mint" />
                                {t.installTitle}
                            </h2>
                            <ol className="relative flex flex-col gap-3 text-sm text-king-mint-lightest/90">
                                {t.installSteps.map((step: string, i: number) => (
                                    <li key={i} className="flex gap-3">
                                        <span className="w-5 h-5 flex-shrink-0 rounded-full bg-king-mint text-king-forest-darker text-xs font-bold flex items-center justify-center">
                                            {i + 1}
                                        </span>
                                        {step}
                                    </li>
                                ))}
                            </ol>
                            <p className="relative mt-4 pt-4 border-t border-white/10 text-xs text-white/50 leading-relaxed">
                                {t.installNote.replace('{id}', skill.id)}
                            </p>
                        </div>

                        <div className="bg-white border border-[#dce2de] rounded-xl p-6 shadow-sm">
                            <h2 className="flex items-center gap-2 font-semibold text-neutral-dark-bg mb-4">
                                <Wrench className="w-5 h-5 text-king-forest" />
                                {t.allowedTools}
                            </h2>
                            {skill.allowedTools.length > 0 ? (
                                <div className="flex flex-wrap gap-2">
                                    {skill.allowedTools.map(tool => (
                                        <span
                                            key={tool}
                                            title={tool}
                                            className="px-2 py-1 text-xs rounded-md bg-neutral-gray-pale border border-neutral-gray-light text-neutral-gray-dark"
                                        >
                                            {toolLabel(tool, lang)}
                                        </span>
                                    ))}
                                </div>
                            ) : (
                                <p className="text-sm text-neutral-gray-medium">—</p>
                            )}
                            <p className="text-xs text-neutral-gray-medium mt-3 leading-relaxed">{t.baseToolsNote}</p>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
