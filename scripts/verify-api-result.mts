/**
 * 部署窗口降级验证：`lib/api-result.ts` 把「上游此刻不在」翻译成 `service_unavailable`，
 * 词典两语都有对应文案，登录/注册/补绑三个表单都走这条路而不是裸 `res.json()`。
 *
 *   npx tsx --tsconfig <repo>/tsconfig.json <repo>/scripts/verify-api-result.mts
 *
 * 起因：合并 master 即自动部署，`npm run build` 就地覆盖 .next + `pm2 restart` 的那段
 * 时间里 nginx 回 502、body 是 HTML。裸 `res.json()` 当场抛，表单显示「操作失败，
 * 请稍后再试」——与「密码不对」无法区分，用户只会原地重试。
 */
import assert from 'assert';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const { readApiJson, SERVICE_UNAVAILABLE } = await import('@/lib/api-result');

// --- 1. 网关级状态码：不解析 body，直接判上游不在 --------------------------
// pm2 restart 期间端口没人听，nginx 给的是自己的 HTML 错误页
for (const status of [502, 503, 504]) {
  const res = new Response('<html><body><h1>502 Bad Gateway</h1></body></html>', {
    status,
    headers: { 'Content-Type': 'text/html' },
  });
  const data = await readApiJson(res);
  assert.strictEqual(data.error, SERVICE_UNAVAILABLE, `${status} 应判为 service_unavailable`);
}
console.log('[1] 502/503/504 -> service_unavailable  OK');

// --- 2. body 不是 JSON：同样判上游不在 --------------------------------------
// `npm run build` 就地改写 .next 期间，老进程加载不到被换掉的 chunk，Next 回 HTML
assert.strictEqual(
  (await readApiJson(new Response('<html>Internal Server Error</html>', { status: 500 }))).error,
  SERVICE_UNAVAILABLE,
  '500 + HTML body 应判为 service_unavailable'
);
assert.strictEqual(
  (await readApiJson(new Response('', { status: 500 }))).error,
  SERVICE_UNAVAILABLE,
  '空 body 应判为 service_unavailable'
);
console.log('[2] 非 JSON body -> service_unavailable  OK');

// --- 3. 正常 JSON 一律原样透传，不许被降级吃掉 -------------------------------
// 这条守的是反向风险：把「密码不对」也说成「服务正在更新」，用户会一直等下去
const creds = await readApiJson(
  new Response(JSON.stringify({ error: 'invalid_credentials' }), {
    status: 401,
    headers: { 'Content-Type': 'application/json' },
  })
);
assert.strictEqual(creds.error, 'invalid_credentials', '业务错误码必须原样透传');

const okBody = await readApiJson(
  new Response(JSON.stringify({ ok: true, mustBindPhone: true }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  })
);
assert.strictEqual(okBody.ok, true);
assert.strictEqual(okBody.mustBindPhone, true, '成功响应的字段不能丢');
console.log('[3] 正常 JSON 原样透传  OK');

// --- 4. 两语词典都要有文案 ---------------------------------------------------
// 少一条不会报错，只会静默回落到 generic——那正是这次要修掉的那句话
for (const lang of ['zh', 'en']) {
  const dict = JSON.parse(fs.readFileSync(path.join(repo, 'dictionaries', `${lang}.json`), 'utf8'));
  const text = dict?.authPage?.errors?.[SERVICE_UNAVAILABLE];
  assert.ok(text, `dictionaries/${lang}.json 缺 authPage.errors.${SERVICE_UNAVAILABLE}`);
  console.log(`[4] ${lang}: ${text}`);
}

// --- 5. 三个表单不许再出现裸 res.json() -------------------------------------
// 本次 bug 就长在这里：新加一处 fetch 时顺手写回 `await res.json()`，
// 降级就又失效了，而且失效得毫无动静。
for (const rel of ['app/[lang]/account/AuthForms.tsx', 'app/[lang]/account/BindPhoneGate.tsx']) {
  const src = fs.readFileSync(path.join(repo, rel), 'utf8');
  assert.ok(
    !/await\s+res\.json\(\)/.test(src),
    `${rel} 里有裸 await res.json()：部署窗口会退回「操作失败」。改用 lib/api-result 的 readApiJson(res)`
  );
  assert.ok(src.includes('readApiJson'), `${rel} 应当用 readApiJson 读响应体`);
}
console.log('[5] 登录/注册/补绑表单都走 readApiJson  OK');

console.log('verify-api-result: 全部通过');
