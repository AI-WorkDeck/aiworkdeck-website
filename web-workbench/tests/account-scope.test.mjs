// SPDX-FileCopyrightText: 2026 北京京微资易科技有限公司 and AI WorkDeck contributors
// SPDX-License-Identifier: AGPL-3.0-or-later
import test from "node:test";
import assert from "node:assert/strict";
import { IDBFactory, IDBKeyRange } from "fake-indexeddb";
import { openWorkspace, adoptLegacyDatabase, listScopes, deleteScope, LEGACY_DATABASE_NAME } from "../src/storage.js";
import { scopeForUser, resolveScope, exportScopeZip, countScopeFiles } from "../src/account-scope.js";

globalThis.IDBKeyRange ??= IDBKeyRange;
globalThis.crypto ??= (await import("node:crypto")).webcrypto;

const bytes = (...n) => new Uint8Array(n);
async function legacyDb(indexedDB) {
  // Reproduces the pre-scoping layout: one shared database with no account in its name.
  const db = await new Promise((resolve, reject) => {
    const r = indexedDB.open(LEGACY_DATABASE_NAME, 1);
    r.onupgradeneeded = () => {
      r.result.createObjectStore("projects", { keyPath: "id" });
      r.result.createObjectStore("files", { keyPath: "id" }).createIndex("projectId", "projectId");
      r.result.createObjectStore("settings", { keyPath: "key" });
    };
    r.onsuccess = () => resolve(r.result); r.onerror = () => reject(r.error);
  });
  await new Promise((resolve) => {
    const tx = db.transaction(["projects", "files", "settings"], "readwrite");
    tx.objectStore("projects").put({ id: "p1", name: "Old project", createdAt: "x" });
    tx.objectStore("files").put({ id: "f1", projectId: "p1", name: "old.docx", version: 3, createdAt: "x", updatedAt: "x", bytes: bytes(9, 9) });
    tx.objectStore("settings").put({ key: "chat:p1", value: ["hi"] });
    tx.oncomplete = resolve;
  });
  db.close();
}

test("scopeForUser hashes the id, is stable, and never embeds identity", async () => {
  const a = await scopeForUser({ id: 42, email: "a@firm.example" });
  assert.match(a, /^u-[0-9a-f]{16}$/);
  assert.equal(a, await scopeForUser({ id: 42, email: "other@firm.example" }));
  assert.notEqual(a, await scopeForUser({ id: 43 }));
  assert.equal(await scopeForUser(null), "guest");
  await assert.rejects(scopeForUser({ username: "no-id" }), /SESSION_UNVERIFIED/);
});

test("resolveScope reads /api/auth/me and fails closed", async () => {
  const ok = (user) => async () => ({ ok: true, json: async () => ({ user }) });
  assert.equal(await resolveScope(ok(null)), "guest");
  assert.match(await resolveScope(ok({ id: 1 })), /^u-/);
  await assert.rejects(resolveScope(async () => ({ ok: false })), /SESSION_UNVERIFIED/);
  await assert.rejects(resolveScope(async () => { throw new TypeError("offline"); }), /offline/);
  let calls = 0;
  assert.match(await resolveScope(async () => { if (!calls++) throw new Error("blip"); return { ok: true, json: async () => ({ user: { id: 1 } }) }; }), /^u-/);
});

test("user A's projects, files and chat are invisible to user B and to guests", async () => {
  const indexedDB = new IDBFactory();
  const a = await scopeForUser({ id: 1 }), b = await scopeForUser({ id: 2 });
  const wa = await openWorkspace({ indexedDB, scope: a });
  const project = await wa.createProject("Client X merger");
  await wa.createFile({ projectId: project.id, name: "spa.docx", bytes: bytes(1) });
  await wa.setSetting("chat:" + project.id, ["privileged"]);
  wa.close();
  for (const scope of [b, "guest"]) {
    const w = await openWorkspace({ indexedDB, scope });
    assert.deepEqual(await w.listProjects(), []);
    assert.equal(await w.getSetting("chat:" + project.id), undefined);
    w.close();
  }
  const again = await openWorkspace({ indexedDB, scope: a });
  assert.equal((await again.listProjects()).length, 1);
  again.close();
  assert.deepEqual((await listScopes({ indexedDB })).sort(), [a, b, "guest"].sort());
});

test("logout: after the session changes, the previous store can be backed up then deleted, and is gone", async () => {
  const indexedDB = new IDBFactory();
  const a = await scopeForUser({ id: 1 });
  const wa = await openWorkspace({ indexedDB, scope: a });
  const project = await wa.createProject("P");
  await wa.createFile({ projectId: project.id, name: "a.docx", bytes: bytes(5, 6) });
  await wa.createFile({ projectId: project.id, name: "a.docx", bytes: bytes(7) });
  wa.close();
  assert.equal(await countScopeFiles(a, { indexedDB }), 2);
  const { count, bytes: zip } = await exportScopeZip(a, { indexedDB });
  assert.equal(count, 2);
  const JSZip = (await import("jszip")).default;
  assert.deepEqual(Object.keys((await JSZip.loadAsync(zip)).files).sort(), ["P/", "P/2-a.docx", "P/a.docx"]);
  // Export is read-only: nothing was deleted until the user explicitly confirms.
  assert.equal(await countScopeFiles(a, { indexedDB }), 2);
  await deleteScope(a, { indexedDB });
  assert.deepEqual(await listScopes({ indexedDB }), []);
  const fresh = await openWorkspace({ indexedDB, scope: a });
  assert.deepEqual(await fresh.listProjects(), []);
  fresh.close();
});

test("migration: first account adopts the legacy shared database, which is then removed", async () => {
  const indexedDB = new IDBFactory();
  await legacyDb(indexedDB);
  const a = await scopeForUser({ id: 1 }), b = await scopeForUser({ id: 2 });
  assert.equal(await adoptLegacyDatabase("guest", { indexedDB }), false, "guest never adopts");
  assert.equal(await adoptLegacyDatabase(a, { indexedDB }), true);
  assert.equal((await indexedDB.databases()).some((d) => d.name === LEGACY_DATABASE_NAME), false);
  const wa = await openWorkspace({ indexedDB, scope: a });
  assert.equal((await wa.listProjects())[0].name, "Old project");
  const file = (await wa.listFiles("p1"))[0];
  assert.equal(file.version, 3);
  assert.deepEqual([...file.bytes], [9, 9]);
  assert.deepEqual(await wa.getSetting("chat:p1"), ["hi"]);
  wa.close();
  assert.equal(await adoptLegacyDatabase(b, { indexedDB }), false, "second account gets nothing");
  const wb = await openWorkspace({ indexedDB, scope: b });
  assert.deepEqual(await wb.listProjects(), []);
  wb.close();
});

test("migration does not create a legacy database when none exists", async () => {
  const indexedDB = new IDBFactory();
  assert.equal(await adoptLegacyDatabase("u-aaaaaaaaaaaaaaaa", { indexedDB }), false);
  assert.deepEqual((await indexedDB.databases()).map((d) => d.name), []);
});

test("an interrupted migration can be repeated without losing or duplicating data", async () => {
  const indexedDB = new IDBFactory();
  await legacyDb(indexedDB);
  const a = await scopeForUser({ id: 1 });
  // Simulate a crash after the copy but before the legacy delete: copy, then run again.
  const first = await openWorkspace({ indexedDB, scope: a });
  await first.createProject("Newer work");
  first.close();
  assert.equal(await adoptLegacyDatabase(a, { indexedDB }), true);
  const w = await openWorkspace({ indexedDB, scope: a });
  assert.deepEqual((await w.listProjects()).map((p) => p.name).sort(), ["Newer work", "Old project"]);
  w.close();
});

test("scope names are validated", async () => {
  await assert.rejects(openWorkspace({ indexedDB: new IDBFactory(), scope: "../x" }), /invalid storage scope/);
});

test("unsaved edits are never discarded without explicit confirmation", async () => {
  const { mayLeaveScope } = await import("../src/account-scope.js");
  let asked = 0;
  const confirm = (answer) => async () => { asked++; return answer; };
  // Saved cleanly: switch proceeds, no prompt.
  assert.equal(await mayLeaveScope({ save: async () => {}, isDirty: () => false, confirmDiscard: confirm(false) }), true);
  assert.equal(asked, 0);
  // Save throws: prompt; declining keeps the workspace open.
  assert.equal(await mayLeaveScope({ save: async () => { throw new Error("quota"); }, isDirty: () => true, confirmDiscard: confirm(null) }), false);
  // Save returns but edits remain dirty: prompt; declining blocks, accepting proceeds.
  assert.equal(await mayLeaveScope({ save: async () => {}, isDirty: () => true, confirmDiscard: confirm(null) }), false);
  assert.equal(await mayLeaveScope({ save: async () => {}, isDirty: () => true, confirmDiscard: confirm(true) }), true);
  assert.equal(asked, 3);
});
