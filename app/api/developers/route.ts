// SPDX-FileCopyrightText: 2026 北京京微资易科技有限公司 and AI WorkDeck contributors
// SPDX-License-Identifier: AGPL-3.0-or-later
import { NextRequest } from 'next/server';
import { cookieDeveloper, developerApiError, privateJson, readDeveloperBody } from '@/lib/developer-api';
import { getDeveloper, developerHistory, saveDeveloper, listSubmissionTokens } from '@/lib/developers';
import { listPlugins } from '@/lib/plugins-store';
export const dynamic = 'force-dynamic';
export async function GET(request: NextRequest) {
  try {
    const user = cookieDeveloper(request);
    return privateJson({ profile: getDeveloper(user.id), history: developerHistory(user.id), tokens: listSubmissionTokens(user.id), plugins: listPlugins().filter(p => p.authorId === user.id) });
  } catch (e) { return developerApiError(e); }
}
export async function PUT(request: NextRequest) {
  try {
    cookieDeveloper(request); const body = await readDeveloperBody(request);
    return privateJson({ profile: saveDeveloper(cookieDeveloper(request), body.profile, body.expectedVersion) });
  } catch (e) { return developerApiError(e); }
}
