// SPDX-FileCopyrightText: 2026 北京京微资易科技有限公司 and AI WorkDeck contributors
// SPDX-License-Identifier: AGPL-3.0-or-later
import { toBaseLocale, type Locale } from '@/i18n-config';
import { getDb, withTransaction } from './db';
import { siteConfig } from './site-config';
import { getMembership, getTeam, getFirm, TeamError } from './team';

export interface MemorySpace {
    id: string | null; scope: 'team' | 'firm'; label: string;
    readable: boolean; writable: boolean; available: boolean; reason?: string;
}
interface DocumentRow {
    path: string; content: string; revision: number; updatedAt: string; updatedBy: string; deleted: number;
}
const INDEX = 'remember.md';
const START = '<!-- memory-files:start -->', END = '<!-- memory-files:end -->';

export function memorySpaces(accountId: string, lang: Locale = siteConfig.defaultLocale): MemorySpace[] {
    const member = getMembership(accountId);
    const team = member && getTeam(member.teamId);
    const firm = team?.firmId ? getFirm(team.firmId) : null;
    const manager = member?.role === 'OWNER' || member?.role === 'ADMIN';
    const isEn = toBaseLocale(lang) === 'en';
    return [
        { id: team ? `team:${team.id}` : null, scope: 'team', label: team?.name ?? (isEn ? 'Team' : '团队'),
            readable: !!team, writable: !!team && manager, available: !!team, ...(!team ? { reason: 'no_team' } : {}) },
        { id: firm ? `firm:${firm.id}` : null, scope: 'firm', label: firm?.name ?? (isEn ? 'Firm' : '律所'),
            readable: !!firm, writable: !!firm && manager && firm.headTeamId === team?.id,
            available: !!firm, ...(!firm ? { reason: 'no_firm' } : {}) },
    ];
}

function authorize(accountId: string, raw: unknown, write = false): MemorySpace & { id: string } {
    const space = memorySpaces(accountId).find(s => s.id === raw && s.available);
    if (!space?.id || !space.readable || (write && !space.writable)) throw new TeamError(403, 'forbidden');
    return { ...space, id: space.id };
}

export function memoryPath(raw: unknown): string {
    if (typeof raw !== 'string' || raw.length > 240 || !raw.endsWith('.md') ||
        /[\\\x00-\x1f\x7f%?#()[\]<>:]/.test(raw) ||
        raw.split('/').some(part => !part || part === '.' || part === '..' || part.trim() !== part)) {
        throw new TeamError(400, 'invalid_memory_path');
    }
    return raw;
}

function row(spaceId: string, file: string): DocumentRow | undefined {
    return getDb().prepare('SELECT * FROM shared_memory_document WHERE spaceId = ? AND path = ?')
        .get(spaceId, file) as DocumentRow | undefined;
}
function save(spaceId: string, file: string, content: string, actor: string, deleted = 0) {
    getDb().prepare(`INSERT INTO shared_memory_document (spaceId,path,content,revision,updatedAt,updatedBy,deleted)
        VALUES (?,?,?,1,?,?,?) ON CONFLICT(spaceId,path) DO UPDATE SET
        content=excluded.content, revision=shared_memory_document.revision+1,
        updatedAt=excluded.updatedAt, updatedBy=excluded.updatedBy, deleted=excluded.deleted`)
        .run(spaceId, file, content, new Date().toISOString(), actor, deleted);
}
function ensureIndex(space: MemorySpace & { id: string }, actor: string) {
    if (!row(space.id, INDEX)) save(space.id, INDEX, `# ${space.label}\n\n${START}\n${END}\n`, actor);
}
function visible(document: DocumentRow, space: MemorySpace) {
    return { path: document.path, title: /^#\s+(.+)$/m.exec(document.content)?.[1] ?? document.path,
        content: document.content, revision: document.revision, updatedAt: document.updatedAt,
        writable: space.writable };
}
function rows(spaceId: string): DocumentRow[] {
    return getDb().prepare('SELECT * FROM shared_memory_document WHERE spaceId = ? AND deleted = 0 ORDER BY path')
        .all(spaceId) as DocumentRow[];
}
function refreshIndex(space: MemorySpace & { id: string }, actor: string, removed?: string) {
    const index = row(space.id, INDEX)!;
    let prose = index.content;
    if (removed) prose = prose.replace(/\[([^\]]*)\]\(([^)]+)\)/g, (match, label, target) => {
        let decoded = target;
        try { decoded = decodeURIComponent(target); } catch { /* Leave unrelated malformed links intact. */ }
        return decoded.replace(/^\.\//, '') === removed ? label : match;
    });
    const links = rows(space.id).filter(d => d.path !== INDEX)
        .map(d => `- [${d.path}](${d.path.split('/').map(encodeURIComponent).join('/')})`).join('\n');
    const block = `${START}\n${links}${links ? '\n' : ''}${END}`;
    const start = prose.indexOf(START), end = prose.indexOf(END, start);
    const content = start >= 0 && end >= start
        ? prose.slice(0, start) + block + prose.slice(end + END.length)
        : `${prose.trimEnd()}\n\n${block}\n`;
    if (content !== index.content) save(space.id, INDEX, content, actor);
}

export function listMemoryFiles(accountId: string, spaceId: unknown) {
    return withTransaction(() => {
        const space = authorize(accountId, spaceId);
        ensureIndex(space, accountId);
        return rows(space.id).map(d => { const { content, writable, ...metadata } = visible(d, space); void content; void writable; return metadata; });
    });
}
export function searchMemoryFiles(accountId: string, spaceId: unknown, query: unknown, limit: unknown = '10') {
    return withTransaction(() => {
        const space = authorize(accountId, spaceId);
        if (typeof query !== 'string' || !query.trim()) throw new TeamError(400, 'invalid_memory_query');
        if (typeof limit !== 'string' || !/^\d+$/.test(limit) || !Number.isSafeInteger(Number(limit)) || Number(limit) < 1)
            throw new TeamError(400, 'invalid_memory_limit');
        ensureIndex(space, accountId);
        const needle = query.toLowerCase();
        return rows(space.id).filter(d => d.path.toLowerCase().includes(needle) || d.content.toLowerCase().includes(needle))
            .slice(0, Math.min(Number(limit), 20)).map(d => {
                const { content, ...metadata } = visible(d, space); void content; return metadata;
            });
    });
}
export function readMemoryFile(accountId: string, spaceId: unknown, path: unknown) {
    return withTransaction(() => {
        const space = authorize(accountId, spaceId);
        const file = memoryPath(path);
        ensureIndex(space, accountId);
        const document = row(space.id, file);
        if (!document || document.deleted) throw new TeamError(404, 'memory_not_found');
        return visible(document, space);
    });
}
export function writeMemoryFile(accountId: string, input: Record<string, unknown>) {
    return withTransaction(() => {
        const space = authorize(accountId, input.spaceId, true);
        const file = memoryPath(input.path);
        if (typeof input.content !== 'string' || Buffer.byteLength(input.content, 'utf8') > 128 * 1024)
            throw new TeamError(400, 'invalid_memory_content');
        if (!Number.isSafeInteger(input.expectedRevision) || Number(input.expectedRevision) < 0)
            throw new TeamError(400, 'invalid_revision');
        ensureIndex(space, accountId);
        const current = row(space.id, file);
        if ((current && !current.deleted ? current.revision : 0) !== input.expectedRevision)
            throw new TeamError(409, 'memory_revision_conflict');
        if (file === INDEX) {
            for (const match of input.content.matchAll(/\[[^\]]*\]\(([^)]+)\)/g)) {
                const target = match[1];
                if (/^[a-z][a-z0-9+.-]*:|^#|^\/\//i.test(target)) continue;
                let decoded;
                try { decoded = decodeURIComponent(target.split('#')[0]).replace(/^\.\//, ''); }
                catch { throw new TeamError(400, 'invalid_memory_link'); }
                if (!decoded.endsWith('.md')) continue;
                const linked = row(space.id, memoryPath(decoded));
                if (!linked || linked.deleted) throw new TeamError(400, 'memory_link_not_found');
            }
        }
        save(space.id, file, input.content, accountId);
        refreshIndex(space, accountId);
        return visible(row(space.id, file)!, space);
    });
}
export function deleteMemoryFile(accountId: string, spaceId: unknown, path: unknown, revision: unknown) {
    return withTransaction(() => {
        const space = authorize(accountId, spaceId, true);
        const file = memoryPath(path);
        if (file === INDEX) throw new TeamError(400, 'cannot_delete_memory_index');
        if (typeof revision !== 'string' || !/^\d+$/.test(revision) || !Number.isSafeInteger(Number(revision)))
            throw new TeamError(400, 'invalid_revision');
        const current = row(space.id, file);
        if (!current || current.deleted) throw new TeamError(404, 'memory_not_found');
        if (current.revision !== Number(revision)) throw new TeamError(409, 'memory_revision_conflict');
        save(space.id, file, '', accountId, 1);
        refreshIndex(space, accountId, file);
        return { deleted: true };
    });
}
