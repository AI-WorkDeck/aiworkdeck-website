import type { StorePlugin } from '@/lib/store-plugins';

/** Small muted notes under a plugin's name: China-only (intl site) and not yet translated (W25). */
export function PluginMarketTags({ plugin, labels }: { plugin: Pick<StorePlugin, 'chinaOnly' | 'chineseOnly'>; labels: { chinaOnly: string; chineseOnly: string } }) {
    const notes = [plugin.chinaOnly && labels.chinaOnly, plugin.chineseOnly && labels.chineseOnly].filter(Boolean) as string[];
    if (!notes.length) return null;
    return (
        <p className="mt-1.5 flex flex-wrap gap-1.5">
            {notes.map(n => (
                <span key={n} className="rounded border border-neutral-gray-light px-1.5 py-0.5 text-[11px] text-neutral-gray-medium">{n}</span>
            ))}
        </p>
    );
}
