// SPDX-FileCopyrightText: 2026 北京京微资易科技有限公司 and AI WorkDeck contributors
// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * OpenRouter 账号轮换 CLI（与 POST /api/admin/ai/rotate 共用 lib/openrouter-rotation.ts）。
 *   默认 dry-run，只读；加 --apply 才会结算 / 禁用 / 退役旧账号的 key。幂等。
 *   需要环境变量 OPENROUTER_PROVISIONING_KEY（新）与 OPENROUTER_PROVISIONING_KEY_RETIRED（旧）。
 * 输出不含任何 key 材料。详见 doc/openrouter-account-rotation.md。
 */
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { rotateRetiredAccount, RotationError } = require('../lib/openrouter-rotation') as typeof import('../lib/openrouter-rotation');
const apply = process.argv.includes('--apply');
try {
  const report = await rotateRetiredAccount({ dryRun: !apply });
  console.log(JSON.stringify(report, null, 2));
  const failed = report.items.filter(i => i.action === 'failed').length;
  console.log(apply ? `applied: ${report.items.length - failed} ok, ${failed} failed` : 'dry-run: nothing written; re-run with --apply');
  process.exit(failed ? 1 : 0);
} catch (e) {
  console.error(e instanceof RotationError ? `${e.code}: ${e.message}` : 'rotation failed');
  process.exit(2);
}
