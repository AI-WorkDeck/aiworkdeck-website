/**
 * 云端反馈收件箱（addin.aiworkdeck.com，桌面端仓 checkba_cloud 的 backend.jar）的服务端代理配置。
 *
 * 后台「用户反馈」分区不直连收件箱：凭据是收件箱的优化者取件密钥
 * （与维护者机器上优化者用的是同一把，FEEDBACK_OPTIMIZER_TOKEN），只能留在服务端；
 * 浏览器一律经 /api/admin/feedback/* 代理，admin cookie 鉴权在代理层完成。
 *
 * 环境变量（两台官网实例都要配）：
 * - AWD_FEEDBACK_INBOX_TOKEN  取件密钥（值同收件箱 env 的 FEEDBACK_OPTIMIZER_TOKEN）
 * - AWD_FEEDBACK_INBOX_BASE   收件箱地址，默认 https://addin.aiworkdeck.com
 */

const DEFAULT_BASE = 'https://addin.aiworkdeck.com';

export function inboxBase(): string {
  return (process.env.AWD_FEEDBACK_INBOX_BASE || DEFAULT_BASE).trim().replace(/\/$/, '');
}

function inboxToken(): string {
  return (process.env.AWD_FEEDBACK_INBOX_TOKEN || '').trim();
}

/** 未配密钥时分区显示配置指引而不是空列表——「没配」与「没反馈」必须长得不一样。 */
export function inboxConfigured(): boolean {
  return inboxToken().length > 0;
}

/** 带取件密钥打收件箱。凭据只在这里出现，不进 URL、不到浏览器。 */
export function inboxFetch(path: string): Promise<Response> {
  return fetch(`${inboxBase()}${path}`, {
    headers: { 'X-Optimizer-Token': inboxToken() },
    cache: 'no-store',
  });
}
