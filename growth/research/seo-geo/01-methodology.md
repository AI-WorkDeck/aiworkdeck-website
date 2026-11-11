# SEO / GEO 方法论学习笔记（面向 AI WorkDeck）

> 调研日期：2026-09-03。所有结论标注来源；来源分三档，阅读时请按档次打折：
> **A 档 = 一手官方**（Google Search Central 文档与官方博客、OpenAI 开发者文档、arXiv/KDD 论文）；
> **B 档 = 厂商公开研究**（Ahrefs、Semrush、Similarweb 等自有数据集，方法论公开但不可复现）；
> **C 档 = 代理商/媒体二手转述**（大量 2026 年的 "GEO 指南" 属此类，数字常互相抄袭、无法溯源）。
> 凡在 C 档里读到、未能在 A/B 档交叉验证的说法，本文一律显式标注「**未经证实**」。

---

## 0. 先校正两个前提

调研中发现总经理给出的两个前提需要修正：

1. **Tritium 并不自称 "legal IDE"。** 抓取 tritium.legal 首页，其自我表述是 "Legal drafting and redlining software for lawyers" / "Lightning fast legal drafting software"，卖点是本地优先（"everything stays on your machine"、无遥测）、Word/PDF 编辑、定义术语解析、红线比对、AI agent，站点带 Getting Started / Tutorial / FAQ / Security / Enterprise Deployment / Blog。「legal IDE」是社区与媒体给它贴的标签，不是它的官方口径。这件事对我们有直接含义：**"legal IDE" 是一个尚无人正式占领的词**，我们可以主动定义它；但它同时是一个几乎没有搜索量的词，不能当作流量目标，只能当作**品类定义 + 被 AI 引用的实体标签**来经营。
2. **"搜 legal ai 没有我们" 不是一个可以直接攻的目标。** `legal ai` 是超高竞争头部词，新域名在真实商业词上通常需要 6–12 个月才见有效流量、头部词 12–24 个月（C 档共识，多家一致但无一手数据，见 §6）。正确的目标是先吃「有购买意图的长尾 + 比较词 + AI 引用位」，头部词是结果不是起点。

另外，本仓当前的 SEO 基建状态（我读了代码，仅作事实陈述）：`public/robots.txt` 只有 `User-agent: * / Allow: /`，**没有 Sitemap 行、没有任何 AI 爬虫条目**；仓库内**没有任何 sitemap 实现**；`app/[lang]/layout.tsx` 的 title 硬编码为 `AI WorkDeck`（子页多数未覆盖）；结构化数据只有 `app/[lang]/about/page.tsx` 一处 JSON-LD；canonical/hreflang 已经由 `lib/page-metadata.ts` 的 `pageAlternates()` 下沉到页面级处理，且 `crossSite` 默认关——这一处做得是对的，理由在文件注释里写得很清楚。

---

## 1. Google 2026 排名的核心机制

### 1.1 Helpful Content 与 E-E-A-T 的真实地位

Google 的一手表述始终是：排序系统奖励「为人而写」的内容，而非为排名而造的内容；E-E-A-T **不是一个排名因子**，而是一组用于判断内容是否可信的因素集合，其中「**Trust is most important. The others contribute to trust**」。Google 给的操作框架是 Who / How / Why：谁写的（署名与作者页）、怎么做的（含 AI 参与的披露）、为什么做（若「why」是为了拿搜索流量，「that's not aligned with what our systems seek to reward」）。（A 档：developers.google.com/search/docs/fundamentals/creating-helpful-content）

Helpful Content 系统已于 2024 年 3 月并入核心排序系统，不再是独立周期性更新，而是持续信号（C 档广泛转述，与 Google 2024 官方公告一致）。

**含义**：E-E-A-T 对我们不是"加分项清单"，而是"可核验的事实"。律师人群 + 文书场景天然带 YMYL 气味（法律属于 Your Money or Your Life 范畴），Google 对这类主题的信任门槛更高——这意味着**作者署名、公司主体、地址、联系方式、安全与隐私页、数据处理边界声明**这些"无聊"的页面，对我们的权重高于对一般 SaaS。

### 1.2 意图匹配 > 一切

2026 年的一致经验（A 档 Google 文档 + B 档研究共同支持）：同一个词的 SERP 已经被拆成不同意图簇，一个页面只能服务一个意图。`legal ai` 这类词的 SERP 目前是"列表 + 媒体 + 大厂"，不是产品官网的位置；`ai contract redlining software` 这类词才是产品页的位置。**先看 SERP 长什么样，再决定造什么页面**，是比任何 on-page 技巧都重要的一步。

### 1.3 Title / Meta / H1 的实际权重

- **Title**：仍是最强的单点 on-page 信号，且 Google 会在它认为不合适时重写。当前我们全站继承 `AI WorkDeck` 是明显浪费。
- **Meta description**：**不是排名因子**，只影响 SERP 点击率（长期共识，Google 多次确认）。Google 的 AI 功能文档里也把它归为"帮助用户理解"的范畴。
- **H1**：语义结构的一部分，Google 官方 AI 指南明确建议"使用语义化 HTML"，但 H1 本身没有神奇权重。

### 1.4 内链与站点结构

Google 在 AI 功能文档里把内链写成硬性建议之一：内容要 "easily findable through internal links on your website"（A 档：developers.google.com/search/docs/appearance/ai-features）。Yext 的一项 2025 研究被广泛转述称：86% 的 AI 引用来自"在该主题上有 5 个以上互链页面"的站点，双向内链使被引概率提升 2.7×（**未经证实**：我只在 C 档转述中见到，未找到 Yext 原始报告全文）。方向是对的，倍数不要当真。

### 1.5 Core Web Vitals 的真实影响

John Mueller 的口径是："We've been pretty clear that Core Web Vitals are not giant factors in ranking"，同时又说它 "is a ranking factor, and it's more than a tie-breaker, but it also doesn't replace relevance"（C 档转述 seroundtable / SEJ，但引语稳定且多方一致）。结论：**CWV 是"别拖后腿"的及格线，不是增长杠杆**。Next.js SSG 站点通常天然及格，不值得为它投入专门排期。

### 1.6 结构化数据：2026 年已经缩水，别高估

必须知道的事实变化：
- **FAQ 富媒体结果已于 2026-05-07 停止展示**，6 月移除 Search Console 中的 FAQ 报表与 Rich Results Test 支持，8 月移除 API 支持。**但 `FAQPage` 作为 schema.org 类型仍然合法，留着不会有害。**（C 档：SEJ / 多家一致）
- HowTo 桌面端富媒体早在 2023-09 已废弃；2025-06 又移除了 Book Actions、Course Info、Claim Review、Estimated Salary、Learning Video、Special Announcement、Vehicle Listing 七类。
- `SoftwareApplication`（含 Offer + AggregateRating）仍是 SaaS/桌面软件最该做的一类，可拿到应用类富结果（C 档；schema.org 30.0 于 2026-03-19 确认该类型 stable —— **未经证实**，我未核对 schema.org 发布说明原文）。
- **关键的一手结论**：Google 的 AI 功能文档明确说，为 AI Overviews / AI Mode **不需要**特殊 schema：「You don't need to create new machine readable files, AI text files, or markup」，也没有 "special schema.org structured data"。它唯一强调的是「**structured data matches the visible text on the page**」。（A 档）

所以结构化数据的正确定位是：**做 Organization + SoftwareApplication + BreadcrumbList + Article（博客/文档），是为了实体消歧与富结果，不是为了讨好 AI。** 且必须与页面可见文本一致，否则是结构化数据 spam。

### 1.7 sitemap / hreflang / canonical 的正确姿势

- **sitemap**：我们目前完全没有。Next.js App Router 有 `app/sitemap.ts` 原生支持，双站 + 双语 + 动态路由（`/skills/[id]`、`/marketplace/plugins`、`/community/post/[id]`、`/u/[username]`）都应进 sitemap；`robots.txt` 里补 `Sitemap:` 行。
- **hreflang**：Google 官方三条硬规则——(1) 三种实现方式（head link / HTTP header / sitemap）等价；(2) **必须互指**，「If two pages don't both point to each other, the tags will be ignored」；(3) 用 ISO 639-1 语言码，别写 `UK`/`EU` 这类非法区域码；`x-default` 用于兜底。（A 档：developers.google.com/search/docs/specialty/international/localized-versions）
- **canonical**：仓库现有做法（页面级自报 canonical、跨站 hreflang 默认关、只对两站等价的营销页开）符合官方语义，**不要改动**。两站是不同缔约主体、不同适用法，法律文本页发跨站 hreflang 会是硬错误。

### 1.8 索引 ≠ 排名

Search Console 的 `Crawled - currently not indexed` 含义是：Google 抓了但决定暂不索引，通常是"价值/独特性不足"或内链孤岛，不是报错。处理顺序：先看是否重复/薄内容 → 补内链把孤儿页挂到高层级页面下 → URL Inspection 请求重新抓取。（C 档：Yoast / Onely / Conductor，一致）

而"被索引但不排名"是另一回事：说明内容与该词的意图不匹配，或站点在该主题上缺少可信度积累。**解法不是改 title，而是换词（打更长尾）或补齐主题簇**。

### 对 AI WorkDeck 的启示（§1）

1. **本季必做的三件基建**：`app/sitemap.ts`（覆盖双站双语与所有动态路由）+ `robots.txt` 加 `Sitemap:` 行 + 每页独立 `title`（`{页面主题} | AI WorkDeck` 而非全站同名）。这是目前投入产出比最高的一段。
2. **结构化数据只做四类**：`Organization`（含 logo/sameAs 指向各第三方站点）、`SoftwareApplication`（含 `operatingSystem: Windows, macOS`、`applicationCategory`、`offers`）、`BreadcrumbList`、博客/文档页 `Article`。**不要**为 AI 专门造 schema，且必须与可见文本一致。
3. **把 E-E-A-T 当作"可核验事实"来做**：公司主体信息、作者署名（真实法律/工程背景）、安全页与数据处理边界、更新日志——法律人群 + YMYL 语境下这些比多写十篇博客有用。
4. **CWV 只做及格线**，不设专项；把精力放在意图匹配与内链结构上。
5. **canonical/hreflang 现状是对的，写进规范别让后来人改坏**；补 sitemap 时同步补 `x-default`。

---

## 2. 一个新品牌怎么在「legal ai」这类词上出现

### 2.1 品牌词 vs 品类词

品牌词（`AI WorkDeck`）我们必然第一——这什么也不证明。品类词（`legal ai`、`legal ide`）的排名本质是**Google 认为"谁是这个品类里值得给用户的选项"**，这是一个关于**实体知名度**的判断，不是关于页面优化的判断。

Ahrefs 对 75,000 个品牌的相关性研究（B 档，Spearman 相关系数，样本条件：DR>40 且最高量关键词月搜索量 ≥800）给出的排序是：
- YouTube 提及 ≈ **0.737**（最强）
- YouTube 提及曝光量 ≈ 0.717
- 品牌网络提及（branded web mentions）**0.656–0.709**
- 品牌锚文本 0.511–0.628
- 品牌搜索量 0.352–0.466
- Domain Rating 0.266–0.326
- 站点页面数 ≈ 0.194（几乎无关）
- 反向链接 / URL Rating：弱

Ahrefs 自己强调 correlation ≠ causation。但方向足够清楚：**排在最前的三个信号全是站外品牌信号，不是链接指标、不是域名权重、不是 on-page**。（B 档：ahrefs.com/blog/ai-brand-visibility-correlations）

**这条对我们是最重要的一条**：想在 `legal ai` 出现，靠改官网改不出来；靠"让别人在网上谈论 AI WorkDeck"才能出来。

### 2.2 长尾与比较页：真正能吃到的部分

比较/替代类页面是 B2B SaaS 公认最高 ROI 的页面类型，且大多数公司做得极少（"市场领导者有几十个对比页，多数公司只有一两个"，C 档共识）。可落地的清单：

- `AI WorkDeck vs Tritium`、`vs Harvey`、`vs Spellbook`、`vs Luminance`（先做我们真敢比的）
- `Tritium alternatives`、`best legal drafting software for solo lawyers`
- `best AI tools for lawyers 2026`、`legal IDE explained`（品类定义页）
- 反向：`Cursor for lawyers` —— 这是一个**已经在社区里被使用的类比短语**，我们有机会成为该短语的规范答案

**红线**：比较页必须诚实（含我们不擅长的场景），否则既伤转化也踩 Google 的"薄内容/误导"判断。法律人群对夸大极敏感，且我们自己的 `growth/README.md` 已经写了合规红线。

### 2.3 内容集群（pillar + cluster）

结构是：一个 pillar 页（如 `/legal-ide` 或 `/what-is-a-legal-workdeck`）+ 8 篇左右 cluster 文章（尽调清单怎么做、Word 修订留痕如何审、引用核验怎么落地、WPS 与 Office 插件差异……）+ **双向内链**。这个模型在 2026 年不仅对 Google 有效，对 AI 引用同样有效（见 §1.4 的 Yext 数据，倍数未经证实但方向多方一致）。

### 2.4 programmatic SEO：能做但风险高

programmatic SEO（批量生成模板页）对我们**有一个合法且天然的入口**：`/marketplace`、`/skills/[id]`、`/plugins/{slug}` —— 每个 Skill/插件本来就是一个独立实体，有真实功能、截图、兼容性、更新时间。这类页面是**有真实内容的批量页**，不是 doorway。

但要非常小心 Google 的 `scaled content abuse` 定义：「using generative AI tools or other similar tools to generate many pages without adding value for users」（A 档：developers.google.com/search/docs/essentials/spam-policies）。判定标准是**是否为用户增加了价值**，不是"是否用了 AI"。所以规则是：**每个 Skill 页必须有该 Skill 独有的真实信息（真实截图、真实参数、真实用例），不能只是模板换名字。**

### 2.5 对 SaaS 特别有效的页面类型

按优先级：**比较页 > use-case 页（按人群/场景：律所尽调 / 企业法务合同 / 投行文件核对）> feature 页 > integrations 页（Office / WPS / 企查查 / TuShare）> changelog > glossary（法律 AI 术语表）> 模板库**。changelog 尤其被低估：它天然高频更新、天然可信、天然带产品实体名，对 AI 引用友好。我们已有 `/updates` 路由，是现成的资产。

### 对 AI WorkDeck 的启示（§2）

1. **接受"品类词是滞后指标"**：把 `legal ai` 从 KPI 里拿掉，换成"比较词/长尾词进前 10 的条数"和"AI 答案里被点名次数"。
2. **12 个月对比页节奏**：每月至少 1 个 `vs` 页 + 1 个 `alternatives` 页 + 1 个 integrations 页；从 `Tritium alternatives`、`AI WorkDeck vs Tritium` 开始（我们与 Tritium 的定位差异——插件生态 + 中文法律场景 + 双站——是真实的差异化素材）。
3. **主动定义 "legal IDE" 与 "Cursor for lawyers"**：做一个 pillar 页把这两个短语讲透（定义句 + 与传统 legal tech 的对照表 + 谁属于这个品类，含 Tritium）。定义品类的页面比"我们最好"的页面更容易被 AI 引用。
4. **把 marketplace / skills 当作合法的 programmatic 资产**，但给每个 Skill 页设"独有内容下限"（≥1 张真实截图 + 真实参数表 + ≥1 个具体用例），并把这条写进插件提交规范。
5. **YouTube 不是"可选渠道"，是相关性最强的单一信号**（B 档 0.737）。产品是桌面工具，天然适合录屏演示——这条应该单独立项。

---

## 3. GEO：AI 引擎如何选择引用来源

### 3.1 Google 的一手立场：GEO 就是 SEO

2026-05-15 Google Search Central 发布《A new resource for optimizing for generative AI in Google Search》，态度非常明确：「optimizing for generative AI search is optimizing for the search experience, and thus **still SEO**」。配套文档《AI Features and Your Website》给出的硬性事实（A 档，最高可信度）：

- 「**There are no additional requirements to appear in AI Overviews or AI Mode, nor other special optimizations necessary.**」
- 前提只有一个：页面被索引，且 **eligible to be shown with a snippet**（所以 `nosnippet` / `max-snippet:0` / `noindex` 会把你排除出 AI 功能——这是唯一真正的"AI 开关"）。
- 不需要：新的机器可读文件、AI 文本文件、markup、Markdown、内容切块（chunking）、特殊 schema。
- 需要：robots.txt 与 CDN 放行抓取、内链可达、良好页面体验、**重要内容以文本形式存在**、配图配视频、结构化数据与可见文本一致、提供 "valuable, unique, non-commodity content"。
- 关于刷提及：追逐不真实的品牌提及 "isn't as helpful as it might seem"。

**这段应当作为我们方案的宪法**。市面上 90% 的 "GEO 指南"（C 档）在卖 Google 明说不需要的东西。

### 3.2 Princeton GEO 论文：唯一的一手实验证据

Aggarwal 等，《GEO: Generative Engine Optimization》，arXiv:2311.09735，KDD'24（A 档）。GEO-Bench 含 10,000 条查询（8000/1000/1000 划分，来自 9 个数据集）。九种内容改写方法在 Position-Adjusted Word Count 指标上的相对提升：

| 方法 | 提升 |
|---|---|
| Quotation Addition（加入引语/直接引用） | **+41%**（主观印象指标 +28%） |
| Statistics Addition（加入统计数字） | **+40%** |
| Fluency Optimization（提升流畅度） | +29% |
| Cite Sources（标注来源） | +28% |
| Technical Terms | +18% |
| Authoritative（权威语气） | +17% |
| Easy-to-Understand | +14% |
| Unique Words | 几乎无提升 |
| **Keyword Stuffing** | **无提升，劣于基线** |

且**领域相关**：Cite Sources 与 Statistics Addition 在 **Law & Government 领域表现最好**——这正好是我们的领域。

这篇论文的价值在于它是唯一在受控实验里证明"内容可以被优化以提高 AI 答案可见度"的研究；它的局限是用的是原型生成引擎（2023 年），不等于今天的 ChatGPT/AIO。但"**加引语、加数据、标来源，别堆关键词**"这条建议同时被论文和 Google 官方指南支持，可以放心执行。

### 3.3 各引擎的引用偏好（B 档，波动极大）

Semrush 的两项研究：

**《The Most-Cited Domains in AI》**（2025-07-14 至 10-12，13 周，230,000+ prompts，1 亿+ 引用）：
- ChatGPT：Reddit、Wikipedia、Medium、Forbes、LinkedIn
- Google AI Mode：LinkedIn（约 15%）、YouTube、Reddit、Google
- Perplexity：Reddit、LinkedIn、NIH、Microsoft、Google
- **重要的警告信号**：ChatGPT 引用 Reddit 的比例从 2025-08 的约 60% 在一个月内跌到约 10%，Wikipedia 从约 55% 跌到 <20%。**单一渠道依赖是危险的**，平台一次调整就能归零。

**《2026 AI Visibility Index》**（2026 年 1–4 月，126M 美国 AI 搜索 prompts）：ChatGPT 平均每条回答引用约 15 个来源，Gemini 约 3 个；Perplexity 的高频被引域名包括 **G2、Gartner、NerdWallet、PCMag、TripAdvisor、Yelp**——即**商业意图查询上偏好评测聚合站与结构化对比源**。这一条对我们最有操作性：**想被 Perplexity 在"best legal AI software"上提到，G2/Capterra 上有条目比官网写得好更重要。**

其他被反复引用但我未能核到原始报告的数字（**未经证实**）：
- ChatGPT 与 Perplexity 的被引域名重叠仅 11%（The Digital Bloom，称基于 6.8 亿+ 引用）
- AI Overviews 引用中来自自然结果前 10 的比例从 2025-07 的 76% 降到 2026-03 的 38%
- earned media 占全部 AI 引用的 82–89%
- AI 流量转化率 ChatGPT 14.2–15.9% / Perplexity 10.5% / Claude 16.8% vs Google 自然 1.76%（这组数字在多篇 C 档文章间原样复制，来源不明，**建议不要写进任何汇报**）

### 3.4 「被 AI 提到」的三条路径

综合 A + B 档，可靠的因果链是：

1. **自有站可抓可引**：robots 放行 → 被索引（Google/Bing 双侧）→ 有明确的定义句和可提取的段落。
2. **第三方权威站有我们的条目**：G2 / Capterra / Legaltech Hub / Wikidata / Crunchbase / LinkedIn 公司页。这条是 Perplexity 类引擎的主路径。
3. **社区讨论里有我们**：Reddit / HN / Quora / 知乎。这条是 ChatGPT 的主路径，但波动最大（见 3.3）。

三条路径**必须同时做**，因为不同引擎走不同路，且单条路径随时可能被平台调整掐断。

### 3.5 内容写法（可直接给写手的规则）

- **首屏直接回答**：页面开头 2–3 句给出可独立成立的定义/答案，不要铺垫。
- **明确的实体命名**：每个关键段落里完整写出 "AI WorkDeck"，别用"我们的产品"、"本平台"。AI 抽取时需要实体名与事实在同一句里。
- **加数据、加引语、标来源**（论文支持，且在 Law & Government 领域效果最好）。
- **可提取的结构**：200–400 词的独立小节、表格、编号列表。
- **FAQ 段落照写**：虽然 FAQ 富媒体已废弃（§1.6），问答式段落对 AI 抽取仍然友好，`FAQPage` 标记留着无害。
- **重要内容必须是文本**（Google 明确要求）——我们首页大量视觉/动效表达的卖点，必须有等价文本版本。

### 3.6 llms.txt：结论是"低优先级，可做可不做"

- Google 的 Gary Illyes 2025-07 明确说不支持也不打算支持；John Mueller 把它类比为已被废弃的 keywords meta 标签；Google 2026-05-15 的 AI 指南明说 AI Overviews / AI Mode 不需要它。（A 档 + C 档转述一致）
- SE Ranking 对 30 万域名的统计：采用率 **10.13%**；90 天窗口内 5 亿+ AI bot 访问中，**只有 408 次针对 llms.txt 的请求**（B/C 档，数字待核，但量级足以说明问题）。
- 明确支持它的是开发者工具侧：Anthropic（Claude/ClaudeBot）、Cursor、Mintlify；OpenAI 在 Agents SDK 和 Agentic Commerce Protocol 里用它，**不是**在 ChatGPT 搜索里用。

结论：**写一个 `llms.txt` 成本是半小时，收益接近零但非负**。可以顺手做，绝不能占任何排期，更不能写进 KPI。

### 3.7 robots.txt 对 AI 爬虫的放行策略

OpenAI 官方文档（A 档：developers.openai.com/api/docs/bots）：
- `OAI-SearchBot` —— "used to surface websites in search results in ChatGPT's search features" → **必须允许**（这是被 ChatGPT 引用的前提）
- `GPTBot` —— "used to crawl content that may be used in training our generative AI foundation models" → 训练用，可自主决定
- `ChatGPT-User` —— 用户主动触发的抓取，官方注明 "robots.txt rules may not apply"

同理：`PerplexityBot`（Perplexity 检索）、`ClaudeBot` / `Claude-SearchBot`（Anthropic）、`Google-Extended`（Google 的训练与 grounding 控制，**注意：它不控制 AI Overviews/AI Mode**——AI Overviews 只受 Googlebot 与 snippet 控制影响，见 A 档 AI features 文档）、`Bingbot`（ChatGPT search 与 Copilot 的检索底座）。

**我们的策略应当是：搜索类爬虫全部放行，训练类爬虫也放行**——理由是我们是要被推荐的一方，出现在训练语料里对品牌实体识别有利，且我们没有需要保护的付费内容。唯一要拦的是 `/admin`、`/account` 这类页面（目前靠页面级 `NOINDEX` meta，可以在 robots 里再加一层）。

### 3.8 IndexNow

开放协议，参与方：**Bing、Yandex、Seznam、Naver、Yep；Google 不参与**（C 档共识，与官方一致）。价值在于：**Bing 的索引是 ChatGPT search 与 Microsoft Copilot 的检索底座**，Bing 没索引 = 这两个引擎看不到你。对我们这种页面频繁增删的站（marketplace / skills / community / updates），IndexNow 是低成本高确定性的动作。

Bing 侧另有一个新工具：Bing Webmaster Tools 于 **2026-02-09** 上线 AI Performance 报表（public preview），跟踪在 Copilot / Bing AI summaries 中的引用，微软自称是 "an early step toward Generative Engine Optimization (GEO) tooling"（C 档转述）。

### 对 AI WorkDeck 的启示（§3）

1. **把 Google 官方 AI 指南当宪法**：不做 chunking、不做特殊 schema、不为 AI 造文件；只保证"可索引 + 可 snippet + 内容是文本 + 内链可达"。这四条我们目前只有第三条部分达标。
2. **改写规则立刻可执行**：所有营销页与文档页首屏 2–3 句给定义、正文补统计数字与外部引用、完整写出 "AI WorkDeck" 实体名。论文证据显示这在 Law & Government 领域收益最高。
3. **robots.txt 本周就改**：加 `Sitemap:` 行；显式 `Allow` `OAI-SearchBot` / `PerplexityBot` / `ClaudeBot` / `Claude-SearchBot` / `Google-Extended` / `Bingbot`；`Disallow: /*/admin`、`/*/account`。
4. **接 IndexNow**（Bing/Yandex/Naver/Seznam 一次通知），并注册 Bing Webmaster Tools 用它的 AI Performance 报表——这是目前唯一免费的官方 AI 引用监测。
5. **llms.txt 顺手做，不立项**；把省下来的时间放到第三方站点条目（§4）上。

---

## 4. 第三方目录与信号

### 4.1 通用 SaaS 必占位（按对 AI 引用的价值排序）

| 站点 | 为什么 | 优先级 |
|---|---|---|
| **G2** | Perplexity 商业意图查询的高频被引域名之一（B 档 Semrush） | 最高 |
| **Capterra**（含 GetApp / Software Advice，同属 Gartner Digital Markets） | 法律软件品类页在 Google 上长期占位 | 最高 |
| **LinkedIn 公司页** | 在 ChatGPT search（14.3%）、Google AI Mode（13.5%）、Perplexity（5.3%）响应中均高频出现（B 档 Semrush，2026） | 最高 |
| **YouTube** | Ahrefs 75k 品牌研究中与 AI 可见度相关性最强（0.737，B 档） | 最高 |
| **Wikidata** | 实体锚点，喂 Google 知识图谱与多数 LLM 管线；门槛低于 Wikipedia 但**不为零**，需要独立可靠来源（新闻报道、政府登记、行业数据库） | 高 |
| **Product Hunt** | 我们已有 `growth/campaigns/2026-09-product-hunt-launch.md`，正在做 | 高 |
| **Crunchbase** | 公司实体信息的标准来源 | 中 |
| **AlternativeTo / SaaSHub** | "X alternatives" 类查询的常见来源，且是常青结构化条目 | 中 |
| **There's An AI For That / Futurepedia / Toolify** | AI 工具目录，权重一般但成本极低 | 中 |
| **GitHub** | 我们首页已有 "View source on GitHub" CTA；开源/插件 SDK 仓库是开发者侧的实体信号 | 中 |
| **TrustRadius** | 企业采购侧 | 低 |
| **Wikipedia** | 需要"独立二手来源的实质性报道"，多数中小品牌达不到；**不要自建，会被删并留下负面记录** | 暂缓 |

### 4.2 Legal tech 垂直目录

- **Legaltech Hub**（legaltechnologyhub.com）—— 自称"全球法律科技解决方案目录"，法律科技采购方研究工具时的主要入口。**这是我们最该拿下的一个垂直位。**
- **LawNext Legal Technology Directory** —— 由 LawSites/Bob Ambrogi 运营，法律科技媒体侧影响力大。
- **awesome-legaltech**（github.com/Vaquill-AI/awesome-legaltech）—— 开源清单，提 PR 即可，成本几乎为零。
- Law Technology Today（ABA 法律技术资源中心的出版物）—— 属于媒体而非目录，路径是投稿/被报道，不是提交条目。（对其当前活跃状态我未做核实，**未经证实**）

### 4.3 关于"刷提及"的红线

Google 明确说：追逐不真实的品牌提及 "isn't as helpful as it might seem"，因为质量系统与反垃圾系统会处理（A 档，2026-05 指南）。另外买链接属于 `link spam`（A 档 spam policies）。**结论：只做真实条目、真实评价、真实社区参与。** 我们的用户是律师，一旦被抓到刷评价，对专业形象的伤害远大于任何 SEO 收益。

### 4.4 Reddit / HN / 知乎 的参与规则

Reddit 的官方内容政策要求"post authentic content into communities where you have a personal interest"，禁止 spam、刷票、马甲。老的 90/10 规则已被更简单的原则替代：**做真正的参与者，不是纯推广者**；版规判定看账号整体行为。可行做法：找已有的讨论去回答（而不是自己发帖）、先给价值再提产品、公开披露身份、用各版的 weekly self-promo 线程。（C 档，多家一致）

一句话总结值得记住："it's fine to be a redditor with a website, it's not fine to be a website with a Reddit account."

### 对 AI WorkDeck 的启示（§4）

1. **本季度目标：拿下 6 个位置** —— G2、Capterra、LinkedIn 公司页、Legaltech Hub、Wikidata、awesome-legaltech PR。这六个的合计成本低于写六篇博客，但对 AI 引用的影响大得多。
2. **YouTube 单独立项**：桌面产品的功能演示视频（尽调清单、Word 修订留痕、引用核验、WPS 插件）——这是 B 档数据里相关性最强的信号，我们目前是零。
3. **G2/Capterra 的评价要真实获取**：走产品内引导（已购买用户）+ 客服邀请，不买评价。评价数量本身是 Perplexity 类引擎的筛选依据。
4. **Wikipedia 暂缓，Wikidata 先做**：先积累独立媒体报道，再谈条目。
5. **Reddit/HN 由懂产品的人亲自参与**（r/Lawyertalk、r/LawFirm、r/legaltech、HN Show HN），不外包、不马甲，把披露身份写进规范。

---

## 5. 中文 / 国内站的差异（简要）

- **百度**：新站收录仍慢。可靠动作是百度搜索资源平台（ziyuan.baidu.com）提交 sitemap + **主动推送 API**。有 C 档博客称 API 推送使收录快 3–5 倍、"已抓取未收录"比例从 2024 年约 15% 升到 2026 年初 40%+ —— **未经证实**（单一来源，是个人 SEO 博客）。方向可信，数字不可引用。
- **必应中国**：与国际 Bing 同一索引体系，且是 ChatGPT/Copilot 的底座，**性价比高于百度**。IndexNow 一次通知同时覆盖。
- **国内 AI 搜索**（豆包、Kimi、DeepSeek、夸克、腾讯元宝）：C 档中文资料一致强调"多信源交叉印证"——只在官网出现不够，需要在行业媒体、评测平台、百科、专业社区（知乎、微信公众号、CSDN）同时有提及。至于各引擎的具体引用来源占比，我**未找到任何可信的一手研究**；中文媒体给出的"8.2 亿 AI 搜索月活"、"GEO 市场规模 30 亿"等数字口径不明，**未经证实，不建议引用**。
- **知乎**是国内最接近 Reddit 角色的平台（中文 AI 引擎与中文搜索都大量抓取），**微信公众号**内容对搜狗/微信搜索与部分国内模型可见，但对 Google 基本不可见。
- 我们已有的「法人格测试」等增长玩法（`growth/`）天然产出可被知乎讨论的内容，但 `growth/README.md` 的红线（不进微信 webview、不做利诱分享）必须继续遵守。

### 对 AI WorkDeck 的启示（§5）

1. **国内优先级排序：必应中国 > 知乎 > 百度 > 微信公众号**。必应因为同时喂 ChatGPT/Copilot，是唯一"一鱼两吃"的渠道。
2. **百度只做基建不做内容投入**：提交 sitemap + 接主动推送 API，然后观察，不为百度专门写内容。
3. **知乎需要一个长期账号**：由产品/法律背景的同事以真实身份回答"律师用什么 AI 工具"类问题，与 Reddit 同一套规范。
4. **中文数字一律不进汇报**：目前所有中文 GEO 市场数据都无法溯源。
5. 双站分工要清楚：`aiworkdeck.com` 服务中文/国内检索面，`workdeck.ai` 服务英文/Google/AI 引擎面，**内容不要互相机翻复制**（会同时伤两边的独特性判断）。

---

## 6. 衡量与工具

### 6.1 官方免费工具（必须先接满）

- **Google Search Console**：两站分别验证。2026-06 起新增 **Search Generative AI 性能报表**，可看在 AI Overviews / AI Mode / Discover 的 AI 功能中的**曝光量**，可按页面、国家、设备、日期（小时到月）拆分；**目前没有点击、CTR 和 query 数据**。（A 档 Google 博客 + C 档 Search Engine Land 一致）
- **Bing Webmaster Tools**：2026-02-09 上线 **AI Performance** 报表（public preview），跟踪 Copilot / Bing AI 摘要中的引用。这是目前唯一能看到"AI 引用份额"的免费官方工具。
- **IndexNow**：不是监测工具，但接上后 Bing 侧数据才有意义。

### 6.2 手工 prompt 集（最便宜也最诚实的方法）

建一张固定的 prompt 表（30–50 条），每月在 ChatGPT / Perplexity / Google AI Mode / Gemini / Copilot / 豆包 / Kimi 上各跑一遍，记录"是否提到 AI WorkDeck / 排第几 / 引用了哪个域名"。prompt 示例：
`best AI tools for lawyers` / `legal drafting software with tracked changes` / `Tritium alternatives` / `AI document editor for law firms` / `Cursor for lawyers` / `律师用什么 AI 写文书` / `法律文书 AI 工具推荐`。

这套表的价值不只是打分，更是**看 AI 引用了谁**——那份被引域名清单就是我们的 §4 目标清单。

### 6.3 第三方工具（按预算）

| 工具 | 定位 | 价格（C 档，2026） |
|---|---|---|
| Otterly AI | 入门，覆盖多引擎 | 约 $29/月起 |
| Peec AI | 中端，性价比高 | €89–199/月 |
| Semrush AI Toolkit | 已有 Semrush 时的加购 | 约 $99/月起 |
| Ahrefs Brand Radar | 品牌提及监测 | 需含基础套餐，约 $828/月起 |
| Profound | 企业级，来源级引用分析 | 约 $499/月起 |

**建议：先用官方免费工具 + 手工 prompt 表跑 3 个月，有了基线再决定是否买 Otterly/Peec。** 现阶段买 Profound 是浪费。

### 6.4 KPI 与时间预期

分层设 KPI（避免拿"legal ai 排名"这种滞后指标折磨自己）：

- **月 1–3（基建期）**：sitemap 覆盖率、GSC 已索引页面数、robots/AI 爬虫命中日志、Bing 索引页面数、第三方条目上线数（目标 6 个）。
- **月 3–6（长尾期）**：长尾/比较词进前 20 的条数、GSC AI 功能曝光量（新报表）、Bing AI Performance 引用次数、手工 prompt 表命中率（从 0% 起）。
- **月 6–12（增长期）**：非品牌自然流量、比较词进前 10 的条数、AI 引用命中率、注册/下载来源中 AI referral 占比。
- **月 12+**：品类词可见度。

时间预期（C 档共识，多家一致但无一手数据，**当作粗略参考**）：新域名在真实商业niche 上 **6–12 个月**才见有用流量；头部词 **12–24 个月**；低竞争长尾 **1–3 个月**可见。B2B 一般 3–4 个月见初步可见度提升、6–9 个月见线索影响。

关于 AI 流量的绝对规模，需要给总经理一个冷静的锚：**B2B SaaS 的 AI 对话 referral 目前约占总流量 1%，自然搜索约 23.4%**（B 档 Similarweb/相关研究转述）；AI 平台整体只占全球互联网流量的 0.15%–0.25%。**GEO 现在做的是卡位与品牌认知，不是当期流量。**

### 对 AI WorkDeck 的启示（§6）

1. **本月完成**：GSC 两站验证 + Bing Webmaster Tools 注册 + IndexNow 接入 + 建 30 条 prompt 表并跑第一次基线。
2. **KPI 按月分层设**，第一季度不看排名只看基建与索引覆盖；把"手工 prompt 表命中率"作为 GEO 的北极星。
3. **不买付费 AI 监测工具**，至少 3 个月内不买。
4. **给总经理设期望**：品类词可见度是 12 个月量级的事；AI referral 当期占比在 1% 量级，做 GEO 的理由是卡位不是流量。
5. **每月复盘"AI 引用了谁"**，把新出现的被引域名滚动加入 §4 的目标清单。

---

## 7. 常见错误与反模式

Google 垃圾政策原文定义（A 档：developers.google.com/search/docs/essentials/spam-policies）：

- **Scaled content abuse**：为操纵排名而生成大量页面；明确点名「using generative AI tools or other similar tools to generate many pages without adding value for users」。→ **我们的 marketplace/skills 批量页必须有独有真实内容。**
- **Site reputation abuse**：借已有域名权重发布第三方内容。→ 不要把官网出租给外部内容/客座垃圾文。
- **Doorway pages**：为覆盖查询而造的多个近似站点/页面。→ 双站（aiworkdeck.com / workdeck.ai）**不能**做成同一份内容的机翻镜像，否则风险接近 doorway；仓库现有的"两站不是镜像"判断是正确的防线。
- **Cloaking**：给用户和搜索引擎看不同内容。→ 不要为爬虫特供文本版。
- **Link spam**：买卖链接、过度互链。→ 不买链接、不参与链接互换。
- **Keyword stuffing**：堆词。→ Princeton 论文也证明堆词在 AI 引擎上**劣于基线**，两边都罚。
- **Thin affiliate**：无增值的搬运内容。

其他必须避免的：

- **SPA 全客户端渲染**：Google 要求"重要内容以文本形式存在"，而多数 AI 抓取器（OAI-SearchBot、PerplexityBot）对 JS 渲染的支持远弱于 Googlebot。我们是 Next.js，**必须守住 SSG/SSR，不要为了动效把首屏卖点做成纯客户端渲染**。`app/[lang]/layout.tsx` 的注释里已经点到"不包 Suspense 会让整棵静态页树退回 CSR"——这个意识要保持。
- **canonical 写在 layout 层**：会让每个子页声明自己是首页的副本。仓库注释里记录了线上实测的这个事故，**不要回退**。
- **用 `nosnippet` / `max-snippet` 试图"保护内容"**：这会直接把页面排除出 AI Overviews / AI Mode（A 档）。
- **为 AI 造特殊文件/标记**：Google 明说不需要（llms.txt、chunking、特殊 schema）。
- **刷第三方提及与评价**：Google 明说无效，且对律师客群是形象自杀。
- **把 AI 引用押在单一平台**：Semrush 数据显示 ChatGPT 对 Reddit 的引用一个月内从 ~60% 跌到 ~10%。

### 对 AI WorkDeck 的启示（§7）

1. **写一份《内容生产红线》并入 `growth/playbooks/`**：批量页独有内容下限、禁止买链接/刷评价、双站禁机翻镜像、禁 `nosnippet`。
2. **在 CI 或 review checklist 里加两条护栏**：新页面必须有独立 `title` + 页面级 `pageAlternates()`；首屏关键文案必须在 SSG 输出的 HTML 里可见（可用 `curl | grep` 验证）。
3. **AI 生成内容不是禁区，无价值的 AI 页面才是**。允许用 AI 起草，但每篇必须有人类补充的独有信息（实际用例、真实截图、真实数据），并在需要时披露。
4. **双站内容策略必须分化**：不同的案例、不同的法域表述、不同的定价与主体，这既是合规要求也是 SEO 要求。
5. **保持"三条路径都走"**（自有站 / 第三方站 / 社区），避免单点依赖。

---

## 来源清单

**A 档（一手官方 / 学术）**
1. Google Search Central — Creating Helpful, Reliable, People-First Content：https://developers.google.com/search/docs/fundamentals/creating-helpful-content
2. Google Search Central — AI Features and Your Website：https://developers.google.com/search/docs/appearance/ai-features
3. Google Search Central Blog — A new resource for optimizing for generative AI in Google Search（2026-05-15）：https://developers.google.com/search/blog/2026/05/a-new-resource-for-optimizing
4. Google Search Central Blog — Introducing Search Generative AI performance reports in Search Console（2026-06）：https://developers.google.com/search/blog/2026/06/gen-ai-performance-reports
5. Google Search Central — Spam policies for Google web search：https://developers.google.com/search/docs/essentials/spam-policies
6. Google Search Central — Localized versions of your pages（hreflang）：https://developers.google.com/search/docs/specialty/international/localized-versions
7. Google Search Central — Latest documentation updates：https://developers.google.com/search/updates
8. OpenAI — Bots / crawlers documentation（OAI-SearchBot / GPTBot / ChatGPT-User）：https://developers.openai.com/api/docs/bots
9. Aggarwal et al., *GEO: Generative Engine Optimization*, arXiv:2311.09735 / KDD'24：https://arxiv.org/abs/2311.09735 ；全文 HTML：https://ar5iv.labs.arxiv.org/html/2311.09735 ；ACM：https://dl.acm.org/doi/10.1145/3637528.3671900

**B 档（厂商研究）**
10. Ahrefs — AI brand visibility correlations（75,000 brands）：https://ahrefs.com/blog/ai-brand-visibility-correlations
11. Ahrefs — Search rankings vs AI citations：https://ahrefs.com/blog/search-rankings-ai-citations
12. Ahrefs 报告新闻稿（YouTube mentions 为最强信号）：https://www.businesswire.com/news/home/20260526119691/en/Across-75000-Brands-YouTube-Mentions-Are-the-Strongest-Signal-of-AI-Visibility-New-Ahrefs-Report-Reveals
13. Semrush — The Most-Cited Domains in AI: A 3-Month Study：https://www.semrush.com/blog/most-cited-domains-ai/
14. Semrush — 2026 AI Visibility Index（126M prompts）：https://www.semrush.com/news/463141-semrush-releases-expanded-2026-ai-visibility-index-analyzing-126-million-ai-search-prompts/
15. Semrush — Google publishes generative AI search guide：https://www.semrush.com/blog/google-publishes-generative-ai-search-guide/
16. Similarweb — AI Search Stats in 2026：https://www.similarweb.com/blog/marketing/geo/gen-ai-stats/

**C 档（媒体 / 代理商转述，供交叉验证）**
17. Search Engine Journal — Google's New AI Search Guide Calls AEO And GEO 'Still SEO'：https://www.searchenginejournal.com/googles-new-ai-search-guide-calls-aeo-and-geo-still-seo/575026/
18. Search Engine Land — Google publishes guide on optimizing for generative AI features：https://searchengineland.com/google-publishes-guide-on-optimizing-for-generative-ai-features-477671
19. Search Engine Land — GSC AI performance reports rolling out globally：https://searchengineland.com/google-search-console-ai-performance-reports-and-search-generative-ai-control-rolling-out-globally-486269
20. Search Engine Journal — Google Drops FAQ Rich Results From Search：https://www.searchenginejournal.com/google-drops-faq-rich-results-from-search/574429/
21. Search Engine Roundtable — Google on ranking drops and Core Web Vitals：https://www.seroundtable.com/google-ranking-drop-core-web-vitals-38297.html
22. Search Engine Journal — Mueller dismisses Core Web Vitals impact on rankings：https://www.searchenginejournal.com/googles-mueller-dismisses-core-web-vitals-impact-on-rankings/530715/
23. Presenc AI — State of llms.txt 2026（采用率与爬虫请求数据）：https://presenc.ai/research/state-of-llms-txt-2026
24. Passionfruit — Should I Create an llms.txt File? Google's 2026 guidance explained：https://www.getpassionfruit.com/blog/should-i-create-an-llms.txt-file-google-s-2026-guidance-explained
25. Cite.sh — Which AI Crawlers to Allow in robots.txt: 2026 List：https://www.cite.sh/blog/ai-crawler-guide/
26. SearchScore — AI bot permissions in robots.txt：https://searchscore.io/guides/ai-crawlers-robots-txt/
27. Onely — How to fix "Crawled – currently not indexed"：https://www.onely.com/blog/how-to-fix-crawled-currently-not-indexed-in-google-search-console/
28. Yoast — What is "Crawled - currently not indexed"：https://yoast.com/crawled-currently-not-indexed-google-search-console/
29. Passionfruit — B2B Comparison Page SEO framework（vs / alternatives 页）：https://www.getpassionfruit.com/blog/b2b-comparison-pages-and-alternatives-seo-framework-examples
30. Backstage SEO — B2B SaaS comparison pages 2026：https://backstageseo.com/blog/b2b-comparison-pages/
31. Conductor — Topic Clusters & Pillar Pages（含 Yext AI Citation Study 转述）：https://www.conductor.com/academy/topic-clusters/
32. Legaltech Hub：https://www.legaltechnologyhub.com/
33. awesome-legaltech（GitHub 清单）：https://github.com/Vaquill-AI/awesome-legaltech
34. TheSaaSDir — 6 AI Tool Directories Cited by ChatGPT & Perplexity（2026）：https://thesaasdir.com/blog/best-directories-ai-tools/
35. MLforSEO — Wikidata for Brands: notability criteria：https://www.mlforseo.com/knowledge-graph-strategy/wikidata-for-brands-notability-criteria-and-a-realistic-path/
36. Otterly — Best AI Search Monitoring Tools 2026：https://otterly.ai/blog/best-ai-search-monitoring-and-llm-monitoring-solutions/
37. Surmado — Best AI Visibility Tools 2026: Profound vs Peec vs Otterly：https://www.surmado.com/blog/best-ai-visibility-tools-2026
38. ALM Corp — Bing Webmaster Tools AI Performance Report guide（2026-02-09 上线）：https://almcorp.com/blog/bing-ai-performance-webmaster-tools-complete-guide/
39. SearchOptimo — IndexNow explained（参与引擎清单）：https://searchoptimo.com/blog/indexnow-explained
40. Redship — Reddit self-promotion rules 2026：https://redship.io/blog/reddit-self-promotion-rules
41. 时空跃动 — 主流搜索引擎 SEO 站长平台与提交入口全汇总（2026）：https://stjhub.com/archives/019b7376-0047-7000-a657-97836052e1a2
42. 王尘宇 — 2026 百度收录加速指南（主动推送 API）：https://www.wangchenyu.com/baidu-help/155632.html
43. Digital Bloom — 2026 AI Citation Position & Revenue Report（转化率数字，未采信）：https://thedigitalbloom.com/learn/ai-citation-position-revenue-report-2026/

**竞品 / 产品参考**
44. Tritium：https://tritium.legal/

**内部文档（本仓）**
45. `doc/websiteprd.md`、`growth/README.md`、`dictionaries/en.json`、`lib/page-metadata.ts`、`public/robots.txt`
