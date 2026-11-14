// SPDX-FileCopyrightText: 2026 北京京微资易科技有限公司 and AI WorkDeck contributors
// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * 官网口令登录失败 → 律所审计日志（readiness S20）。只在账号确实存在且属于某个律所时上报；
 * 不存在的账号没有律所可归（防爆破仍由 login-throttle 负责）。不报输入的口令与账号串。
 */
import { orgOf } from './collab-directory';
import { emitFirmAudit } from './firm-audit';
import { clientIp } from './login-throttle';
import type { User } from './users';

export function auditWebsiteLoginFailure(user: User | null | undefined, via: 'password' | 'exchange_key', request: Request): void {
    try {
        if (!user) return;
        const firmId = orgOf(user.id).firmId;
        if (!firmId) return;
        emitFirmAudit({
            firmId,
            action: 'WEBSITE_LOGIN_FAILED',
            failed: true,
            actor: { id: user.id, name: user.displayName },
            detail: { via },
            ip: clientIp(request) || null,
            userAgent: request.headers.get('user-agent'),
        });
    } catch {
        // 旁白，不影响登录响应
    }
}
