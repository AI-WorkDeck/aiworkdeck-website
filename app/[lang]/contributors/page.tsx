// SPDX-FileCopyrightText: 2026 北京公富信息技术有限公司 and AI WorkDeck contributors
// SPDX-License-Identifier: AGPL-3.0-or-later
import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowUpRight, Code2, Feather, Puzzle } from 'lucide-react';
import { getDictionary } from '@/get-dictionary';
import { LOCALE_META, type Locale } from '@/i18n-config';
import { getCodeContributors, listMarketplaceContributors } from '@/lib/contributors';
import { PageHero } from '@/components/layout/PageHero';
import { Avatar } from '@/components/user/Avatar';
import { pageAlternates } from '@/lib/page-metadata';
import { REPO_URL } from '@/lib/structured-data';

export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }: { params: Promise<{ lang: Locale }> }): Promise<Metadata> {
  const { lang } = await params;
  const t = (await getDictionary(lang)).contributorsPage;
  return {
    title: t.metaTitle,
    description: t.metaDescription,
    alternates: pageAlternates(lang, '/contributors'),
  };
}

export default async function ContributorsPage({ params }: { params: Promise<{ lang: Locale }> }) {
  const { lang } = await params;
  const t = (await getDictionary(lang)).contributorsPage;
  const codeContributors = getCodeContributors();
  const marketplaceContributors = listMarketplaceContributors();

  return (
    <div className="min-h-screen bg-neutral-gray-pale pb-24">
      <PageHero eyebrow={t.eyebrow} title={t.title} subtitle={t.intro} width="6xl" />

      <div className="container mx-auto max-w-6xl px-4 pt-12 md:px-8">
        <section aria-labelledby="code-contributors">
          <div className="mb-6 max-w-3xl">
            <div className="flex items-center gap-3">
              <Code2 className="h-5 w-5 text-king-forest" strokeWidth={1.6} />
              <h2 id="code-contributors" className="font-display text-2xl font-semibold text-neutral-dark-bg">{t.codeTitle}</h2>
            </div>
            <p className="mt-3 text-[15px] leading-relaxed text-neutral-gray-medium">{t.codeIntro}</p>
          </div>
          <ul className="grid gap-px overflow-hidden rounded-xl border border-neutral-gray-light bg-neutral-gray-light sm:grid-cols-2 lg:grid-cols-3">
            {codeContributors.map(contributor => (
              <li key={contributor.login} className="bg-[#fffdf8]">
                <a
                  href={contributor.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="group flex min-h-24 items-center gap-4 px-5 py-5 transition-colors hover:bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-king-forest"
                  aria-label={`${contributor.login} — ${t.githubProfile}`}
                >
                  <span aria-hidden="true" className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-king-forest/20 bg-king-forest-lightest font-display text-lg font-semibold text-king-forest">
                    {contributor.login.slice(0, 1).toUpperCase()}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-display text-[16px] font-semibold text-neutral-dark-bg">{contributor.login}</span>
                    <span className="mt-1 block text-xs text-neutral-gray-medium">
                      {t.mergedContributions.replace('{count}', contributor.contributions.toLocaleString(LOCALE_META[lang].bcp47))}
                    </span>
                  </span>
                  <ArrowUpRight className="h-4 w-4 shrink-0 text-neutral-gray-medium transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-king-forest" strokeWidth={1.6} />
                </a>
              </li>
            ))}
          </ul>
        </section>

        <section aria-labelledby="marketplace-contributors" className="mt-16">
          <div className="mb-6 max-w-3xl">
            <div className="flex items-center gap-3">
              <Puzzle className="h-5 w-5 text-king-forest" strokeWidth={1.6} />
              <h2 id="marketplace-contributors" className="font-display text-2xl font-semibold text-neutral-dark-bg">{t.marketplaceTitle}</h2>
            </div>
            <p className="mt-3 text-[15px] leading-relaxed text-neutral-gray-medium">{t.marketplaceIntro}</p>
          </div>
          {marketplaceContributors.length === 0 ? (
            <p className="rounded-xl border border-dashed border-neutral-gray-light bg-white/50 px-6 py-10 text-center text-sm text-neutral-gray-medium">{t.emptyMarketplace}</p>
          ) : (
            <ul className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {marketplaceContributors.map(contributor => (
                <li key={contributor.user.id}>
                  <Link
                    href={`/${lang}/u/${contributor.user.username}`}
                    className="group block h-full rounded-xl border border-neutral-gray-light bg-[#fffdf8] p-5 transition-all hover:-translate-y-0.5 hover:border-king-forest/35 hover:shadow-lg hover:shadow-king-forest/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-king-forest"
                    aria-label={`${contributor.user.displayName} — ${t.viewProfile}`}
                  >
                    <div className="flex items-center gap-3.5">
                      <Avatar
                        userId={contributor.user.id}
                        displayName={contributor.user.displayName}
                        avatarUpdatedAt={contributor.user.avatarUpdatedAt}
                        size={44}
                        shape="circle"
                      />
                      <div className="min-w-0">
                        <h3 className="truncate font-display text-[17px] font-semibold text-neutral-dark-bg group-hover:text-king-forest">{contributor.user.displayName}</h3>
                        <p className="truncate text-xs text-neutral-gray-medium">@{contributor.user.username}</p>
                      </div>
                    </div>
                    <div className="mt-5 flex flex-wrap gap-x-4 gap-y-2 border-t border-neutral-gray-light/70 pt-4 text-xs text-neutral-gray-medium">
                      {contributor.skills.length > 0 && (
                        <span className="inline-flex items-center gap-1.5">
                          <Feather className="h-3.5 w-3.5 text-king-forest" strokeWidth={1.6} />
                          {t.skillCount.replace('{count}', String(contributor.skills.length))}
                        </span>
                      )}
                      {contributor.plugins.length > 0 && (
                        <span className="inline-flex items-center gap-1.5">
                          <Puzzle className="h-3.5 w-3.5 text-king-forest" strokeWidth={1.6} />
                          {t.pluginCount.replace('{count}', String(contributor.plugins.length))}
                        </span>
                      )}
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="mt-16 border-y border-[#d7c5a1] py-8 md:flex md:items-center md:justify-between md:gap-10">
          <div className="max-w-2xl">
            <h2 className="font-display text-2xl font-semibold text-neutral-dark-bg">{t.joinTitle}</h2>
            <p className="mt-3 text-[15px] leading-relaxed text-neutral-gray-medium">{t.joinText}</p>
          </div>
          <div className="mt-6 flex flex-wrap gap-3 md:mt-0 md:justify-end">
            <a href={`${REPO_URL}/blob/master/.github/CONTRIBUTING.md`} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center rounded-lg bg-king-forest px-4 text-sm font-semibold text-white hover:bg-king-forest/90">
              {t.contributeCode}
            </a>
            <Link href={`/${lang}/skills/submit`} className="inline-flex min-h-11 items-center rounded-lg border border-king-forest/30 px-4 text-sm font-semibold text-king-forest hover:bg-king-forest-lightest">
              {t.submitSkill}
            </Link>
            <Link href={`/${lang}/plugins/submit`} className="inline-flex min-h-11 items-center rounded-lg border border-king-forest/30 px-4 text-sm font-semibold text-king-forest hover:bg-king-forest-lightest">
              {t.submitPlugin}
            </Link>
          </div>
        </section>
      </div>
    </div>
  );
}
