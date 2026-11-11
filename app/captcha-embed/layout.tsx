// SPDX-FileCopyrightText: 2026 北京京微资易科技有限公司 and AI WorkDeck contributors
// SPDX-License-Identifier: AGPL-3.0-or-later
import type { Metadata } from 'next';
import { NOINDEX } from '@/lib/page-metadata';

/**
 * `/captcha-embed` 的独立根布局。
 *
 * 本站没有 `app/layout.tsx`，根布局是 `app/[lang]/layout.tsx`（带导航、页脚、全站样式与
 * 悬浮按钮）。这一页要被桌面端当 iframe 嵌进登录页，那些东西一样都不能有，所以另起一个根布局。
 *
 * 刻意**不引 globals.css**：它给 body 铺了底色，嵌进去会在桌面端登录页上盖一块色块。
 * Captcha 组件只用到 `hidden` / `absolute` 两个类，在这里内联补上。
 *
 * 也刻意**不声明 color-scheme**：iframe 文档的 color-scheme 与父页上 iframe 元素的不一致时，
 * 浏览器会给 iframe 画一层不透明底，透明底就没了。明暗只交给控件自己的 theme 参数。
 */
export const metadata: Metadata = {
  title: 'Verification',
  robots: NOINDEX,
};

const EMBED_CSS = 'html,body{margin:0;padding:0;background:transparent;overflow:hidden}.hidden{display:none}.absolute{position:absolute}';

export default function CaptchaEmbedLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html>
      <head>
        <style dangerouslySetInnerHTML={{ __html: EMBED_CSS }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
