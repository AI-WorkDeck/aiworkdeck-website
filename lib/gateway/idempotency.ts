import { getDb, withTransaction } from '@/lib/db';
import { GatewayError } from './errors';

/**
 * 幂等去重。
 *
 * **为什么必须有**：网关的失败退款只覆盖「我们自己观测到的上游失败」这一侧。
 * 另一侧是「客户端超时了，而服务端其实已经调通上游并扣了费」——桌面端一重试
 * 就是再扣一次钱、再向上游付一次费，两笔在日志里都是成功。
 * 而 OCR、TTS、听悟建任务超过几秒是常态，这不是罕见路径。
 *
 * 形态照 lib/orders.ts 已有的 idempotencyKey / findOrderByIdempotencyKey /
 * markOrderPaid 的 alreadyPaid 语义，不发明新的。
 *
 * 状态机：
 *   (无) --claim--> in_flight --complete--> done      （重复请求回放原响应）
 *                             --fail-----> failed    （重复请求允许重跑）
 *
 * failed 之所以允许重跑：失败的调用没有扣费，也没有交付，重试是用户想要的行为。
 * done 之所以不许重跑：那一笔已经扣过费了。
 */

export type GatewayRequestStatus = 'in_flight' | 'done' | 'failed';

interface RequestRow {
    id: number;
    userId: string;
    idempotencyKey: string;
    service: string;
    op: string;
    status: GatewayRequestStatus;
    responseJson: string | null;
    spendLedgerId: number | null;
    createdAt: string;
    completedAt: string | null;
}

export type ClaimResult =
    /** 本次请求拿到了执行权，可以去调上游 */
    | { kind: 'claimed' }
    /** 同一个键之前已经完成过，直接回放当时的响应 */
    | { kind: 'replay'; response: unknown };

/** 幂等键的格式约束：足够长以避免碰撞，足够短以免被当成注入向量。 */
const KEY_PATTERN = /^[A-Za-z0-9_-]{8,128}$/;

export function assertValidKey(key: string | null | undefined): string {
    if (!key || !KEY_PATTERN.test(key)) {
        throw new GatewayError(
            'bad_request',
            '缺少或格式不合法的 Idempotency-Key（8-128 位字母数字、下划线或连字符）'
        );
    }
    return key;
}

/**
 * 尝试占用一个幂等键。
 *
 * 并发安全靠 (userId, idempotencyKey) 的唯一索引 + `withTransaction` 的 BEGIN IMMEDIATE：
 * 两个并发请求里只有一个能插进去，另一个读到 in_flight 行并被回 409。
 */
export function claim(
    userId: string,
    idempotencyKey: string,
    service: string,
    op: string,
    nowIso = new Date().toISOString()
): ClaimResult {
    return withTransaction((d) => {
        const existing = d
            .prepare('SELECT * FROM gateway_request WHERE userId = ? AND idempotencyKey = ?')
            .get(userId, idempotencyKey) as RequestRow | undefined;

        if (existing) {
            if (existing.status === 'done') {
                return {
                    kind: 'replay' as const,
                    response: existing.responseJson ? JSON.parse(existing.responseJson) : null,
                };
            }
            if (existing.status === 'in_flight') {
                throw new GatewayError('in_flight', '同一次操作的上一个请求仍在处理中，请稍候', {
                    idempotencyKey,
                });
            }
            // failed：允许重跑，把行改回 in_flight
            d.prepare(
                "UPDATE gateway_request SET status = 'in_flight', service = ?, op = ?, createdAt = ?, completedAt = NULL WHERE id = ?"
            ).run(service, op, nowIso, existing.id);
            return { kind: 'claimed' as const };
        }

        d.prepare(
            `INSERT INTO gateway_request (userId, idempotencyKey, service, op, status, createdAt)
             VALUES (?, ?, ?, ?, 'in_flight', ?)`
        ).run(userId, idempotencyKey, service, op, nowIso);
        return { kind: 'claimed' as const };
    });
}

export function complete(
    userId: string,
    idempotencyKey: string,
    response: unknown,
    spendLedgerId: number | null,
    nowIso = new Date().toISOString()
): void {
    withTransaction((d) => {
        d.prepare(
            `UPDATE gateway_request
                SET status = 'done', responseJson = ?, spendLedgerId = ?, completedAt = ?
              WHERE userId = ? AND idempotencyKey = ?`
        ).run(JSON.stringify(response ?? null), spendLedgerId, nowIso, userId, idempotencyKey);
    });
}

export function fail(
    userId: string,
    idempotencyKey: string,
    nowIso = new Date().toISOString()
): void {
    withTransaction((d) => {
        d.prepare(
            `UPDATE gateway_request
                SET status = 'failed', completedAt = ?
              WHERE userId = ? AND idempotencyKey = ?`
        ).run(nowIso, userId, idempotencyKey);
    });
}

/** 仅供测试与回收任务：读一行。 */
export function findRequest(userId: string, idempotencyKey: string): RequestRow | null {
    const row = getDb()
        .prepare('SELECT * FROM gateway_request WHERE userId = ? AND idempotencyKey = ?')
        .get(userId, idempotencyKey) as RequestRow | undefined;
    return row ?? null;
}

/**
 * 清扫卡在 in_flight 的行：进程在调上游的过程中被杀掉会留下这种行，
 * 而它会把同一个幂等键永久锁死在 409。超过阈值一律降级为 failed（允许重跑）。
 *
 * 阈值取所有服务里最长的那个超时上限再放宽一倍，避免把真的还在跑的请求判死。
 */
export function reclaimStaleInFlight(
    olderThanIso: string
): { reclaimed: number } {
    const res = withTransaction((d) =>
        d
            .prepare(
                "UPDATE gateway_request SET status = 'failed', completedAt = ? WHERE status = 'in_flight' AND createdAt < ?"
            )
            .run(new Date().toISOString(), olderThanIso)
    );
    return { reclaimed: res.changes };
}
