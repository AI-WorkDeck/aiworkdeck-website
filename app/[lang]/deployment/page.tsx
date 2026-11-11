import type { Metadata } from 'next';
import type { Locale } from '@/i18n-config';
import { getDictionary } from '@/get-dictionary';
import { pageAlternates } from '@/lib/page-metadata';
import { DeploymentPlanner } from '@/components/deployment/DeploymentPlanner';

export async function generateMetadata({ params }: { params: Promise<{ lang: Locale }> }): Promise<Metadata> {
    const { lang } = await params;
    const dict = await getDictionary(lang);
    const t = dict.deploymentPage;
    return {
        title: t.metaTitle,
        description: t.metaDescription,
        alternates: pageAlternates(lang, '/deployment', { crossSite: true }),
    };
}

export default async function DeploymentPage({ params }: { params: Promise<{ lang: Locale }> }) {
    const { lang } = await params;
    return <DeploymentPlanner lang={lang} />;
}
