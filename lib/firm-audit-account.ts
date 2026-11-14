// SPDX-FileCopyrightText: 2026 北京京微资易科技有限公司 and AI WorkDeck contributors
// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * 官网口令登录失败 → 律所审计日志（readiness S20）。只在账号确实存在且属于某个律所时上报；
 * 不存在的账号没有律所可归（防爆破仍由 login-throttle 负责）。不报输入的口令与账号串。
 */
import { orgOf } from './collab-directory';
import { emitFirmAudit } from './firm-audit';
import { clientIp } from './login-throttle';
import { MAX_ACTIVE_KEYS } from './api-keys';
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

/**
 * 账户 Key 签发 / 吊销 → 律所审计日志。只报 Key 行 id 与列表上本来就展示的前缀，绝不报明文或哈希。
 * 挂在路由（调用点）而不是 lib/api-keys.ts 里：后者是 Key 哈希的唯一实现，少动为好。
 */
export function auditAccountKey(
    user: Pick<User, 'id' | 'displayName'>,
    action: 'ACCOUNT_API_KEY_CREATED' | 'ACCOUNT_API_KEY_REVOKED',
    key: { id: number | string; prefix?: string | null; label?: string | null },
    via: 'login' | 'scan_login' | 'user' | 'evicted_by_login',
    request?: Request
): void {
    try {
        const firmId = orgOf(user.id).firmId;
        if (!firmId) return;
        const detail: Record<string, string> = { via };
        if (key.prefix) detail.keyPrefix = key.prefix;
        if (key.label) detail.label = key.label;
        emitFirmAudit({
            firmId,
            action,
            actor: { id: user.id, name: user.displayName },
            target: { type: 'ACCOUNT_KEY', id: String(key.id), label: key.prefix ?? null },
            detail,
            ip: request ? clientIp(request) || null : null,
            userAgent: request ? request.headers.get('user-agent') : null,
        });
    } catch {
        // 旁白，不影响响应
    }
}

/** 登录换 Key：记签发；若登录满上限挤掉了最旧的几枚，再记一条吊销（`activeBefore` 为签发前的有效 Key 数）。 */
export function auditLoginKey(
    user: Pick<User, 'id' | 'displayName'>,
    info: { id: number; prefix: string; label: string | null },
    via: 'login' | 'scan_login',
    activeBefore: number,
    request?: Request
): void {
    auditAccountKey(user, 'ACCOUNT_API_KEY_CREATED', info, via, request);
    if (activeBefore >= MAX_ACTIVE_KEYS) {
        auditAccountKey(user, 'ACCOUNT_API_KEY_REVOKED', { id: 'oldest', label: `${activeBefore - (MAX_ACTIVE_KEYS - 1)}` }, 'evicted_by_login', request);
    }
}
