import { findUserByApiKey } from './api-keys';
import { getUserByToken, SESSION_COOKIE } from './sessions';
import { User } from './users';

/**
 * 桌面端 Bearer 鉴权 helper（PR-W1）。
 * 解析 `Authorization: Bearer awdk_...`，按哈希查未吊销的 api_keys，返回用户。
 * 解析失败/无效一律返回 null，路由层统一回 401。
 */
export function resolveKeyUser(request: Request): User | null {
  const header = request.headers.get('authorization') || '';
  const match = /^Bearer\s+(\S+)$/i.exec(header.trim());
  if (!match) return null;
  const user = findUserByApiKey(match[1]);
  return user ?? null;
}

/**
 * Bearer 优先、Cookie 会话兜底（dev-board#496）。
 *
 * `/api/account/team/*` 有两类调用方：桌面端经本地后端透传（`Bearer awdk_`），
 * 与官网账户页「我的团队」分区里浏览器直接 fetch（`awd_session` Cookie）。
 * 让账户页也去要一把 Key 是把「拿 Key」这件事塞回用户面前，而 Key 早在
 * v0.18.0 就从账户页删掉了；反过来给桌面端塞 Cookie 更不可能。所以两种都认。
 *
 * **顺序不能反**：带了 Bearer 就以 Bearer 为准。同一台机器上浏览器登着 A、
 * 桌面端连着 B 是常态，先读 Cookie 会让桌面端的请求记到 A 头上。
 *
 * Cookie 从 **request 头**上读，不走 `next/headers` 的 `cookies()`：
 * 后者依赖请求期的 async storage，契约脚本直接调 route handler 时会抛，
 * 于是这条路径永远测不到；从 request 上读则请求里带什么就是什么，可测。
 *
 * CSRF 面与站内其它 Cookie 端点同口径：`awd_session` 是 SameSite=lax，
 * 跨站的 POST/PATCH/DELETE 根本带不上它。这里不另起一套 token，
 * 只保护这十几个端点的机制会与其余端点口径不一，反而更容易漏。
 */
export function resolveSessionOrKeyUser(request: Request): User | null {
  const byKey = resolveKeyUser(request);
  if (byKey) return byKey;
  const raw = request.headers.get('cookie');
  if (!raw) return null;
  for (const part of raw.split(';')) {
    const eq = part.indexOf('=');
    if (eq < 0) continue;
    if (part.slice(0, eq).trim() !== SESSION_COOKIE) continue;
    return getUserByToken(decodeURIComponent(part.slice(eq + 1).trim())) ?? null;
  }
  return null;
}
