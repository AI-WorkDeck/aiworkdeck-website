#!/usr/bin/env node
// 备份 SQLite 账本：用 VACUUM INTO 生成一致性快照到 data/backups/，保留最近 14 份。
// 用法：node scripts/backup-db.mjs
// crontab 示例见 DEPLOY.md。
//
// KEEP 是保留期承诺的一部分，只许调小、不许调大。
// 快照是整库副本，里面躺着 /api/admin/telemetry/purge 清理掉的那些遥测行——
// 隐私政策承诺匿名遥测「24 个月，届期滚动删除」，备份里多留一天就是多持有一天。
// 14 天的滞后落在「删除后合理的备份轮换窗口」内（对照口径：账户注销后 30 日内删除），
// 把 KEEP 调到 30 以上就直接违诺了。真要延长备份链，先改隐私政策的保存期限表。

import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dbFile = path.join(root, 'data', 'awd.db');
const backupDir = path.join(root, 'data', 'backups');
const KEEP = 14;

if (!fs.existsSync(dbFile)) {
  console.log(`跳过备份：${dbFile} 不存在`);
  process.exit(0);
}

fs.mkdirSync(backupDir, { recursive: true });

const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const target = path.join(backupDir, `awd-${stamp}.db`);

const db = new Database(dbFile, { readonly: true });
try {
  // VACUUM INTO 生成的是紧凑、一致的独立快照，WAL 下也安全
  db.prepare('VACUUM INTO ?').run(target);
} finally {
  db.close();
}
console.log(`已备份到 ${target}`);

// 只保留最近 KEEP 份
const backups = fs
  .readdirSync(backupDir)
  .filter((f) => /^awd-.*\.db$/.test(f))
  .sort()
  .reverse();
for (const old of backups.slice(KEEP)) {
  fs.unlinkSync(path.join(backupDir, old));
  console.log(`已清理旧备份 ${old}`);
}
