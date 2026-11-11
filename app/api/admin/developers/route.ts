// SPDX-FileCopyrightText: 2026 北京京微资易科技有限公司 and AI WorkDeck contributors
// SPDX-License-Identifier: AGPL-3.0-or-later
import { NextRequest } from 'next/server';
import { isAdminRequest } from '@/lib/admin';
import { developerApiError, privateJson, readDeveloperBody } from '@/lib/developer-api';
import { listDevelopers, developerHistory, reviewDeveloper } from '@/lib/developers';
import { listPlugins } from '@/lib/plugins-store';
export const dynamic = 'force-dynamic';
export async function GET(request: NextRequest) {
  if (!isAdminRequest(request)) return privateJson({ error: 'unauthorized' }, 401);
  const plugins = listPlugins();
  return privateJson({ developers: listDevelopers().map(p => ({ ...p, history: developerHistory(p.userId), plugins: plugins.filter(x => x.authorId === p.userId).map(x => ({ id: x.id, name: x.name, version: x.version, permissions: x.permissions, status: x.status })) })) });
}
export async function POST(request: NextRequest) {
  if (!isAdminRequest(request)) return privateJson({ error: 'unauthorized' }, 401);
  try {
    const b = await readDeveloperBody(request);
    if (!isAdminRequest(request)) return privateJson({ error: 'unauthorized' }, 401);
    if (typeof b.userId !== 'string') return privateJson({ error: 'invalid_user' }, 400);
    return privateJson({ profile: reviewDeveloper(b.userId, b.expectedVersion, b.action, b.note, b.contactChecked) });
  } catch (e) { return developerApiError(e); }
}
