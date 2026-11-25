/**
 * Origin override for private and staging deployments (lib/site-config.ts):
 *
 *   npx tsx --tsconfig tsconfig.json scripts/verify-site-origin-override.mts
 *
 * - Unset variables: production config, unchanged, for both sites.
 * - NEXT_PUBLIC_AWD_ORIGIN_OVERRIDE / NEXT_PUBLIC_AWD_ADDIN_ORIGIN_OVERRIDE replace origin, host, addinOrigin
 *   and the same-site origin list for the built site only; the other site's config is untouched.
 * - Anything that isn't a bare origin fails the build instead of silently advertising a wrong URL.
 * site-config reads env at import time, so each case runs in its own tsx process.
 */
import assert from 'assert';
import { spawnSync } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PROBE_FILE = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'site-origin-')), 'probe.mts');
fs.writeFileSync(PROBE_FILE, `const m = await import('@/lib/site-config'); console.log(JSON.stringify({ origin: m.siteConfig.origin, host: m.siteConfig.host, addin: m.siteConfig.addinOrigin, origins: m.siteOrigins, ofSelf: m.siteConfigOf(m.SITE_ID).origin, other: m.siteConfigOf(m.SITE_ID === 'cn' ? 'intl' : 'cn').origin }));`);

function probe(env: Record<string, string>) {
  const clean = { ...process.env };
  delete clean.NEXT_PUBLIC_AWD_ORIGIN_OVERRIDE;
  delete clean.NEXT_PUBLIC_AWD_ADDIN_ORIGIN_OVERRIDE;
  delete clean.NEXT_PUBLIC_AWD_SITE;
  const r = spawnSync('npx', ['tsx', '--tsconfig', 'tsconfig.json', PROBE_FILE], { cwd: repo, env: { ...clean, ...env }, encoding: 'utf8' });
  return { ok: r.status === 0, out: r.status === 0 ? JSON.parse(r.stdout.trim().split('\n').pop()!) : null, err: r.stderr };
}

// 1. unset -> production, both sites
const cn = probe({});
assert.ok(cn.ok, cn.err);
assert.deepStrictEqual(cn.out, { origin: 'https://www.aiworkdeck.com', host: 'www.aiworkdeck.com', addin: 'https://addin.aiworkdeck.com', origins: ['https://www.aiworkdeck.com', 'https://aiworkdeck.com'], ofSelf: 'https://www.aiworkdeck.com', other: 'https://www.workdeck.ai' });
const intl = probe({ NEXT_PUBLIC_AWD_SITE: 'intl' });
assert.ok(intl.ok, intl.err);
assert.strictEqual(intl.out.origin, 'https://www.workdeck.ai');
assert.strictEqual(intl.out.addin, 'https://addin.workdeck.ai');
assert.strictEqual(intl.out.origins.length, 4);
console.log('[1] unset -> production config for cn and intl  OK');

// 2. override -> this site only
const stg = probe({ NEXT_PUBLIC_AWD_ORIGIN_OVERRIDE: 'https://localhost:18043/', NEXT_PUBLIC_AWD_ADDIN_ORIGIN_OVERRIDE: 'https://localhost:18044' });
assert.ok(stg.ok, stg.err);
assert.deepStrictEqual(stg.out, { origin: 'https://localhost:18043', host: 'localhost:18043', addin: 'https://localhost:18044', origins: ['https://localhost:18043'], ofSelf: 'https://localhost:18043', other: 'https://www.workdeck.ai' });
const addinOnly = probe({ NEXT_PUBLIC_AWD_ADDIN_ORIGIN_OVERRIDE: 'https://addin.firm.example' });
assert.ok(addinOnly.ok, addinOnly.err);
assert.strictEqual(addinOnly.out.origin, 'https://www.aiworkdeck.com');
assert.strictEqual(addinOnly.out.addin, 'https://addin.firm.example');
console.log('[2] override replaces origin/host/addin/same-site list for the built site only  OK');

// 3. not a bare origin -> fails loudly
for (const bad of ['stg.example.com', 'https://stg.example.com/zh', 'ftp://stg.example.com']) {
  const r = probe({ NEXT_PUBLIC_AWD_ORIGIN_OVERRIDE: bad });
  assert.ok(!r.ok && /NEXT_PUBLIC_AWD_ORIGIN_OVERRIDE must be/.test(r.err), `"${bad}" should be rejected`);
}
console.log('[3] malformed override fails the build  OK');
