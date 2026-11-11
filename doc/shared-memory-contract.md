# Shared Markdown memory contract (dev-board #559)

This change accompanies the desktop AI interaction PR. Do not deploy either branch as part
of this task. User and project documents stay in their owning backend; team and firm
documents have one canonical copy in this website's SQLite database (migration 29).

## Desktop transport

`Authorization: Bearer awdk_…` identifies the account; account IDs in request bodies are
never used for authorization. All JSON success responses are `{code:200,data:…}`.

| Method | Path | Input / result |
| --- | --- | --- |
| GET | `/api/account/memory/spaces` | Current team/firm spaces: id, scope, label, readable, writable, available, reason |
| GET | `/api/account/memory/files` | Query `spaceId`; document path, title, revision, updatedAt |
| GET | `/api/account/memory/file` | Query `spaceId,path`; metadata plus content and writable |
| PUT | `/api/account/memory/file` | JSON `spaceId,path,content,expectedRevision`; returns saved document |
| DELETE | `/api/account/memory/file` | Query `spaceId,path,expectedRevision` |
| GET | `/api/account/memory/download` | Query `spaceId,path`; Markdown attachment |

Space IDs are `team:<id>` and `firm:<id>`. No-team/no-firm spaces have `id:null`,
`available:false`, and cannot be opened. Team members can read team memory; all current
members of teams within a firm can read firm memory. Team OWNER/ADMIN can write team
memory. Only the head team's OWNER/ADMIN can write firm memory. Every request rechecks
membership, including downloads, so revocation is immediate.

Paths are relative `.md` paths, without traversal, control characters or URL syntax.
Content is limited to 128 KiB per document. `remember.md` is initialized on first access,
cannot be deleted, and has an automatically maintained Markdown topic list between
`memory-files:start` and `memory-files:end` comments. Prose outside the list is preserved.
Index edits reject links to missing local Markdown documents. Deletion removes the index
link and leaves a revision tombstone. Create uses `expectedRevision:0`; update/delete
require the current revision. Recreated paths receive a higher revision than the deleted
document, so stale operations cannot affect the replacement.

Failures: HTTP 400 invalid input, 401 invalid account key, 403 outside the space or lacking
write permission, 404 missing document, 409 stale revision, 413 oversized request. JSON
errors include `code` and `message`. Revision and index mutations are one SQLite transaction.

## Case-server transport

The same operations are available under `/api/internal/memory/`. The existing reverse
proxy rule denying public `/api/internal/` access must remain in force. The case server
supplies `X-Requester-Account-Id` from its authenticated session's account binding and
`X-Internal-Secret` from its dedicated memory configuration. It must never forward an
untrusted caller's requester header or accept an account ID from a client payload.

Website configuration: `AWD_SHARED_MEMORY_SECRET`. Case configuration:
`memory.shared.base-url` and `memory.shared.secret` (Spring environment forms
`MEMORY_SHARED_BASE_URL` / `MEMORY_SHARED_SECRET`). The base URL is the site's loopback
Next origin, not the public proxy. Keep the secret in existing approved server env files;
this document intentionally contains no value. This credential grants memory operations
on behalf of bound accounts and **must not reuse** the read-only collaboration-directory,
billing, or transfer credential. Missing/mismatched secret produces a bare 404. A deleted
or unknown requester produces 401. Unconfigured clients show shared spaces unavailable.

## Validation

`npm run test:shared-memory` builds an isolated SQLite/user fixture and calls real route
handlers. It covers cross-member and cross-transport reads, team/firm roles, unauthorized
access, traversal, dangling index links, revisions, Markdown download, deletion/recreation,
secret authentication, deleted requesters, and immediate membership revocation.
`npm run test:team`, `npm run test:collab-directory`, `npm run typecheck`, and `npm run build`
cover the existing organizational contracts and application integration.

`GET /search?spaceId=S&query=Q&limit=10` searches authorized Markdown content and paths centrally, returning compact file metadata (maximum 20). Unavailable spaces have `id:null`; use `scope` for their UI identity.
