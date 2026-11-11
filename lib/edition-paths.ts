import type { Locale } from '@/i18n-config';
import { SITE_ID, type SiteId } from '@/lib/site-config';

/** /community remains the discussion forum. */
export function communityHomePath(lang: Locale, _siteId: SiteId = SITE_ID): string {
    return `/${lang}`;
}
