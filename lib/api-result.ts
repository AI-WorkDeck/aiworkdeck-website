/**
 * 客户端读 API 响应体的统一收口。
 *
 * **为什么不能直接 `await res.json()`**：本仓库合并 master 即自动部署
 * （.github/workflows/ci.yml），部署窗口里 `npm run build` 就地覆盖 `.next`、
 * 紧接着 `pm2 restart`，这段时间 nginx 回的是 502/503/504，body 是 HTML 而不是 JSON。
 * `res.json()` 当场抛异常，落进各处表单的 `catch` 里，最后显示的是
 * 「操作失败，请稍后再试」——和「密码不对」长得一模一样。用户读不出「等一会儿再来」，
 * 只会原地反复重试、或者以为自己账号出了问题。
 *
 * 这里把「上游此刻不在」统一翻译成 `service_unavailable`，由词典给出
 * 「服务正在更新，请稍后重试」。判据有两条，覆盖部署窗口的两个阶段：
 * - 状态码是 502/503/504：`pm2 restart` 期间端口没人听，nginx 直接给的网关错误页；
 * - body 解析不出 JSON：`npm run build` 就地改写 `.next` 期间，老进程加载不到
 *   被换掉的 chunk，Next 回的是 HTML 错误页。本站所有 API 无论成败都回 JSON，
 *   所以「不是 JSON」本身就是上游异常的可靠信号。
 *
 * 这个文件**不 import 任何东西**：它被 `'use client'` 组件用，别把服务端依赖拖进
 * 客户端包（同 lib/sms-constants.ts 里记的那个坑）。
 */

/** 上游不可用时的错误码。词典 `authPage.errors` 里有对应文案。 */
export const SERVICE_UNAVAILABLE = 'service_unavailable';

/**
 * 读响应体。读不出 JSON、或状态码本身就是网关级失败时，返回
 * `{ error: 'service_unavailable' }`——调用方照常走 `t.errors[data.error]` 那条路，
 * 不需要额外分支。
 */
export async function readApiJson(res: Response): Promise<any> {
    if (res.status === 502 || res.status === 503 || res.status === 504) {
        return { error: SERVICE_UNAVAILABLE };
    }
    try {
        return await res.json();
    } catch {
        return { error: SERVICE_UNAVAILABLE };
    }
}
