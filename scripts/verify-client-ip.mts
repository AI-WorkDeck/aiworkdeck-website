// SPDX-FileCopyrightText: 2026 北京京微资易科技有限公司 and AI WorkDeck contributors
// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * 可信客户端地址（lib/client-ip.ts）与按 IP 的登录锁定。
 *
 * nginx 设 `X-Real-IP $remote_addr` 并**追加** `X-Forwarded-For`：XFF 第一段是客户端自己写的。
 * 此前 login-throttle 取第一段，攻击者每次换一个假的第一段，按 IP 的失败锁定（15 分钟 30 次）就永远不触发，
 * 可以对任意多个账号撒口令。这里模拟 nginx 加的头，断言换第一段绕不过去。
 *
 * 必须在空目录里执行：npx tsx --tsconfig <repo>/tsconfig.json <repo>/scripts/verify-client-ip.mts
 */
import fs from 'fs';
import path from 'path';
import assert from 'assert';

const cwd = process.cwd();
assert.ok(!fs.existsSync(path.join(cwd, 'package.json')), '必须在隔离目录运行');
fs.mkdirSync(path.join(cwd, 'data'), { recursive: true });
fs.writeFileSync(path.join(cwd, 'data', 'users.json'), '[]');

const { trustedClientIp } = await import('@/lib/client-ip');
const { clientIp, MAX_IP_FAILURES } = await import('@/lib/login-throttle');
const { NextRequest } = await import('next/server');
const loginRoute = await import('@/app/api/auth/login/route');
const exchangeRoute = await import('@/app/api/auth/exchange-key/route');

let passed = 0;
const ok = (n: string) => { passed++; console.log('  PASS', n); };
const req = (h: Record<string, string>) => new Request('http://localhost/x', { headers: h });

assert.equal(trustedClientIp(req({ 'x-real-ip': '198.51.100.4', 'x-forwarded-for': '6.6.6.6, 198.51.100.4' })), '198.51.100.4');
assert.equal(trustedClientIp(req({ 'x-forwarded-for': '6.6.6.6, 7.7.7.7, 198.51.100.9' })), '198.51.100.9');
assert.equal(trustedClientIp(req({})), '');
assert.equal(clientIp(req({ 'x-real-ip': '198.51.100.4', 'x-forwarded-for': '6.6.6.6, 198.51.100.4' })), '198.51.100.4');
ok('X-Real-IP 优先，否则 XFF 最后一段；客户端写的第一段不用');

// 同一真实来源，每次换一个伪造的 XFF 第一段，对不同账号撒口令：第 MAX_IP_FAILURES 次之后必须 429
async function spray(route: { POST: (r: InstanceType<typeof NextRequest>) => Promise<Response> }, url: string, realIp: string, withRealIpHeader: boolean) {
    const statuses: number[] = [];
    for (let i = 0; i <= MAX_IP_FAILURES; i++) {
        const headers: Record<string, string> = {
            'content-type': 'application/json',
            'x-forwarded-for': `10.${i}.${i}.${i}, ${realIp}`,
        };
        if (withRealIpHeader) headers['x-real-ip'] = realIp;
        const r = await route.POST(new NextRequest(url, {
            method: 'POST', headers, body: JSON.stringify({ account: `spray-${realIp}-${i}@test.local`, password: 'Wrong-pass-1' }),
        }));
        statuses.push(r.status);
    }
    return statuses;
}
let s = await spray(loginRoute, 'http://localhost/api/auth/login', '203.0.113.50', true);
assert.deepEqual(s.slice(0, MAX_IP_FAILURES), Array(MAX_IP_FAILURES).fill(401));
assert.equal(s[MAX_IP_FAILURES], 429, `/api/auth/login: rotating the spoofed first XFF hop must not evade the IP lock (got ${s[MAX_IP_FAILURES]})`);
ok('/api/auth/login：换伪造的第一段绕不过按 IP 的锁定（X-Real-IP）');

s = await spray(exchangeRoute, 'http://localhost/api/auth/exchange-key', '203.0.113.51', false);
assert.equal(s[MAX_IP_FAILURES], 429, `/api/auth/exchange-key: rotating the spoofed first XFF hop must not evade the IP lock (got ${s[MAX_IP_FAILURES]})`);
ok('/api/auth/exchange-key：只有 XFF（无 X-Real-IP）时按最后一段计，同样绕不过');

console.log(`\nverify-client-ip: ${passed} passed`);
