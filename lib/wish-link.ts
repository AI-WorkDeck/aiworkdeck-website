// SPDX-FileCopyrightText: 2026 北京京微资易科技有限公司 and AI WorkDeck contributors
// SPDX-License-Identifier: AGPL-3.0-or-later

/**
 * 许愿短链 /wish（2026-11-16 金杜 AI 元力营「法律人的第一个 GitHub PR」课堂带练用）。
 *
 * 目标是 GitHub 新建文件页，预填 community/wishes/ 路径与愿望模板（与主仓 community/wishes/README.md 一致）。
 * 由 middleware 用 NextResponse.redirect 发 307，而**不放进 next.config.ts 的 redirects()**：
 * Next 会把 redirects() 目标里的查询参数解码后原样写进 Location 头，模板里的中文让 Node 报
 * ERR_INVALID_CHAR，整条请求 500（2026-11-12 线上实测）。NextResponse.redirect 保留百分号编码。
 * 只发 307——模板或目标仓库调整时改这里即可，不让浏览器缓存成永久跳转。
 */
const WISH_TEMPLATE = [
  "# 我的愿望",
  "",
  "- 许愿人：（姓名或化名）",
  "- 业务领域：（如 商标 / 专利 / 争议解决 / 公司）",
  "- 这件麻烦事：",
  "- 用户会怎么说：",
  "- 先问什么：",
  "- 步骤和标准：",
  "- 怎么算做完：",
  "",
].join("\n");

export const WISH_URL =
  "https://github.com/AI-WorkDeck/aiworkdeck/new/master/community/wishes" +
  `?filename=${encodeURIComponent("你的GitHub用户名.md")}&value=${encodeURIComponent(WISH_TEMPLATE)}`;

/** /wish 或任一语种前缀下的 /<lang>/wish（容忍尾斜杠）。 */
export function isWishPath(pathname: string, locales: readonly string[]): boolean {
  const p = pathname.endsWith("/") && pathname.length > 1 ? pathname.slice(0, -1) : pathname;
  return p === "/wish" || locales.some((l) => p === `/${l}/wish`);
}
