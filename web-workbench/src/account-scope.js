// SPDX-FileCopyrightText: 2026 北京京微资易科技有限公司 and AI WorkDeck contributors
// SPDX-License-Identifier: AGPL-3.0-or-later
import JSZip from 'jszip';
import {GUEST_SCOPE, openWorkspace} from './storage.js';

/**
 * Local data is partitioned by signed-in account. The partition name is a salted SHA-256
 * of the website user id (never the email or username), truncated to 16 hex characters.
 * It only separates users of one browser profile; it is not a secret.
 */
export async function scopeForUser(user, cryptoApi = globalThis.crypto) {
  if (!user) return GUEST_SCOPE;
  if (user.id === undefined || user.id === null || user.id === '') throw new Error('SESSION_UNVERIFIED');
  const digest = await cryptoApi.subtle.digest('SHA-256', new TextEncoder().encode('aiworkdeck-web-workbench:' + String(user.id)));
  return 'u-' + [...new Uint8Array(digest)].slice(0, 8).map((b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Asks the website who is signed in. Fails closed: when the session cannot be verified
 * we throw rather than guess, so another person's documents are never shown by mistake.
 */
export async function resolveScope(fetcher = globalThis.fetch.bind(globalThis), cryptoApi = globalThis.crypto) {
  let lastError;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const response = await fetcher('/api/auth/me', {credentials: 'same-origin', cache: 'no-store'});
      if (!response.ok) throw new Error('SESSION_UNVERIFIED');
      const body = await response.json();
      if (!body || typeof body !== 'object' || !('user' in body)) throw new Error('SESSION_UNVERIFIED');
      return scopeForUser(body.user, cryptoApi);
    } catch (error) { lastError = error; }
  }
  throw lastError;
}

/** Bundles every DOCX of one scope (grouped by project) into a ZIP for backup before deletion. */
export async function exportScopeZip(scope, {indexedDB} = {}) {
  const workspace = await openWorkspace({indexedDB, scope});
  try {
    const zip = new JSZip(), used = new Set();
    let count = 0;
    for (const project of await workspace.listProjects()) {
      for (const file of await workspace.listFiles(project.id)) {
        let path = `${project.name}/${file.name}`;
        for (let n = 2; used.has(path); n++) path = `${project.name}/${n}-${file.name}`;
        used.add(path);
        zip.file(path, file.bytes);
        count++;
      }
    }
    return {count, bytes: count ? await zip.generateAsync({type: 'uint8array'}) : null};
  } finally { workspace.close(); }
}

/** Number of documents stored in a scope (0 means nothing would be lost by deleting it). */
export async function countScopeFiles(scope, {indexedDB} = {}) {
  const workspace = await openWorkspace({indexedDB, scope});
  try {
    let count = 0;
    for (const project of await workspace.listProjects()) count += (await workspace.listFiles(project.id)).length;
    return count;
  } finally { workspace.close(); }
}

/**
 * Decides whether the page may close the current account's workspace. Edits are saved
 * first; if any remain unsaved, proceeding requires explicit confirmation.
 */
export async function mayLeaveScope({save, isDirty, confirmDiscard}) {
  let saved = true;
  try { await save(); saved = !isDirty(); } catch { saved = false; }
  return saved || (await confirmDiscard()) === true;
}
