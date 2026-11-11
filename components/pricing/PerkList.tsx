import { Check } from 'lucide-react';

/** 定价卡的权益列表。条目数尽量一致，卡片等高靠条目数，不靠 min-height。 */
export function PerkList({ perks }: { perks: string[] }) {
    return (
        <ul className="space-y-3 text-sm">
            {perks.map((perk, i) => (
                <li key={i} className="flex gap-2">
                    <Check className="mt-0.5 h-4 w-4 shrink-0 text-king-forest" strokeWidth={1.75} /> {perk}
                </li>
            ))}
        </ul>
    );
}
