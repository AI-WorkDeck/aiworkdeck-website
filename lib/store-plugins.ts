import { listPlugins, getPluginDisplay, type PluginEntry } from '@/lib/plugins-store';

/** Account that publishes AI WorkDeck's own plugins (same id submitPlugin treats as official). */
export const OFFICIAL_AUTHOR_ID = 'awd-official';
/** Brand spelling on official cards; older entries carry the author snapshot "AI Workdeck". */
export const OFFICIAL_AUTHOR_NAME = 'AI WorkDeck';
/** Developer samples stay downloadable for plugin authors but are not listed in the store. */
const HIDDEN_FROM_STORE = new Set(['hello-plugin']);
/** Below this, an install count reads as "nobody uses it", so the card leaves it out. */
export const MIN_SHOWN_INSTALLS = 10;

export type StorePlugin = PluginEntry & { official: boolean };

/** What the store lists: latest approved version per id, localized for the visitor, newest first. */
export function listStorePlugins(language?: string): StorePlugin[] {
    const latest = new Map<string, PluginEntry>();
    for (const p of listPlugins({ status: 'approved' })) {
        if (HIDDEN_FROM_STORE.has(p.id)) continue;
        const prev = latest.get(p.id);
        if (!prev || (p.publishedAt ?? '') > (prev.publishedAt ?? '')) latest.set(p.id, p);
    }
    return [...latest.values()]
        .map(p => {
            const official = p.authorId === OFFICIAL_AUTHOR_ID;
            return { ...p, ...getPluginDisplay(p, language), official, author: official ? OFFICIAL_AUTHOR_NAME : p.author };
        })
        .sort((a, b) => (b.publishedAt ?? '').localeCompare(a.publishedAt ?? ''));
}
