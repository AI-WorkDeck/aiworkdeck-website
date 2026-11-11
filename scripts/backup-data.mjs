#!/usr/bin/env node
// 备份 data/ 下除数据库外的全部持久化文件（avatars/pack-submissions/pack-publish/
// packs.json/users.json/skills.json/gateway-config.json 等），打包到 data/backups/，
// 保留最近 14 份。数据库本体由 backup-db.mjs 的 VACUUM INTO 快照负责，这里排除。
//
// 另可用 --extra name=/abs/path 追加备份站点目录之外的资产（如 /www/wwwroot/plugin-packs、
// /opt/aiworkdeck/cloud/data），每个 extra 独立成包、保留最近 3 份——它们是追加型内容
// （版本化发布件），备份只为兜误删，不需要长链。
//
// 用法：node scripts/backup-data.mjs [--extra plugin-packs=/www/wwwroot/plugin-packs]...
// crontab 示例见 DEPLOY.md。跑法同 backup-db.mjs：必须用 v22 的 node。
//
// KEEP 与 backup-db.mjs 同理是保留期承诺的一部分，只许调小、不许调大：
// users.json/sessions.json 与云后端 data/ 里躺着用户数据，备份多留一天就是多持有一天。
// 备份不出本机：北京机的用户数据同步到境外机就是数据出境，隐私政策承诺过全境内。

import { execFileSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dataDir = path.join(root, 'data');
const backupDir = path.join(dataDir, 'backups');
const KEEP = 14;
const KEEP_EXTRA = 3;

const stamp = new Date().toISOString().replace(/[:.]/g, '-');

fs.mkdirSync(backupDir, { recursive: true });

function rotate(prefix, keep) {
  const old = fs
    .readdirSync(backupDir)
    .filter((f) => f.startsWith(`${prefix}-`) && f.endsWith('.tar.gz'))
    .sort()
    .reverse()
    .slice(keep);
  for (const f of old) {
    fs.unlinkSync(path.join(backupDir, f));
    console.log(`已清理旧备份 ${f}`);
  }
}

// tar 打包：-C 到父目录、归档相对目录名，产物可搬运；0600（内含密钥与用户数据）
function pack(target, parent, dirName, excludes = []) {
  const args = ['-czf', target, '-C', parent];
  for (const e of excludes) args.push(`--exclude=${e}`);
  args.push(dirName);
  execFileSync('tar', args);
  fs.chmodSync(target, 0o600);
  const size = (fs.statSync(target).size / 1024).toFixed(0);
  console.log(`已备份到 ${target}（${size}KB）`);
}

// 1) 站点 data/（排除 backups 自身与数据库三件套）
if (fs.existsSync(dataDir)) {
  pack(path.join(backupDir, `data-${stamp}.tar.gz`), root, 'data', [
    'data/backups',
    'data/awd.db',
    'data/awd.db-wal',
    'data/awd.db-shm',
  ]);
  rotate('data', KEEP);
} else {
  console.log(`跳过备份：${dataDir} 不存在`);
}

// 2) --extra name=/abs/path（也接受 --extra=name=path）
const argv = process.argv.slice(2);
for (let i = 0; i < argv.length; i++) {
  let spec;
  if (argv[i] === '--extra') spec = argv[++i];
  else if (argv[i].startsWith('--extra=')) spec = argv[i].slice('--extra='.length);
  else continue;
  const eq = (spec ?? '').indexOf('=');
  if (eq <= 0) {
    console.error(`忽略无效的 --extra：${spec}`);
    continue;
  }
  const name = spec.slice(0, eq);
  const dir = spec.slice(eq + 1);
  if (!/^[a-z0-9][a-z0-9-]*$/.test(name)) {
    console.error(`忽略无效的 extra 名：${name}`);
    continue;
  }
  if (!fs.existsSync(dir)) {
    console.log(`跳过 ${name}：${dir} 不存在`);
    continue;
  }
  pack(
    path.join(backupDir, `${name}-${stamp}.tar.gz`),
    path.dirname(dir),
    path.basename(dir)
  );
  rotate(name, KEEP_EXTRA);
}
