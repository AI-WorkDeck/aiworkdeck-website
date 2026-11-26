import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft, Download, ShieldCheck, Wrench } from 'lucide-react';
import { getDictionary } from '@/get-dictionary';
import { LOCALE_META, type Locale } from '@/i18n-config';
import { getStorePlugin, MIN_SHOWN_INSTALLS } from '@/lib/store-plugins';
import { hasEntitlement } from '@/lib/purchases';
import { getSessionUser } from '@/lib/sessions';
import { BuyButton } from '@/components/purchase/BuyButton';
import { formatPrice } from '@/lib/price';
import { pageAlternates } from '@/lib/page-metadata';
import { PluginMarketTags } from '@/components/plugins/PluginMarketTags';

export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }: { params: Promise<{ lang: Locale; id: string }> }): Promise<Metadata> {
    const { lang, id } = await params;
    const dict = await getDictionary(lang);
    const alternates = pageAlternates(lang, `/plugins/${id}`);
    const p = getStorePlugin(id, lang);
    if (!p) return { alternates };
    return { title: `${p.name} · ${dict.pluginsPage.title}`, description: p.description, alternates };
}

/** Plugin page (W24): the full description, permissions and how to install. Also the registry `homepage`. */
export default async function PluginDetailPage({ params }: { params: Promise<{ lang: Locale; id: string }> }) {
    const { lang, id } = await params;
    const dict = await getDictionary(lang);
    const t = dict.pluginsPage;
    const p = getStorePlugin(id, lang);
    if (!p) notFound();
    const me = await getSessionUser();
    const priceCents = p.priceCents ?? 0;
    return (
        <div className="min-h-screen bg-neutral-gray-pale pb-24">
            <div className="container mx-auto max-w-3xl px-4 pt-28 md:px-8 md:pt-32">
                <Link href={`/${lang}/marketplace/plugins`} className="inline-flex items-center gap-1.5 text-sm text-neutral-gray-medium hover:text-king-forest">
                    <ArrowLeft className="h-4 w-4 rtl:rotate-180" strokeWidth={1.75} />
                    {t.title}
                </Link>
                <article className="mt-6 rounded-xl border border-neutral-gray-light/90 bg-white/70 p-6 md:p-8">
                    <header className="flex items-start justify-between gap-4">
                        <div className="min-w-0">
                            <p className="mb-2 flex items-center gap-1.5 text-[11px] uppercase tracking-[0.14em] text-king-forest/80">
                                <ShieldCheck className="h-3.5 w-3.5" strokeWidth={1.75} />
                                {t.signed}
                            </p>
                            <h1 className="text-2xl font-semibold text-neutral-dark-bg md:text-3xl">{p.name}</h1>
                            <p className="mt-1 font-mono text-xs text-neutral-gray-medium">v{p.version} · {p.author}</p>
                            <PluginMarketTags plugin={p} labels={t.detail} />
                        </div>
                        {priceCents > 0 && <span className="shrink-0 text-xl font-bold text-king-forest">{formatPrice(priceCents)}</span>}
                    </header>
                    <p className="mt-6 whitespace-pre-line text-[15px] leading-relaxed text-neutral-gray-dark">{p.description}</p>
                    {p.permissions.length > 0 && (
                        <section className="mt-7">
                            <h2 className="text-sm font-semibold text-neutral-dark-bg">{t.detail.permissionsTitle}</h2>
                            <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm text-neutral-gray-dark">
                                {p.permissions.map(perm => <li key={perm}>{(t.permissions as Record<string, string>)[perm] ?? perm}</li>)}
                            </ul>
                        </section>
                    )}
                    <p className="mt-5 flex flex-wrap items-center gap-x-4 gap-y-1 text-[12.5px] text-neutral-gray-medium">
                        {p.tools.length > 0 && <span className="inline-flex items-center gap-1"><Wrench className="h-3.5 w-3.5" strokeWidth={1.75} />{p.tools.length} {t.toolsSuffix}</span>}
                        {p.downloads >= MIN_SHOWN_INSTALLS && <span className="inline-flex items-center gap-1"><Download className="h-3.5 w-3.5" strokeWidth={1.75} />{p.downloads} {t.installsSuffix}</span>}
                        {p.publishedAt && <span>{new Date(p.publishedAt).toLocaleDateString(LOCALE_META[lang].bcp47)}</span>}
                    </p>
                    <section className="mt-7 rounded-lg bg-neutral-gray-pale/70 p-4">
                        <h2 className="text-sm font-semibold text-neutral-dark-bg">{t.detail.installTitle}</h2>
                        <p className="mt-1 text-sm text-neutral-gray-dark">{t.detail.installBody.replace('{name}', p.name)}</p>
                    </section>
                    {priceCents > 0 && (
                        <div className="mt-6">
                            <BuyButton lang={lang} labels={dict.purchase} skuId={`plugin:${p.id}`} priceCents={priceCents} itemName={p.name}
                                owned={!!me && hasEntitlement(me.id, `plugin:${p.id}`)} loggedIn={!!me} />
                        </div>
                    )}
                </article>
            </div>
        </div>
    );
}
