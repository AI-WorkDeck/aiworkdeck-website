import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import '../../globals.css';
import '../../website-design.css';
import { NOINDEX } from '@/lib/page-metadata';

export const metadata: Metadata = { title: 'AI WorkDeck Mobile Account', robots: NOINDEX };

/** A closed mobile handoff: no website navigation, wallet or purchase links. */
export default async function MobileAccountLayout({ children, params }: {
    children: React.ReactNode;
    params: Promise<{ lang: string }>;
}) {
    const { lang } = await params;
    if (lang !== 'en' && lang !== 'zh') notFound();
    return <html lang={lang}><body className="site-shell bg-neutral-gray-pale"><main>{children}</main></body></html>;
}
