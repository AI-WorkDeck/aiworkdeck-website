// SPDX-FileCopyrightText: 2026 北京京微资易科技有限公司 and AI WorkDeck contributors
// SPDX-License-Identifier: AGPL-3.0-or-later

import test from "node:test";
import assert from "node:assert/strict";
import { indexedDB, IDBKeyRange } from "fake-indexeddb";
import { openWorkspace } from "../src/storage.js";

globalThis.IDBKeyRange ??= IDBKeyRange;
globalThis.crypto ??= (await import("node:crypto")).webcrypto;

let serial = 0;
async function workspace() {
  const name = `test-${++serial}`;
  const scoped = {
    open: (dbName, version) => indexedDB.open(`${name}-${dbName}`, version),
  };
  return openWorkspace({ indexedDB: scoped });
}

test("creates, lists, renames, and deletes projects and files", async () => {
  const db = await workspace();
  const project = await db.createProject("Drafts");
  assert.deepEqual(await db.listProjects(), [project]);
  const file = await db.createFile({ projectId: project.id, name: "a.docx", bytes: new Uint8Array([1, 2]) });
  assert.equal(file.version, 1);
  assert.deepEqual([...file.bytes], [1, 2]);
  assert.equal((await db.listFiles(project.id))[0].id, file.id);
  assert.equal((await db.renameFile(file.id, "b.docx")).name, "b.docx");
  assert.equal((await db.renameProject(project.id, "Renamed")).name, "Renamed");
  assert.equal(await db.deleteProject(project.id), true);
  assert.deepEqual(await db.listFiles(project.id), []);
  assert.deepEqual(await db.listProjects(), []);
  db.close();
});

test("saves with optimistic version checks and leaves bytes intact on conflicts", async () => {
  const db = await workspace();
  const project = await db.createProject("P");
  const file = await db.createFile({ projectId: project.id, name: "f", bytes: new Uint8Array([4]) });
  const saved = await db.saveFile(file.id, new Uint8Array([5]), 1);
  assert.equal(saved.version, 2);
  await assert.rejects(db.saveFile(file.id, new Uint8Array([6]), 1), { code: "VERSION_CONFLICT" });
  assert.deepEqual([...(await db.getFile(file.id)).bytes], [5]);
  assert.equal((await db.getFile(file.id)).version, 2);
  db.close();
});

test("serializes concurrent saves with one expected version", async () => {
  const db = await workspace();
  const project = await db.createProject("P");
  const file = await db.createFile({ projectId: project.id, name: "f", bytes: new Uint8Array([0]) });
  const outcomes = await Promise.allSettled([
    db.saveFile(file.id, new Uint8Array([1]), 1),
    db.saveFile(file.id, new Uint8Array([2]), 1),
  ]);
  assert.equal(outcomes.filter(({ status }) => status === "fulfilled").length, 1);
  const rejected = outcomes.find(({ status }) => status === "rejected");
  assert.equal(rejected.reason.code, "VERSION_CONFLICT");
  const stored = await db.getFile(file.id);
  assert.equal(stored.version, 2);
  assert.ok([1, 2].includes(stored.bytes[0]));
  db.close();
});

test("validates names, project existence, and the 20 MB limit", async () => {
  const db = await workspace();
  assert.throws(() => db.createProject("../unsafe"), TypeError);
  await assert.rejects(db.createFile({ projectId: "missing", name: "f", bytes: new Uint8Array() }), /Project not found/);
  assert.throws(() => db.createFile({ projectId: "missing", name: "f", bytes: new Uint8Array(20 * 1024 * 1024 + 1) }), RangeError);
  db.close();
});

test("stores settings", async () => {
  const db = await workspace();
  assert.equal(await db.getSetting("theme"), undefined);
  await db.setSetting("theme", "dark");
  assert.equal(await db.getSetting("theme"), "dark");
  db.close();
});

test("temporary project is unique across concurrent creation and cannot be renamed or deleted", async () => {
  const db = await workspace();
  const old = await db.createProject('My workspace');
  const [a,b] = await Promise.all([db.ensureTemporaryProject(),db.ensureTemporaryProject()]);
  assert.equal(a.id,b.id);
  assert.equal((await db.listProjects()).length,2);
  assert.ok((await db.listProjects()).some(p=>p.id===old.id));
  await assert.rejects(db.renameProject(a.id,'Other'));
  await assert.rejects(db.deleteProject(a.id));
  db.close();
});

test("copy is atomic, keeps originals and target history, maps file context, and makes actions read-only", async () => {
  const db = await workspace();
  const source = await db.ensureTemporaryProject(), target = await db.createProject('Matter');
  const file = await db.createFile({projectId:source.id,name:'contract.docx',bytes:new Uint8Array([3,4])});
  const messages=[{role:'user',content:'Keep this',fileId:file.id},{role:'assistant',content:'Advice',fileId:file.id,proposal:{original:'a',replacement:'b'},pending:true,agent:{runId:'old-run',steps:[],requests:[]}}];
  const record={version:1,activeId:'c1',items:[{id:'c1',title:'Chat',updatedAt:'2026-01-01',messages}]};
  await db.setSetting('conversations:'+source.id,record);
  await db.setSetting('chat:'+target.id,[{role:'user',content:'Legacy target'}]);
  await assert.rejects(db.copyToProject({sourceId:source.id,targetId:target.id,fileIds:[file.id],conversationIds:['missing']}));
  assert.equal((await db.listFiles(target.id)).length,0);
  assert.equal(await db.getSetting('conversations:'+target.id),undefined);
  const result=await db.copyToProject({sourceId:source.id,targetId:target.id,fileIds:[file.id,file.id],conversationIds:['c1','c1']});
  const files=await db.listFiles(target.id);
  assert.equal(files.length,1);assert.notEqual(files[0].id,file.id);assert.deepEqual([...files[0].bytes],[3,4]);
  assert.deepEqual(await db.getSetting('conversations:'+source.id),record);
  assert.equal((await db.listFiles(source.id)).length,1);
  const copied=await db.getSetting('conversations:'+target.id);
  assert.equal(copied.items.length,2);assert.equal(copied.items[0].messages[0].content,'Legacy target');
  assert.equal(copied.items[1].messages[0].fileId,result.fileMap[file.id]);
  assert.equal(copied.items[1].messages[1].copiedHistory,true);
  assert.equal(copied.items[1].messages[1].pending,false);
  assert.equal(copied.items[1].messages[1].proposal.replacement,'b');
  assert.notEqual(copied.items[1].messages[1].agent.runId,'old-run');
  await db.copyToProject({sourceId:source.id,targetId:target.id,conversationIds:['c1']});
  assert.equal((await db.getSetting('conversations:'+target.id)).items[2].messages[0].fileId,null);
  await assert.rejects(db.copyToProject({sourceId:source.id,targetId:source.id,fileIds:[file.id]}));
  await assert.rejects(db.copyToProject({sourceId:target.id,targetId:'missing',fileIds:[file.id]}));
  await assert.rejects(db.copyToProject({sourceId:target.id,targetId:(await db.createProject('Another')).id,fileIds:[file.id]}));
  db.close();
});
