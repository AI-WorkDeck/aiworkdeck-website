import assert from 'node:assert/strict';
import type { DeploymentConfig } from '../lib/deployment-planner';

// Match the other .mts checks: tsx loads this package's .ts modules as CommonJS.
// Runtime destructuring avoids Node's static named-export detection across that boundary.
const { DEFAULT_CONFIG, estimateDeployment } = await import('../lib/deployment-planner');

const estimate = (patch: Partial<DeploymentConfig> = {}) => estimateDeployment({ ...DEFAULT_CONFIG, ...patch });
const base = estimate();
assert.equal(base.firstYear, 24920); // 9,800 license + 6,000 setup + 12 × (500 server + 100 backup + 160 model)
assert.equal(base.recurringYear, 18920); // no repeated setup
assert.equal(base.missing.length, 0);
for (const [users, expected] of [[1, 9800], [20, 9800], [21, 19800], [50, 19800], [51, 39800], [100, 39800], [101, 49800], [200, 49800]] as const) {
    assert.equal(estimate({ users }).annual, expected, `license boundary ${users}`);
}
assert.deepEqual(estimate({ users: 201 }).missing, ['license', 'setup']);
assert.equal(estimate({ commercial: false }).firstYear, base.firstYear - 9800);
assert.equal(estimate({ ownedServer: true }).firstYear, base.firstYear - 6000);
assert.equal(estimate({ model: 'hybrid', cloudPercent: 25 }).lines.find(l => l.key === 'model')?.amount, 40);
const local = estimate({ model: 'local' });
assert.equal(local.lines.find(l => l.key === 'model')?.amount, 0);
assert.deepEqual(local.missing, ['gpuPurchase', 'gpuMonthly', 'adaptation']);
assert.equal(local.reviewRequired, true);
assert.equal(estimate({ model: 'local', gpuPurchase: 0, gpuMonthly: 0, adaptation: 0 }).missing.length, 0);
assert.equal(estimate({ model: 'local', gpuPurchase: 0, gpuMonthly: 0, adaptation: 0 }).reviewRequired, true);
assert.equal(estimate({ model: 'cloud', gpuPurchase: 50000, adaptation: 20000 }).firstYear, base.firstYear, 'hidden local costs must not leak into cloud plan');
assert.deepEqual(estimate({ options: ['data', 'search', 'mobile', 'externalGit'] }).missing, ['adaptation', 'search', 'data', 'mobile', 'gitSetup']);
assert.equal(estimate({ options: ['ocr', 'asr'] }).monthly, 880);
assert.equal(estimate({ options: [], ocrPages: 90000 }).monthly, base.monthly, 'deselected options must not charge');
assert.deepEqual(estimate({ offline: true, options: ['ocr', 'asr', 'tts', 'parse'] }).conflicts, ['cloudModel', 'ocr', 'asr']);
assert.deepEqual(estimate({ offline: true, model: 'local', options: ['tts', 'parse'] }).conflicts, []);
assert.equal(estimate({ concurrency: 21 }).reviewRequired, true);
assert.equal(estimate({ users: 20, concurrency: 11 }).resource, 2, 'concurrency sizes server independently');
assert.equal(estimate({ options: ['parse'] }).extraMemoryGB, 16);
assert.equal(estimate({ users: 21 }).diskGB, 300);
assert.equal(estimate({ inputRate: 0, outputRate: 0 }).lines.find(l => l.key === 'model')?.amount, 0);
assert.deepEqual(estimate({ options: ['ocr'], ocrRate: null }).missing, ['ocr']);
assert.deepEqual(estimate({ serverMonthly: null, backupMonthly: null, inputRate: null }).missing, ['server', 'backup', 'model']);
assert.equal(estimate({ ownedServer: true, serverMonthly: null }).missing.length, 0);
assert.deepEqual(estimate({ options: ['mobile'], mobileMonthly: 100 }).missing, ['adaptation']);
assert.equal(estimate({ options: ['mobile'], mobileMonthly: 100, adaptation: 0 }).reviewRequired, true);
assert.equal(estimate({ model: 'local', inputRate: null }).lines.find(l => l.key === 'model')?.amount, 0);
console.log('Deployment planner assertions passed: price boundaries, exclusions, unknowns, offline conflicts, capacity and mobile adaptation.');
