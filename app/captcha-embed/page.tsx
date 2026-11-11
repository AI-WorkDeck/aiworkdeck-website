// SPDX-FileCopyrightText: 2026 北京京微资易科技有限公司 and AI WorkDeck contributors
// SPDX-License-Identifier: AGPL-3.0-or-later
import { captchaClientConfig } from '@/lib/captcha';
import { CaptchaEmbed } from './CaptchaEmbed';

/**
 * 给桌面端登录页嵌的人机验证页（契约见 doc/desktop-contract.md「/captcha-embed 嵌入契约」）。
 *
 * 为什么要这一页：桌面端主窗口是 `file://`，Turnstile 按域名放行，在 `file://` 上直接
 * `turnstile.render` 必报 110200。把控件放到本站域名下的页面里、由 iframe 嵌进去，
 * 控件看到的就是本站域名；token 经 postMessage 交回父窗口。
 *
 * 启用与否、用哪家都由服务端判定（`captchaClientConfig()` 要读不带 NEXT_PUBLIC_ 的密钥），
 * 所以必须按请求渲染，不能预渲染成静态页——否则构建机上没密钥，线上就永远是 disabled。
 */
export const dynamic = 'force-dynamic';

export default async function CaptchaEmbedPage({
  searchParams,
}: {
  searchParams: Promise<{ lang?: string; theme?: string }>;
}) {
  const sp = await searchParams;
  const lang = sp.lang === 'zh' ? 'zh' : 'en';
  const theme = sp.theme === 'dark' ? 'dark' : 'light';
  return <CaptchaEmbed config={captchaClientConfig()} lang={lang} theme={theme} />;
}
