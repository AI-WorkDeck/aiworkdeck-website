// SPDX-FileCopyrightText: 2026 北京京微资易科技有限公司 and AI WorkDeck contributors
// SPDX-License-Identifier: AGPL-3.0-or-later

export const TEMPORARY_PROJECT_ID = "temporary-project";

// Before per-account scoping every user shared this single database name.
export const LEGACY_DATABASE_NAME = "ai-workdeck-web-workbench";
export const GUEST_SCOPE = "guest";
const SCOPED_PREFIX = LEGACY_DATABASE_NAME + ":";
const databaseName = (scope) => SCOPED_PREFIX + scope;
const DATABASE_VERSION = 1;
const PROJECTS = "projects";
const FILES = "files";
const SETTINGS = "settings";
const MAX_FILE_BYTES = 20 * 1024 * 1024;

function validateName(name, label = "name") {
  if (typeof name !== "string" || !name.trim()) {
    throw new TypeError(`${label} must be a non-empty string`);
  }
  const value = name.trim();
  if (value === "." || value === ".." || /[\\/\0-\x1f\x7f]/u.test(value)) {
    throw new TypeError(`${label} must not contain path separators or control characters`);
  }
  return value;
}

function normalizeBytes(bytes) {
  if (!(bytes instanceof Uint8Array) && !(bytes instanceof ArrayBuffer) && !ArrayBuffer.isView(bytes)) {
    throw new TypeError("bytes must be a Uint8Array, ArrayBuffer, or typed array view");
  }
  const view = bytes instanceof ArrayBuffer
    ? new Uint8Array(bytes)
    : new Uint8Array(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (view.byteLength > MAX_FILE_BYTES) throw new RangeError("File exceeds the 20 MB limit");
  return view.slice();
}

function requestResult(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error("IndexedDB request failed"));
  });
}

function openDatabase(indexedDB, name) {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(name, DATABASE_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(PROJECTS)) db.createObjectStore(PROJECTS, { keyPath: "id" });
      if (!db.objectStoreNames.contains(FILES)) {
        const files = db.createObjectStore(FILES, { keyPath: "id" });
        files.createIndex("projectId", "projectId", { unique: false });
      }
      if (!db.objectStoreNames.contains(SETTINGS)) db.createObjectStore(SETTINGS, { keyPath: "key" });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error("Unable to open workspace database"));
    request.onblocked = () => reject(new Error("Workspace database upgrade is blocked"));
  });
}

function id() {
  if (!globalThis.crypto?.randomUUID) throw new Error("crypto.randomUUID is required");
  return globalThis.crypto.randomUUID();
}

function validateScope(scope) {
  if (typeof scope !== "string" || !/^[a-z0-9-]{1,64}$/.test(scope)) throw new TypeError("invalid storage scope");
  return scope;
}

function deleteDatabase(indexedDB, name) {
  return new Promise((resolve, reject) => {
    const request = indexedDB.deleteDatabase(name);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error || new Error("Unable to delete workspace database"));
    request.onblocked = () => reject(new Error("Workspace database deletion is blocked by another tab"));
  });
}

async function databaseNames(indexedDB) {
  if (typeof indexedDB.databases !== "function") return null;
  return (await indexedDB.databases()).map((d) => d.name);
}

/** Scopes (guest and account hashes) that have a local database in this browser. */
export async function listScopes({ indexedDB = globalThis.indexedDB } = {}) {
  const names = (await databaseNames(indexedDB)) || [];
  return names.filter((n) => n.startsWith(SCOPED_PREFIX)).map((n) => n.slice(SCOPED_PREFIX.length));
}

/** Permanently removes one scope's database. */
export function deleteScope(scope, { indexedDB = globalThis.indexedDB } = {}) {
  return deleteDatabase(indexedDB, databaseName(validateScope(scope)));
}

/**
 * Moves the pre-scoping shared database into `scope` (the first account that signs in
 * after the upgrade), then removes it. Copy uses put(), so an interrupted run can be
 * repeated safely; the legacy database is deleted only after the copy committed.
 * Returns true when something was adopted.
 */
export async function adoptLegacyDatabase(scope, { indexedDB = globalThis.indexedDB } = {}) {
  if (validateScope(scope) === GUEST_SCOPE) return false;
  const names = await databaseNames(indexedDB);
  if (names && !names.includes(LEGACY_DATABASE_NAME)) return false;
  const legacy = await openDatabase(indexedDB, LEGACY_DATABASE_NAME);
  const stores = [PROJECTS, FILES, SETTINGS].filter((n) => legacy.objectStoreNames.contains(n));
  const rows = {};
  try {
    if (stores.length) {
      const tx = legacy.transaction(stores, "readonly");
      for (const n of stores) rows[n] = await requestResult(tx.objectStore(n).getAll());
    }
  } finally { legacy.close(); }
  if (stores.length) {
    const target = await openDatabase(indexedDB, databaseName(scope));
    try {
      const tx = target.transaction(stores, "readwrite");
      const done = new Promise((resolve, reject) => {
        tx.oncomplete = resolve;
        tx.onabort = () => reject(tx.error || new Error("Migration aborted"));
      });
      for (const n of stores) for (const row of rows[n]) tx.objectStore(n).put(row);
      await done;
    } finally { target.close(); }
  }
  await deleteDatabase(indexedDB, LEGACY_DATABASE_NAME);
  return stores.some((n) => rows[n].length > 0);
}

export async function openWorkspace({ indexedDB = globalThis.indexedDB, scope = GUEST_SCOPE } = {}) {
  if (!indexedDB) throw new Error("IndexedDB is unavailable");
  const db = await openDatabase(indexedDB, databaseName(validateScope(scope)));
  let closed = false;

  function run(stores, mode, work) {
    if (closed) return Promise.reject(new Error("Workspace is closed"));
    let tx;
    try { tx = db.transaction(stores, mode); }
    catch (error) { return Promise.reject(error); }
    let result;
    let workError;
    try { result = work(tx); }
    catch (error) {
      workError = error;
      try { tx.abort(); } catch { /* transaction may already be inactive */ }
    }
    return new Promise((resolve, reject) => {
      let value;
      Promise.resolve(result).then((v) => { value = v; }, (error) => { workError ||= error; try { tx.abort(); } catch { /* inactive */ } });
      tx.oncomplete = () => workError ? reject(workError) : resolve(value);
      tx.onabort = () => reject(workError || tx.error || new Error("IndexedDB transaction aborted"));
      tx.onerror = () => { workError ||= tx.error; };
    });
  }

  return {
    listProjects() {
      return run(PROJECTS, "readonly", (tx) => requestResult(tx.objectStore(PROJECTS).getAll()));
    },
    ensureTemporaryProject() {
      return run(PROJECTS, "readwrite", async (tx) => {
        const projects = tx.objectStore(PROJECTS);
        const existing = await requestResult(projects.get(TEMPORARY_PROJECT_ID));
        if (existing) return existing;
        const project = { id: TEMPORARY_PROJECT_ID, name: "Temporary project", createdAt: new Date().toISOString() };
        projects.add(project);
        return project;
      });
    },
    copyToProject({ sourceId, targetId, fileIds = [], conversationIds = [] }) {
      return run([PROJECTS, FILES, SETTINGS], "readwrite", async (tx) => {
        const projects = tx.objectStore(PROJECTS), files = tx.objectStore(FILES), settings = tx.objectStore(SETTINGS);
        if (sourceId === targetId || targetId === TEMPORARY_PROJECT_ID) throw new Error("Invalid target project");
        if (!await requestResult(projects.get(sourceId)) || !await requestResult(projects.get(targetId))) throw new Error("Project not found");
        const fileMap = {}, timestamp = new Date().toISOString();
        for (const fileId of new Set(fileIds)) {
          const file = await requestResult(files.get(fileId));
          if (!file || file.projectId !== sourceId) throw new Error("Source file not found");
          fileMap[fileId] = id();
          files.add({ ...file, id: fileMap[fileId], projectId: targetId, version: 1, createdAt: timestamp, updatedAt: timestamp });
        }
        const source = (await requestResult(settings.get("conversations:" + sourceId)))?.value;
        const targetKey = "conversations:" + targetId;
        let target = (await requestResult(settings.get(targetKey)))?.value;
        // Preserve legacy target history even when it has never been opened in the new UI.
        if (!target) {
          const legacy = (await requestResult(settings.get("chat:" + targetId)))?.value;
          const first = { id: id(), title: "", updatedAt: timestamp, messages: legacy || [] };
          target = { version: 1, activeId: first.id, items: [first] };
        }
        const copiedIds = [];
        for (const conversationId of new Set(conversationIds)) {
          const original = source?.items.find(c => c.id === conversationId);
          if (!original) throw new Error("Source conversation not found");
          const copy = structuredClone(original);
          copy.id = id();
          copy.updatedAt = timestamp;
          // Preserve readable proposals and operation logs, but never replay source actions.
          for (const message of copy.messages) {
            message.copiedHistory = true;
            message.pending = false;
            if (message.fileId) {
              message.sourceFileId = message.fileId;
              message.fileId = fileMap[message.fileId] || null;
            }
            if (message.agent) message.agent.runId = id();
          }
          target.items.push(copy);
          copiedIds.push(copy.id);
        }
        if (copiedIds.length) settings.put({ key: targetKey, value: target });
        return { fileMap, conversationIds: copiedIds };
      });
    },
    createProject(name) {
      const project = { id: id(), name: validateName(name, "project name"), createdAt: new Date().toISOString() };
      return run(PROJECTS, "readwrite", (tx) => { tx.objectStore(PROJECTS).add(project); return project; });
    },
    renameProject(projectId, name) {
      if (projectId === TEMPORARY_PROJECT_ID) return Promise.reject(new Error("Temporary project cannot be renamed"));
      const nextName = validateName(name, "project name");
      return run(PROJECTS, "readwrite", async (tx) => {
        const store = tx.objectStore(PROJECTS);
        const project = await requestResult(store.get(projectId));
        if (!project) throw new Error("Project not found");
        project.name = nextName;
        store.put(project);
        return project;
      });
    },
    deleteProject(projectId) {
      if (projectId === TEMPORARY_PROJECT_ID) return Promise.reject(new Error("Temporary project cannot be deleted"));
      return run([PROJECTS, FILES], "readwrite", async (tx) => {
        const projects = tx.objectStore(PROJECTS);
        const project = await requestResult(projects.get(projectId));
        if (!project) return false;
        const files = tx.objectStore(FILES);
        const keys = await requestResult(files.index("projectId").getAllKeys(projectId));
        for (const key of keys) files.delete(key);
        projects.delete(projectId);
        return true;
      });
    },
    listFiles(projectId) {
      return run(FILES, "readonly", async (tx) => (await requestResult(tx.objectStore(FILES).index("projectId").getAll(projectId))).map((file) => ({ ...file, bytes: new Uint8Array(file.bytes) })));
    },
    getFile(fileId) {
      return run(FILES, "readonly", async (tx) => {
        const file = await requestResult(tx.objectStore(FILES).get(fileId));
        if (!file) return undefined;
        return { ...file, bytes: new Uint8Array(file.bytes) };
      });
    },
    createFile({ projectId, name, bytes }) {
      const fileBytes = normalizeBytes(bytes);
      const timestamp = new Date().toISOString();
      const file = { id: id(), projectId, name: validateName(name, "file name"), version: 1, createdAt: timestamp, updatedAt: timestamp, bytes: fileBytes };
      return run([PROJECTS, FILES], "readwrite", async (tx) => {
        if (!await requestResult(tx.objectStore(PROJECTS).get(projectId))) throw new Error("Project not found");
        tx.objectStore(FILES).add(file);
        return { ...file, bytes: fileBytes.slice() };
      });
    },
    renameFile(fileId, name) {
      const nextName = validateName(name, "file name");
      return run(FILES, "readwrite", async (tx) => {
        const store = tx.objectStore(FILES);
        const file = await requestResult(store.get(fileId));
        if (!file) throw new Error("File not found");
        file.name = nextName;
        file.updatedAt = new Date().toISOString();
        store.put(file);
        return { ...file, bytes: new Uint8Array(file.bytes) };
      });
    },
    deleteFile(fileId) {
      return run(FILES, "readwrite", async (tx) => {
        const store = tx.objectStore(FILES);
        const file = await requestResult(store.get(fileId));
        if (!file) return false;
        store.delete(fileId);
        return true;
      });
    },
    saveFile(fileId, bytes, expectedVersion) {
      const fileBytes = normalizeBytes(bytes);
      return run(FILES, "readwrite", async (tx) => {
        const store = tx.objectStore(FILES);
        const file = await requestResult(store.get(fileId));
        if (!file) throw new Error("File not found");
        if (!Number.isInteger(expectedVersion) || file.version !== expectedVersion) {
          const error = new Error("File version conflict");
          error.code = "VERSION_CONFLICT";
          throw error;
        }
        file.bytes = fileBytes;
        file.version += 1;
        file.updatedAt = new Date().toISOString();
        store.put(file);
        return { ...file, bytes: new Uint8Array(file.bytes) };
      });
    },
    getSetting(key) {
      if (typeof key !== "string" || !key) return Promise.reject(new TypeError("setting key must be a non-empty string"));
      return run(SETTINGS, "readonly", async (tx) => (await requestResult(tx.objectStore(SETTINGS).get(key)))?.value);
    },
    setSetting(key, value) {
      if (typeof key !== "string" || !key) return Promise.reject(new TypeError("setting key must be a non-empty string"));
      return run(SETTINGS, "readwrite", (tx) => { tx.objectStore(SETTINGS).put({ key, value }); return value; });
    },
    close() { if (!closed) { closed = true; db.close(); } },
  };
}
