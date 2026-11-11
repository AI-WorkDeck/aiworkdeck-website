import 'server-only';

import crypto from 'crypto';

/**
 * dl.aiworkdeck.com（阿里云 CDN）下载直链的 URL 鉴权签名（type A，dev-board#294）。
 *
 * CDN 侧开了 URL 鉴权之后，裸链接一律 403——只有带有效 auth_key 的限时链接能下载，
 * 这是防盗链/防刷流量的闸（签名只由 /api/download 服务端发出）。
 *
 * type A 规格：auth_key = {ts}-{rand}-{uid}-{md5(URI-ts-rand-uid-key)}，
 * ts 为签发时刻的 unix 秒，有效窗口由 CDN 侧配置（当前 3600s）。
 *
 * 密钥 `AWD_DL_AUTH_KEY` 在两台 ECS 官网目录 `.env.local`（与 CDN 域名配置同值，
 * 位置登记在 EXTERNAL_SERVICES.md）。**未配置时原样返回**：代码先部署、密钥后注入
 * 的中间态必然存在，此时 CDN 鉴权也尚未开启，裸链接仍可下载，不能让签名层抛错断流。
 */
export function signDownloadUrl(raw: string): string {
    const key = process.env.AWD_DL_AUTH_KEY;
    if (!key) return raw;

    let u: URL;
    try {
        u = new URL(raw);
    } catch {
        return raw;
    }
    // 只签自家 CDN 域名；GitHub 兜底直链等第三方 URL 原样放行
    if (u.hostname !== 'dl.aiworkdeck.com') return raw;

    const ts = Math.floor(Date.now() / 1000);
    const rand = crypto.randomBytes(8).toString('hex');
    const uid = '0';
    const digest = crypto
        .createHash('md5')
        .update(`${u.pathname}-${ts}-${rand}-${uid}-${key}`)
        .digest('hex');
    u.searchParams.set('auth_key', `${ts}-${rand}-${uid}-${digest}`);
    return u.toString();
}
