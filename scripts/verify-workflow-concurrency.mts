/**
 * Actions capacity rules for this repo's workflows (readiness CI capacity review, 2026-11-25):
 *
 *   npx tsx scripts/verify-workflow-concurrency.mts
 *
 * - security.yml: PR scans cancel their superseded run; master / release pushes never cancel or
 *   supersede an earlier commit's scan (run_id group).
 * - ci.yml: PR runs cancel their superseded run; master keeps the per-ref group with no cancelling,
 *   which serializes master runs (deploy jobs must never overlap or be cut off mid-deploy).
 * Text checks only (no YAML dependency in this repo); the blocks are short and stable.
 */
import assert from 'assert';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (f: string) => fs.readFileSync(path.join(repo, '.github/workflows', f), 'utf8');
const block = (src: string) => {
  const m = src.match(/^concurrency:\n((?:[ \t]+.*\n)+)/m);
  assert.ok(m, 'top-level concurrency block missing');
  return m[1].split('\n').map((l) => l.trim()).filter((l) => l && !l.startsWith('#'));
};

const security = block(read('security.yml'));
assert.ok(security.includes('group: security-${{ github.event.pull_request.number || github.run_id }}'), `security.yml group: ${security}`);
assert.ok(security.includes("cancel-in-progress: ${{ github.event_name == 'pull_request' }}"), `security.yml cancel: ${security}`);
console.log('[1] security.yml: PR-only cancel, master/release scans never superseded  OK');

const ci = block(read('ci.yml'));
assert.ok(ci.includes('group: ci-${{ github.ref }}'), `ci.yml group: ${ci}`);
assert.ok(ci.includes("cancel-in-progress: ${{ github.event_name == 'pull_request' }}"), `ci.yml cancel: ${ci}`);
console.log('[2] ci.yml: PR-only cancel, master serialized per ref  OK');
