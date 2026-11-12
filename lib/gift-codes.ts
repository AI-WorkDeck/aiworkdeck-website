import crypto from 'crypto';
import { getDb, withTransaction } from './db';
import { grantCredits } from './wallet';
import { getFeatureProduct } from './products';
import { getSkill } from './skills-store';
import { getPlugin } from './plugins-store';
import { mapUsernamesByIds } from './users';

/**
 * 兑换码（PR-W4）。
 *
 * 两类：
 * - recharge   ：兑换后按面额入钱包（wallet_ledger 记 kind=recharge）
 * - entitlement：兑换后直接发权益（entitlements 行，orderId 记为 gift:<code>）
 *
 * 码格式 `AWDG-XXXX-XXXX-XXXX`：12 位 base32（A-Z2-7，60 bit 随机）。
 * 与试用码 `AWD-T-` 前缀刻意区分——两者用途完全不同（试用码离线解锁应用，
 * 兑换码是账户侧的钱/权益），混用会让用户在解锁页与账户页之间反复试错。
 *
 * 核销的唯一不变式：**一码只能被核销一次**。实现靠
 * `UPDATE ... WHERE code=? AND redeemedByUserId IS NULL AND revokedAt IS NULL`
 * 的 changes>0 判定抢占，而不是「SELECT 校验 → UPDATE」——后者在多进程部署下
 * 两个请求可以同时通过 SELECT。前置 SELECT 只用于回具体错误原因。
 */

export type GiftCodeKind = 'recharge' | 'entitlement';

export const CODE_PREFIX = 'AWDG';
const CODE_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
const CODE_BODY_LEN = 12;
/** 单次批量生成上限 */
export const MAX_BATCH = 200;
/** 单码面额上限：¥10000（与充值上限同口径） */
export const MAX_GIFT_AMOUNT_CENTS = 1000000;

export interface GiftCodeRow {
  id: number;
  code: string;
  kind: GiftCodeKind;
  payloadJson: string;
  note: string | null;
  createdBy: string;
  createdAt: string;
  redeemedByUserId: string | null;
  redeemedAt: string | null;
  revokedAt: string | null;
}

/** 随机码本体，形如 AWDG-A2B3-C4D5-E6F7 */
function randomCode(): string {
  const bytes = crypto.randomBytes(CODE_BODY_LEN);
  let body = '';
  for (let i = 0; i < CODE_BODY_LEN; i++) {
    body += CODE_ALPHABET[bytes[i] % CODE_ALPHABET.length];
  }
  return `${CODE_PREFIX}-${body.slice(0, 4)}-${body.slice(4, 8)}-${body.slice(8, 12)}`;
}

/**
 * 归一化用户输入：去空白与连字符、转大写，再还原成带连字符的规范形式。
 * 用户从微信里复制常带空格/小写，不归一化会造成「明明发了码却兑不了」的假故障。
 * 非法格式返回 null。
 */
export function normalizeCode(input: unknown): string | null {
  if (typeof input !== 'string' || input.length > 64) return null;
  const compact = input.replace(/[\s-]/g, '').toUpperCase();
  const match = new RegExp(`^${CODE_PREFIX}([A-Z2-7]{${CODE_BODY_LEN}})$`).exec(compact);
  if (!match) return null;
  const body = match[1];
  return `${CODE_PREFIX}-${body.slice(0, 4)}-${body.slice(4, 8)}-${body.slice(8, 12)}`;
}

/**
 * 可赠送的权益名白名单：feature 商品目录 + 存在的付费/免费 Skill、已上架插件。
 * 不做白名单等于允许 admin 手滑造出桌面端永远不认识的 feature 串。
 *
 * 只在**生成**时校验，核销时刻意不复查：条目下架/待审期间复查会把用户手里的有效码
 * 变成不可兑（且用户多半不会再回来重试），而多发一条指向暂时不存在条目的权益是无害的
 * ——下载闸门另有 hasEntitlement 把关，条目重新上架后该权益直接可用。
 */
export function isGrantableFeature(feature: unknown): feature is string {
  if (typeof feature !== 'string' || !feature || feature.length > 128) return false;
  if (getFeatureProduct(feature)) return true;
  if (feature.startsWith('skill:')) return !!getSkill(feature.slice('skill:'.length));
  if (feature.startsWith('plugin:')) {
    const plugin = getPlugin(feature.slice('plugin:'.length));
    return !!plugin && plugin.status === 'approved';
  }
  return false;
}

export type GenerateError = 'invalid_count' | 'invalid_amount' | 'invalid_feature';

export interface GeneratedBatch {
  codes: string[];
}

/**
 * 批量生成。同一批共享 kind/payload/note。
 * 码本体随机重复的概率极低（60 bit），但 UNIQUE 冲突仍要退让重试，
 * 否则一次撞车会让整批失败。
 */
export function generateGiftCodes(input: {
  count: number;
  kind: GiftCodeKind;
  amountCents?: number;
  feature?: string;
  note?: string;
  createdBy: string;
}): GeneratedBatch | { error: GenerateError } {
  const { count, kind, createdBy } = input;
  if (!Number.isInteger(count) || count < 1 || count > MAX_BATCH) {
    return { error: 'invalid_count' };
  }
  let payload: Record<string, unknown>;
  if (kind === 'recharge') {
    const amountCents = input.amountCents;
    if (
      !Number.isInteger(amountCents) ||
      (amountCents as number) < 1 ||
      (amountCents as number) > MAX_GIFT_AMOUNT_CENTS
    ) {
      return { error: 'invalid_amount' };
    }
    payload = { amountCents };
  } else {
    if (!isGrantableFeature(input.feature)) {
      return { error: 'invalid_feature' };
    }
    payload = { feature: input.feature };
  }
  const note = typeof input.note === 'string' ? input.note.trim().slice(0, 200) : '';
  const payloadJson = JSON.stringify(payload);

  return withTransaction((db) => {
    const insert = db.prepare(
      `INSERT INTO gift_codes (code, kind, payloadJson, note, createdBy, createdAt)
       VALUES (?, ?, ?, ?, ?, ?)`
    );
    const createdAt = new Date().toISOString();
    const codes: string[] = [];
    for (let i = 0; i < count; i++) {
      let inserted = false;
      for (let attempt = 0; attempt < 5 && !inserted; attempt++) {
        const code = randomCode();
        try {
          insert.run(code, kind, payloadJson, note || null, createdBy, createdAt);
          codes.push(code);
          inserted = true;
        } catch (e) {
          // UNIQUE 冲突才重试；其他错误照抛，整批回滚
          if (!String(e).includes('UNIQUE')) throw e;
        }
      }
      if (!inserted) throw new Error('兑换码生成连续撞车，请重试');
    }
    db.prepare('INSERT INTO admin_audit (ts, action, detail) VALUES (?, ?, ?)').run(
      createdAt,
      'gift_codes_generate',
      JSON.stringify({ count, kind, payload, note, createdBy })
    );
    return { codes };
  });
}

/** 撤销一枚未核销的码。已核销/已撤销/不存在都返回 false（调用方回 409）。 */
export function revokeGiftCode(code: string, operator: string): boolean {
  return withTransaction((db) => {
    const now = new Date().toISOString();
    const result = db
      .prepare(
        `UPDATE gift_codes SET revokedAt = ?
          WHERE code = ? AND redeemedByUserId IS NULL AND revokedAt IS NULL`
      )
      .run(now, code);
    if (result.changes === 0) return false;
    db.prepare('INSERT INTO admin_audit (ts, action, detail) VALUES (?, ?, ?)').run(
      now,
      'gift_code_revoke',
      JSON.stringify({ code, operator })
    );
    return true;
  });
}

export type RedeemError =
  | 'invalid_code'
  | 'not_found'
  | 'already_redeemed'
  | 'revoked'
  | 'already_owned';

export interface RedeemSuccess {
  ok: true;
  kind: GiftCodeKind;
  /** recharge：入账金额（分） */
  amountCents?: number;
  /** recharge：入账后的余额（分） */
  balanceCents?: number;
  /** entitlement：发放的权益名 */
  feature?: string;
}

/**
 * 核销并派发。整个过程在一个事务里：抢占 + 入账/发权益要么全成要么全不成。
 * 派发失败（例如余额溢出等异常）会连带回滚核销标记，码不会被白白吃掉。
 */
export function redeemGiftCode(userId: string, rawCode: unknown): RedeemSuccess | { error: RedeemError } {
  const code = normalizeCode(rawCode);
  if (!code) return { error: 'invalid_code' };

  return withTransaction((db) => {
    const row = db.prepare('SELECT * FROM gift_codes WHERE code = ?').get(code) as
      | GiftCodeRow
      | undefined;
    if (!row) return { error: 'not_found' as const };
    if (row.revokedAt) return { error: 'revoked' as const };
    if (row.redeemedByUserId) return { error: 'already_redeemed' as const };

    const payload = JSON.parse(row.payloadJson) as { amountCents?: number; feature?: string };
    // payload 形状校验。生成端有白名单，这里兜的是手工/迁移/导入产生的坏行。
    // 抛错而不是回错误码：这是服务端数据故障，走 500 与「码保持未核销」的回滚语义，
    // 不占用契约里的 5 个用户可见错误码。recharge 一侧由 grantCredits 的金额校验抛错兜底。
    if (row.kind === 'entitlement' && (typeof payload.feature !== 'string' || !payload.feature)) {
      throw new Error(`兑换码 payload 缺少 feature: ${code}`);
    }

    // 权益类：已拥有就不消耗码，让用户还能转赠他人，比吃掉码更合理。
    // 这一步必须在抢占之前，且与抢占同事务，否则并发下两枚码可能被同时吃掉。
    if (row.kind === 'entitlement') {
      const owned = db
        .prepare('SELECT 1 AS x FROM entitlements WHERE userId = ? AND feature = ? LIMIT 1')
        .get(userId, payload.feature);
      if (owned) return { error: 'already_owned' as const };
    }

    const now = new Date().toISOString();
    const claimed = db
      .prepare(
        `UPDATE gift_codes SET redeemedByUserId = ?, redeemedAt = ?
          WHERE code = ? AND redeemedByUserId IS NULL AND revokedAt IS NULL`
      )
      .run(userId, now, code);
    if (claimed.changes === 0) {
      // 上面的 SELECT 到这里之间被别人抢走（多进程）
      return { error: 'already_redeemed' as const };
    }

    if (row.kind === 'recharge') {
      // 兑换码是平台自费发放，入 reward 批次：24 个月有效期、不可提现。
      // 与用户真金白银充值而来的 topup 批次刻意区分开。
      const entry = grantCredits(db, {
        userId,
        pool: 'reward',
        amountCents: payload.amountCents as number,
        ledgerKind: 'gift',
        meta: { giftCode: code, note: row.note ?? undefined },
      });
      return {
        ok: true as const,
        kind: 'recharge' as const,
        amountCents: entry.amountCents,
        balanceCents: entry.balanceAfterCents,
      };
    }

    // 这里**不能**用 INSERT OR IGNORE：OR IGNORE 会把约束冲突（含 feature 为 NULL
    // 的 NOT NULL 冲突）静默降级成 changes=0，而此时核销标记已经写下——用户的码被吃掉、
    // 权益没发、接口还回 ok:true。裸 INSERT 抛错才会连带回滚核销，符合「派发失败码不被白吃」。
    // UNIQUE(userId, feature) 的合法冲突已由上面的 already_owned 检查在同事务内挡掉。
    db.prepare(
      'INSERT INTO entitlements (userId, feature, orderId, createdAt) VALUES (?, ?, ?, ?)'
    ).run(userId, payload.feature, `gift:${code}`, now);
    return { ok: true as const, kind: 'entitlement' as const, feature: payload.feature };
  });
}

export interface GiftCodeView {
  code: string;
  kind: GiftCodeKind;
  /** recharge 面额（分），entitlement 为 null */
  amountCents: number | null;
  /** entitlement 权益名，recharge 为 null */
  feature: string | null;
  note: string | null;
  createdAt: string;
  status: 'available' | 'redeemed' | 'revoked';
  redeemedBy: string | null;
  redeemedAt: string | null;
}

export interface GiftCodeStats {
  total: number;
  available: number;
  redeemed: number;
  revoked: number;
}

/** admin 列表：新的在前。stats 是全表口径，codes 只有当页——两者不要混用。 */
export function listGiftCodes(limit = 200): { codes: GiftCodeView[]; stats: GiftCodeStats } {
  const db = getDb();
  const rows = db
    .prepare('SELECT * FROM gift_codes ORDER BY id DESC LIMIT ?')
    .all(Math.min(Math.max(limit, 1), 500)) as GiftCodeRow[];
  const usernames = mapUsernamesByIds(
    rows.map(r => r.redeemedByUserId).filter((v): v is string => !!v)
  );
  const stats = db
    .prepare(
      `SELECT
         COUNT(*) AS total,
         SUM(CASE WHEN redeemedByUserId IS NULL AND revokedAt IS NULL THEN 1 ELSE 0 END) AS available,
         SUM(CASE WHEN redeemedByUserId IS NOT NULL THEN 1 ELSE 0 END) AS redeemed,
         SUM(CASE WHEN revokedAt IS NOT NULL THEN 1 ELSE 0 END) AS revoked
       FROM gift_codes`
    )
    .get() as { total: number; available: number | null; redeemed: number | null; revoked: number | null };
  return {
    codes: rows.map((r) => {
      let payload: { amountCents?: number; feature?: string } = {};
      try {
        payload = JSON.parse(r.payloadJson);
      } catch {
        payload = {};
      }
      return {
        code: r.code,
        kind: r.kind,
        amountCents: r.kind === 'recharge' ? payload.amountCents ?? null : null,
        feature: r.kind === 'entitlement' ? payload.feature ?? null : null,
        note: r.note,
        createdAt: r.createdAt,
        status: r.revokedAt ? 'revoked' : r.redeemedByUserId ? 'redeemed' : 'available',
        redeemedBy: r.redeemedByUserId
          ? usernames.get(r.redeemedByUserId) ?? r.redeemedByUserId
          : null,
        redeemedAt: r.redeemedAt,
      };
    }),
    stats: {
      total: stats.total,
      available: stats.available ?? 0,
      redeemed: stats.redeemed ?? 0,
      revoked: stats.revoked ?? 0,
    },
  };
}

/**
 * 全部未核销码，不分页。
 * 运营导出必须走这里而不是过滤 listGiftCodes 的当页结果：列表有 LIMIT，
 * 而表头的「未核销 N」是全表口径，两者一混就会出现「界面说 405、导出文件只有 200」
 * 且没有任何提示——剩下的码谁也不会发现它们从没发出去过。
 */
export function listAvailableGiftCodes(): string[] {
  return (
    getDb()
      .prepare(
        `SELECT code FROM gift_codes
          WHERE redeemedByUserId IS NULL AND revokedAt IS NULL
          ORDER BY id DESC`
      )
      .all() as { code: string }[]
  ).map(r => r.code);
}
