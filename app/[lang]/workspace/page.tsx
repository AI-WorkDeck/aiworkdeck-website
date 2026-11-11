import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowLeft, ArrowRight } from 'lucide-react';
import type { Locale } from '@/i18n-config';
import { getDictionary } from '@/get-dictionary';
import { pageAlternates } from '@/lib/page-metadata';
import { WorkspaceTools } from '@/components/sections/WorkspaceTools';

export async function generateMetadata({ params }: { params: Promise<{ lang: Locale }> }): Promise<Metadata> {
  const { lang } = await params;
  const dict = await getDictionary(lang);
  const t = dict.workspacePage;
  return { title: t.metaTitle, description: t.metaDescription, alternates: pageAlternates(lang, '/workspace') };
}

export default async function WorkspacePage({ params }: { params: Promise<{ lang: Locale }> }) {
  const { lang } = await params;
  const dict = await getDictionary(lang);
  const t = dict.workspacePage;
  return <div className="workspace-tools-page"><div className="edition-container">
    <header className="tools-page-heading">
      <Link href={`/${lang}`} className="tools-back"><ArrowLeft size={14} />{t.backToHome}</Link>
      <p className="workspace-eyebrow">{t.eyebrow}</p>
      <h1 className="font-display">{t.title}</h1>
      <p>{t.subtitle}</p>
    </header>
    <WorkspaceTools lang={lang} copy={t} />
    <div className="tools-page-close"><p>{t.closeLead}</p><Link href={`/${lang}/start`} className="edition-button">{t.closeCta}<ArrowRight size={16} /></Link></div>
  </div></div>;
}
