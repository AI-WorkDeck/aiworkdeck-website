// SPDX-FileCopyrightText: 2026 北京京微资易科技有限公司 and AI WorkDeck contributors
// SPDX-License-Identifier: AGPL-3.0-or-later
// 钉住 promoter 的安全性质：无服务器构建、审批门、输入校验、失败自动回滚、旧入口仍 exit 1。
// 行为测试在临时沙箱里真跑 promote-next-artifact.sh（pm2 / npm / curl / systemd-run 为桩），
// 不联网、不碰任何服务器。
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {execFileSync, spawnSync} from 'node:child_process';

const repo = path.resolve(import.meta.dirname, '..');
const read = file => fs.readFileSync(path.join(repo, file), 'utf8');
const code = text => text.split('\n').filter(line => !/^\s*#/.test(line)).join('\n');
const workflow = read('.github/workflows/promote-next-artifact.yml');
const server = read('scripts/promote-next-artifact.sh');
const phase = read('scripts/promote-remote-phase.sh');
const job = name => workflow.split(`\n  ${name}:\n`)[1].split(/\n  [a-z-]+:\n/)[0];

test('workflow is dispatch-only, gated per site, never cancelled mid-deploy', () => {
  const on = workflow.split('\non:\n')[1].split('\npermissions:')[0];
  assert.match(on, /^  workflow_dispatch:\n/);
  assert.doesNotMatch(on, /\n  (push|pull_request|workflow_run|schedule|repository_dispatch):/);
  assert.match(on, /site:[\s\S]*type: choice\n\s+options: \[cn, intl\]/);
  assert.match(workflow, /concurrency:\n  group: promote-next-\$\{\{ inputs\.site \}\}\n  cancel-in-progress: false\n/);
  const verify = job('verify'), promote = job('promote');
  assert.doesNotMatch(verify, /secrets\.|environment:|ssh /, 'pre-gate job must not see secrets or SSH');
  assert.match(promote, /\n    needs: verify\n/);
  assert.match(promote, /\n    environment: production-\$\{\{ inputs\.site \}\}\n/);
  assert.equal(workflow.match(/secrets\./g).length, 1, 'only the gated job reads DEPLOY_SSH_KEY');
  assert.match(promote, /DEPLOY_SSH_KEY: \$\{\{ secrets\.DEPLOY_SSH_KEY \}\}/);
  assert.match(promote, /StrictHostKeyChecking yes/);
  assert.match(promote, /8\.152\.169\.44 ssh-ed25519 AAAA/);
  assert.match(promote, /8\.219\.94\.204 ssh-ed25519 AAAA/);
  assert.doesNotMatch(workflow, /ssh-keyscan|StrictHostKeyChecking[= ]no/);
});

test('inputs are validated before anything is downloaded', () => {
  const steps = job('verify');
  const validate = steps.split('- name: Validate inputs')[1].split('- uses:')[0];
  assert.ok(steps.indexOf('Validate inputs') < steps.indexOf('Verify official artifact'));
  for (const pattern of ['refs/heads/master', '^(cn|intl)$', '^[1-9][0-9]{0,19}$', '^[0-9a-f]{40}$']) assert.ok(validate.includes(pattern), pattern);
  // 用户输入只经 env 进 shell，不直接插值进脚本
  assert.doesNotMatch(validate.split('run:')[1], /\$\{\{ inputs\./);
});

test('no Next build, server install or destructive git on any promoter path', () => {
  for (const [name, text] of [['workflow', workflow], ['server', server], ['phase', phase]]) {
    const body = code(text);
    for (const forbidden of [/next build/, /npm run build(?!-release)/, /deploy-build-swap/, /deploy-intl\.sh/, /npm install/, /reset --hard/, /git clean/, /crontab/, /rm -rf[^\n]*(\.env|\bdata\b)/]) {
      assert.doesNotMatch(body, forbidden, `${name}: ${forbidden}`);
    }
  }
  assert.match(code(server), /capped npm ci --no-audit --no-fund/);
  assert.match(code(server), /systemd-run --scope --quiet -p MemoryMax=/);
  assert.match(code(server), /refusing uncapped install/);
  assert.match(code(server), /git merge --ff-only/);
});

test('rollback path exists on server and in workflow', () => {
  assert.match(server, /trap '[^']*rollback; exit 1' ERR/);
  assert.match(server, /local_health \|\| \{[^}]*rollback; exit 1; \}/);
  assert.match(server, /mv \.next-old \.next/);
  assert.match(server, /mv \.node_modules-old node_modules/);
  const last = workflow.split('- name: Roll back after failed activation or health check')[1];
  assert.match(last, /if: failure\(\) && steps\.activate\.outcome != 'skipped'/);
  assert.match(last, /promote-remote-phase\.sh rollback/);
  assert.match(last, /exit 1/);
});

test('legacy ci.yml deploy jobs still hard-fail first', () => {
  const ci = read('.github/workflows/ci.yml');
  for (const name of ['deploy-cn', 'deploy-intl']) {
    const first = ci.split(`  ${name}:\n`)[1].split('    steps:\n')[1].split('      - ')[1];
    assert.ok(first.startsWith('name: Block unsafe production build path (#1648)\n'));
    assert.match(first, /\n {10}exit 1\n/);
    assert.doesNotMatch(first, /if:|continue-on-error/);
  }
});

// ---------------------------------------------------------------------------
// 行为：沙箱里的「服务器」。需要 Linux（/proc/meminfo、GNU coreutils、mv -T）。
const linux = process.platform === 'linux';
const sha256 = data => createHash('sha256').update(data).digest('hex');
const sh = (cmd, args, cwd, env = {}) => execFileSync(cmd, args, {cwd, encoding: 'utf8', env: {...process.env, ...env}});
const gitEnv = {GIT_AUTHOR_NAME: 't', GIT_AUTHOR_EMAIL: 't@example.invalid', GIT_COMMITTER_NAME: 't', GIT_COMMITTER_EMAIL: 't@example.invalid'};
const write = (file, text) => { fs.mkdirSync(path.dirname(file), {recursive: true}); fs.writeFileSync(file, text); };
const fakeSqlite = marker => `const fs=require('fs');if(fs.existsSync(__dirname+'/BROKEN'))throw Error('dlopen GLIBC');module.exports=class{exec(){}prepare(){return{run(){}}}close(){}};module.exports.marker=${JSON.stringify(marker)};`;

function sandbox() {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'awd-promote-')));
  const bin = path.join(root, 'bin'), app = path.join(root, 'app'), log = path.join(root, 'calls.log');
  const stub = (name, body) => { write(path.join(bin, name), `#!/usr/bin/env bash\necho "${name} $*" >> ${log}\n${body}\n`); fs.chmodSync(path.join(bin, name), 0o755); };
  stub('pm2', `[ "$1" = jlist ] && echo "[{\\"name\\":\\"app\\",\\"pm2_env\\":{\\"node_version\\":\\"$(node -v | tr -d v)\\"}}]"; exit 0`);
  stub('systemd-run', 'while [[ "$1" == -* ]]; do [ "$1" = -p ] && shift; shift; done; exec "$@"');
  stub('npm', `case " $* " in *" build "*|*" run build "*) echo FORBIDDEN-BUILD >> ${log}; exit 99;; esac
[ "$1" = ci ] && { mkdir -p node_modules/better-sqlite3 && cat > node_modules/better-sqlite3/index.js <<'JS'
${fakeSqlite('new')}
JS
[ -f ${root}/sqlite-broken ] && touch node_modules/better-sqlite3/BROKEN; }; exit 0`);
  // health-fail：换入后的新版本 verify-key 500（启动探针照常 200，免得测试干等 90 秒）
  stub('curl', `for a in "$@"; do case "$a" in *registry/skills) echo '[{"id":1}]'; exit 0;;
  *verify-key) [ -f ${root}/health-fail ] && grep -q new ${app}/.next/BUILD_ID && { printf 500; exit 0; };; esac; done; printf 200`);

  const origin = path.join(root, 'origin.git');
  sh('git', ['init', '-q', '--bare', '-b', 'master', origin], root);
  sh('git', ['clone', '-q', origin, app], root);
  const files = {'package.json': '{"name":"fixture"}\n', 'package-lock.json': '{"lockfileVersion":3}\n', 'next.config.ts': 'export default {}\n',
    'scripts/seed.mjs': "import fs from 'fs';fs.mkdirSync('data',{recursive:true});fs.appendFileSync('data/seeded','1');\n",
    'scripts/web-install-artifact.mjs': "import fs from 'fs';const [stage,id]=process.argv.slice(2);fs.mkdirSync('.web-releases',{recursive:true});fs.renameSync(stage,'.web-releases/'+id);fs.symlinkSync('../.web-releases/'+id,'public/.web-next');fs.renameSync('public/.web-next','public/web');\n",
    'content.txt': 'old\n', '.gitignore': '/node_modules\n/.next/\n/.next-old/\n/.node_modules-old/\n/.promote/\n/data/*\n.env*.local\n/public/web/\n/.web-releases/\n'};
  for (const [name, text] of Object.entries(files)) write(path.join(app, name), text);
  sh('git', ['add', '-A'], app); sh('git', ['commit', '-qm', 'prev'], app, gitEnv);
  const prev = sh('git', ['rev-parse', 'HEAD'], app).trim();
  write(path.join(app, 'content.txt'), 'new\n');
  sh('git', ['commit', '-qam', 'target'], app, gitEnv);
  const target = sh('git', ['rev-parse', 'HEAD'], app).trim();
  sh('git', ['push', '-q', 'origin', 'master'], app);
  sh('git', ['reset', '-q', '--hard', prev], app);   // 沙箱初始化：「服务器」停在上一版
  // 线上现状：旧 .next / 旧依赖 / env / 数据 / 旧 Web 版本
  write(path.join(app, '.next/BUILD_ID'), 'old');
  write(path.join(app, '.next/static/chunks/old.js'), 'old-chunk');
  write(path.join(app, 'node_modules/better-sqlite3/index.js'), fakeSqlite('old'));
  write(path.join(app, '.env.local'), 'SECRET=keep\n');
  write(path.join(app, 'data/awd.db'), 'db');
  write(path.join(app, '.web-releases/old/index.html'), 'old-web');
  fs.mkdirSync(path.join(app, 'public'), {recursive: true});
  fs.symlinkSync('../.web-releases/old', path.join(app, 'public/web'));

  // 产物（与 CI promote-next-artifact.py 输出同形）
  const rel = path.join(app, '.promote', 'rel1'), bundle = path.join(root, 'bundle'), web = path.join(root, 'web');
  write(path.join(bundle, '.next/BUILD_ID'), 'new');
  write(path.join(bundle, '.next/static/chunks/new.js'), 'new-chunk');
  for (const name of ['package.json', 'package-lock.json', 'next.config.ts']) write(path.join(bundle, name), files[name]);
  const abi = process.versions.modules;
  write(path.join(bundle, 'provenance.json'), JSON.stringify({sourceSha: target, site: 'intl', buildMode: 'webpack', nodeAbi: abi}));
  write(path.join(web, 'index.html'), 'new-web');
  fs.mkdirSync(rel, {recursive: true});
  sh('tar', ['-czf', path.join(rel, 'next-artifact.tar.gz'), '-C', bundle, '.'], root);
  sh('tar', ['-czf', path.join(rel, 'web-workbench.tar.gz'), '-C', web, '.'], root);
  const list = sh('find', ['.', '-type', 'f'], bundle).trim().split('\n').map(f => f.slice(2)).sort();
  write(path.join(rel, 'files.sha256'), list.map(f => `${sha256(fs.readFileSync(path.join(bundle, f)))}  ${f}`).join('\n') + '\n');
  const digest = f => sha256(fs.readFileSync(path.join(rel, f)));
  write(path.join(rel, 'release.env'), `SITE=intl\nSHA=${target}\nNEXT_TAR_SHA256=${digest('next-artifact.tar.gz')}\nWEB_TAR_SHA256=${digest('web-workbench.tar.gz')}\nNODE_ABI=${abi}\nAPP=${app}\nPM2_NAME=app\nNODE_BIN=\nSQLITE_PYTHON=\nHOST=www.workdeck.ai\nPORT=3000\n`);
  const run = (...args) => spawnSync('bash', [path.join(repo, 'scripts/promote-next-artifact.sh'), ...args, rel], {encoding: 'utf8', env: {...process.env, PATH: `${bin}:${process.env.PATH}`}});
  const calls = () => fs.existsSync(log) ? fs.readFileSync(log, 'utf8') : '';
  const at = f => fs.readFileSync(path.join(app, f), 'utf8');
  const head = () => sh('git', ['rev-parse', 'HEAD'], app).trim();
  return {root, app, rel, prev, target, run, calls, at, head, cleanup: () => fs.rmSync(root, {recursive: true, force: true})};
}

const ok = (result, label) => assert.equal(result.status, 0, `${label}\n${result.stdout}\n${result.stderr}`);

test('promote swaps artifact in, keeps rollback copies, preserves env/data, never builds', {skip: !linux && 'needs Linux'}, () => {
  const s = sandbox();
  try {
    ok(s.run('prepare'), 'prepare');
    assert.equal(s.at('.next/BUILD_ID'), 'old', 'prepare must not touch live .next');
    assert.equal(s.head(), s.prev, 'prepare must not move the checkout');
    ok(s.run('activate'), 'activate');
    assert.equal(s.at('.next/BUILD_ID'), 'new');
    assert.equal(s.at('.next/static/chunks/old.js'), 'old-chunk', 'previous static chunks retained');
    assert.equal(s.at('.next-old/BUILD_ID'), 'old');
    assert.match(s.at('node_modules/better-sqlite3/index.js'), /"new"/);
    assert.match(s.at('.node_modules-old/better-sqlite3/index.js'), /"old"/);
    assert.equal(s.head(), s.target);
    assert.equal(s.at('.env.local'), 'SECRET=keep\n');
    assert.equal(s.at('data/awd.db'), 'db');
    assert.equal(s.at('public/web/index.html'), 'new-web');
    assert.match(s.calls(), /pm2 restart app --update-env/);
    assert.match(s.calls(), /npm ci --no-audit --no-fund/);
    assert.doesNotMatch(s.calls(), /FORBIDDEN-BUILD|npm (install|run build)/);
    ok(s.run('activate'), 'activate retry is idempotent');
    // 发现问题后的人工回滚
    ok(s.run('rollback'), 'manual rollback');
    assert.equal(s.at('.next/BUILD_ID'), 'old');
    assert.match(s.at('node_modules/better-sqlite3/index.js'), /"old"/);
    assert.equal(s.head(), s.prev);
    assert.equal(s.at('public/web/index.html'), 'old-web');
    assert.equal(s.at('.env.local'), 'SECRET=keep\n');
  } finally { s.cleanup(); }
});

test('failed health check after swap rolls back automatically and fails', {skip: !linux && 'needs Linux'}, () => {
  const s = sandbox();
  try {
    ok(s.run('prepare'), 'prepare');
    fs.writeFileSync(path.join(s.root, 'health-fail'), '');
    const result = s.run('activate');
    assert.notEqual(result.status, 0, 'activation must fail');
    assert.match(result.stdout + result.stderr, /ROLLED BACK|回滚/);
    assert.equal(s.at('.next/BUILD_ID'), 'old');
    assert.match(s.at('node_modules/better-sqlite3/index.js'), /"old"/);
    assert.equal(s.head(), s.prev);
    assert.equal(s.at('public/web/index.html'), 'old-web');
    assert.match(s.at('.promote/state'), /phase=rolled-back/);
    ok(s.run('rollback'), 'second rollback is a no-op');
    assert.notEqual(s.run('activate').status, 0, 'a rolled-back release cannot be re-activated');
  } finally { s.cleanup(); }
});

test('prepare rejects tampering and unloadable better-sqlite3 without touching live site', {skip: !linux && 'needs Linux'}, () => {
  const s = sandbox();
  try {
    const sums = path.join(s.rel, 'files.sha256');
    const original = fs.readFileSync(sums, 'utf8');
    fs.writeFileSync(sums, original.replace(/^[0-9a-f]{64}/, '0'.repeat(64)));
    assert.notEqual(s.run('prepare').status, 0, 'per-file SHA mismatch');
    fs.writeFileSync(sums, original);
    fs.appendFileSync(path.join(s.rel, 'release.env'), 'NODE_OPTIONS=--inspect\n');
    assert.match(s.run('prepare').stderr, /unexpected release.env key/);
    fs.writeFileSync(path.join(s.rel, 'release.env'), fs.readFileSync(path.join(s.rel, 'release.env'), 'utf8').replace('NODE_OPTIONS=--inspect\n', ''));
    fs.writeFileSync(path.join(s.root, 'sqlite-broken'), '');
    assert.match(s.run('prepare').stderr, /better-sqlite3 failed to load/);
    assert.notEqual(s.run('activate').status, 0, 'activate requires a successful prepare');
    assert.equal(s.at('.next/BUILD_ID'), 'old');
    assert.equal(s.head(), s.prev);
  } finally { s.cleanup(); }
});
