/**
 * 口令登录的失败计次与锁定。
 *
 * 上这个的直接原因：`/api/auth/exchange-key` 是**匿名**端点，验对口令就发一枚
 * `awdk_` Bearer Key（吊销前一直有效、任何地方都能用）。没有计次的话它就是一个
 * 无限次数的口令试探口，而这个站背后是支付与 Credits。
 *
 * 顺手也接到 `/api/auth/login` 上：那条此前同样没有任何防爆破，只是返回 Cookie
 * 而不是 Key。只护住新端点、把旧端点晾着，等于攻击者换个 URL 就绕过去了。
 *
 * **只记失败**：成功即清零，正常用户永远碰不到这条闸。
 * 手机号密码登录同样走这里；首次验证码自带 5 次作废 + 60 秒冷却 + 单号日配额。
 */
import { getDb } from './db';
import { normalizeLoginAccount } from './users';

/** 同一账号在窗口内允许的失败次数。 */
export const MAX_ACCOUNT_FAILURES = 10;
/** 同一 IP 在窗口内允许的失败次数（同办公室共用出口，比账号宽松）。 */
export const MAX_IP_FAILURES = 30;
/** 统计与锁定窗口。 */
export const WINDOW_MS = 15 * 60 * 1000;

export type ThrottleScope = 'account' | 'ip';

function countFailures(scope: ThrottleScope, key: string, now: number): number {
  const row = getDb()
    .prepare('SELECT COUNT(*) AS n FROM login_attempt WHERE scope = ? AND key = ? AND failedAt > ?')
    .get(scope, key, now - WINDOW_MS) as { n: number };
  return row.n;
}

/**
 * 尝试之前调用。已被锁定则返回 false（调用方回 429，**不要**顺带透露账号是否存在）。
 * 账号为空串时只查 IP——不能让空账号把所有请求都算到同一个桶里。
 */
export function loginAllowed(account: string, ip: string): boolean {
  const now = Date.now();
  const acc = normalizeLoginAccount(account);
  if (acc && countFailures('account', acc, now) >= MAX_ACCOUNT_FAILURES) return false;
  if (ip && countFailures('ip', ip, now) >= MAX_IP_FAILURES) return false;
  return true;
}

/** 口令错时调用。 */
export function recordLoginFailure(account: string, ip: string): void {
  const now = Date.now();
  const db = getDb();
  const acc = normalizeLoginAccount(account);
  const insert = db.prepare('INSERT INTO login_attempt (scope, key, failedAt) VALUES (?, ?, ?)');
  if (acc) insert.run('account', acc, now);
  if (ip) insert.run('ip', ip, now);
  // 顺手清理过期记录，避免这张表无限增长
  db.prepare('DELETE FROM login_attempt WHERE failedAt < ?').run(now - WINDOW_MS);
}

/** 登录成功时调用：清掉该账号的失败记录，正常用户不会被自己之前的手误拖住。 */
export function clearLoginFailures(account: string): void {
  const acc = normalizeLoginAccount(account);
  if (!acc) return;
  getDb().prepare('DELETE FROM login_attempt WHERE scope = ? AND key = ?').run('account', acc);
}

/** 取客户端 IP。反代后面看 x-forwarded-for 的第一段。 */
export function clientIp(request: Request): string {
  const xff = request.headers.get('x-forwarded-for') || '';
  const first = xff.split(',')[0]?.trim();
  return first || request.headers.get('x-real-ip') || '';
}
