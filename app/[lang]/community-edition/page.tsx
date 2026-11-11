import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import type { Locale } from '@/i18n-config';
import { SITE_ID } from '@/lib/site-config';
import { pageAlternates } from '@/lib/page-metadata';
import { CommunityHome } from '@/components/sections/CommunityHome';
import { getDictionary } from '@/get-dictionary';

export const dynamic = 'force-dynamic';
export async function generateMetadata({ params }: { params: Promise<{ lang: Locale }> }): Promise<Metadata> {
  const { lang } = await params;
  const dict = await getDictionary(lang);
  return { title: dict.communityEditionPage.metaTitle, alternates: pageAlternates(lang, SITE_ID === 'intl' ? '/community-edition' : '') };
}
export default async function Page({ params, searchParams }: { params: Promise<{ lang: Locale }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { lang } = await params;
  if (SITE_ID === 'cn') {
    const query = new URLSearchParams();
    for (const [key, value] of Object.entries(await searchParams)) {
      for (const item of Array.isArray(value) ? value : value === undefined ? [] : [value]) query.append(key, item);
    }
    redirect(`/${lang}${query.size ? `?${query}` : ''}`);
  }
  return <CommunityHome lang={lang} />;
}
