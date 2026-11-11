import { Plus } from 'lucide-react';

export type PricingFaqItem = {
    id: string;
    q: string;
    a: string;
    /** 法律敏感条：试用 / 退款 / AGPL 列举等 */
    legalPending?: boolean;
};

/**
 * 定价页 FAQ 手风琴（定稿 Q1–Q5）。
 * 与 FAQ 页 Credits 用量 FAQ 分离；互链文案由 PricingPageView 脚注承担。
 */
export function PricingFaq({
    title,
    items,
}: {
    title: string;
    items: PricingFaqItem[];
}) {
    return (
        <section>
            <h2 className="mb-5 text-2xl font-semibold tracking-tight text-neutral-dark-bg">{title}</h2>
            <div className="divide-y divide-neutral-gray-light rounded-2xl border border-neutral-gray-light bg-white px-5 md:px-8">
                {items.map(item => (
                    <details
                        key={item.id}
                        id={item.id}
                        className="group scroll-mt-24 py-5"
                        {...(item.legalPending ? { 'data-legal-pending': 'zewei-counsel' } : {})}
                    >
                        <summary className="flex min-h-8 cursor-pointer list-none items-start justify-between gap-5 text-base font-medium text-neutral-dark-bg marker:content-none">
                            {item.q}
                            <Plus
                                aria-hidden="true"
                                className="mt-1 h-4 w-4 shrink-0 text-king-forest transition-transform group-open:rotate-45"
                            />
                        </summary>
                        <div className="mt-4 max-w-3xl space-y-3 text-sm leading-7 text-neutral-gray-medium">
                            {item.a.split('\n\n').map(paragraph => (
                                <p key={paragraph.slice(0, 48)}>{paragraph}</p>
                            ))}
                        </div>
                    </details>
                ))}
            </div>
        </section>
    );
}
