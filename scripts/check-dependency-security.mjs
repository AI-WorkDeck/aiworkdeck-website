// SPDX-License-Identifier: AGPL-3.0-or-later
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const WORKSPACES = ['.', 'web-workbench'];
const APPROVED = new Set(['.']);
const ADVISORY = 'https://github.com/advisories/GHSA-g3hv-75wg-m249';
const EXPIRES = Date.parse('2027-02-02T00:00:00Z');

/** Fail closed on malformed results, changed advisories, runtime reachability or expiry. */
export function validateAudit(audit, lock, workspace, now = Date.now()) {
  if (!audit || audit.error || audit.auditReportVersion !== 2 || !audit.vulnerabilities ||
      !audit.metadata?.vulnerabilities || !lock?.packages) throw Error('Invalid audit or lock data');
  const vulnerabilities = audit.vulnerabilities;
  const entries = Object.entries(vulnerabilities);
  const count = audit.metadata.vulnerabilities.total;
  if (!Number.isInteger(count) || count !== entries.length) throw Error('Audit count mismatch');
  if (!entries.length) return { exceptions: 0 };
  if (!APPROVED.has(workspace) || !Number.isFinite(now) || now >= EXPIRES) throw Error('Exception unavailable or expired');
  let advisoryCount = 0;
  for (const [name, item] of entries) {
    if (item.name !== name || !Array.isArray(item.nodes) || !item.nodes.length || !Array.isArray(item.via) || !item.via.length)
      throw Error(`Malformed vulnerability: ${name}`);
    for (const node of item.nodes) {
      if (!lock.packages[node] || lock.packages[node].dev !== true || lock.packages[node].devOptional === true)
        throw Error(`Non-development vulnerable dependency: ${node}`);
    }
    for (const via of item.via) {
      if (typeof via === 'string') {
        if (!Object.hasOwn(vulnerabilities, via)) throw Error(`Unknown advisory chain: ${via}`);
      } else {
        if (!via || via.url !== ADVISORY || via.name !== 'minimatch' || via.dependency !== 'minimatch' || name !== 'minimatch' || via.range !== '<11.0.1' || via.severity !== 'moderate')
          throw Error(`Unapproved advisory: ${via?.url ?? name}`);
        advisoryCount++;
      }
    }
  }
  if (!advisoryCount) throw Error('No approved advisory found');
  // Every transitive entry must lead to the approved leaf; cycles must not hide unknown roots.
  function reachesLeaf(name, seen = new Set()) {
    if (seen.has(name)) return false;
    const next = new Set(seen).add(name);
    return vulnerabilities[name].via.some(v => typeof v !== 'string' || reachesLeaf(v, next));
  }
  for (const [name] of entries) if (!reachesLeaf(name)) throw Error(`Cyclic advisory chain: ${name}`);
  return { exceptions: entries.length };
}

export function parseAuditResult(result) {
  if (result.error || result.signal || ![0, 1].includes(result.status)) throw Error('npm audit execution failed');
  try { return JSON.parse(result.stdout); } catch { throw Error('npm audit returned invalid JSON'); }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  let failed = false;
  for (const workspace of WORKSPACES) {
    try {
      const cwd = path.resolve(ROOT, workspace);
      const result = spawnSync(process.platform === 'win32' ? 'npm.cmd' : 'npm', ['audit', '--json'], { cwd, encoding: 'utf8', timeout: 120000, maxBuffer: 16 * 1024 * 1024 });
      const audit = parseAuditResult(result);
      const summary = validateAudit(audit, JSON.parse(fs.readFileSync(path.join(cwd, 'package-lock.json'), 'utf8')), workspace);
      console.log(`${workspace}: ${summary.exceptions ? `${summary.exceptions} development-only transitive entries covered by GHSA-g3hv-75wg-m249 exception until 2027-02-02` : '0 vulnerabilities'}`);
    } catch (error) { failed = true; console.error(`${workspace}: ${error.message}`); }
  }
  if (failed) process.exitCode = 1;
}
