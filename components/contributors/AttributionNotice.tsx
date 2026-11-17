// SPDX-FileCopyrightText: 2026 北京公富信息技术有限公司 and AI WorkDeck contributors
// SPDX-License-Identifier: AGPL-3.0-or-later
import Link from 'next/link';
import type { Locale } from '@/i18n-config';

export function AttributionNotice({ lang, text, linkLabel }: { lang: Locale; text: string; linkLabel: string }) {
  return (
    <p className="mt-5 rounded-lg border border-neutral-gray-light bg-white/65 px-4 py-3 text-sm leading-relaxed text-neutral-gray-dark">
      {text}{' '}
      <Link href={`/${lang}/contributors`} className="font-medium text-king-forest underline underline-offset-4">
        {linkLabel}
      </Link>
    </p>
  );
}
