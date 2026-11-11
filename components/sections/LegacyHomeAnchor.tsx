'use client';

import { useEffect } from 'react';
import type { Locale } from '@/i18n-config';
import { communityHomePath } from '@/lib/edition-paths';

/** Fragments never reach the server. Keep previously shared product/pricing links useful. */
export function LegacyHomeAnchor({ lang }: { lang: Locale }) {
  useEffect(() => {
    if (!['#product', '#pricing', '#skills', '#articles'].includes(window.location.hash)) return;
    window.location.replace(`${communityHomePath(lang)}${window.location.search}${window.location.hash}`);
  }, [lang]);
  return null;
}
