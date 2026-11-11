// SPDX-FileCopyrightText: 2026 北京京微资易科技有限公司 and AI WorkDeck contributors
// SPDX-License-Identifier: AGPL-3.0-or-later
import { NextRequest } from 'next/server';
import { cookieDeveloper, developerApiError, privateJson, readDeveloperBody } from '@/lib/developer-api';
import { issueSubmissionToken, revokeSubmissionToken } from '@/lib/developers';
export const dynamic = 'force-dynamic';
export async function POST(request: NextRequest) {
  try {
    cookieDeveloper(request); const body = await readDeveloperBody(request);
    return privateJson(issueSubmissionToken(cookieDeveloper(request).id, body.label, body.expiresInDays));
  } catch (e) { return developerApiError(e); }
}
export async function DELETE(request: NextRequest) {
  try {
    cookieDeveloper(request); const body = await readDeveloperBody(request);
    revokeSubmissionToken(cookieDeveloper(request).id, body.id); return privateJson({ ok: true });
  } catch (e) { return developerApiError(e); }
}
