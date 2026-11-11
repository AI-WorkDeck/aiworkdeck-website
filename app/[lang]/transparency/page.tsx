import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowUpRight, FileText } from 'lucide-react';
import { Locale, LOCALE_META } from '@/i18n-config';
import { getDictionary } from '@/get-dictionary';
import { PageHero } from '@/components/layout/PageHero';
import { Reveal } from '@/components/motion/Reveal';
import { CountUp } from '@/components/motion/CountUp';
import { pageAlternates } from '@/lib/page-metadata';
import { REPO_URL } from '@/lib/structured-data';
import { loadPublicTransparency, type PublicReport } from '@/lib/transparency-public';
import { localizeReportNote, parsePeriod, type Money, type Num } from '@/lib/transparency';

export async function generateMetadata({
    params,
}: {
    params: Promise<{ lang: Locale }>;
}): Promise<Metadata> {
    const { lang } = await params;
    const dict = await getDictionary(lang);
    return {
        title: dict.transparencyPage.title,
        description: dict.transparencyPage.metaDescription,
        alternates: pageAlternates(lang, '/transparency', { crossSite: true }),
    };
}

/**
 * 账目公开页（dev-board#611 / #612）。
 *
 * 承诺是「每半年公布账目与使用情况」，这一页就是兑现的地方。它有两层内容：
 * 上半页是**随时可查的实时计数**（注册 / 安装 / 下载），下半页是**已发布的半年报**。
 * 首期报表出来之前，实时计数照样显示——空着一整页说「敬请期待」是最差的交代。
 *
 * 数字一律不粉饰：取不到的值直接不显示（不拿 0 冒充「真的是零」），
 * 每个口径都带一行小字说明它是什么、不是什么。
 */
export const dynamic = 'force-dynamic';

function SectionEyebrow({ children }: { children: React.ReactNode }) {
    return (
        <div className="mb-4 flex items-center gap-3">
            <span className="h-px w-8 bg-king-forest/40" />
            <span className="text-[11px] font-medium uppercase tracking-[0.22em] text-king-forest">{children}</span>
        </div>
    );
}

const CARD =
    'rounded-xl border border-neutral-gray-light/90 bg-white/65 backdrop-blur-xl';

function fmtMoney(m: Money | undefined, lang: Locale, fallback: string): string {
    if (!m || m.cents === null) return fallback;
    // 负号落在货币符号之前（盈余为负是常态，不是边角情况）
    const major = (Math.abs(m.cents) / 100).toLocaleString(LOCALE_META[lang].bcp47, {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
    });
    return `${m.cents < 0 ? '-' : ''}${m.currency === 'USD' ? 'US$' : '¥'}${major}`;
}

function fmtCents(cents: number, currency: 'CNY' | 'USD', lang: Locale): string {
    return fmtMoney({ cents, currency, source: 'auto' }, lang, '—');
}

function fmtCount(n: Num | undefined, lang: Locale, fallback: string): string {
    if (!n || n.value === null) return fallback;
    return n.value.toLocaleString(LOCALE_META[lang].bcp47);
}

/** 一个数字的口径说明。没有说明的数字在公开账目里不该出现。 */
function NoteLine({ note, lang }: { note?: string; lang: Locale }) {
    const text = localizeReportNote(note, lang);
    if (!text) return null;
    return <p className="mt-1 text-[11px] leading-relaxed text-neutral-gray-medium">{text}</p>;
}

function periodLabel(period: string, t: any): string {
    const { year, half } = parsePeriod(period);
    return (half === 1 ? t.reports.periodH1 : t.reports.periodH2).replace('{year}', String(year));
}

/** 实时计数格。取不到值的格子整块不渲染——空数字位比没有这一格更刺眼。 */
function LiveTile({ label, value, note }: { label: string; value: number | null; note: string }) {
    if (value === null) return null;
    return (
        <div className={`${CARD} px-5 py-5`}>
            <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-neutral-gray-medium">{label}</p>
            <p className="font-display mt-2.5 text-3xl font-bold leading-none text-neutral-dark-bg tabular-nums">
                <CountUp value={value} />
            </p>
            <p className="mt-2 text-xs leading-relaxed text-neutral-gray-medium">{note}</p>
        </div>
    );
}

function ReportCard({ report, lang, t }: { report: PublicReport; lang: Locale; t: any }) {
    const { data, summary } = report;
    const r = t.reports;
    const dash = r.notFilled;

    const metricRows: Array<[string, Num]> = [
        [r.metrics.usersTotal, data.metrics.usersTotal],
        [r.metrics.usersNew, data.metrics.usersNew],
        [r.metrics.installsTotal, data.metrics.installsTotal],
        [r.metrics.installsActive, data.metrics.installsActive],
        [r.metrics.downloads, data.metrics.downloads],
    ];

    const images = report.receipts.filter((x) => x.mime.startsWith('image/'));
    const files = report.receipts.filter((x) => !x.mime.startsWith('image/'));

    return (
        <article className={`${CARD} overflow-hidden`}>
            <header className="flex flex-wrap items-baseline justify-between gap-3 border-b border-neutral-gray-light/70 px-6 py-5">
                <h3 className="font-display text-xl font-semibold text-neutral-dark-bg">
                    {periodLabel(report.period, t)}
                </h3>
                {report.publishedAt && (
                    <p className="text-xs text-neutral-gray-medium">
                        {r.publishedAt.replace('{date}', report.publishedAt.slice(0, 10))}
                    </p>
                )}
            </header>

            <div className="flex flex-col gap-8 px-6 py-6">
                {/* 使用情况 */}
                <section>
                    <h4 className="font-display mb-3 text-sm font-semibold text-neutral-dark-bg">{r.metrics.title}</h4>
                    <dl className="grid grid-cols-2 gap-x-5 gap-y-4 md:grid-cols-5">
                        {metricRows.map(([label, n]) => (
                            <div key={label}>
                                <dt className="text-[11px] uppercase tracking-[0.14em] text-neutral-gray-medium">
                                    {label}
                                </dt>
                                <dd className="font-display mt-1 text-lg font-bold text-neutral-dark-bg tabular-nums">
                                    {fmtCount(n, lang, dash)}
                                </dd>
                                <NoteLine note={n?.note} lang={lang} />
                            </div>
                        ))}
                    </dl>
                </section>

                {/* 收入与渠道费 */}
                <section>
                    <h4 className="font-display mb-3 text-sm font-semibold text-neutral-dark-bg">{r.revenue.title}</h4>
                    {data.revenue.length === 0 ? (
                        <p className="text-sm text-neutral-gray-medium">{r.revenue.none}</p>
                    ) : (
                        <div className="overflow-x-auto">
                            <table className="w-full min-w-[480px] border-collapse text-sm">
                                <thead>
                                    <tr className="border-b border-neutral-gray-light/70 text-[11px] uppercase tracking-[0.14em] text-neutral-gray-medium">
                                        <th className="py-2 pr-4 text-left font-medium">{r.revenue.channel}</th>
                                        <th className="py-2 pr-4 text-right font-medium">{r.revenue.gross}</th>
                                        <th className="py-2 pr-4 text-right font-medium">{r.revenue.fee}</th>
                                        <th className="py-2 text-right font-medium">{r.revenue.net}</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {data.revenue.map((line, i) => {
                                        const net =
                                            line.gross.cents !== null && line.fee.cents !== null
                                                ? fmtCents(line.gross.cents - line.fee.cents, line.gross.currency, lang)
                                                : dash;
                                        return (
                                            <tr key={`${line.channel}-${i}`} className="border-b border-neutral-gray-light/50">
                                                <td className="py-2.5 pr-4 text-neutral-gray-dark">
                                                    {r.channels[line.channel] ?? line.channel}
                                                </td>
                                                <td className="py-2.5 pr-4 text-right font-mono text-neutral-gray-dark tabular-nums">
                                                    {fmtMoney(line.gross, lang, dash)}
                                                </td>
                                                <td className="py-2.5 pr-4 text-right font-mono text-neutral-gray-dark tabular-nums">
                                                    {fmtMoney(line.fee, lang, dash)}
                                                </td>
                                                <td className="py-2.5 text-right font-mono text-neutral-gray-dark tabular-nums">
                                                    {net}
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    )}
                </section>

                {/* 第三方成本 */}
                <section>
                    <h4 className="font-display mb-3 text-sm font-semibold text-neutral-dark-bg">{r.costs.title}</h4>
                    {data.costs.length === 0 ? (
                        <p className="text-sm text-neutral-gray-medium">{r.costs.none}</p>
                    ) : (
                        <div className="overflow-x-auto">
                            <table className="w-full min-w-[480px] border-collapse text-sm">
                                <thead>
                                    <tr className="border-b border-neutral-gray-light/70 text-[11px] uppercase tracking-[0.14em] text-neutral-gray-medium">
                                        <th className="py-2 pr-4 text-left font-medium">{r.costs.item}</th>
                                        <th className="py-2 text-right font-medium">{r.costs.amount}</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {data.costs.map((line, i) => (
                                        <tr key={`${line.key}-${i}`} className="border-b border-neutral-gray-light/50">
                                            <td className="py-2.5 pr-4 text-neutral-gray-dark">
                                                {line.key === 'other' && line.label
                                                    ? line.label
                                                    : r.costKeys[line.key] ?? line.key}
                                                <NoteLine note={line.amount.note} lang={lang} />
                                            </td>
                                            <td className="py-2.5 text-right align-top font-mono text-neutral-gray-dark tabular-nums">
                                                {fmtMoney(line.amount, lang, dash)}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                    {data.founderCosts.cents !== null && (
                        <p className="mt-3 text-sm text-neutral-gray-dark">
                            {r.founderCosts}
                            <span className="ml-2 font-mono tabular-nums">{fmtMoney(data.founderCosts, lang, dash)}</span>
                            <span className="ml-2 text-xs text-neutral-gray-medium">{r.founderCostsNote}</span>
                        </p>
                    )}
                </section>

                {/* 盈余 */}
                {summary.byCurrency.length > 0 && (
                    <section>
                        <h4 className="font-display mb-1 text-sm font-semibold text-neutral-dark-bg">{r.summary.title}</h4>
                        <p className="mb-1 text-xs text-neutral-gray-medium">{r.summary.formula}</p>
                        <p className="mb-3 text-xs text-neutral-gray-medium">{r.summary.amortizeNote}</p>
                        <div className="overflow-x-auto">
                            <table className="w-full min-w-[520px] border-collapse text-sm">
                                <thead>
                                    <tr className="border-b border-neutral-gray-light/70 text-[11px] uppercase tracking-[0.14em] text-neutral-gray-medium">
                                        <th className="py-2 pr-4 text-left font-medium">{r.summary.currency}</th>
                                        <th className="py-2 pr-4 text-right font-medium">{r.revenue.gross}</th>
                                        <th className="py-2 pr-4 text-right font-medium">{r.revenue.fee}</th>
                                        <th className="py-2 pr-4 text-right font-medium">{r.costs.title}</th>
                                        <th className="py-2 text-right font-medium">{r.summary.net}</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {summary.byCurrency.map((row) => (
                                        <tr key={row.currency} className="border-b border-neutral-gray-light/50">
                                            <td className="py-2.5 pr-4 text-neutral-gray-dark">{row.currency}</td>
                                            <td className="py-2.5 pr-4 text-right font-mono tabular-nums">
                                                {fmtCents(row.grossCents, row.currency, lang)}
                                            </td>
                                            <td className="py-2.5 pr-4 text-right font-mono tabular-nums">
                                                {fmtCents(row.feeCents, row.currency, lang)}
                                            </td>
                                            <td className="py-2.5 pr-4 text-right font-mono tabular-nums">
                                                {fmtCents(row.costCents, row.currency, lang)}
                                            </td>
                                            <td className="py-2.5 text-right font-mono font-medium text-king-forest tabular-nums">
                                                {fmtCents(row.netCents, row.currency, lang)}
                                            </td>
                                        </tr>
                                    ))}
                                    {summary.combinedCny && (
                                        <tr className="border-b border-neutral-gray-light/50">
                                            <td className="py-2.5 pr-4 text-neutral-gray-dark">
                                                {r.summary.combined.replace('{rate}', String(data.usdToCnyRate))}
                                            </td>
                                            <td className="py-2.5 pr-4 text-right font-mono tabular-nums">
                                                {fmtCents(summary.combinedCny.grossCents, 'CNY', lang)}
                                            </td>
                                            <td className="py-2.5 pr-4 text-right font-mono tabular-nums">
                                                {fmtCents(summary.combinedCny.feeCents, 'CNY', lang)}
                                            </td>
                                            <td className="py-2.5 pr-4 text-right font-mono tabular-nums">
                                                {fmtCents(summary.combinedCny.costCents, 'CNY', lang)}
                                            </td>
                                            <td className="py-2.5 text-right font-mono font-medium text-king-forest tabular-nums">
                                                {fmtCents(summary.combinedCny.netCents, 'CNY', lang)}
                                            </td>
                                        </tr>
                                    )}
                                </tbody>
                            </table>
                        </div>
                        {summary.hasNulls && (
                            <p className="mt-2 text-[11px] text-neutral-gray-medium">{r.summary.partial}</p>
                        )}
                    </section>
                )}

                {/* 捐赠 */}
                {(data.donation.amount.cents !== null || data.donation.org || report.receipts.length > 0) && (
                    <section className="rounded-lg border border-neutral-gray-light/80 bg-neutral-gray-pale/60 px-5 py-4">
                        <h4 className="font-display mb-3 text-sm font-semibold text-neutral-dark-bg">{r.donation.title}</h4>
                        <dl className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-[8rem_minmax(0,1fr)]">
                            <dt className="text-neutral-gray-medium">{r.donation.amount}</dt>
                            <dd className="font-mono text-neutral-gray-dark tabular-nums">
                                {fmtMoney(data.donation.amount, lang, dash)}
                            </dd>
                            <dt className="text-neutral-gray-medium">{r.donation.org}</dt>
                            <dd className="text-neutral-gray-dark">{data.donation.org || dash}</dd>
                            {data.donation.note && (
                                <>
                                    <dt className="text-neutral-gray-medium">{r.donation.note}</dt>
                                    <dd className="leading-relaxed text-neutral-gray-dark">{data.donation.note}</dd>
                                </>
                            )}
                        </dl>
                        {report.receipts.length > 0 && (
                            <div className="mt-4">
                                <p className="mb-2 text-[11px] uppercase tracking-[0.14em] text-neutral-gray-medium">
                                    {r.donation.receipts}
                                </p>
                                <div className="flex flex-wrap gap-3">
                                    {images.map((x) => (
                                        <a
                                            key={x.id}
                                            href={`/api/transparency/receipt/${x.id}`}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="block overflow-hidden rounded-lg border border-neutral-gray-light bg-white transition-colors hover:border-king-forest/30"
                                        >
                                            {/* eslint-disable-next-line @next/next/no-img-element */}
                                            <img
                                                src={`/api/transparency/receipt/${x.id}`}
                                                alt={x.caption || x.fileName}
                                                // 定高 + 封顶宽：极宽的回执截图不许把画廊撑出一条横带
                                                className="h-28 w-auto max-w-[14rem] object-cover"
                                            />
                                        </a>
                                    ))}
                                    {files.map((x) => (
                                        <a
                                            key={x.id}
                                            href={`/api/transparency/receipt/${x.id}`}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="inline-flex items-center gap-2 rounded-lg border border-neutral-gray-light bg-white px-3 py-2 text-sm text-neutral-gray-dark transition-colors hover:border-king-forest/30 hover:text-king-forest"
                                        >
                                            <FileText className="h-4 w-4" strokeWidth={1.5} />
                                            {x.caption || x.fileName}
                                        </a>
                                    ))}
                                </div>
                            </div>
                        )}
                    </section>
                )}

                {data.remarks.trim() && (
                    <section>
                        <h4 className="font-display mb-2 text-sm font-semibold text-neutral-dark-bg">{r.remarks.title}</h4>
                        <p className="whitespace-pre-line text-sm leading-relaxed text-neutral-gray-medium">
                            {data.remarks}
                        </p>
                    </section>
                )}
            </div>
        </article>
    );
}

export default async function TransparencyPage({
    params,
}: {
    params: Promise<{ lang: Locale }>;
}) {
    const { lang } = await params;
    const dict = await getDictionary(lang);
    const t = dict.transparencyPage as any;
    const { reports, live } = await loadPublicTransparency();

    return (
        <div className="min-h-screen bg-neutral-gray-pale pb-20">
            <PageHero eyebrow={t.eyebrow} title={t.heroTitle} subtitle={t.heroSubtitle} size="compact" width="5xl">
                <a
                    href={REPO_URL}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex min-h-11 items-center gap-1.5 text-sm font-semibold text-king-forest underline underline-offset-4"
                >
                    {t.githubCta}
                    <ArrowUpRight className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
                </a>
            </PageHero>

            <div className="container mx-auto max-w-5xl px-4 md:px-8">
                {/* 实时计数置顶：首屏直接交付真实客观指标，建立高信任感 */}
                <section className="pt-10">
                    <Reveal>
                        <SectionEyebrow>{t.live.eyebrow}</SectionEyebrow>
                        <h2 className="font-display mb-5 text-2xl font-semibold tracking-tight text-neutral-dark-bg">
                            {t.live.title}
                        </h2>
                    </Reveal>
                    <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
                        <Reveal>
                            <LiveTile label={t.live.users} value={live.usersTotal} note={t.live.usersNote} />
                        </Reveal>
                        <Reveal delay={60}>
                            <LiveTile label={t.live.installs} value={live.installsTotal} note={t.live.installsNote} />
                        </Reveal>
                        <Reveal delay={120}>
                            <LiveTile label={t.live.active} value={live.installsActive} note={t.live.activeNote} />
                        </Reveal>
                        <Reveal delay={180}>
                            <LiveTile label={t.live.downloads} value={live.downloads} note={t.live.downloadsNote} />
                        </Reveal>
                    </div>
                </section>

                {/* 口径与机制说明块 */}
                <section className="mt-12 rounded-2xl border border-[#dce2de] bg-white p-6 shadow-[0_12px_32px_-20px_rgba(22,42,33,0.1)] md:p-8">
                    <Reveal>
                        <SectionEyebrow>{t.intro.eyebrow}</SectionEyebrow>
                        <h2 className="font-display mb-5 text-2xl font-semibold tracking-tight text-neutral-dark-bg">
                            {t.intro.title}
                        </h2>
                    </Reveal>
                    <div className="grid gap-5 md:grid-cols-2">
                        {(t.intro.paragraphs as string[]).map((p, i) => (
                            <Reveal key={i} delay={i * 60}>
                                <p className="text-sm leading-relaxed text-neutral-gray-medium">{p}</p>
                            </Reveal>
                        ))}
                    </div>
                    <Reveal delay={200}>
                        <div className="mt-6 flex flex-wrap items-center gap-5 border-t border-neutral-gray-light/70 pt-5 text-sm">
                            <a
                                href={REPO_URL}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-1.5 font-semibold text-king-forest hover:underline"
                            >
                                {t.intro.repoCta}
                                <ArrowUpRight className="h-3.5 w-3.5" strokeWidth={1.75} />
                            </a>
                            <Link
                                href={`/${lang}/faq#why`}
                                className="font-medium text-neutral-gray-medium transition-colors hover:text-king-forest"
                            >
                                {t.intro.pricingCta}
                            </Link>
                        </div>
                    </Reveal>
                </section>

                {/* 历期账目 */}
                <section className="mt-12">
                    <Reveal>
                        <SectionEyebrow>{t.reports.eyebrow}</SectionEyebrow>
                        <h2 className="font-display mb-6 text-2xl font-semibold tracking-tight text-neutral-dark-bg">
                            {t.reports.title}
                        </h2>
                    </Reveal>
                    {reports.length === 0 ? (
                        <Reveal>
                            <div className={`${CARD} px-6 py-12 text-center`}>
                                <FileText className="mx-auto h-6 w-6 text-neutral-gray-medium/60" strokeWidth={1.5} />
                                <p className="mt-6 text-sm leading-7 text-neutral-gray-dark">{t.reports.empty}</p>
                                <p className="mt-3 text-xs leading-6 text-neutral-gray-medium">{t.reports.emptyHint}</p>
                            </div>
                        </Reveal>
                    ) : (
                        <div className="flex flex-col gap-5">
                            {reports.map((report, i) => (
                                <Reveal key={report.period} delay={i * 70}>
                                    <ReportCard report={report} lang={lang} t={t} />
                                </Reveal>
                            ))}
                        </div>
                    )}
                </section>
            </div>
        </div>
    );
}
