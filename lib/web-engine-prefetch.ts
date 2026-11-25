/**
 * Warm the browser cache with the web editor engine before a visitor opens /web/ (POLISH W6 step 4).
 * Only on clear intent (the web-version paragraph scrolled into view, or the link hovered/focused),
 * and never on Save-Data or slow connections: the files are ~70 MB.
 */
export const WEB_ENGINE_PREFETCH_URLS = [
    '/web/editor/lowa/soffice.wasm',
    '/web/editor/lowa/soffice.data',
    '/web/editor/compressed/cjk.ttc',
] as const;

type Connection = { saveData?: boolean; effectiveType?: string } | undefined;

export function shouldPrefetchWebEngine(connection: Connection): boolean {
    if (!connection) return true;
    if (connection.saveData) return false;
    return !['slow-2g', '2g', '3g'].includes(connection.effectiveType ?? '');
}
