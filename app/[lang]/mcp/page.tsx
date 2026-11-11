// SPDX-FileCopyrightText: 2026 北京京微资易科技有限公司 and AI WorkDeck contributors
// SPDX-License-Identifier: AGPL-3.0-or-later
import { permanentRedirect } from 'next/navigation';
import type { Locale } from '@/i18n-config';

export default async function McpRedirect({ params }: { params: Promise<{ lang: Locale }> }) {
    const { lang } = await params;
    permanentRedirect(`/${lang}/marketplace/mcp`);
}
