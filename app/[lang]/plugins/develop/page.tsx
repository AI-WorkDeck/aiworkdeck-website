import { PLATFORM_GUIDE, PLATFORM_MANIFEST, PLATFORM_COMMANDS } from '@/lib/plugin-platform-guide';
import Link from 'next/link';
import { Download, ArrowRight } from 'lucide-react';
import { toBaseLocale, type Locale } from '@/i18n-config';
import { getDictionary } from '@/get-dictionary';
import { getTemplateSnippets, getWebSdkMethods } from '@/lib/plugin-template';
import { Reveal } from '@/components/motion/Reveal';
import { PageHero } from '@/components/layout/PageHero';
import { Button } from '@/components/ui/button';
import { CopyButton } from '@/components/skills/CopyButton';
import { pageAlternates } from '@/lib/page-metadata';

export async function generateMetadata({ params }: { params: Promise<{ lang: Locale }> }) {
    const { lang } = await params;
    const dict = await getDictionary(lang);
    return {
        title: dict.developPage.metaTitle,
        description: dict.developPage.metaDescription,
        alternates: pageAlternates(lang, '/plugins/develop', { crossSite: true }),
    };
}

function Code({ children, copyLabel, copiedLabel }: { children: string; copyLabel: string; copiedLabel: string }) {
    return (
        <div className="group relative my-5 overflow-hidden rounded-xl border border-neutral-gray-light bg-neutral-dark-bg">
            <div className="absolute right-3 top-3 opacity-0 transition-opacity group-hover:opacity-100">
                <CopyButton text={children} label={copyLabel} copiedLabel={copiedLabel} />
            </div>
            <pre className="overflow-x-auto p-5 text-[13px] leading-relaxed text-neutral-gray-pale">
                <code>{children}</code>
            </pre>
        </div>
    );
}

function Section({
    n,
    title,
    children,
}: {
    n: string;
    title: string;
    children: React.ReactNode;
}) {
    return (
        <Reveal>
            <section className="mt-16 scroll-mt-28">
                <div className="mb-5 flex items-baseline gap-4">
                    <span aria-hidden="true" className="text-xs tabular-nums text-king-forest">{n}</span>
                    <h2 className="text-2xl font-semibold tracking-tight text-neutral-dark-bg">{title}</h2>
                </div>
                <div className="space-y-4 leading-[1.85] text-neutral-gray-dark">{children}</div>
            </section>
        </Reveal>
    );
}

export default async function PluginDevelopPage({ params }: { params: Promise<{ lang: Locale }> }) {
    const { lang } = await params;
    const dict = await getDictionary(lang);
    const t = dict.developPage;
    const platform = PLATFORM_GUIDE[toBaseLocale(lang)];
    const snippets = getTemplateSnippets(lang);
    const webSdkMethods = getWebSdkMethods(lang);

    return (
        <div className="min-h-screen bg-neutral-gray-pale pb-24">
            {/* 全站统一深色刊物式页头（dev-board#328）；模板下载/投稿入口进 hero 插槽 */}
            <PageHero eyebrow={t.eyebrow} title={t.title} subtitle={t.intro} size="compact" width="3xl">
                <div className="flex flex-wrap gap-3">
                    <a
                        href="/api/plugins/template"
                        download
                        className="inline-flex h-10 items-center gap-1.5 rounded-lg bg-white px-5 text-sm font-bold text-king-forest-darker shadow-md shadow-black/10 transition-colors hover:bg-king-mint-lightest"
                    >
                        <Download className="h-4 w-4" strokeWidth={2} />
                        {t.downloadTemplate}
                    </a>
                    <Link
                        href={`/${lang}/plugins/submit`}
                        className="inline-flex h-10 items-center rounded-lg border border-[#e3dccb] bg-[#fffdf8] px-5 text-sm font-medium text-[#1f3b34] transition-colors hover:border-[#c9bd9f] hover:bg-white"
                    >
                        {t.goSubmit}
                    </Link>
                </div>
                <p className="mt-4 text-[13px] leading-relaxed text-[#4a5650]">
                    {t.devEligibilityP1} {t.devEligibilityP2}{' '}
                    <Link className="text-[#1f3b34] underline underline-offset-2" href={`/${lang}/plugins/developer`}>{t.devEligibilityLink}</Link>
                </p>
            </PageHero>
            <div className="container mx-auto max-w-3xl px-4 md:px-8 pt-4">
                <Section n="01" title={t.s1Title}>
                    <p>
                        {t.s1Lead}
                        <strong className="text-neutral-gray-darkest">
                            {t.s1LeadStrong}
                        </strong>
                    </p>
                    <div className="my-6 overflow-hidden rounded-xl border border-neutral-gray-light bg-white">
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="border-b border-neutral-gray-light bg-neutral-gray-pale/60 text-left">
                                    <th className="px-5 py-3 font-medium text-neutral-gray-darkest">{t.s1ThScenario}</th>
                                    <th className="px-5 py-3 font-medium text-neutral-gray-darkest">{t.s1ThUse}</th>
                                </tr>
                            </thead>
                            <tbody className="text-neutral-gray-dark">
                                {t.s1Rows.map(([scenario, use]: string[], i: number) => (
                                    <tr key={i} className="border-b border-neutral-gray-light/60 last:border-0">
                                        <td className="px-5 py-3">{scenario}</td>
                                        <td className={`px-5 py-3 font-medium ${use === 'plugin' ? 'text-king-forest' : 'text-neutral-gray-medium'}`}>
                                            {use === 'plugin' ? t.pluginLabel : t.skillLabel}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                    <p>
                        {t.s1P2a}
                        <Link href={`/${lang}/skills/submit`} className="text-king-forest underline underline-offset-4">
                            {t.s1P2Link}
                        </Link>
                        {t.s1P2b}
                    </p>
                </Section>

                <Section n="02" title={t.s2Title}>
                    <p>
                        {t.s2P1a}<code className="rounded bg-neutral-gray-light/60 px-1.5 py-0.5 text-[13px]">manifest.json</code>
                        {t.s2P1b}
                    </p>
                    <p>
                        {t.s2P2}
                    </p>
                    <Code copyLabel={t.copy} copiedLabel={t.copied}>{snippets.tools}</Code>
                    <p>
                        <strong className="text-neutral-gray-darkest">
                            {t.s2P3Strong}
                        </strong>
                        {t.s2P3}
                    </p>
                    <p>{t.s2P4}</p>
                    <Code copyLabel={t.copy} copiedLabel={t.copied}>{snippets.manifest}</Code>
                    <p>
                        <strong className="text-neutral-gray-darkest">{t.s2P5Strong}</strong>
                        {t.s2P5a}
                        <code className="rounded bg-neutral-gray-light/60 px-1.5 py-0.5 text-[13px]">tools[].name</code>
                        {t.s2P5b}
                    </p>
                    <p>{t.s2P6}</p>
                    <Code copyLabel={t.copy} copiedLabel={t.copied}>{`mvn package
mkdir -p dist && cp target/my-plugin-1.0.0.jar manifest.json dist/
cd dist && zip -r ../my-plugin-1.0.0.zip . && cd ..`}</Code>
                    <p>
                        {t.s2P7}
                    </p>
                </Section>

                <Section n="03" title={t.s3Title}>
                    <p>
                        {t.s3P1a}<code className="rounded bg-neutral-gray-light/60 px-1.5 py-0.5 text-[13px]">dist/</code>
                        {t.s3P1b}
                    </p>
                    <Code copyLabel={t.copy} copiedLabel={t.copied}>{`# macOS / Linux
~/.aiworkdeck/plugins/my-plugin/`}</Code>
                    <p>
                        {t.s3P2}
                    </p>
                </Section>

                <Section n="04" title={t.s4Title}>
                    <div className="my-5 overflow-hidden rounded-xl border border-neutral-gray-light bg-white">
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="border-b border-neutral-gray-light bg-neutral-gray-pale/60 text-left">
                                    <th className="px-5 py-3 font-medium text-neutral-gray-darkest">{t.s4ThField}</th>
                                    <th className="px-5 py-3 font-medium text-neutral-gray-darkest">{t.s4ThDesc}</th>
                                </tr>
                            </thead>
                            <tbody className="text-neutral-gray-dark">
                                {t.s4Rows.map(([f, d]: string[]) => (
                                    <tr key={f} className="border-b border-neutral-gray-light/60 last:border-0">
                                        <td className="whitespace-nowrap px-5 py-3 align-top">
                                            <code className="text-[13px] text-king-forest">{f}</code>
                                        </td>
                                        <td className="px-5 py-3 leading-relaxed">{d}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </Section>

                <Section n="05" title={t.s5Title}>
                    <p>{t.s5Intro}</p>
                    <ul className="ml-1 space-y-2">
                        {t.s5Perms.map(([k, v]: string[]) => (
                            <li key={k} className="flex gap-3">
                                <code className="mt-0.5 shrink-0 rounded bg-neutral-gray-light/60 px-2 py-0.5 text-[13px] text-king-forest">
                                    {k}
                                </code>
                                <span>{v}</span>
                            </li>
                        ))}
                    </ul>
                    <div className="my-6 rounded-xl border-l-2 border-king-forest bg-white p-5">
                        <p className="mb-3 font-medium text-neutral-gray-darkest">{t.s5BoxTitle}</p>
                        <p className="text-sm leading-relaxed">
                            {t.s5BoxP1}
                            <strong className="text-neutral-gray-darkest">{t.s5BoxStrong}</strong>
                            {t.s5BoxP2}
                        </p>
                    </div>
                </Section>

                <Section n="06" title={t.s6Title}>
                    <p>
                        {t.s6P1}
                    </p>
                    <p className="font-medium text-neutral-gray-darkest">{t.s6RejectLead}</p>
                    <ul className="ml-5 list-disc space-y-2 marker:text-king-forest/40">
                        {t.s6Rejects.map((item: string, i: number) => (
                            <li key={i}>{item}</li>
                        ))}
                    </ul>
                    <p>
                        {t.s6P2}
                    </p>
                    <p>
                        {t.s6P3}
                    </p>
                </Section>

                <Section n="07" title={t.s7Title}>
                    <p>
                        {t.s7P1}
                    </p>
                    <p>
                        {t.s7P2}
                    </p>
                </Section>

                <Section n="08" title={t.s8Title}>
                    <p className="rounded-xl border border-neutral-gray-light bg-white p-5 text-sm leading-7" role="note">{platform.notice}</p>
                    <p>
                        {t.s8P1a}<code className="rounded bg-neutral-gray-light/60 px-1.5 py-0.5 text-[13px]">web/</code>
                        {t.s8P1b}<code className="rounded bg-neutral-gray-light/60 px-1.5 py-0.5 text-[13px]">frontendEntry</code>
                        {t.s8P1c}
                    </p>
                    <p>
                        <strong className="text-neutral-gray-darkest">{t.s8P2Strong}</strong>
                        {t.s8P2}
                    </p>
                    <p>{t.s8SdkLead}</p>
                    <div className="my-5 overflow-x-auto rounded-xl border border-neutral-gray-light bg-white">
                        <table className="w-full min-w-[34rem] text-sm">
                            <thead>
                                <tr className="border-b border-neutral-gray-light bg-neutral-gray-pale/60 text-left">
                                    <th className="px-5 py-3 font-medium text-neutral-gray-darkest">{t.s8ThMethod}</th>
                                    <th className="px-5 py-3 font-medium text-neutral-gray-darkest">{t.s8ThParams}</th>
                                    <th className="px-5 py-3 font-medium text-neutral-gray-darkest">{t.s8ThResult}</th>
                                    <th className="px-5 py-3 font-medium text-neutral-gray-darkest">{t.s8ThPerm}</th>
                                </tr>
                            </thead>
                            <tbody className="text-neutral-gray-dark">
                                {webSdkMethods.map(m => (
                                    <tr key={m.method} className="border-b border-neutral-gray-light/60 last:border-0">
                                        <td className="whitespace-nowrap px-5 py-3 align-top">
                                            <code className="text-[13px] text-king-forest">{m.method}</code>
                                        </td>
                                        <td className="px-5 py-3 align-top">
                                            <code className="text-[13px]">{m.params}</code>
                                        </td>
                                        <td className="px-5 py-3 align-top">
                                            <code className="text-[13px]">{m.result}</code>
                                        </td>
                                        <td className="whitespace-nowrap px-5 py-3 align-top">
                                            <code className="text-[13px]">{m.permission}</code>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                    <Code copyLabel={t.copy} copiedLabel={t.copied}>{snippets.webUsage}</Code>
                    <p>{t.s8P3}</p>
                    <p className="font-medium text-neutral-gray-darkest">{t.s8ThemeTitle}</p>
                    <p>{t.s8ThemeLead}</p>
                    <p>{t.s8SimLead}</p>
                    <Code copyLabel={t.copy} copiedLabel={t.copied}>{`python3 -m http.server 8000
# -> http://localhost:8000/dev/host-simulator.html`}</Code>
                    <p className="text-sm text-neutral-gray-medium">{t.s8SimNote}</p>
                    <div className="pt-2">
                        <a href="/api/plugins/template?type=web" download>
                            <Button variant="outline" className="font-semibold px-6">
                                <Download className="mr-2 h-4 w-4" strokeWidth={2} />
                                {t.s8Download}
                            </Button>
                        </a>
                    </div>
                </Section>

                <Section n="09" title={platform.title}>
                    {platform.paragraphs.map((paragraph) => <p key={paragraph}>{paragraph}</p>)}
                    <Code copyLabel={t.copy} copiedLabel={t.copied}>{PLATFORM_COMMANDS}</Code>
                    <Code copyLabel={t.copy} copiedLabel={t.copied}>{PLATFORM_MANIFEST}</Code>
                    <h3 className="text-lg font-semibold">{platform.agentTitle}</h3>
                    <Code copyLabel={t.copy} copiedLabel={t.copied}>{platform.agent}</Code>
                    <p className="text-sm"><a className="underline" href="https://modelcontextprotocol.io/specification/2025-03-26/basic/transports">MCP Streamable HTTP specification</a></p>
                </Section>
                <Reveal>
                    <div className="mt-16 flex flex-col items-start gap-6 rounded-2xl border border-neutral-gray-light bg-white p-8 sm:flex-row sm:items-center sm:justify-between">
                        <div>
                            <p className="font-display text-lg font-semibold text-neutral-gray-darkest">
                                {t.ctaTitle}
                            </p>
                            <p className="mt-3 text-sm leading-7 text-neutral-gray-dark">
                                {t.ctaBody}
                            </p>
                        </div>
                        <Link href={`/${lang}/plugins/submit`}>
                            <Button className="font-semibold px-6">
                                {t.ctaBtn}
                                <ArrowRight className="ml-2 h-4 w-4" strokeWidth={2} />
                            </Button>
                        </Link>
                    </div>
                </Reveal>
            </div>
        </div>
    );
}
