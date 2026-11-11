# AI WorkDeck 关键词地图与竞品 SEO/GEO 拆解

调研日期：2026-09-03。方法：WebSearch 实测 SERP（美国区）、curl 抓取竞品 robots/sitemap/结构化数据、WebFetch 读取页面。
产品口径来自 `doc/websiteprd.md` 与 `dictionaries/en.json`：文档编辑器（LibreOffice 内核、修订留痕）、AI 起草（可溯源引用）、Office/WPS 插件、Skill 广场/插件生态、录音转写、本地优先（文件不出本机）、Windows/macOS 桌面端。

---

## 一、SERP 实测记录

> 说明：WebSearch 返回美国区结果，中文词的结果偏「中文内容在美区的可见部分」，仅作方向性参考，百度/微信生态需另行人工核。

### 1.1 英文词

| 关键词 | 前排域名（按返回顺序） | 页面类型 | 标题措辞观察 |
|---|---|---|---|
| legal ai | harvey.ai、thomsonreuters、lexisnexis、ailawyer.pro、gc.ai、cetient.com、lawconnect | 厂商首页为主 | 大厂垄断；标题用 "AI software for legal and professional services" |
| legal ai software | ironcladapp（列表文）、harvey.ai、clio.com、eve.legal（列表文）、barchart（行业报告） | 厂商站 + 厂商博客列表文 | "The 15 Best…"「Best…for Lawyers (2026)」标题模板统治 |
| ai for lawyers | bloomberglaw、umich、clio（×2）、americanbar.org、darrow.ai、coursera、substack | 教育/协会/列表文 | ABA、Bloomberg Law 等权威站占位，非厂商站 |
| ai legal drafting tool | mycase、lexisnexis、legalfly、clio/draft、paxton.ai/drafting、kleap、g2 | 厂商功能页 + 列表文 | 出现 **功能子页**（/draft、/drafting）能排 |
| legal document ai | juro.com、thomsonreuters、americanbar（×2）、doclegal.ai、lawdistrict | 指南文为主 | "Your guide to…"「How AI Enhances…」 |
| ai contract drafting | sirion.ai、mycase、thomsonreuters、legalontech、legalfly、spellbook.com、alternativeto | 厂商首页 + buyer's guide | Spellbook 首页直接命中 |
| **legal ide** | lawinsider（词典）、wikipedia、**law.mit.edu**、**news.ycombinator.com（Show HN: Tritium）**、fda.gov、irb.ucsf.edu | 词义被 FDA「Investigational Device Exemption」占据 | 词义歧义极重；Tritium 靠 **HN 帖**而非自己官网进前 10 |
| cursor for lawyers | linkedin（×2）、medium、peerlist、creandum（Vesence）、artificiallawyer、crosby.ai | 社媒/媒体/VC 博客 | 无人做承接页，全是 UGC 与媒体 |
| legal ai desktop app | libguides.law.ucdavis、smokeball、americanbar、harvey.ai、Google Play、ailawyer.pro、lawconnect、App Store | 高校指南 + 应用商店 | **无一个真正的桌面端厂商站命中**，空位明显 |
| best legal ai tools 2026 | definely、ttms、darrow、spellbook、gc.ai（×2）、haqq.ai | 全是厂商自建列表文 | 中小厂商靠 "N Best… (2026)" 抢占 |
| ai for microsoft word lawyers（add-in） | microsoft marketplace（×3）、gavel.io、legalfly、gc.ai、artificiallawyer、spellbook | 微软商店 + 厂商教程文 | **Microsoft Marketplace 页面排前**，值得上架 |
| tritium legal | law.cornell（氚法规）、**tritium.legal/about**、**tritium.legal/**、quora、nrc.gov | 品牌词被元素同名词稀释 | 官网只占 2 席 |
| tritium legal alternative | getapp、omegaforums、edcforums、cornell、smolsys… | **几乎全是手表/EDC 论坛** | 品牌 alternative 词尚未成型，只有 GetApp 目录页 |
| harvey ai alternative | ibl.ai、paxton.ai/compare、clio、eigent.ai、isometrik、gc.ai | **全部是竞品自建比较页** | 模板：`/compare/harvey-alternative`、`/blog/harvey-alternatives` |
| spellbook ai alternative | g2、spellbook 自家页、legalfly、topai.tools、startuphub、slashdot、contracko、haqq、aiproductivity | 目录站 + 竞品比较页 | 目录站（G2/Slashdot/TopAI）占一半 |
| can ai draft contracts | mycase、hyperstart、harvey.ai/blog、bloomberglaw、americanbar、clio | 问题型博客 | 全部是 blog/insights 长文 |
| ai transcription for lawyers | sonix.ai（4 个页面）、verbit、speechtext.ai、clio 词条、rask.ai | 垂直厂商站 | Sonix 用 /legal、/legal-firms 多个行业落地页霸屏 |

### 1.2 中文词

| 关键词 | 前排域名 | 页面类型 |
|---|---|---|
| 法律AI / 律师AI工具 | delilegal.com（得理）、ai-bot.cn（AI工具集，2 席）、aihub.cn、zhihu、csdn、icourt.cc | **导航/聚合站 + 知乎/CSDN 占绝对多数**，厂商站仅得理、iCourt |
| AI法律助手 | ai-bot.cn（2 席）、aihub.cn、aig123.com、sxls.com、mambabit.com、ai138.com | 几乎全是 AI 工具导航站 |
| 合同审查AI | cloud.baidu.com、ai.baidu.com、textin.com、xfyun.cn、csdn（2 席）、zhihu、tensorbounce | 大厂解决方案页 + CSDN/知乎 |
| 法律文书 AI 写作 | csdn（2 席）、zhihu（3 席） | **纯 UGC**，无厂商站 |
| Word/WPS 法律 AI 插件 | law.wps.cn、看雪论坛、github、飞书文档、wps.com、wps.ai、wordollama.com | 官方 + 开源 + 社区文档 |

**中文站关键结论**：中文法律 AI 词的分发权在**导航站（ai-bot.cn / aihub.cn / aig123）、知乎、CSDN、微信公众号**手里，不在搜索引擎的厂商站。aiworkdeck.com 的 SEO ROI 显著低于「上导航站 + 知乎/公众号内容运营」。

---

## 二、Tritium（tritium.legal）拆解

### 站点事实
- **title**：`Tritium | Legal Drafting and Redlining Software for Lawyers`；**description**：`Draft, review and redline Word documents and PDFs on your desktop`；**H1**：`Legal drafting workspace`。
- 注意：官网 title/H1/description **完全没有出现 "IDE"**。IDE 是它的对外叙事（HN 标题、about 页、媒体），不是它的 SEO 承接词。
- **页面规模：仅 38 个 URL**（sitemap.xml 全量）：首页、/download、/about、/press、/source、/wasm、/feedback、/license、/privacy + **12 篇 blog** + **15 篇 docs**（getting-started / tutorial 7 篇 / security / enterprise / web-api / faq）。
- **无 /pricing、无 /features/*、无 /use-cases/*、无比较页**。定价只在 GetApp 等第三方目录上可见（Community $0 / Commercial $425 per user/year）。
- **技术 SEO 做得干净**：robots.txt + sitemap + canonical + OG/Twitter card + RSS + 两组 JSON-LD（`Organization`+`WebSite`，以及 `SoftwareApplication`，含 featureList、operatingSystem、downloadUrl、softwareHelp）。首页仅 11KB 静态 HTML，无框架。
- **无 llms.txt**（404）。
- 博客 12 篇，2025-10 到 2026-05，**主题几乎全是 Rust 工程**（egui 帧率、Tokio 并发、Word 规范、Outlook COM 加载项、字体、i18n、网络盘）。只有 1 篇 "Redlining, or Value Over Artifacts" 和 1 篇 "Legal's Jane Street" 面向法律读者。

### 外链与提及
- **Hacker News 是它的主引擎**：Show HN "Tritium – The Legal IDE in Rust"（2025-06-12）**312 分 / 167 条评论**，另有一条 44091019 的提交。这条 HN 帖至今仍在 `legal ide` SERP 前 10。
- MIT Computational Law Report 那篇 "What Would an IDE for Law look like?" 与它同排，把这个词的语义坐实。
- 软件目录：GetApp、Software Advice、SoftwareFinder 都有条目（这是 `tritium alternative` 的唯一承接方）。
- **未见** Product Hunt、Reddit 讨论、YouTube、主流 legaltech 媒体（Artificial Lawyer 未见报道）。LinkedIn/X（@urandomd）有官方号。

### 「它为什么能排上 legal ide」——结论
1. **词本身几乎没有商业竞争**：`legal ide` 的搜索意图被 FDA 的 Investigational Device Exemption 和 lawinsider 词典占掉，没有任何 legaltech 厂商在争这个词，剩下的语义空位只需要 1–2 个强信号就能占住。
2. **占位的不是它的官网，是 Hacker News**。312 分的 Show HN 帖 + MIT Law Report 的概念文，构成了这个词的全部「主题权威」。它自己的首页甚至不写 IDE。
3. **它做对的可复制部分**：小而干净的静态站 + 完整 `SoftwareApplication` JSON-LD + 15 篇 docs（docs 是桌面软件最好的长尾承接）+ 工程博客换来的开发者社区背书。做错/没做的：无 pricing 页、无功能页、无比较页、无 llms.txt，博客读者是工程师不是律师——所以它在 `legal ai software`、`ai legal drafting tool` 这些真正有量的词上完全不在。

**对我们的启示**：`legal ide` 这类词靠「一次高质量社区曝光」就能拿下，成本极低；但它带不来量。真正的量在 `legal ai software / ai legal drafting tool / word add-in` 这一层，需要页面矩阵。

---

## 三、可学习的中小厂商（各 ~200 字）

**Spellbook（spellbook.com）** — 全场最值得抄的一家。sitemap 约 600 URL，结构分五层：`/learn/`（252 篇教程博客，绝对主力）、`/briefs/`（104 篇短内容）、`/clauses/`（44 个条款词条，程序化长尾）、`/vs/`（ivo、harvey、chatgpt、law-insider 四个比较页）、`/solutions/`（按行业：energy、healthcare、financial-services、law-firms、in-house-legal）、`/integrations/`（imanage、sharepoint、dropbox、google-drive、onedrive）、`/features/`（ask/review/draft/market）、`/lp/`（12 个合作方专属落地页，如 CBA、Lex Mundi、ClioCon）、`/stories/`（14 个客户案例）。**并且有 llms.txt**，2.9 万字符，明确写「这是给 ChatGPT/Claude/Perplexity/Gemini 的事实真相来源」，里面塞满了可被引用的硬事实（4500+ 法务团队、80+ 国家、1000 万份合同、加拿大律师协会独家合作、客户名单）。这是目前 GEO 做得最系统的样本。

**Gavel（gavel.io）** — 程序化 SEO 的极致：sitemap 约 750 URL，其中 `/court-forms/` 119 页（各州法院表格）、`/legal-apps/` 108 页、`/document-types/` 49 页、`/pre-built-workflows/` 48 页、`/clause-library/` 42 页、`/alternatives/` **30 个比较页**（blackboiler-vs、harvey-vs、clio-draft-vs、claude-for-word-vs、gc-ai-vs…）、`/practice-areas/` 8 个（家事/破产/公司/雇佣/遗嘱）、`/use-cases/` 14 个、`/resources/` 194 篇。它靠「表格/条款/文书类型」这种天然长尾数据库拿到了海量入口，然后用 `/alternatives/` 收割所有竞品的品牌词。我们的 Skill 广场天然具备同样的数据结构。

**Paxton（paxton.ai）** — 内容量适中但打法明确：`/post/` 271 篇博客占大头，`/solutions/` 按案由分（personal-injury、employment、family、criminal、corporate），`/compare/` 5 页全部瞄准巨头做「替代」词：`westlaw-alternative`、`harvey-alternative`、`lexisnexis-alternative`、`thomson-reuters-casetext-alternative`、`vlex-alternative`。它在 `harvey ai alternative` 的 SERP 上稳居前 3，就是靠这一个页面模板。robots.txt 里显式 `User-agent: GPTBot / Allow: /`——主动放行 AI 爬虫，是明确的 GEO 动作。

**GC AI（gc.ai）** — 三块结构：`/blog/` 210 篇（大量 "Best X in 2026" 榜单文，在 `best legal ai tools 2026`、`ai for microsoft word lawyers` 两个词上都命中）、`/compare/` **13 个 vs 页**（vs-spellbook / vs-harvey / vs-legora / vs-chatgpt / vs-gavel…，比 Paxton 更全）、`/features/` 11 页（playbooks、word-integration、skill-library、exact-quote 等把每个功能做成独立可排页面）、`/clauses/` 41 页、`/learn-ai/` 课程分级页（101/105/121/202）、`/podcast/` 46 期。它的 `/features/skill-library` 与我们的 Skill 广场高度对位，可直接借鉴命名与页面结构。

---

## 四、关键词地图

| 关键词 | 语言 | 意图 | 竞争度 | 建议承接页面 | 优先级 |
|---|---|---|---|---|---|
| legal ide / legal IDE for lawyers | EN | 品类（空位） | 低 | 首页 + 一篇立场长文 `/blog/legal-ide` | **P0** |
| ai ide for lawyers | EN | 品类长尾 | 低 | 同上 | P0 |
| legal ai desktop app | EN | 品类 | 低-中 | `/product` 或 `/desktop` 专页 | **P0** |
| local first legal ai / offline legal ai | EN | 问题+差异化 | 低 | `/security` 或 `/local-first` 专页 | **P0** |
| cursor for lawyers | EN | 类比品类 | 低（无承接页） | 首页副标题 + 一篇解释文 | **P0** |
| ai word add-in for lawyers | EN | 功能 | 中 | `/integrations/word`（并上架 MS Marketplace） | **P0** |
| ai legal drafting tool / software | EN | 品类 | 中-高 | `/features/draft` | **P0** |
| tritium alternative | EN | 比较 | 低 | `/vs/tritium` | **P0** |
| spellbook alternative | EN | 比较 | 中 | `/vs/spellbook` | **P0** |
| harvey ai alternative | EN | 比较 | 高 | `/vs/harvey` | P1 |
| best legal ai tools 2026 | EN | 列表 | 高 | `/learn/best-legal-ai-tools` 榜单文 | P1 |
| ai contract drafting / review | EN | 品类 | 高 | `/features/review` | P1 |
| ai transcription for lawyers | EN | 功能 | 中 | `/features/transcription` | P1 |
| legal document comparison / redlining software | EN | 功能 | 中 | `/features/redline` | P1 |
| can ai draft contracts | EN | 问题 | 中 | blog 长文 | P1 |
| legal ai plugin marketplace / legal ai skills | EN | 功能（自造词） | 低 | `/marketplace` + 每个 Skill 独立页 | P1 |
| legal ai for [practice area]（M&A/due diligence/employment） | EN | 场景 | 中 | `/solutions/{area}` 系列 | P2 |
| ai for lawyers / legal ai / legal ai software | EN | 品类头部 | 高 | 首页（不指望短期排上） | P2 |
| clio draft alternative / definely alternative | EN | 比较长尾 | 低 | `/vs/*` 扩展 | P2 |
| 律师AI工具 / 法律AI工具 | ZH | 品类 | 中（导航站占位） | 首页 + 上 ai-bot.cn 等导航站 | **P0** |
| 法律AI软件 下载 / 律师 桌面 AI | ZH | 品类+意图明确 | 低 | `/download` 中文页 | **P0** |
| WPS 法律 AI 插件 / Word 律师插件 | ZH | 功能 | 低 | `/plugins/office` 中文页 | **P0** |
| 法律文书 AI 写作 | ZH | 功能 | 中（知乎/CSDN 占位） | 知乎专栏 + 站内长文 | P1 |
| 合同审查AI | ZH | 品类 | 高（百度/讯飞/TextIn） | `/features/contract` | P2 |
| AI法律助手 | ZH | 品类 | 高（导航站+大厂） | 首页 | P2 |
| 尽职调查 AI / 庭审录音转写 | ZH | 场景/功能 | 低 | 插件详情页 | P1 |

### P0 的 10 个词与理由

1. **legal ide**（EN）— 竞争几乎为零，Tritium 只靠一条 HN 帖占位；我们的产品形态（多文档工作台 + 插件 + 本地）比它更像 IDE，一篇立场文 + 一次社区曝光即可争位。
2. **ai ide for lawyers / cursor for lawyers**（EN）— SERP 上全是 LinkedIn 帖和 VC 博客，**没有任何厂商建了承接页**，是纯粹的空地。
3. **legal ai desktop app**（EN）— 前 10 无一个桌面端厂商站（全是高校指南和应用商店），而「桌面端」正是我们与 Harvey/Spellbook 的结构性差异。
4. **local first legal ai / offline legal ai**（EN）— 该意图在 SERP 上只有个人博客和 LocalChat 这种非法律产品；保密性是律师最大的采购顾虑，转化意图极强。
5. **ai word add-in for lawyers**（EN）— 有真实商业量；SERP 显示 **Microsoft Marketplace 页面本身能排前**，我们上架插件即可获得一个高权重入口，成本低于自建内容。
6. **tritium alternative**（EN）— 这个词目前只有 GetApp 一个弱页面在接，其余全是手表论坛。我们是唯一同形态（桌面 + 起草）的产品，建 `/vs/tritium` 几乎必占第一。
7. **spellbook alternative**（EN）— 有稳定搜索量，SERP 前 10 有一半是目录站（G2/Slashdot/TopAI）这类低质页面，厂商自建比较页的胜率高（Paxton 和 GC AI 已验证该模板）。
8. **ai legal drafting tool**（EN）— 品类里意图最靠近购买的词，且 SERP 证明**厂商功能子页**（clio.com/draft、paxton.ai/drafting）能排，不必拼域名权重。
9. **律师AI工具 / 法律AI工具**（ZH）— 中文侧的品类总入口；但打法不是 SEO，是**上 ai-bot.cn、aihub.cn、aig123 三个导航站收录**，它们在该词上占了 4–5 席。
10. **法律AI软件 下载 / WPS·Word 法律 AI 插件**（ZH）— 中文竞品全是 Web/大模型问答，几乎没人做桌面软件下载与 Office 插件，词竞争低且意图直达下载转化。

---

## 五、GEO 实测

三组问题的 AI 摘要与引用来源（WebSearch 返回的 AI 答案 + 其引用列表；Perplexity 网页抓取被拒绝，未取到）：

| 问题 | 被点名的产品 | 引用来源域名 |
|---|---|---|
| what is the best legal AI IDE for lawyers | Lexis+ AI、Spellbook、Diligen、Clearbrief、Clio | eve.legal、monday.com、clio.com、darrow.ai、**spellbook.com**、**gc.ai** |
| legal AI desktop apps for lawyers（含 local/offline 变体） | Claude Desktop + Descrybe、Harvey、Archie AI/Smokeball、LocalChat、Bibliome、Llama 3.x | libguides.law.ucdavis.edu、smokeball.com、americanbar.org、harvey.ai、attorneyatwork.com、newideaslegaltech.com、aimadefor.com、mayhemcode.com |
| AI tools for drafting legal documents | CoCounsel、Lexis+ Protégé、Spellbook、Gavel、Clio Draft、Paxton、LocalChat | ringcentral.com、**legalfly.com**、thomsonreuters、lexisnexis、**clio.com**、mycase.com |
| （对照）best legal ai tools 2026 | AI4Legal、CoCounsel、Harvey、Spellbook、GC AI、Vincent、Luminance | definely.com、ttms.com、darrow.ai、**spellbook.com**、**gc.ai**、haqq.ai |

### 结论：要被 AI 提到，必须先出现在这些来源上

**AI 引擎引用来源前 5 名域名（按出现频次）**：
1. **clio.com**（含 /resources、/blog、/draft，几乎每题必引）
2. **spellbook.com**（自建 `/learn/` 榜单文 + llms.txt，反复被当作事实源）
3. **gc.ai**（`/blog/` 的 "Best…2026" 榜单文）
4. **americanbar.org**（ABA Law Technology Today，权威背书类）
5. **thomsonreuters / lexisnexis**（大厂内容），并列值得注意的还有 darrow.ai、definely.com、legalfly.com、eve.legal 这批「中小厂商榜单文」，以及 **libguides.law.ucdavis.edu 这类法学院 LibGuide**。

**可执行动作**（按 ROI 排序）：
1. **写自己的 llms.txt**（Spellbook 模板）：把产品事实、类别归属（"legal IDE / desktop legal AI workspace"）、功能列表、平台、定价、客户数写成可被 LLM 直接引用的硬事实。成本一天，收益最高。
2. **robots.txt 显式放行 GPTBot / ClaudeBot / PerplexityBot**（Paxton 已这么做）。
3. **首页加 `SoftwareApplication` JSON-LD**（抄 Tritium 的字段：applicationCategory、featureList、operatingSystem、downloadUrl、offers、softwareHelp）——这是 AI 抽取产品事实最直接的结构。
4. **自建 "Best legal AI tools / Best legal AI desktop apps 2026" 榜单文**，把自己列进去。这是 spellbook/gc.ai/darrow/definely 被引用的唯一原因。
5. **争取被第三方收录**：G2、GetApp、Software Advice、AlternativeTo、Product Hunt（Tritium 没做 PH，是空位）；中文侧 ai-bot.cn、aihub.cn、aig123。
6. **一次高质量 Show HN**（Tritium 的 312 分证明这条路对桌面端 + Rust/本地优先叙事极其有效），并争取 ABA Law Technology Today / Artificial Lawyer / 法学院 LibGuide 的一次提及。
