import type { Metadata } from 'next';
import { Locale } from '@/i18n-config';
import { getDictionary } from '@/get-dictionary';
import { ProSuccessView } from './ProSuccessView';

/** 个人 Pro 支付成功页（ProCheckout 轮询到 paid 后跳转至此）。不进索引。 */
export async function generateMetadata({ params }: { params: Promise<{ lang: Locale }> }): Promise<Metadata> {
    const { lang } = await params;
    const dict = await getDictionary(lang);
    return { title: dict.pricingPage.pro.checkout.successTitle, robots: { index: false, follow: false } };
}

export default async function ProSuccessPage({
    params,
    searchParams,
}: {
    params: Promise<{ lang: Locale }>;
    searchParams: Promise<{ order?: string }>;
}) {
    const { lang } = await params;
    const { order } = await searchParams;
    const dict = await getDictionary(lang);
    const orderNo = typeof order === 'string' && /^[A-Za-z0-9_-]{1,64}$/.test(order) ? order : null;
    return (
        <div className="min-h-screen bg-neutral-gray-pale px-4">
            <ProSuccessView lang={lang} orderNo={orderNo} labels={dict.pricingPage.pro.checkout} />
        </div>
    );
}
