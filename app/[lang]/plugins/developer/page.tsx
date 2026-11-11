// SPDX-FileCopyrightText: 2026 北京京微资易科技有限公司 and AI WorkDeck contributors
// SPDX-License-Identifier: AGPL-3.0-or-later
import Link from 'next/link';
import { Lock } from 'lucide-react';
import { Locale } from '@/i18n-config';
import { getDictionary } from '@/get-dictionary';
import { getSessionUser } from '@/lib/sessions';
import { NOINDEX } from '@/lib/page-metadata';
import { Button } from '@/components/ui/button';
import { PageHero } from '@/components/layout/PageHero';
import { DeveloperDashboard } from './DeveloperDashboard';
export const dynamic = 'force-dynamic';
export const metadata = { robots: NOINDEX };
export default async function Page({ params }: { params: Promise<{ lang: Locale }> }) {
  const { lang } = await params;
  const dict = await getDictionary(lang);
  const t = dict.developerPage;
  const user = await getSessionUser();
  return <main className="min-h-screen bg-neutral-gray-pale pb-24">
    <PageHero eyebrow={t.eyebrow} title={t.title} subtitle={t.subtitle} size="compact" width="3xl" />
    <div className="container mx-auto max-w-3xl px-4 pt-8 md:px-8">
      {user ? <DeveloperDashboard lang={lang} t={t} /> : <div className="mx-auto max-w-md text-center">
        <div className="rounded-xl border border-neutral-gray-light bg-white p-10">
          <Lock className="mx-auto mb-5 h-9 w-9 text-king-forest/60" strokeWidth={1.5} />
          <p className="mb-6 text-neutral-gray-dark">{t.signInToContinue}</p>
          <Link href={`/${lang}/account?next=/${lang}/plugins/developer`}>
            <Button className="font-bold">{dict.pluginSubmitPage.goLogin}</Button>
          </Link>
        </div>
        <ol className="mt-6 space-y-1.5 text-start text-sm text-neutral-gray-medium">
          {[t.gateStep1, t.gateStep2, t.gateStep3].map((step: string, i: number) => <li key={i}>{i + 1}. {step}</li>)}
        </ol>
      </div>}
    </div>
  </main>;
}
