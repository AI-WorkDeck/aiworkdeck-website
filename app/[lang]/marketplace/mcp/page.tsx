// SPDX-FileCopyrightText: 2026 北京京微资易科技有限公司 and AI WorkDeck contributors
// SPDX-License-Identifier: AGPL-3.0-or-later
import type { Metadata } from 'next';
import { ExternalLink, Network } from 'lucide-react';
import type { Locale } from '@/i18n-config';
import { getDictionary } from '@/get-dictionary';
import { pageAlternates } from '@/lib/page-metadata';
import { MarketplaceHero } from '../MarketplaceHero';

// Provider-owned references only. Credentials are entered in the desktop, never here.
const providers = [
    { id: 'qichacha', name: 'Qichacha', official: true, docs: 'https://agent.qcc.com/', endpoint: 'https://agent.qcc.com/mcp/company/stream' },
    { id: 'pkulaw', name: 'PKULaw', official: true, docs: 'https://mcp.pkulaw.com/', endpoint: 'https://apim-gateway.pkulaw.com/mcp-law-agg/mcp' },
    { id: 'yuandian', name: 'Yuandian', docs: 'https://open.chineselaw.com/mcp-config', endpoint: 'https://open.chineselaw.com/mcp/law/stream' },
    { id: 'tavily', name: 'Tavily', docs: 'https://github.com/tavily-ai/tavily-mcp', endpoint: 'https://mcp.tavily.com/mcp/' },
    { id: 'github', name: 'GitHub', docs: 'https://docs.github.com/en/copilot/how-tos/provide-context/use-mcp-in-your-ide/set-up-the-github-mcp-server', endpoint: 'https://api.githubcopilot.com/mcp/' },
    { id: 'notion', name: 'Notion', docs: 'https://developers.notion.com/guides/mcp/get-started-with-mcp', endpoint: 'https://mcp.notion.com/mcp', oauth: true },
];

export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }: { params: Promise<{ lang: Locale }> }): Promise<Metadata> {
    const { lang } = await params;
    const dict = await getDictionary(lang);
    return {
        title: dict.mcpPage.title,
        description: dict.marketplacePage.mcpDescription,
        alternates: pageAlternates(lang, '/marketplace/mcp', { crossSite: true }),
    };
}

export default async function McpPage({ params }: { params: Promise<{ lang: Locale }> }) {
    const { lang } = await params;
    const dict = await getDictionary(lang);
    const t = dict.mcpPage;
    return (
        <div className="min-h-screen bg-neutral-gray-pale pb-24">
            <MarketplaceHero lang={lang} dict={dict} active="mcp">
                <a href="#configure" className="inline-flex min-h-10 items-center rounded-lg bg-white px-5 text-sm font-bold text-king-forest-darker shadow-sm transition-colors hover:bg-king-mint-lightest">
                    {t.configure}
                </a>
            </MarketplaceHero>
            <div className="container mx-auto max-w-6xl px-4 md:px-8">
                {/* 先呈现可接入的 MCP 服务商矩阵，再展示配置指引，避免首屏大段说明文字挡住核心目录 */}
                <section className="pt-10" aria-label={t.title}>
                    <div className="grid grid-cols-1 gap-5 md:grid-cols-2 lg:grid-cols-3">
                        {providers.map(provider => (
                            <article
                                key={provider.id}
                                id={provider.id}
                                className="flex scroll-mt-28 flex-col justify-between rounded-2xl border border-[#dce2de] bg-white p-6 transition-all duration-300 hover:-translate-y-0.5 hover:border-king-forest/35 hover:shadow-[0_18px_40px_-18px_rgba(18,58,38,0.2)]"
                            >
                                <div>
                                    <div className="mb-4 flex items-center justify-between gap-3">
                                        <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-king-mint-lightest text-king-forest">
                                            <Network className="h-5 w-5" strokeWidth={1.75} aria-hidden="true" />
                                        </span>
                                        <span className="rounded-full border border-king-forest/20 bg-neutral-gray-pale px-2.5 py-0.5 font-mono text-[10.5px] font-medium text-king-forest">
                                            {provider.official ? 'BUILTIN' : provider.oauth ? 'OAUTH' : 'MCP'}
                                        </span>
                                    </div>
                                    <h2 className="font-display text-xl font-bold text-neutral-dark-bg">
                                        {t.providers[provider.id as keyof typeof t.providers] || provider.name}
                                    </h2>
                                    <p className="mt-2.5 text-sm leading-relaxed text-neutral-gray-dark">
                                        {t.descriptions[provider.id as keyof typeof t.descriptions]}
                                    </p>
                                    <p className="mt-3 text-xs leading-relaxed text-neutral-gray-medium">
                                        {provider.official ? t.builtin : provider.oauth ? t.oauthNotice : t.custom}
                                    </p>
                                </div>

                                <div className="mt-5 border-t border-neutral-gray-light/70 pt-4">
                                    {provider.endpoint && (
                                        <details className="mb-3 text-xs text-neutral-gray-dark">
                                            <summary className="cursor-pointer font-semibold text-king-forest hover:underline">
                                                {t.endpoint}
                                            </summary>
                                            <code dir="ltr" className="mt-2 block break-all rounded-lg border border-neutral-gray-light bg-neutral-gray-pale p-2.5 font-mono text-[11px] leading-relaxed [unicode-bidi:isolate]">
                                                {provider.endpoint}
                                            </code>
                                        </details>
                                    )}
                                    <a
                                        href={provider.docs}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="inline-flex items-center gap-1.5 text-xs font-bold text-king-forest hover:underline"
                                    >
                                        {t.docs}
                                        <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
                                    </a>
                                </div>
                            </article>
                        ))}
                    </div>
                </section>

                <section id="configure" className="mt-12 scroll-mt-28 rounded-2xl border border-[#dce2de] bg-white p-6 md:p-8">
                    <div className="flex flex-wrap items-baseline justify-between gap-3 border-b border-neutral-gray-light/80 pb-4">
                        <h2 className="font-display text-xl font-bold text-neutral-dark-bg md:text-2xl">{t.configure}</h2>
                        <p className="font-mono text-xs text-neutral-gray-medium">{t.releaseNote}</p>
                    </div>
                    <div className="mt-6 grid gap-5 md:grid-cols-3">
                        <div className="rounded-xl border border-neutral-gray-light/80 bg-neutral-gray-pale/50 p-4">
                            <span className="font-mono text-[11px] font-bold text-king-forest">01</span>
                            <p className="mt-2 text-xs leading-relaxed text-neutral-gray-dark">{t.setup}</p>
                        </div>
                        <div className="rounded-xl border border-neutral-gray-light/80 bg-neutral-gray-pale/50 p-4">
                            <span className="font-mono text-[11px] font-bold text-king-forest">02</span>
                            <p className="mt-2 text-xs leading-relaxed text-neutral-gray-dark">{t.jsonSetup}</p>
                            <p className="mt-2 border-t border-neutral-gray-light/60 pt-2 text-xs leading-relaxed text-neutral-gray-medium">{t.stdioSetup}</p>
                        </div>
                        <div className="rounded-xl border border-neutral-gray-light/80 bg-neutral-gray-pale/50 p-4">
                            <span className="font-mono text-[11px] font-bold text-king-forest">03</span>
                            <p className="mt-2 text-xs leading-relaxed text-neutral-gray-dark">{t.billing}</p>
                            <p className="mt-2 border-t border-neutral-gray-light/60 pt-2 text-xs leading-relaxed text-neutral-gray-medium">{t.customServer}</p>
                        </div>
                    </div>
                </section>
            </div>
        </div>
    );
}
