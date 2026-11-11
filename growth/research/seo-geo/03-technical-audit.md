> **勘误（2026-09-03，Fable 复核）**：本报告 P0 第 1 条「workdeck.ai 对所有访客（含 Googlebot）301 到国内站」**不成立**。
> 新加坡服务器 `/www/wwwlogs/workdeck.ai.log` 显示 Googlebot（66.249.x）请求 `/en` 得到 200，
> 301 全部来自境内 IP 段（113.215.x、125.70.x 等），与 nginx `geo $awd_from_cn` 的设计一致。
> 审计代理与本机 curl 的出口都在境内，才误判为全站 301。由此派生的 F1、以及 8.2/8.4 中
> 「hreflang 目标是 301 URL」「国际站不存在」的推论一并作废；其余发现（软 404、无 sitemap、
> 裸品牌 title、零 JSON-LD/OG、/about 死链等）均已由 Fable 独立复核属实。
> 另：同一日志显示 Googlebot 只抓过 `/en`、`/zh`、robots.txt，几乎没有内页——没有 sitemap 的代价。
> AI 爬虫极活跃（近 20 万行内：GPTBot 1415、ClaudeBot 1071、OAI-SearchBot 540、PerplexityBot 260 次）。

# AI WorkDeck 官网技术 SEO / GEO 审计报告

- 审计日期：2026-09-03
- 审计对象：`https://www.aiworkdeck.com`（国内站，默认 zh）、`https://www.workdeck.ai`（国际站，默认 en）
- 仓库：`/Users/zewei/Documents/2024-2044/5-Tech/1-1 aiworkdeckweb/.claude/worktrees/nice-pare-6d07fb`（分支 `claude/seo-optimization-strategy-6d40b2`，Next.js 16 App Router）
- 性质：**只读审计**，未修改任何文件、未提交
- 探测出口 IP：中国境内（对国际站 nginx 的地域判定有影响，已用 WebFetch 从境外出口做交叉验证）

---

## 一、执行摘要

### 计分

| 严重度 | 条数 |
|---|---|
| **P0** | 5 |
| **P1** | 7 |
| **P2** | 8 |

### P0（正在造成实际收录损失，应立即处理）

1. **国际站 `workdeck.ai` 对所有访客（含 Googlebot、含境外出口）301 到 `aiworkdeck.com`** —— 国际站等于不存在，英文市场零收录可能。
2. **任意 `/{名字}.{png|jpg|jpeg|webp|svg|gif|mp4|webm}` 路径返回 HTTP 200 + 整份中文首页，且 canonical 自指** —— 无限重复内容页，且每一页都声明自己是权威版本。
3. **全站零 sitemap.xml** —— 仓库无 `app/sitemap.ts`，线上 `/sitemap.xml` 307；robots.txt 也未声明 Sitemap。29 个 Skill 详情页等动态页面完全靠爬虫自己发现。
4. **首页 `<title>` 是裸品牌名 "AI WorkDeck"，description 无任何品类词** —— 首页对搜索引擎完全没有说明「我是给律师用的法律文档工作台」，而 "workdeck" 品牌词已被西班牙公司 Workdeck Solutions SL 占据。
5. **两站收录量估计为 0** —— `site:aiworkdeck.com` 与 `site:workdeck.ai` 均返回零条本域结果；搜索引擎对本产品的全部认知来自 GitHub 仓库描述。

### P1

6. hreflang 的 `en` 目标 `https://www.workdeck.ai/en` 是 301 跳转 URL，Google 会整条丢弃；且无 `x-default`。
7. 全站零 JSON-LD 结构化数据（`SoftwareApplication` / `Organization` / `FAQPage` / `BreadcrumbList` 全缺）。
8. 全站零 `og:*` / `twitter:*` 标签，也没有 `opengraph-image` —— 社交/IM 分享无卡片。
9. `/{lang}/about` 在国内站 404，而 **Footer 全站链接到它** —— 全站范围的内链死链；且该页的存在意义（合规主体公示）因国际站 301 而彻底失效。
10. 首页 + 12 个页面 `force-dynamic`，全站零静态预渲染 —— 无 ISR/CDN 缓存，TTFB 全靠单台 1.8G 内存 ECS 现算。
11. 8 个可索引页面的 description 是继承布局层的同一句 tagline —— 大面积重复 meta description。
12. 无 `llms.txt` / `llms-full.txt`，robots.txt 对 12 个 AI 爬虫无任何显式声明（既没有开放策略也没有限制策略）。

### P2

13. `/{lang}/skills/{id}`（29 页）与 `/{lang}/u/{username}` 的 title 落回 "AI WorkDeck"，description 落回通用 tagline。
14. `<html lang="foo.png">` —— 软 404 页输出非法 lang 属性。
15. 无自定义 `not-found.tsx`。
16. 图片全部为原生 `<img>` + 未压缩 PNG（`Loginpage.png` 980 KB、`logo.png` 224 KB），Lighthouse 提示可省 1723 KiB。
17. 无面包屑导航、无 `BreadcrumbList`。
18. `/{lang}/community` 与 `/{lang}/community/chat` 是空壳（帖子 0 条），却已可索引 —— 薄内容页。
19. `/{lang}/updates` 的 changelog 无 `<time>` 标签、无版本条目的语义标记。
20. Navbar/Footer 未链接到 `/membership`、`/quiz`、`/updates` 的完整集合（`/membership`、`/quiz` 仅 Footer 有），`/plugins/develop`、`/skills/charts` 为半孤儿页。

---

## 二、逐项证据

### 1. 可抓取与可渲染

**结论：渲染层面非常健康。** `app/[lang]/` 下 **零个 `page.tsx` 带 `'use client'`**，全部是 Server Component，正文全部服务端渲染。

```bash
$ grep -rln "use client" "app/[lang]/" --include=page.tsx
# （无输出）
```

curl 抓原始 HTML 后剥掉 `<script>`/`<style>` 统计可见文本：

| 路径 | HTTP | HTML 体积 | SSR 可见正文字数 | h1 数 | h2 数 |
|---|---|---|---|---|---|
| `/en` | 200 | 209 KB | 8315 | 1 | 4 |
| `/zh` | 200 | 204 KB | — | 1 | 4 |
| `/en/start` | 200 | 130 KB | 3292 | 1 | 2 |
| `/en/marketplace` | 200 | 336 KB | 9622 | 1 | 1 |
| `/en/community` | 200 | 109 KB | **768** | 1 | 0 |
| `/en/updates` | 200 | 129 KB | 3604 | 1 | 1 |
| `/en/showcase` | 200 | 107 KB | **1033** | 1 | 1 |
| `/en/membership` | 200 | 116 KB | **1750** | 1 | 0 |
| `/en/quiz` | 200 | 108 KB | **1152** | 1 | 0 |
| `/en/legal/privacy` | 200 | 206 KB | — | 1 | 14 |
| `/en/legal/terms` | 200 | 176 KB | — | 1 | 18 |
| `/en/about` | **404** | 90 KB | — | — | — |

每页恰好 1 个 h1，无重复 h1 —— 这一项合规。

**问题**：`/en/community`、`/en/showcase`、`/en/quiz` 的可见正文均在 1000 字符量级（其中约 300 字符还是 Navbar+Footer 的导航词），属于薄内容页。`/en/community` SSR 输出实测：

```
Community Write long-form posts, start discussions, or just hang out.
Every topic here is started by practitioners like you. New post Open chatroom
All Discussions Blog No posts yet. This page is waiting for your first one.
```

`grep -c '/community/post/'` = **0** —— 论坛一条帖子都没有，页面已可索引。

**严重度**：SSR 本身 = 无问题；薄内容 = **P2**。

---

### 2. robots.txt

```bash
$ curl -sS https://www.aiworkdeck.com/robots.txt
User-agent: *
Allow: /

$ curl -sS https://www.workdeck.ai/robots.txt
<html><head><title>301 Moved Permanently</title></head>...
```

文件位置：`public/robots.txt`（2 行，静态）。`middleware.ts` 的 matcher 已正确把 `robots.txt` 排除在 locale 重定向之外（这一点做对了）。

**AI / 搜索爬虫处理**：`User-agent: *` + `Allow: /` 意味着以下全部**隐式允许**，但**没有一条显式声明**：

| 爬虫 | robots.txt 显式规则 | 实测 UA 探测 `GET /en` |
|---|---|---|
| GPTBot | 无 | 200, 214046 B |
| OAI-SearchBot | 无 | 200, 214046 B |
| ChatGPT-User | 无 | 200, 214046 B |
| PerplexityBot | 无 | 200, 214046 B |
| ClaudeBot | 无 | 200, 214046 B |
| Claude-SearchBot | 无 | 200, 214046 B |
| anthropic-ai | 无 | 200, 214046 B |
| Google-Extended | 无 | 200, 213809 B |
| Bingbot | 无 | 200, 213809 B |
| Applebot | 无 | 200, 213809 B |
| CCBot | 无 | 200, 214046 B |
| Bytespider | 无 | 200, 214046 B |

服务端**不做任何 UA 区分**（体积差异 214046 vs 213809 仅来自语言协商，非 cloaking）—— 这是好事，无 cloaking 风险。

**缺失**：`Sitemap:` 指令完全没有。

**严重度**：无 Sitemap 声明 = **P0**（并入第 3 条）；AI 爬虫无显式策略 = **P1**。

---

### 3. sitemap

```bash
$ curl -sS -o /dev/null -w "%{http_code}\n" https://www.aiworkdeck.com/sitemap.xml
307              # → /zh/sitemap.xml → 404
$ curl -sS -o /dev/null -w "%{http_code}\n" https://www.workdeck.ai/sitemap.xml
301              # → aiworkdeck.com

$ find app -iname "*sitemap*"
# （无输出）
```

仓库中**不存在** `app/sitemap.ts`，`public/sitemap.xml` 也不存在。llms.txt 同样不存在（`/llms.txt` → 307）。

**应进 sitemap 的页面清单**（每条 × 2 语种 × 2 站）：

静态路由（14 条 × 2 lang = 28 URL）：

| 路径 | 备注 |
|---|---|
| `/{lang}` | 首页 |
| `/{lang}/start` | |
| `/{lang}/marketplace` | |
| `/{lang}/marketplace/plugins` | |
| `/{lang}/plugins/develop` | |
| `/{lang}/skills/charts` | |
| `/{lang}/community` | 当前空壳，建议有帖后再进 |
| `/{lang}/community/chat` | 建议不进（聊天室无索引价值） |
| `/{lang}/showcase` | |
| `/{lang}/updates` | |
| `/{lang}/membership` | |
| `/{lang}/quiz` | |
| `/{lang}/legal/privacy` | |
| `/{lang}/legal/terms` | |
| `/{lang}/about` | **仅 intl 站**（国内站 404） |

动态路由与数据源：

| 路由 | 数据源 | 当前规模 | 是否应进 sitemap |
|---|---|---|---|
| `/{lang}/skills/[id]` | `lib/skills-store.ts` → `listSkills()` | 29（从 marketplace 页链接统计） | **应进**（最大的长尾资产） |
| `/{lang}/community/post/[id]` | `lib/forum.ts` → `listPosts()` | 0 | 有帖后应进 |
| `/{lang}/u/[username]` | 用户库 | 未知 | 建议 noindex，不进 |
| `/{lang}/cert/[id]` | 已 `NOINDEX` | — | 不进 |

**严重度**：**P0**。

---

### 4. 每页 metadata

#### 4.1 布局层（`app/[lang]/layout.tsx:22-44`）

```ts
return {
  title: 'AI WorkDeck',                      // ← 硬编码，无 template
  description: dict.common.productTagline,   // ← 全站同一句
  metadataBase: new URL(siteConfig.origin),
};
```

`lib/page-metadata.ts` 的设计（canonical 下沉到页面而非布局）**是正确的**，注释里对「布局层 canonical 会让全站折叠成一页」的分析准确。问题不在这个机制，而在**布局层的 title 没有 `template`，导致所有未自报 title 的页面全部落回裸品牌名**。

#### 4.2 线上实测（Googlebot UA，`curl` 抓 `<head>`）

| 路径 | 线上 `<title>` | 线上 description | canonical | hreflang | og/twitter | h1 |
|---|---|---|---|---|---|---|
| `/en` | **`AI WorkDeck`** | One-Stop Workspace for Document Professionals in the AI Era | `…/en` ✅ | zh-CN→aiworkdeck/zh, en→**workdeck.ai/en（301）** | ❌ | One-Stop Workspace for Document Pros. |
| `/zh` | **`AI WorkDeck`** | AI 时代文档工作者的一站式工作平台 | `…/zh` ✅ | 同上 | ❌ | 一站式文档工作台。 |
| `/en/start` | Two steps to get started with AI WorkDeck · AI WorkDeck | 自有 ✅ | ✅ | ✅（en 指向 301） | ❌ | Two steps to get started… |
| `/en/marketplace` | Marketplace · AI WorkDeck | **继承 tagline** ❌ | ✅ | ✅（en 指向 301） | ❌ | Marketplace |
| `/en/marketplace/plugins` | Plugins · Marketplace · AI WorkDeck | **继承 tagline** ❌ | ✅ | ✅（en 指向 301） | ❌ | Marketplace |
| `/en/community` | Community · AI WorkDeck | 自有 ✅ | ✅ | **无** | ❌ | Community |
| `/en/community/chat` | Chatroom · AI WorkDeck | **继承 tagline** ❌ | ✅ | **无** | ❌ | Chatroom |
| `/en/updates` | Versioning & Updates · AI WorkDeck | **继承 tagline** ❌ | ✅ | ✅（en 指向 301） | ❌ | Versioning & Updates |
| `/en/showcase` | Showcase · AI WorkDeck | **继承 tagline** ❌ | ✅ | ✅（en 指向 301） | ❌ | Showcase |
| `/en/membership` | Membership Tiers · AI WorkDeck | **继承 tagline** ❌ | ✅ | ✅（en 指向 301） | ❌ | Membership Tiers |
| `/en/quiz` | Legal Persona · Which Legal Mind Are You · AI WorkDeck | 自有 ✅ | ✅ | **无** | ❌ | Which legal mind are you? |
| `/en/plugins/develop` | Plugin Development Guide · AI WorkDeck | 自有 ✅ | ✅ | ✅（en 指向 301） | ❌ | Write a plugin |
| `/en/skills/charts` | Skill Charts · AI WorkDeck | 自有 ✅ | ✅ | **无** | ❌ | Skill Charts |
| `/en/legal/privacy` | Privacy Policy · AI WorkDeck | 自有 ✅ | ✅ | **无** | ❌ | Privacy Policy |
| `/en/legal/terms` | Terms of Service · AI WorkDeck | 自有 ✅ | ✅ | **无** | ❌ | Terms of Service |
| `/en/skills/agreement-gotchas` | **`AI WorkDeck`** | **继承 tagline** ❌ | ✅ | **无** | ❌ | Agreement Gotcha Scan |
| `/en/account` | `AI WorkDeck` | 继承 | — | — | ❌ | **0 个 h1** |
| `/en/admin` | `AI WorkDeck` | 继承 | — | — | ❌ | **0 个 h1** |
| `/en/about` | **HTTP 404** | — | — | — | — | — |

`/en/account`、`/en/admin` 的 `<meta name="robots" content="noindex, follow"/>` 已正确输出 ✅。

**重复 title**：`/en`、`/zh`、`/en/skills/*`（29 页）、`/en/u/*`、`/en/account`、`/en/admin` —— **至少 35 个 URL 共用同一个 `<title>AI WorkDeck</title>`**。

**重复 description**：8 个可索引页共用 `One-Stop Workspace for Document Professionals in the AI Era`。

**严重度**：首页裸品牌 title = **P0**；skills 详情页 title 落回 = **P2**；重复 description = **P1**。

---

### 5. 结构化数据

```bash
$ for f in *.html; do grep -c 'application/ld+json' $f; done
# 全部为 0
```

**17 个抓取的线上页面，JSON-LD 数量全部为 0。**

缺失的高价值类型：
- `Organization` / `SoftwareApplication`（首页 —— 对 AI 搜索引擎理解「这是什么产品」最关键）
- `Product` + `Offer`（`/membership` 定价页）
- `FAQPage`（`/start`）
- `BreadcrumbList`（Marketplace → Skill 详情）
- `Article` / `DiscussionForumPosting`（`/community/post/[id]`）
- `SoftwareSourceCode` / `Product`（`/skills/[id]` × 29）

**严重度**：**P1**（对 GEO / AI 搜索是重点损失项）。

---

### 6. 关键词呈现

字典文件词频（`grep -oi | wc -l`）：

| 词 | `dictionaries/en.json` | 词 | `dictionaries/zh.json` |
|---|---|---|---|
| legal | 26 | 法律 | 21 |
| lawyer | **2** | 律师 | **3** |
| law firm | **1** | 律所 | 6 |
| attorney | **0** | 法务 | 2 |
| litigation | **0** | 诉讼 | **0** |
| compliance | **0** | 合同 | 13 |
| contract | 11 | | |

**首页 HTML 全文词频**（剥标签后）：

| 词 | `/en` 首页 | `/zh` 首页 |
|---|---|---|
| legal | 11 | 2 |
| lawyer | **0** | — |
| law firm | 1 | — |
| 律师 | — | **1** |
| 法律 | — | 6 |
| 律所 | — | 4 |
| document | 14 | — |

**核心问题**：首页对搜索引擎自述的「我是什么」是——

- `<title>`：`AI WorkDeck`（零品类词）
- `<meta description>`：`One-Stop Workspace for Document Professionals in the AI Era`（零品类词）
- `<h1>`：`One-Stop Workspace for Document Pros.`（零品类词）
- hero lead：`Write, read, research, file. All in one deck.`（零品类词）

三个最高权重位置全部是「document professionals」这一泛化说法。而同一产品的 GitHub 描述是：

> AI-native IDE workspace for legal and document-heavy workflows … VS Code for lawyers.

`legal` 的 11 次出现全部落在页面中下部的功能描述与 Skill 卡片里，权重位置一个都没占到。

**旁证**：`WebSearch "AI WorkDeck" legal document workspace lawyers` 返回的**全部**产品认知都来自 GitHub 仓库描述，官网一条未出现 —— 搜索引擎目前是通过 GitHub 而非官网理解这个产品的。

**品牌词冲突**：`workdeck` 被以下已收录实体占据：`workdeck.com`（Workdeck Solutions SL，巴塞罗那，企业 PSA 平台）、`workdeck.io`（自由职业者面板）、Google Play 上的 Workdeck app、GetApp / SoftwareFinder 上的 Workdeck 条目。**裸品牌词 "AI WorkDeck" 作为 title 不具备任何区分度**。

**严重度**：**P0**。

---

### 7. 性能与 Core Web Vitals

#### TTFB（Googlebot UA，各 3 次取平均）

| 路径 | 平均 TTFB |
|---|---|
| `/en` | **280 ms** |
| `/zh` | 196 ms |
| `/en/marketplace` | 221 ms |
| `/en/start` | 221 ms |
| `/en/community` | 255 ms |

#### Lighthouse 12（本地 headless Chrome，模拟节流）

PageSpeed Insights API 无 key 时当日配额已耗尽（`429 Quota exceeded`），改用本地 Lighthouse。

**移动端**（`--form-factor=mobile`）：

| 指标 | 值 | 分 |
|---|---|---|
| **Performance** | — | **0.97** |
| SEO | — | **1.00** |
| Best Practices | — | **1.00** |
| FCP | 1.7 s | 0.91 |
| **LCP** | **2.3 s** | 0.94 |
| **CLS** | **0** | 1.00 |
| TBT（INP 代理） | 10 ms | 1.00 |
| Speed Index | 2.8 s | 0.96 |
| Server response | 70 ms | 1.00 |
| Total byte weight | 2326 KiB | 1.00 |

**桌面端**：

| 指标 | 值 | 分 |
|---|---|---|
| Performance | — | 0.92 |
| Accessibility | — | 0.95 |
| SEO | — | 1.00 |
| FCP | 0.5 s | 1.00 |
| LCP | 1.7 s | 0.73 |
| CLS | **0.077** | 0.95 |
| TBT | 10 ms | 1.00 |
| **uses-responsive-images** | 可省 **1723 KiB** | **0.00** |
| **modern-image-formats** | 可省 **1366 KiB** | **0.00** |

> ⚠️ Lighthouse 的 SEO 分 = 1.00 **不能作为结论**。它只检查 title/description/canonical/viewport/可爬取性等浅层项，不检查 sitemap 缺失、跨页 title 重复、JSON-LD 缺失、hreflang 目标是否 301、软 404 —— 本报告的 P0 项它一条也发现不了。

#### 渲染模式

```bash
$ grep -rn "force-dynamic" "app/[lang]/" | wc -l
19
```

**19 处 `export const dynamic = 'force-dynamic'`**，覆盖首页、marketplace、community、skills、start、quiz、charts 等**全部主要可索引页面**。全站零静态预渲染 / 零 ISR。

首页的理由写在 `app/[lang]/page.tsx:15`：

```ts
// SkillsSpotlight 实时读 skills-store，首页必须动态渲染
export const dynamic = 'force-dynamic';
```

代价：每次爬虫请求都要现算，且 `next.config.ts` 的注释表明生产机只有 1.8 G 内存、同时跑 4 个站点。当前 TTFB 200–280 ms 尚可接受，但没有任何缓冲余量，也无法被 CDN 缓存。

#### 字体

`app/[lang]/layout.tsx:12-20` 用 `next/font/google` 加载 `Inter` + `Noto_Serif_SC`（`display: 'swap'`），自托管、无外部请求。Lighthouse `font-display` 审计通过 ✅。CSP 的 `font-src 'self' data:` 与之一致 ✅。

#### 图片

```
img 标签数：22        无 alt 的：0  ✅
/_next/image? 出现次数：0        ← next/image 完全未启用
```

`public/` 下：`Loginpage.png` **980 KB**、`logo.png` **224 KB**、`new_full_logo.png` **224 KB**（与 logo.png 内容相同，重复文件）。全部以原生 `<img>` + 未压缩 PNG 直出，无 WebP/AVIF、无响应式 `srcset`。

**严重度**：性能整体 = 无问题；图片未优化 = **P2**；全站 force-dynamic = **P1**。

---

### 8. 国际化与双站 —— 本次审计最严重的一项

#### 8.1 workdeck.ai 全站 301

```bash
$ curl -sS -o /dev/null -A "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)" \
    -w "code=%{http_code} redirect=%{redirect_url}\n" https://www.workdeck.ai/
code=301 redirect=https://www.aiworkdeck.com/

$ curl -sSL -o /dev/null -A "…Googlebot…" -w "FINAL=%{url_effective} redirects=%{num_redirects}\n" https://www.workdeck.ai/
FINAL=https://www.aiworkdeck.com/zh redirects=3
```

**Googlebot UA 与普通 Chrome UA 结果完全相同**，无 UA 区分。测试的每一条路径都 301：

| URL | Googlebot UA | 普通 UA | 最终落点 |
|---|---|---|---|
| `https://www.workdeck.ai/` | 301 | 301 | `aiworkdeck.com/zh` |
| `https://workdeck.ai/` | 301 | 301 | `aiworkdeck.com/zh` |
| `https://www.workdeck.ai/en` | 301 | 301 | `aiworkdeck.com/en` |
| `https://www.workdeck.ai/robots.txt` | 301 | 301 | `aiworkdeck.com/robots.txt` |

**境外出口交叉验证**：用 WebFetch（Anthropic 侧出口，非中国境内 IP）请求 `https://www.workdeck.ai/en`：

```
REDIRECT DETECTED
Original URL: https://www.workdeck.ai/en
Redirect URL: https://www.aiworkdeck.com/en
Status: 301 Moved Permanently
```

**境外 IP 同样被 301。** 这排除了「只对境内访客 301」的假设 —— `middleware.ts:74-80` 的注释描述的是设计意图（「国际站的 nginx 对**境内访客**默认 301 回国内站」），但线上 nginx 实际行为是**对所有来源 301**。

**后果**：
1. Googlebot 从美国 IP 爬 workdeck.ai 会拿到 301 → 把 workdeck.ai 的所有 URL 判为「已永久迁移到 aiworkdeck.com」→ workdeck.ai 从索引中消失，权重全部归并到国内站。
2. `.ai` 域名 + 美元定价 + Stripe + 香港主体这一整套国际化投入，在搜索层面**完全无法被英文用户找到**。
3. 国内站 `aiworkdeck.com` 有 ICP 备案，是**中文优先站**，`/` 默认 307 到 `/zh` —— 英文用户即使被 301 过来也落在中文首页。

**严重度**：**P0**（全部 P 项中影响面最大的一条）。

#### 8.2 hreflang 输出

`/en` 与 `/zh` 首页的实际输出：

```html
<link rel="canonical" href="https://www.aiworkdeck.com/en"/>
<link rel="alternate" hrefLang="zh-CN" href="https://www.aiworkdeck.com/zh"/>
<link rel="alternate" hrefLang="en" href="https://www.workdeck.ai/en"/>
```

三个问题：

1. **`en` 的目标是 301 URL**。Google 明确要求 hreflang 目标必须返回 200；指向重定向的 hreflang 会被整条丢弃。→ 目前两站间**实际上没有生效的 hreflang**。
2. **无 `x-default`**。`/`（无语种前缀）没有对应的 hreflang 条目。
3. **互指不可能双向**。合规的 hreflang 要求 A 页声明 B、B 页也声明 A。workdeck.ai/en 永远不返回 200，Google 拿不到它的 hreflang，reciprocity 校验必然失败。

另外：`/community`、`/community/chat`、`/quiz`、`/skills/charts`、`/legal/*`、`/skills/[id]`、`/u/[username]` 完全没有 hreflang（`crossSite` 默认关）。`lib/page-metadata.ts` 里对「为什么默认关」的论证是站得住的（法律文本是不同缔约主体的不同文书，不是同一文本的翻译），**但同站内 en↔zh 的 hreflang 也一并没了** —— 这一层是纯损失，与跨站顾虑无关。

**严重度**：**P1**。

#### 8.3 无语种前缀的 `/` 处理

```bash
$ curl -sS -o /dev/null -w "%{http_code} -> %{redirect_url}\n" https://www.aiworkdeck.com/
307 -> https://www.aiworkdeck.com/zh/
$ curl … -H "Accept-Language: en-US,en;q=0.9" https://www.aiworkdeck.com/
307 -> https://www.aiworkdeck.com/en/
$ curl … -H "Accept-Language: zh-CN,zh;q=0.9" https://www.aiworkdeck.com/
307 -> https://www.aiworkdeck.com/zh/
$ curl … https://www.aiworkdeck.com/zh/
308 -> https://www.aiworkdeck.com/zh
```

`middleware.ts:100-130` 用 `negotiator` + `@formatjs/intl-localematcher` 做 Accept-Language 协商，输出 **307 临时重定向**（`NextResponse.redirect` 默认）。

对 Googlebot 的影响：
- Googlebot **不发送 Accept-Language 头**，因此永远落到 `defaultLocale` = `zh`（国内站）。
- 307 是临时重定向，Google 会保留 `/` 本身作为可索引 URL，但内容永远是中文版。
- 存在一次多余跳转链：`/` → 307 `/zh/` → 308 `/zh`（因为 middleware 拼出了带尾斜杠的路径，再被 Next 的 trailingSlash 规范化掉）。爬虫每次访问 `/` 要走两跳。

**严重度**：**P2**（多余跳转）；配合 8.1 一起看则加重。

#### 8.4 重复内容判定

两站会否被判重复内容 —— **目前不会，因为国际站根本不存在**（301 已把归并做完了）。一旦 8.1 修复、workdeck.ai 恢复 200，则会立刻面临重复内容判定，届时 hreflang（8.2）必须同时修好。这两条**必须一起改**。

---

### 9. 内链与站点结构

#### Navbar（`components/layout/Navbar.tsx:77-87`）

```
/{lang}/marketplace        (highlight)
/{lang}/skills/submit
/{lang}/community
/{lang}/community/chat
/{lang}#product            ← 锚点，非独立页
/{lang}/showcase
/{lang}#pricing            ← 锚点，非独立页
/{lang}            (logo)
/{lang}/account
/{lang}/start      (CTA)
```

#### Footer（实测线上渲染文本）

```
Product: Get started / Features / Pricing / Updates / Request a feature
Skill Ecosystem: Marketplace / Plugin Square / Skill Charts / Submit / Submit a Plugin
Community: Discussions / Chatroom / Membership / Legal Persona test / Showcase
Legal: Privacy Policy / Terms of Service
+ 北京京微资易科技有限公司  京ICP备2024096997号-8  (beian.miit.gov.cn)
```

`components/layout/Footer.tsx` 中的 href 集合：`/{lang}`、`/{lang}/about`、`/{lang}/legal/privacy`、`/{lang}/legal/terms`。

**问题 1（P1）**：Footer 链接 `/{lang}/about`，但国内站该路径 **404**：

```bash
$ curl -sS -o /dev/null -w "%{http_code}\n" https://www.aiworkdeck.com/en/about
404
$ curl -sS -o /dev/null -w "%{http_code}\n" https://www.aiworkdeck.com/zh/about
404
```

原因在 `app/[lang]/about/page.tsx:30`：`if (SITE_ID !== 'intl') return {};` 且页面体 `notFound()`。设计意图（国内主体的代表人无登记文件可据）合理，但**链接没有跟着条件隐藏** —— 这是一条出现在**每一个页面**上的死链。

**问题 2（P0 派生）**：`about` 页的注释写明其存在意义是「供支付/平台/供应商的合规核验当公开来源引用」。它只在 intl 站存在，而 intl 站全站 301 —— **这个页面在整个互联网上没有任何一个可达的 URL**。

**问题 3（P2）**：无面包屑导航（`grep -rin breadcrumb app/ components/` 无输出）。`/skills/[id]` 这类三层深的页面没有任何层级信号。

**半孤儿页**：`/plugins/develop`、`/skills/charts`、`/membership`、`/quiz`、`/updates` 仅在 Footer 有链接，Navbar 无入口。`/skills/[id]`（29 页）仅从 `/marketplace` 列表链接，且该列表页 `force-dynamic` 无分页 sitemap 兜底。

---

### 10. 索引现状

| 查询 | 本域结果数 |
|---|---|
| `site:aiworkdeck.com` | **0** |
| `site:workdeck.ai` | **0** |

两次查询返回的全部是同名/近名的无关站点（`workdeck.com` 的 Workdeck Solutions SL、`workdeck.io`、Google Play 的 Workdeck app、`auth.aiworkk.com`）与 `github.com/zeweihan/aiworkdeck`。

被搜索引擎实际读到的产品描述是 **GitHub 仓库的 description**：

> AI-native IDE workspace for legal and document-heavy workflows: files, agents, plugins, WPS editing, OCR, evidence chains. VS Code for lawyers.

搜 `"AI WorkDeck" legal document workspace lawyers` 的结果同样如此 —— 摘要内容全部来自 GitHub README（AGPLv3、Ollama 自托管、无 telemetry 等），**官网一个页面都没有出现在结果里**。

**结论**：估计收录页数 ≈ **0**。这与 P0 项（无 sitemap、无 robots Sitemap 指令、国际站全站 301、首页无品类词）完全吻合。

**附带发现（GEO 视角）**：AI 搜索引擎目前对本产品的**唯一信息源是 GitHub**。这是一个短期可用的杠杆（GitHub 描述写得比官网好），也是一个长期风险（官网完全不参与叙事）。

**严重度**：**P0**。

---

### 11. 其他

#### 11.1 软 404 —— 任意图片扩展名路径返回 200 首页

```bash
$ curl -sS -o /dev/null -w "%{http_code} %{content_type} %{size_download}\n" https://www.aiworkdeck.com/foo.png
200 text/html; charset=utf-8 209611

$ curl -sS https://www.aiworkdeck.com/foo.png | grep -o '<html lang="[^"]*"'
<html lang="foo.png"

$ curl -sS https://www.aiworkdeck.com/x.webp | grep -o '<link rel="canonical"[^>]*>'
<link rel="canonical" href="https://www.aiworkdeck.com/x.webp"/>

$ curl -sS -o /dev/null -w "%{http_code} %{content_type}\n" https://www.aiworkdeck.com/apple-touch-icon.png
200 text/html; charset=utf-8
$ curl -sS -o /dev/null -w "%{http_code} %{content_type}\n" https://www.aiworkdeck.com/apple-icon.png
200 text/html; charset=utf-8      ← 210470 字节的完整中文首页
```

**根因**：`middleware.ts` 的 matcher 把图片扩展名排除在 locale 重定向之外：

```ts
matcher: [
  '/((?!api|_next/static|_next/image|favicon.ico|robots.txt|.*\\.(?:svg|png|jpg|jpeg|gif|webp|mp4|webm)$).*)',
  …
]
```

`/foo.png` 跳过 middleware → Next 找不到同名静态文件 → 落到动态路由 `app/[lang]/page.tsx`，把 **`foo.png` 当成 `[lang]` 参数**。`getDictionary('foo.png')` 静默回落到默认字典，于是渲染出完整首页；`generateMetadata` 里的 `pageAlternates(lang, '')` 拼出 `${origin}/${lang}` = `https://www.aiworkdeck.com/foo.png`，成为**自指 canonical**。

**后果**：
- 每一个以 `.png/.jpg/.jpeg/.svg/.gif/.webp/.mp4/.webm` 结尾的单段路径都是一个返回 200 的首页副本，且都声明自己是权威版本 → 无限重复内容。
- 浏览器与爬虫会主动请求 `/apple-touch-icon.png`、`/apple-icon.png` 等约定路径，这些**必然被访问**，且都命中此缺陷。
- 输出 `<html lang="foo.png">` —— 非法 BCP-47 语言标签。
- 各种外链失效的图片 URL（`https://www.aiworkdeck.com/xxx.png`）都会变成 200 首页而非 404。

对比：非图片扩展名路径行为正确 —— `/pricing` → 307 `/zh/pricing` → 404；`/{lang}/nonexistent` → 404；`/.well-known/x` → nginx 404。

**严重度**：**P0**。

#### 11.2 favicon / icon / OG image

| 资源 | 状态 |
|---|---|
| `app/favicon.ico`（11 KB） | ✅ 线上 200，`image/x-icon` |
| `app/icon.png`（91 KB） | ✅ 线上 200，`image/png`，head 中 `sizes="512x512"` |
| `opengraph-image` | ❌ 不存在（`/opengraph-image` → 307 `/zh/opengraph-image` → 无） |
| `apple-icon.png` | ❌ 不存在（命中 11.1 的软 404，返回 200 首页 HTML） |
| `og:*` / `twitter:*` meta | ❌ **全站零个** |

head 中实际输出：

```html
<link rel="icon" href="/favicon.ico?favicon.72253b14.ico" sizes="64x64" type="image/x-icon"/>
<link rel="icon" href="/icon.png?icon.e12d48fc.png" sizes="512x512" type="image/png"/>
```

`grep -rn "openGraph\|twitter" app/ lib/ components/` 无任何结果 —— 分享到微信 / Slack / X / LinkedIn 时无标题卡片、无缩略图。对一个**主要靠社群与口碑传播的法律 SaaS**，这是很直接的转化损失。

**严重度**：**P1**。

#### 11.3 404 页面

```bash
$ find app -name "not-found*"
# （无输出）
```

无自定义 `not-found.tsx`，用 Next.js 默认 404（线上 `/en/nonexistent-xyz` 返回 404 + 90 KB 默认页）。状态码正确 ✅，但页面无导航、无搜索、无返回首页引导。

**严重度**：**P2**。

#### 11.4 `/{lang}/updates` changelog 结构化程度

```bash
$ python3 -c "…" # 对 _en_updates.html
version-like strings: ['0.11.1','0.11.2','0.14.0','0.15.0','0.16.0','0.21.0','1.0.0','3.676.56']
time tags: 0
```

内容 SSR 完整（3604 字符可见文本），但：
- **0 个 `<time>` 标签** —— 发布日期无机器可读标记。
- 无 `SoftwareApplication` + `softwareVersion` / `releaseNotes` 的 JSON-LD。
- 版本条目无 `id` 锚点，无法深链到具体版本。

changelog 是搜索引擎与 AI 搜索最喜欢引用的内容类型之一（「AI WorkDeck 最新版本有什么变化」），当前形态无法被结构化提取。

**严重度**：**P2**。

#### 11.5 社区帖子 `/{lang}/community/post/[id]`

`app/[lang]/community/post/[id]/page.tsx`：
- `export const dynamic = 'force-dynamic'` —— 服务端渲染 ✅
- `generateMetadata` 输出 `title: ${post.title} · AI WorkDeck`、`description: post.content.slice(0,140)`、`alternates: pageAlternates(lang, /community/post/${id})` ✅
- 已删 / 被隐藏的帖子走 `notFound()` ✅
- **未设 noindex** —— 设计上帖子页是可索引的 ✅（合理）

**当前实际状态**：`/en/community` 列表页 SSR 输出 `No posts yet.`，`grep -c '/community/post/'` = 0 —— **一条帖子都没有**。

风险：一旦有 UGC，缺乏 `DiscussionForumPosting` JSON-LD、缺乏对低质/垃圾帖的 noindex 策略、缺乏 `rel="nofollow ugc"` 处理。

**严重度**：**P2**（当前无内容；有 UGC 后升为 P1）。

#### 11.6 用户页 `/{lang}/u/[username]` 索引策略

`app/[lang]/u/[username]/page.tsx:66-74`：

```ts
export async function generateMetadata({ params }) {
    const { lang, username } = await params;
    // 不发跨站 hreflang：两站账号体系完全独立，同名用户在另一站不是同一个人
    return { alternates: pageAlternates(lang, `/u/${username}`) };
}
```

- **未设 NOINDEX** —— 所有贡献者主页可索引
- **未设 title / description** —— 全部落回 `AI WorkDeck` + 通用 tagline
- 用户不存在时 `notFound()` ✅

问题：这会产出 N 个 title 完全相同、description 完全相同、内容稀薄的可索引页。对比 `/{lang}/cert/[id]` 已正确设 `NOINDEX`。

建议策略：有公开作品（发布过 Skill / 帖子）的用户页保留索引并补 title/description；零作品的用户页 `NOINDEX`。

**严重度**：**P2**。

---

## 三、页面 metadata 总表

图例：✅ 有 · ❌ 无 · 🔻 落回布局层默认（`AI WorkDeck` / 通用 tagline）

| 路径 | generateMetadata | title | description | pageAlternates | crossSite | NOINDEX | 应否索引 | 现状问题 |
|---|---|---|---|---|---|---|---|---|
| `/{lang}` | ✅ | 🔻 `AI WorkDeck` | 🔻 tagline | ✅ `''` | ✅ | ❌ | **是** | **P0** 裸品牌 title、无品类词 |
| `/{lang}/start` | ✅ | ✅ 自有 | ✅ 自有 | ✅ `/start` | ✅ | ❌ | 是 | hreflang en 指向 301 |
| `/{lang}/marketplace` | ✅ | ✅ 自有 | 🔻 tagline | ✅ `/marketplace` | ✅ | ❌ | 是 | 重复 description |
| `/{lang}/marketplace/plugins` | ✅ | ✅ 自有 | 🔻 tagline | ✅ | ✅ | ❌ | 是 | 重复 description |
| `/{lang}/plugins/develop` | ✅ | ✅ 自有 | ✅ 自有 | ✅ | ✅ | ❌ | 是 | 仅 Footer 有入口 |
| `/{lang}/plugins/office` | ❌ | 🔻 | 🔻 | ❌ | — | ❌ | 否 | 307 → `/start`，应改 301 |
| `/{lang}/plugins/submit` | ❌（静态 metadata） | 🔻 | 🔻 | ❌ | — | ✅ | 否 | ✅ 正确 |
| `/{lang}/skills/charts` | ✅ | ✅ 自有 | ✅ 自有 | ✅ | ❌ | ❌ | 是 | 无同站 en↔zh hreflang |
| `/{lang}/skills/submit` | ❌（静态 metadata） | 🔻 | 🔻 | ❌ | — | ✅ | 否 | ✅ 正确 |
| `/{lang}/skills/[id]` ×29 | ✅ | **🔻 `AI WorkDeck`** | 🔻 tagline | ✅ | ❌ | ❌ | **是** | **P2** 29 页 title 全同，最大长尾资产被浪费 |
| `/{lang}/community` | ✅ | ✅ 自有 | ✅ 自有 | ✅ | ❌ | ❌ | 是（暂空） | 薄内容 |
| `/{lang}/community/chat` | ✅ | ✅ 自有 | 🔻 tagline | ✅ | ❌ | ❌ | **建议否** | 聊天室无索引价值 |
| `/{lang}/community/new` | ✅ | ✅ 自有 | 🔻 tagline | ✅ | ❌ | ❌ | **建议否** | 表单页，应 NOINDEX |
| `/{lang}/community/post/[id]` | ✅ | ✅ 自有 | ✅ 自有 | ✅ | ❌ | ❌ | 是 | 当前 0 条帖子 |
| `/{lang}/showcase` | ✅ | ✅ 自有 | 🔻 tagline | ✅ | ✅ | ❌ | 是 | 薄内容（1033 字符） |
| `/{lang}/updates` | ✅ | ✅ 自有 | 🔻 tagline | ✅ | ✅ | ❌ | 是 | 无 `<time>`、无 JSON-LD |
| `/{lang}/membership` | ✅ | ✅ 自有 | 🔻 tagline | ✅ | ✅ | ❌ | 是 | 定价页无 `Product`/`Offer` |
| `/{lang}/quiz` | ✅ | ✅ 自有 | ✅ 自有 | ✅ | ❌ | ❌ | 是 | title 唯一带 "Legal" 的页 |
| `/{lang}/about` | ✅ | ✅ 自有 | ✅ 自有 | ✅ | ❌ | ❌ | 是（仅 intl） | **P1** cn 站 404 但 Footer 全站链接它 |
| `/{lang}/legal/privacy` | ✅ | ✅ 自有 | ✅ 自有 | ✅ | ❌ | ❌ | 是 | 按站分叉文本 ✅ |
| `/{lang}/legal/terms` | ✅ | ✅ 自有 | ✅ 自有 | ✅ | ❌ | ❌ | 是 | 按站分叉文本 ✅ |
| `/{lang}/u/[username]` | ✅ | 🔻 | 🔻 | ✅ | ❌ | ❌ | **待定** | **P2** 无 title/desc，无索引策略 |
| `/{lang}/cert/[id]` | ✅ | ✅ 自有 | 🔻 | ❌ | — | ✅ | 否 | ✅ 正确 |
| `/{lang}/account` | ❌（静态 metadata） | 🔻 | 🔻 | ❌ | — | ✅ | 否 | ✅ 正确（线上已验证 noindex） |
| `/{lang}/admin` | ❌（静态 metadata） | 🔻 | 🔻 | ❌ | — | ✅ | 否 | ✅ 正确 |
| `/{lang}/admin/telemetry` | ❌（静态 metadata） | 🔻 | 🔻 | ❌ | — | ✅ | 否 | ✅ 正确 |
| `/{lang}/feature-request` | ❌ | 🔻 | 🔻 | ❌ | — | ❌ | 否 | 307 → `/{lang}?feature-request=1` |

**汇总**：27 个 page.tsx → 20 个应索引 / 7 个不应索引；其中 **6 个已正确 NOINDEX**，**2 个应加未加**（`community/chat`、`community/new`），**1 个待定**（`u/[username]`）。

---

## 四、建议修复清单

### P0 —— 立即

**F1. 让 workdeck.ai 对搜索引擎与境外访客返回 200**
- 涉及：生产 nginx 配置（参考仓库 `doc/nginx-workdeck-ai.conf`），非本仓代码
- 做法：把「境内 IP → 301 国内站」的规则收窄为**只对真实浏览器生效**；对 Googlebot / Bingbot / GPTBot / ClaudeBot / PerplexityBot 等已知爬虫 UA 无条件放行返回 200。当前实测**境外出口也被 301**，说明地域判定要么失效要么根本没配 —— 需先确认 nginx 现行规则再改。
- 验证：`curl -A "…Googlebot…" -o /dev/null -w "%{http_code}" https://www.workdeck.ai/en` 应为 `200`
- 必须与 F2 同时上线（恢复 200 后立刻面临重复内容判定）

**F2. 修复 hreflang**
- 涉及：`lib/page-metadata.ts`
- 做法：(a) 补 `x-default`（指向 intl 站 `/en`）；(b) 无论 `crossSite` 与否，**同站内 en↔zh 必须互指**；(c) 确认 F1 后两站 hreflang 目标均返回 200
- 验证：Google Search Console「国际定位」报告零错误

**F3. 消除图片扩展名软 404**
- 涉及：`middleware.ts:135-142`（matcher）
- 做法：`[lang]` 必须做白名单校验 —— 在 `app/[lang]/layout.tsx` 或各 page 中对非 `en`/`zh` 的 lang 值直接 `notFound()`。（改 matcher 正则只能治标：把图片扩展名放回 middleware 会破坏 `public/` 下真实静态文件的服务。根治点是 `[lang]` 参数校验。）
- 验证：`curl -o /dev/null -w "%{http_code}" https://www.aiworkdeck.com/foo.png` 应为 `404`；`/apple-touch-icon.png` 应为 `404` 或真实图片

**F4. 新建 `app/sitemap.ts` 并在 robots.txt 声明**
- 涉及：新建 `app/sitemap.ts`；修改 `public/robots.txt`
- 做法：静态路由 14 条 × 2 lang；动态并入 `listSkills()`（29 条）与 `listPosts()`；按 `SITE_ID` 分叉（`/about` 仅 intl）；排除全部 NOINDEX 页。robots.txt 加 `Sitemap: https://www.aiworkdeck.com/sitemap.xml`（intl 站同理）
- 验证：`curl https://www.aiworkdeck.com/sitemap.xml` 返回有效 XML 且 URL 数 ≥ 55

**F5. 重写首页 title / description / h1，植入品类词**
- 涉及：`app/[lang]/layout.tsx:31-32`（改为 `title: { default, template: '%s · AI WorkDeck' }`）；`app/[lang]/page.tsx:23-25`（首页自报 title）；`dictionaries/en.json:84` 与 `dictionaries/zh.json` 对应键
- 做法：把 GitHub 描述里已验证有效的定位（"AI-native IDE workspace for legal and document-heavy workflows / VS Code for lawyers"）搬到 title、description、h1 三个最高权重位。英文侧必须出现 `legal` / `lawyers` / `law firm`；中文侧必须出现 `律师` / `法律` / `律所`。同时消解 `workdeck` 的品牌词冲突（西班牙 Workdeck Solutions SL 等）。
- 验证：`curl https://www.aiworkdeck.com/en | grep -o '<title>[^<]*'` 含品类词

### P1 —— 本迭代内

**F6. 补 `og:*` / `twitter:*` 与 `opengraph-image`**
- 涉及：`app/[lang]/layout.tsx`（默认 OG）；新建 `app/[lang]/opengraph-image.tsx`（Next 16 支持 ImageResponse 动态生成）；各页 `generateMetadata` 补 `openGraph.title/description`

**F7. 修 Footer `/about` 死链**
- 涉及：`components/layout/Footer.tsx`
- 做法：`SITE_ID === 'intl'` 时才渲染该链接。同时确认 F1 修好后该页在 intl 站可达（否则合规公示无效）

**F8. 补 JSON-LD**
- 涉及：新建 `components/seo/JsonLd.tsx`；接入 `app/[lang]/layout.tsx`（`Organization`）、`app/[lang]/page.tsx`（`SoftwareApplication`）、`app/[lang]/membership/page.tsx`（`Product`+`Offer`）、`app/[lang]/start/page.tsx`（`FAQPage`）、`app/[lang]/skills/[id]/page.tsx`（`SoftwareApplication`）
- 注意：`next.config.ts` 的 CSP 已含 `script-src 'unsafe-inline'`，JSON-LD 不会被拦

**F9. 消除重复 description**
- 涉及：`marketplace/page.tsx`、`marketplace/plugins/page.tsx`、`showcase/page.tsx`、`updates/page.tsx`、`membership/page.tsx`、`community/chat/page.tsx` 的 `generateMetadata`，各自补 `description`；对应文案加进 `dictionaries/{en,zh}.json`

**F10. 收缩 `force-dynamic` 范围**
- 涉及：`app/[lang]/page.tsx:15`、`marketplace/page.tsx:17`、`skills/[id]/page.tsx:21`、`skills/charts/page.tsx:20`、`showcase/page.tsx`、`updates/page.tsx`
- 做法：改用 `export const revalidate = 300`（ISR）。首页的 `SkillsSpotlight` 不需要秒级新鲜度；纯静态页（`showcase`、`updates`、`legal/*`）应完全静态化。生产机只有 1.8 G 内存 —— 这一项同时是稳定性收益

**F11. 补 llms.txt + robots.txt 显式 AI 爬虫策略**
- 涉及：新建 `app/llms.txt/route.ts` 或 `public/llms.txt`；修改 `public/robots.txt`
- 做法：llms.txt 用 Markdown 列出产品定位（含品类词）+ 关键页面链接 + 29 个 Skill 的清单。robots.txt 对 GPTBot / OAI-SearchBot / ChatGPT-User / PerplexityBot / ClaudeBot / Claude-SearchBot / anthropic-ai / Google-Extended / Applebot-Extended / CCBot / Bytespider **显式声明** Allow 或 Disallow —— 当前的隐式允许在策略上是不设防的，且失去了「主动告诉 AI 搜索引擎欢迎抓取」的信号

**F12. `community/chat` 与 `community/new` 加 NOINDEX**
- 涉及：`app/[lang]/community/chat/page.tsx`、`app/[lang]/community/new/page.tsx`

### P2 —— 排期处理

**F13.** `skills/[id]` ×29 与 `u/[username]` 补 title / description —— `app/[lang]/skills/[id]/page.tsx:31`、`app/[lang]/u/[username]/page.tsx:66`

**F14.** `u/[username]` 索引策略：零作品用户页 `NOINDEX` —— 同上

**F15.** 图片优化：`public/Loginpage.png`(980 KB)、`logo.png`(224 KB)、`new_full_logo.png`(224 KB，与 logo.png 重复) 转 WebP；全站 `<img>` 换 `next/image`

**F16.** 新建自定义 `app/[lang]/not-found.tsx`

**F17.** 面包屑 + `BreadcrumbList` JSON-LD —— 新建 `components/layout/Breadcrumb.tsx`，接入 `skills/[id]`、`marketplace/plugins`、`community/post/[id]`、`legal/*`

**F18.** `updates` changelog 结构化：补 `<time datetime>`、版本锚点 id、`SoftwareApplication` JSON-LD —— `app/[lang]/updates/page.tsx`

**F19.** `/{lang}/plugins/office` 与 `/{lang}/feature-request` 的 307 改 301 —— 移进 `next.config.ts` 的 `redirects()`（已有 3 条同类规则）

**F20.** 消除 `/` → `/zh/` → `/zh` 的双跳 —— `middleware.ts:120-128` 拼路径时不带尾斜杠

**F21.** 充实薄内容页 `showcase`(1033 字符) / `quiz`(1152) / `membership`(1750) —— 对应 `dictionaries/*.json`

---

## 附：审计方法与工具

- 线上抓取：`curl -sS -A "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)"`，17 个页面完整 HTML 落盘后用 Python 正则解析 head / h1 / JSON-LD / img
- 双 UA 对照：Googlebot UA vs Chrome 131 UA，12 个 AI/搜索爬虫 UA 逐一探测
- 境外出口交叉验证：WebFetch（非中国境内 IP）
- 性能：Lighthouse 12 本地 headless（PageSpeed Insights API 无 key 当日配额已满，返回 429）
- 收录：WebSearch `site:` 查询 + 品牌词查询
- 仓库：`grep` / `find` / Python AST-free 正则扫描 `app/[lang]/**/page.tsx` 全部 27 个页面

**未验证项**：
- workdeck.ai nginx 的实际配置内容（无服务器访问，仅从外部行为反推）
- Google Search Console / Bing Webmaster 的真实收录数与覆盖率报告（无账号访问权限）——「收录 ≈ 0」是基于 `site:` 查询的**估计**
- CrUX 真实用户字段数据（PSI 配额耗尽，Lighthouse 仅为实验室数据）
- `/{lang}/u/[username]` 的实际用户页数量（无数据库访问）
