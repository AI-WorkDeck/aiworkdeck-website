import type { Metadata } from 'next';
import type { Locale } from '@/i18n-config';
import { CommunityHome } from '@/components/sections/CommunityHome';
import { pageAlternates } from '@/lib/page-metadata';
import { getDictionary } from '@/get-dictionary';

export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }: { params: Promise<{ lang: Locale }> }): Promise<Metadata> {
  const { lang } = await params;
  const dict = await getDictionary(lang);
  return {
    title: { absolute: dict.common.seo.homeTitle },
    alternates: pageAlternates(lang, ''),
  };
}

export default async function Home({ params }: { params: Promise<{ lang: Locale }> }) {
  const { lang } = await params;
  return <CommunityHome lang={lang} />;
}
