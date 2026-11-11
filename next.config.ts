import type { NextConfig } from "next";

/**
 * 全站 CSP。口径说明见下方 headers() 的注释；这里只把 `frame-ancestors` 留成参数，
 * 让 `/captcha-embed` 复用同一份策略、只放开被谁嵌这一条——其余指令逐字相同，
 * 不许为那一页另抄一份（抄了就会有一天两份不同步）。
 */
function contentSecurityPolicy(frameAncestors: string): string {
  return [
    "default-src 'self'",
    "script-src 'self' 'unsafe-inline' https://challenges.cloudflare.com https://*.alicdn.com",
    // 阿里云验证码 2.0 的 CSS 从 g.alicdn.com 动态注入（2026-08-24 上线后生产实测抓到被拦），style 也要放行 *.alicdn.com
    "style-src 'self' 'unsafe-inline' https://*.alicdn.com",
    // 双主站互引（互跳横幅的对侧 logo、Next Link 跨站预取）：两站域名互放
    // dl.aiworkdeck.com：首页与 /videos 的视频封面（经 /api/video 302 到 CDN 签名链接）
    "img-src 'self' data: blob: https://*.alicdn.com https://*.aliyuncs.com https://www.aiworkdeck.com https://aiworkdeck.com https://www.workdeck.ai https://workdeck.ai https://dl.aiworkdeck.com",
    // 宣传片与操作教程托管在 CDN dl.aiworkdeck.com（lib/videos.ts）
    "media-src 'self' https://dl.aiworkdeck.com",
    "font-src 'self' data:",
    "connect-src 'self' https://challenges.cloudflare.com https://*.aliyuncs.com https://*.alicdn.com https://www.aiworkdeck.com https://aiworkdeck.com https://www.workdeck.ai https://workdeck.ai",
    "frame-src https://challenges.cloudflare.com https://*.aliyuncs.com",
    "worker-src 'self' blob:",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    `frame-ancestors ${frameAncestors}`,
  ].join("; ");
}

const nextConfig: NextConfig = {
  // Full-width product UI needs a higher-quality variant to keep small text sharp.
  images: { qualities: [75, 90] },
  // 生产构建跳过类型检查与 lint。
  //
  // 背景（2026-07-27 线上事故）：生产机只有 1.8G 内存且同时跑着另外三个站点，
  // `next build` 的 TypeScript 检查阶段被内核 OOM killer 杀掉（编译本身 17 秒就过了）。
  // 更糟的是失败的 build 已经覆盖了旧的 .next，留下没有 BUILD_ID、没有 CSS 的残缺产物，
  // PM2 里的老进程照旧读它——站点返回 200 但样式全裸。
  //
  // 类型检查不是被取消，是移到开发端：提交前跑 `npm run check`（= tsc --noEmit）。
  // 生产构建重复做一遍，既拖慢部署，又正好是这台机器扛不住的那一步。
  //
  // 注：Next 16 已不在 build 阶段跑 ESLint（`eslint.ignoreDuringBuilds` 配置项
  // 也随之从 NextConfig 类型中移除），所以只需处理 TypeScript 这一项。
  // `npm run lint` 目前有 54 个历史遗留错误（多为 any 与空接口），是独立的技术债，
  // 没有并进 check —— 否则这道门槛一跑就红，久而久之就会被忽略。
  typescript: {
    ignoreBuildErrors: true,
  },

  // 构建产物目录。默认 `.next`；部署时把它指到暂存目录，构建成功后再原子换入。
  //
  // **为什么必须这样**：`next start` 在跑的时候就地 `next build`，会把正在服务的
  // `.next` 边写边换。已经被请求过的路由不受影响（模块早进了 Node 的 module registry，
  // 不再碰盘），但**任何还没被加载过的路由，整场构建期间都是 500**。
  // 本地实测：18 秒的构建里 83 次冷路由请求有 50 次 500，坏在 +0.8s ~ +20s；
  // 生产机内存小、构建以分钟计，窗口只会更长。低流量站在上次重启后大部分路由都是冷的。
  //
  // 顺带修掉上面那条注释里的 2026-07-27 事故形态：**构建失败不再污染正在服务的产物**。
  // 换入只在构建成功之后发生，构建挂了线上继续跑旧版本，而不是读一份没有 BUILD_ID
  // 的残缺 `.next` 返回 200 裸页。
  //
  // 只有构建时才该设这个变量。`next start` 读的是同一份配置——**别 export 它**，
  // 否则 `pm2 restart --update-env` 会把它带进运行时环境，让线上进程去读暂存目录。
  // scripts/deploy-build-swap.sh 用的是行内赋值，不进 shell 环境。
  distDir: process.env.AWD_BUILD_DIST_DIR || ".next",
  // better-sqlite3 是原生模块，不能被打进 server bundle。
  //
  // ali-oss / 听悟 SDK 同样不能打包，但原因不同：它们（以及底层的 urllib、darabonba）
  // 用运行时 require 按需加载可选依赖（proxy-agent 之类）。打包器静态分析不到，
  // 直接把整个 build 判成 module-not-found 失败。这两个只跑在服务端路由里，
  // 从 node_modules 原样 require 就是它们本来的用法。
  serverExternalPackages: [
    "better-sqlite3",
    "ali-oss",
    "@alicloud/tingwu20230930",
    "@alicloud/ocr-api20210707",
    "@alicloud/openapi-core",
    "@darabonba/typescript",
  ],

  // 不暴露 x-powered-by: Next.js
  poweredByHeader: false,

  // 全站安全响应头（dev-board#141，2026-08-24 外部扫描指出七个头全缺）。
  //
  // 只覆盖走到 Next 进程的请求；nginx 直出的静态段（/update/desktop/、/plugin-packs/、
  // /lowa-engine/）不经过这里，需要的话在 nginx 各自 location 里补。
  // addin.aiworkdeck.com / addin.workdeck.ai 是另一个应用（Office 插件宿主，
  // 必须允许被 Office iframe），不走本配置，别把 frame-ancestors 抄过去。
  //
  // CSP 口径：站点外部资源面很小——脚本只有 Cloudflare Turnstile（国际站验证码）
  // 和阿里云验证码 2.0（o.alicdn.com，国内站）。阿里云验证码的浏览器端回连端点
  // 没有稳定文档，放宽到 *.aliyuncs.com / *.alicdn.com，防止复发 F015 那类
  // 「验证码被自己策略打死」的事故。Next 水合脚本未接 nonce，script-src 需要
  // 'unsafe-inline'——防线主要在「外部脚本域白名单 + object/base/frame-ancestors」。
  async headers() {
    const csp = contentSecurityPolicy("'self'");
    return [
      {
        source: "/:path*",
        headers: [
          { key: "Content-Security-Policy", value: csp },
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
          { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
          { key: "Cross-Origin-Resource-Policy", value: "same-site" },
          { key: "Strict-Transport-Security", value: "max-age=31536000" },
        ],
      },
      // Only the browser IDE/LOWA needs WASM compilation and cross-origin isolation.
      // This overrides the global CSP for /web only; login/captcha stay outside it.
      {
        source: "/web/:path*",
        headers: [
          { key: "Content-Security-Policy", value: "default-src 'self'; script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:; connect-src 'self' blob:; frame-src 'self'; worker-src 'self' blob:; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'self'" },
          { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
          { key: "Cross-Origin-Embedder-Policy", value: "require-corp" },
          { key: "Cross-Origin-Resource-Policy", value: "same-origin" },
          { key: "Cache-Control", value: "no-cache" },
        ],
      },
      // Pinned LOWA's Emscripten bindings generate JavaScript wrappers at runtime.
      // Limit that permission to the editor iframe and its workers, never the IDE or login.
      {
        source: "/web/editor/:path*",
        headers: [{ key: "Content-Security-Policy", value: "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:; connect-src 'self' blob:; frame-src 'self'; worker-src 'self' blob:; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'self'" }],
      },
      // Manifest pins these bytes as Brotli, not an uncompressed WASM/data file.
      {
        source: "/web/editor/lowa/soffice.wasm",
        headers: [
          { key: "Content-Type", value: "application/wasm" },
          { key: "Content-Encoding", value: "br" },
        ],
      },
      {
        source: "/web/editor/lowa/soffice.data",
        headers: [
          { key: "Content-Type", value: "application/octet-stream" },
          { key: "Content-Encoding", value: "br" },
        ],
      },
      // Explicit compressed paths keep original font URLs safe during upgrades/rollback.
      ...["cjk.ttc", "cjk-serif.otf", "cjk-kai.ttf", "cjk-fangsong.ttf"].map((font) => ({
        source: `/web/editor/compressed/${font}`,
        headers: [
          { key: "Content-Encoding", value: "br" },
          { key: "Content-Type", value: font.endsWith(".ttf") ? "font/ttf" : "font/otf" },
        ],
      })),
      // 头像是匿名公开图片（见 app/api/avatar/[userId]/route.ts 顶部注释），
      // 桌面端主窗口是 file:// 源，Chromium 按 CORP same-site 会把它当跨源拦掉
      // （net::ERR_BLOCKED_BY_RESPONSE.NotSameSite，dev-board#609）。这条匹配更
      // 具体，声明在全站规则之后，对同一个 key 覆盖为 cross-origin。
      {
        source: "/api/avatar/:path*",
        headers: [{ key: "Cross-Origin-Resource-Policy", value: "cross-origin" }],
      },
      // 桌面端登录页的人机验证嵌入页（doc/desktop-contract.md「/captcha-embed 嵌入契约」）。
      // 桌面端主窗口是 file:// 源（origin 为 null），没法按来源点名，只能整体放开：
      // `*` 放行所有 http/https 嵌入方，但**不含 file:**——CSP 规定 `*` 只匹配网络 scheme
      // 与本页同 scheme 的 URL。2026-09-23 无头 Chrome 144 实测只写 `*` 时 file:// 父页被拦
      // （控制台原话：'*' matches only URLs with network schemes），所以 `file:` 要单独列出。
      // 敢对这一页放开，是因为它上面只有一个验证码控件：没有登录态、没有按钮能触发任何动作，
      // 产出的 token 只能配本站服务端 secret 核销，一次性、几分钟过期——被恶意站点嵌进去
      // 做点击劫持，也造不成任何损失。
      // 这条匹配更具体，声明在全站规则之后，对同名 key 覆盖。
      //
      // X-Frame-Options 必须一并处理：全站规则发的是 SAMEORIGIN，会把 file:// 父页拦掉，
      // 而 Next 的 headers() 只能覆盖、不能删头。这里写成 ALLOWALL——它不是合法取值
      // （合法值只有 DENY / SAMEORIGIN），浏览器遇到非法值按「没有这个头」处理；
      // 何况现代浏览器在响应带 CSP frame-ancestors 时本来就忽略 X-Frame-Options，
      // 真正生效的是上面那条 frame-ancestors。
      {
        source: "/captcha-embed",
        headers: [
          { key: "Content-Security-Policy", value: contentSecurityPolicy("* file:") },
          { key: "X-Frame-Options", value: "ALLOWALL" },
        ],
      },
    ];
  },

  async rewrites() {
    return [{ source: "/web", destination: "/web/index.html" }];
  },

  async redirects() {
    return [
      // /download-free 是一张站内无人链接的死页：全英文硬编码、三个下载按钮没有 href、
      // 写着不存在的 CLI、还列了个从未发布过的 Intel Mac 版本。页面已删，
      // 线上是 200 可达的 URL，留一条永久重定向指向新的引导页。
      // 无语种前缀的 /download-free 交给 middleware 补语种后再命中这条。
      {
        source: "/:lang(zh|en)/download-free",
        destination: "/:lang/start",
        permanent: true,
      },
      // 录屏 Showcase 下线，换成公众号文章列表页（dev-board#507）。
      {
        source: "/:lang(zh|en)/showcase",
        destination: "/:lang/articles",
        permanent: true,
      },
      // Skill 广场与插件页合并为 Marketplace（dev-board#327）。两个旧首页 URL 都有
      // 外链与收录，301 保住；子路由（/skills/:id、/skills/submit、/plugins/develop 等）
      // 原样保留，不受影响。query（q/sort/cat）由 Next 自动透传。
      {
        source: "/:lang(zh|en)/skills",
        destination: "/:lang/marketplace",
        permanent: true,
      },
      {
        source: "/:lang(zh|en)/plugins",
        destination: "/:lang/marketplace/plugins",
        permanent: true,
      },
      // 下面两条从前是页面里的 `redirect()`。Next 的 `redirect()` 发 307（临时），
      // 而这两个路径都是「页面没了，去这里」的永久搬迁：307 让 Google 一直保留旧 URL
      // 并反复回来抓，301 才会把权重并过去。搬到这里同时省掉两次渲染。
      //
      // Office 插件不再有独立说明页（2026-08-19 维护者拍板），安装器下载按钮在 /start 第一步。
      {
        source: "/:lang(zh|en)/plugins/office",
        destination: "/:lang/start",
        permanent: true,
      },
      // 「提交需求」是全站右下角的悬浮按钮 + 弹窗（dev-board#240），不是独立页面。
      // 带上 ?feature-request=1，FeatureRequestWidget 读到参数自动弹开。
      {
        source: "/:lang(zh|en)/feature-request",
        destination: "/:lang?feature-request=1",
        permanent: true,
      },
    ];
  },
};

export default nextConfig;
