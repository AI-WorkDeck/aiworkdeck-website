// SPDX-FileCopyrightText: 2026 北京京微资易科技有限公司 and AI WorkDeck contributors
// SPDX-License-Identifier: AGPL-3.0-or-later
import crypto from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { resolveKeyUser } from './account-auth';
import { resolveRequestLocale } from './api-locale';
import { findUserById, isDeletedUser } from './users';
import { readJsonBody } from './team-http';
import { TeamError } from './team';
import { memorySpaces, listMemoryFiles, searchMemoryFiles, readMemoryFile, writeMemoryFile, deleteMemoryFile } from './shared-memory';

export type MemoryRouteContext = { params: Promise<{ operation: string }> };

/** Both transports share canonical storage. The internal credential is deliberately separate
 * from the read-only collaboration directory secret and must stay behind /api/internal/ ACLs. */
export async function handleMemory(request: NextRequest, context: MemoryRouteContext, internal = false) {
    let user;
    if (internal) {
        const secret = process.env.AWD_SHARED_MEMORY_SECRET;
        const supplied = request.headers.get('x-internal-secret');
        if (!secret || !supplied || Buffer.byteLength(secret) !== Buffer.byteLength(supplied) ||
            !crypto.timingSafeEqual(Buffer.from(secret), Buffer.from(supplied)))
            return new NextResponse(null, { status: 404 });
        user = findUserById(request.headers.get('x-requester-account-id') ?? '');
    } else {
        user = resolveKeyUser(request);
    }
    if (!user || isDeletedUser(user)) return NextResponse.json({ code: 401, message: 'unauthorized' }, { status: 401 });
    try {
        const { operation } = await context.params;
        const query = request.nextUrl.searchParams;
        const lang = resolveRequestLocale(request);
        let data;
        if (request.method === 'GET') {
            if (operation === 'spaces') data = memorySpaces(user.id, lang);
            else if (operation === 'search') data = searchMemoryFiles(user.id, query.get('spaceId'), query.get('query'), query.get('limit') ?? '10');
            else if (operation === 'files') data = listMemoryFiles(user.id, query.get('spaceId'));
            else if (operation === 'file' || operation === 'download') {
                data = readMemoryFile(user.id, query.get('spaceId'), query.get('path'));
                if (operation === 'download') return new NextResponse(data.content, { headers: {
                    'Content-Type': 'text/markdown; charset=utf-8',
                    'Content-Disposition': `attachment; filename="memory.md"; filename*=UTF-8''${encodeURIComponent(data.path.split('/').at(-1)!)}`,
                    'Cache-Control': 'no-store',
                } });
            } else throw new TeamError(404, 'not_found');
        } else if (operation === 'file' && request.method === 'PUT') {
            const body = await readJsonBody(request, 256 * 1024);
            if (!body || typeof body !== 'object' || Array.isArray(body)) throw new TeamError(400, 'bad_request');
            data = writeMemoryFile(user.id, body as Record<string, unknown>);
        } else if (operation === 'file' && request.method === 'DELETE') {
            data = deleteMemoryFile(user.id, query.get('spaceId'), query.get('path'), query.get('expectedRevision'));
        } else throw new TeamError(405, 'method_not_allowed');
        return NextResponse.json({ code: 200, data }, { headers: { 'Cache-Control': 'no-store' } });
    } catch (error) {
        if (error instanceof TeamError)
            return NextResponse.json({ code: error.status, message: error.code }, { status: error.status });
        throw error;
    }
}
