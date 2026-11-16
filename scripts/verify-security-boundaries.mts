import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const { packErrorMessage } = await import('@/lib/pack-messages');

const longDetail = ('a manifest 声明 ' + '1'.repeat(10000)).repeat(10);
const started = performance.now();
assert.ok(packErrorMessage('bad_archive', longDetail, 'en').includes(longDetail));
assert.ok(performance.now() - started < 1000, 'long details must bypass ambiguous regexes');
assert.equal(packErrorMessage('size_mismatch', 'asset.tar.gz 声明 10 字节，实到 9 字节', 'en'),
  'Actual byte size does not match the size declared in manifest (asset.tar.gz declared 10 bytes, received 9 bytes)');

// Execute the real live script with invalid targets. It must fail before data creation or requests.
const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
for (const target of ['https://UAT.BQT.COM', 'https://uat.bqt.com', 'https://bqt-test.bqt.com.evil.example',
  'https://bqt-test.bqt.com@evil.example', 'https://user@bqt-test.bqt.com', 'http://bqt-test.bqt.com',
  'https://bqt-test.bqt.com:8443', 'https://bqt-test.bqt.com', 'https://BQT-TEST.BQT.COM']) {
  const isolated = mkdtempSync(path.join(tmpdir(), 'awd-live-guard-'));
  try {
    const result = spawnSync(path.join(repo, 'node_modules/.bin/tsx'),
      ['--tsconfig', path.join(repo, 'tsconfig.json'), path.join(repo, 'scripts/live-bqt-e2e.mts')],
      { cwd: isolated, env: { PATH: process.env.PATH, NODE_ENV: 'test', AWD_BQT_MEMBER_BASE_URL: target }, encoding: 'utf8', timeout: 15000 });
    assert.equal(result.error, undefined);
    assert.notEqual(result.status, 0);
    const allowed = new URL(target).origin === 'https://bqt-test.bqt.com' && !new URL(target).username;
    assert.ok(result.stderr.includes(allowed ? '需要 BQT_LIVE_LAWYER_ID' : '只允许对包晴天测试环境运行'),
      'allowed hosts pass only to the next offline prerequisite; other hosts fail at environment guard');
    assert.equal(existsSync(path.join(isolated, 'data')), false);
  } finally { rmSync(isolated, { recursive: true, force: true }); }
}
console.log('Bounded detail localization and 7 live-environment rejection and 2 allow cases passed');
