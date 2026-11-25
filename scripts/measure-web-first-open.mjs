// SPDX-FileCopyrightText: 2026 北京公富信息技术有限公司 and AI WorkDeck contributors
// SPDX-License-Identifier: AGPL-3.0-or-later
// Measures what a first-time visitor waits for in the web version (POLISH W6): cold and warm open of /web/
// until the sample document is editable, plus bytes transferred. Read-only; no sign-in, no AI calls.
// Usage: node scripts/measure-web-first-open.mjs https://www.aiworkdeck.us [https://www.aiworkdeck.com ...]
import { chromium } from 'playwright';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const results = [];
for (const base of process.argv.slice(2)) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'web-open-'));
  const ctx = await chromium.launchPersistentContext(dir, { headless: true, viewport: { width: 1440, height: 900 } });
  for (const round of ['cold', 'warm']) {
    const page = await ctx.newPage();
    let bytes = 0;
    page.on('requestfinished', async r => { try { bytes += (await r.sizes()).responseBodySize; } catch { /* aborted */ } });
    const t0 = Date.now();
    await page.goto(`${base}/web/?lang=en`, { waitUntil: 'load', timeout: 120000 });
    let readyMs = null;
    for (let i = 0; i < 600; i++) {
      await page.waitForTimeout(500);
      const ready = await page.evaluate(() => {
        const cover = document.querySelector('#editor-cover');
        return !!cover && cover.hidden && !/Preparing|正在准备/.test(document.body.innerText);
      });
      if (ready) { readyMs = Date.now() - t0; break; }
    }
    results.push({ site: base, round, readyMs, mb: +(bytes / 1e6).toFixed(1) });
    console.log(JSON.stringify(results.at(-1)));
    await page.close();
  }
  await ctx.close();
  fs.rmSync(dir, { recursive: true, force: true });
}
const table = ['| site | round | editable after | transferred |', '|---|---|---|---|',
  ...results.map(r => `| ${r.site} | ${r.round} | ${r.readyMs === null ? 'not ready in 5 min' : (r.readyMs / 1000).toFixed(1) + ' s'} | ${r.mb} MB |`)].join('\n');
if (process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, `### Web version first open\n\n${table}\n`);
console.log(table);
