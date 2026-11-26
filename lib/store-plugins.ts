import { listPlugins, getPluginDisplay, type PluginEntry } from '@/lib/plugins-store';
import { SITE_ID } from '@/lib/site-config';
import { toBaseLocale } from '@/i18n-config';

/** Account that publishes AI WorkDeck's own plugins (same id submitPlugin treats as official). */
export const OFFICIAL_AUTHOR_ID = 'awd-official';
/** Brand spelling on official cards; older entries carry the author snapshot "AI Workdeck". */
export const OFFICIAL_AUTHOR_NAME = 'AI WorkDeck';
/** Developer samples stay downloadable for plugin authors but are not listed in the store. */
const HIDDEN_FROM_STORE = new Set(['hello-plugin']);
/** Below this, an install count reads as "nobody uses it", so the card leaves it out. */
export const MIN_SHOWN_INSTALLS = 10;

/** Official plugins that only work with mainland China accounts or services (W25). */
const CHINA_ONLY = new Set(['project-im', 'baoqingtian', 'tencent-meeting']);

export type StorePlugin = PluginEntry & {
    official: boolean;
    /** International site only: the plugin needs a mainland China account or service. */
    chinaOnly: boolean;
    /** Non-Chinese visitor: the plugin has no translation yet, so its card is still Chinese. */
    chineseOnly: boolean;
};

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
            const shown = { ...p, ...getPluginDisplay(p, language) };
            const chineseVisitor = toBaseLocale(language ?? 'zh') === 'zh';
            return {
                ...shown, official, author: official ? OFFICIAL_AUTHOR_NAME : p.author,
                chinaOnly: SITE_ID === 'intl' && CHINA_ONLY.has(p.id),
                chineseOnly: !chineseVisitor && /[\u4e00-\u9fff]/.test(shown.name + shown.description),
            };
        })
        // Usable plugins first; China-only and untranslated ones last (W25). Newest first within each group.
        .sort((a, b) => rank(a) - rank(b) || (b.publishedAt ?? '').localeCompare(a.publishedAt ?? ''));
}

const rank = (p: StorePlugin) => (p.chineseOnly ? 2 : p.chinaOnly ? 1 : 0);

/** One plugin as the store shows it, or undefined when it isn't listed. */
export function getStorePlugin(id: string, language?: string): StorePlugin | undefined {
    return listStorePlugins(language).find(p => p.id === id);
}
