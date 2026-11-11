# SEO / GEO 方案：让 Google 与 AI 搜索在品类词下找到 AI WorkDeck

dev-board#415 · 2026-09-03 · 调研笔记见 `../research/seo-geo/`（01 方法论、02 竞品与关键词、03 技术审计）。

## 0. 结论先行

1. **官网现在没有告诉搜索引擎「我是给律师用的」**。首页 title 是裸的 `AI WorkDeck`，description / h1 说的是
   "Document Professionals"，`lawyer` 一词在英文首页出现 0 次。搜索引擎与 AI 目前对本产品的全部认知都来自
   GitHub 仓库描述（"VS Code for lawyers"）——官网一页都没参与叙事。
2. **基建缺口是当前 ROI 最高的一段**：无 sitemap、robots 无 Sitemap 行、全站零 JSON-LD、零 OG 卡片、
   任意 `/x.png` 返回 200 首页（无限重复内容）、29 个 Skill 页共用同一个 title。Googlebot 日志证实它只抓过
   `/en`、`/zh` 和 robots.txt，内页几乎没爬。
3. **「legal ide」不是 Tritium 做对了什么，是没人争**。它官网 title 里没有 IDE，占位的是一篇 312 分的
   Show HN 帖。这个词能靠一篇立场文 + 一次社区曝光拿下，但它没有流量；真正有量的词是
   `legal ai software`、`ai legal drafting tool`、`ai word add-in for lawyers`、`spellbook alternative`。
4. **`legal ai` 这种头部词是滞后指标**（新域名 12–24 个月量级），不能当 KPI。KPI 换成：索引覆盖、
   长尾/比较词进前 20 的条数、手工 prompt 表里被 AI 点名的次数。
5. **被 AI 推荐靠的是站外信号**，不是官网写得多好。Ahrefs 7.5 万品牌研究里与 AI 可见度相关性最强的是
   YouTube 提及（0.737）与品牌提及；Perplexity 商业意图查询高频引用 G2 / Capterra 类目录站。
   所以「6 个第三方位置」比「6 篇博客」重要。
6. Google 官方（2026-05）明说 AI Overviews / AI Mode **没有额外要求**，llms.txt 不需要、特殊 schema
   不需要；唯一的 AI 开关是页面可索引且可出摘要。llms.txt 顺手做，不立项。

## 1. 定位口径（本方案的前提，需用户拍板）

官网从「AI 时代文档工作者的一站式工作平台」改为 **法律优先、文档密集型工作为延伸**，与 GitHub、
Product Hunt 文案对齐：

| 位置 | 英文 | 中文 |
|---|---|---|
| 首页 title | AI WorkDeck — Legal AI Workspace & IDE for Lawyers (Windows / macOS) | AI WorkDeck — 律师的 AI 法律文书工作台（Windows / macOS 桌面端） |
| 首页 description | AI WorkDeck is an open-source, local-first legal AI workspace for lawyers and document-heavy teams: an Office-grade editor with tracked changes, AI drafting with citation checks, Word/WPS add-ins and a plugin marketplace. | AI WorkDeck 是开源、本地优先的律师 AI 工作台：带修订留痕的文档编辑器、可核验引用的 AI 起草、Word/WPS 插件与 Skill 广场，文件不出本机。 |
| 首页 h1（hero.subtitle） | The AI workspace for lawyers and document professionals. | 律师与文档工作者的 AI 一站式工作台 |
| 全站 title 模板 | `%s · AI WorkDeck` | 同 |

理由：`workdeck` 品牌词已被西班牙 Workdeck Solutions SL 等占据，裸品牌 title 零区分度；`legal` /
`lawyer` / `律师` 必须出现在 title、description、h1 三个最高权重位。「文档工作者」不删，退到第二句。

## 2. 三个阶段

### 阶段一：技术基建（本周，纯代码，PR 一次交付）

对应审计清单 F2–F13、F16、F19、F20（F1 作废，见审计勘误）。

| # | 项 | 涉及 |
|---|---|---|
| 1 | `app/sitemap.ts`：静态路由 × 双语 + Skill 详情 + 社区帖，按 SITE_ID 分叉（/about 仅 intl），排除 NOINDEX 页 | 新建 |
| 2 | `app/robots.ts` 取代静态 robots.txt：`Sitemap:` 行按站点；显式 Allow OAI-SearchBot / GPTBot / ChatGPT-User / PerplexityBot / ClaudeBot / Claude-SearchBot / Google-Extended / Bingbot / Applebot；Disallow `/*/admin`、`/*/account`、`/api/` | 替换 `public/robots.txt` |
| 3 | 软 404：`app/[lang]/layout.tsx` 加 `dynamicParams = false`，非 en/zh 的 lang 直接 404 | layout |
| 4 | hreflang：补 `x-default`；非 crossSite 页也输出同站 en↔zh 互指 | `lib/page-metadata.ts` |
| 5 | 首页 title/description/h1 按第 1 节改；layout 改 title 模板 | layout、page、dictionaries |
| 6 | 6 个页面补独立 description（marketplace、marketplace/plugins、showcase、updates、membership、community/chat） | 各 page + dictionaries |
| 7 | Skill 详情页 title/description 取自 Skill 数据；用户页 title + 零作品 NOINDEX | skills/[id]、u/[username] |
| 8 | JSON-LD：layout `Organization`（sameAs → GitHub / Product Hunt / LinkedIn）；首页 `SoftwareApplication`（operatingSystem、applicationCategory、offers、downloadUrl、license）；Skill 页 `SoftwareApplication` | 新建 `components/seo/JsonLd.tsx` |
| 9 | OG / Twitter 默认标签 + 静态 `public/og.png`（1200×630，sharp 生成一次入库，不做动态 ImageResponse——生产机 1.8G 内存） | layout |
| 10 | `community/chat`、`community/new` NOINDEX | 两个 page |
| 11 | `/llms.txt`：产品定位、事实清单（平台、许可证、定价、功能）、关键页面链接 | `app/llms.txt/route.ts` |
| 12 | `/{lang}/plugins/office`、`/{lang}/feature-request` 的 307 改 301；`/` → `/zh/` → `/zh` 双跳合一 | next.config、middleware |
| 13 | 自定义 `not-found.tsx` | 新建 |

不做：`force-dynamic` 改 ISR（F10）——涉及 skills-store 读盘时机与生产机稳定性，另开卡；
图片转 WebP / next/image（F15）另开卡。

验证口径：`npm run check` + `npm run build` + 本地 `next start` 后 curl 核对 sitemap URL 数 ≥ 55、
`/foo.png` 404、首页 title 含 legal、hreflang 含 x-default、JSON-LD 存在、chat/new 有 noindex。

### 阶段二：站外占位 + 监测（本月，大部分要用户本人操作）

| # | 动作 | 谁做 | 为什么 |
|---|---|---|---|
| 1 | Google Search Console 验证两站 + 提交 sitemap | 用户（需域名 DNS 或 HTML 文件，Fable 可放验证文件） | 唯一真实的收录数据；2026-06 起有 AI 功能曝光报表 |
| 2 | Bing Webmaster Tools 两站 + IndexNow 接入（CI 部署后 ping） | 用户注册；Fable 做 CI | Bing 索引是 ChatGPT search / Copilot 的底座；BWT 有免费的 AI Performance 报表 |
| 3 | G2、Capterra（含 GetApp / Software Advice）建条目 | 用户 | Perplexity 商业意图查询高频引用 |
| 4 | LinkedIn 公司页、Crunchbase、Wikidata 实体 | 用户 | 实体锚点；LinkedIn 在 ChatGPT search 响应里出现率 14% |
| 5 | Legaltech Hub、LawNext 目录、awesome-legaltech PR、AlternativeTo、There's An AI For That | 用户 / Fable 可提 PR | 垂直目录 + "alternatives" 类查询来源 |
| 6 | 中文：ai-bot.cn、aihub.cn、aig123 导航站收录；知乎长期账号 | 用户 | 中文品类词 4–5 席被导航站占 |
| 7 | Show HN：「AI WorkDeck – open-source legal IDE (AGPL, local-first)」 | 用户亲自发、亲自答 | Tritium 占「legal ide」靠的就是这一篇 |
| 8 | YouTube：4 条 3–5 分钟功能演示（修订留痕、引用核验、WPS/Word 插件、尽调清单） | 用户录 | 与 AI 可见度相关性最强的单一信号，目前为零 |
| 9 | 30 条手工 prompt 表（ChatGPT / Perplexity / AI Overviews / Kimi / 豆包各跑一遍）作基线，每月复跑 | Fable 建表并跑 | GEO 北极星，从 0% 起 |

红线：不买链接、不买评价、不马甲；比较页诚实写我们不擅长的场景（法律人群对夸大极敏感）。

### 阶段三：内容矩阵（本季度，每月 3–4 页）

按关键词地图 P0 → P1 排：

| 顺序 | 页面 | 承接词 |
|---|---|---|
| 1 | `/legal-ide`：品类定义页（什么是 legal IDE、与传统 legal tech 对照表、谁属于这个品类含 Tritium） | legal ide、ai ide for lawyers、cursor for lawyers |
| 2 | `/vs/tritium`、`/vs/spellbook` | tritium alternative、spellbook alternative |
| 3 | `/features/drafting`、`/features/redline`、`/integrations/word`、`/integrations/wps` | ai legal drafting tool、redlining software、ai word add-in for lawyers |
| 4 | `/security`（local-first / offline） | local first legal ai、offline legal ai |
| 5 | `/learn/best-legal-ai-desktop-apps-2026` 榜单文（把自己诚实列进去） | best legal ai tools 2026 |
| 6 | `/updates` 结构化（`<time>`、版本锚点、Article JSON-LD） | 「AI WorkDeck 最新版本」类 AI 查询 |
| 7 | 中文：`/zh/download` 落地页、`/zh/plugins/office` WPS/Word 插件页 | 法律AI软件下载、WPS 法律 AI 插件 |

写法规则（Princeton GEO 论文，Law & Government 领域效果最好）：首屏 2–3 句直接给定义；每段完整写
"AI WorkDeck" 实体名；加统计数字、加引语、标来源；200–400 词独立小节 + 表格；双站内容分化不机翻。
Skill 广场是合法的 programmatic 资产，但每页要有独有内容下限（真实截图 + 参数表 + 用例）。

## 3. KPI 与节奏

| 时间 | 看什么 |
|---|---|
| 月 1–3 | GSC / Bing 已索引页数、sitemap 覆盖率、第三方条目上线数（目标 6）、prompt 表基线 |
| 月 3–6 | 长尾 / 比较词进前 20 的条数、GSC AI 功能曝光、Bing AI Performance 引用数、prompt 命中率 |
| 月 6–12 | 非品牌自然流量、比较词进前 10、下载/注册来源中 AI referral 占比 |
| 月 12+ | `legal ai` 等品类词可见度 |

冷静锚：B2B SaaS 当前 AI 对话 referral 约占总流量 1%。现在做 GEO 是卡位与实体建设，不是当期流量。
