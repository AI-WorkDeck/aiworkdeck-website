// SPDX-FileCopyrightText: 2026 北京京微资易科技有限公司 and AI WorkDeck contributors
// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * 可信的客户端地址：所有按 IP 计数、限流、记录的地方都从这里取。
 *
 * 我们的 nginx（DEPLOY.md）对每个反代都设
 *   proxy_set_header X-Real-IP $remote_addr;
 *   proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
 * 所以 `X-Real-IP` 总是 nginx 看到的真实对端（客户端带来的同名头会被覆盖），
 * 而 `X-Forwarded-For` 是**追加**的：第一段是客户端自己写的，可以任意伪造，只有最后一段是 nginx 加的。
 * 此前各处取 XFF 第一段——换一个假的第一段就能绕过按 IP 的登录锁定与发码限流。
 *
 * 取法：`X-Real-IP`；没有时取 XFF 最后一段；都没有（本地开发直连）回空串。
 */
export function trustedClientIp(request: Request): string {
    const real = request.headers.get('x-real-ip')?.trim();
    if (real) return real;
    const parts = (request.headers.get('x-forwarded-for') ?? '').split(',').map(p => p.trim()).filter(Boolean);
    return parts.length ? parts[parts.length - 1] : '';
}
