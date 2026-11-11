import { Mail } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { siteConfig } from '@/lib/site-config';

/**
 * 商业授权与 Certified 简述块（定稿 §3）。
 * 不含人数档表 / OEM 大卡 / 创始客户横幅——明细走 mailto。
 */
export function CommercialBrief({ p }: { /** dict.pricingPage.commercialBrief */ p: any }) {
    const email = siteConfig.legalEntity.contactEmail;
    const href = `mailto:${email}?subject=${encodeURIComponent(p.mailSubject)}`;

    return (
        <section className="rounded-2xl border border-[#dce2de] bg-white px-6 py-7 shadow-[0_8px_28px_-16px_rgba(22,42,33,0.1)] md:px-9 md:py-8">
            <div className="flex flex-col justify-between gap-6 md:flex-row md:items-center">
                <div className="min-w-0 flex-1">
                    <p className="mb-2 inline-flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-king-forest/75">
                        <span aria-hidden className="h-px w-4 bg-king-forest/45" />
                        {p.eyebrow}
                    </p>
                    <h2 className="font-display text-xl font-semibold tracking-tight text-neutral-dark-bg md:text-2xl">
                        {p.title}
                    </h2>
                    <p className="mt-2.5 max-w-2xl text-sm leading-relaxed text-neutral-gray-medium">{p.body}</p>
                    <p className="mt-2 text-xs text-neutral-gray-medium" data-legal-pending="zewei-counsel">
                        {p.disclaimer}
                    </p>
                </div>
                <a href={href} className="inline-flex shrink-0" data-analytics="pricing_commercial_mail">
                    <Button className="gap-2 bg-king-forest font-bold text-white shadow-sm hover:bg-king-forest-darker">
                        <Mail className="h-4 w-4" /> {p.cta}
                    </Button>
                </a>
            </div>
        </section>
    );
}
