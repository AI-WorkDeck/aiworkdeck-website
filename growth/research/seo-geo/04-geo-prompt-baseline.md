# GEO 手工 prompt 基线表

dev-board#415 阶段二第 9 项。目的：用一组固定的、模拟真实用户提问的 prompt，长期跟踪 AI 搜索引擎回答
「律师该用什么 AI 工具」这类品类问题时，是否点名 AI WorkDeck、点名了哪些竞品、引用了哪些域名。
这是 GEO（Generative Engine Optimization）的北极星指标，从 0 开始记录，不追求短期好看。

## 怎么复跑

- **频率**：建议每月 1 日复跑一次，30 条 prompt 全跑，作为月度快照；节点前后可加跑做对照。
- **渠道**：本次基线只用 WebSearch（返回美区结果 + AI 摘要 + 引用来源，可作为 Google AI
  Overviews/AI Mode 的近似代理）。往后建议在有账号/客户端的条件下，同一批 prompt 再分别在
  **ChatGPT（search 模式）、Perplexity、Google AI Mode、Kimi、豆包** 各跑一遍——五个引擎的召回
  逻辑不同，WebSearch 一家的结果不能代表全部 AI 搜索生态，尤其中文 prompt 需要 Kimi/豆包才能反映
  真实的中文语料引用。
- **口径**：每条 prompt 逐字复用本文件里的原文，不要因为「更像人话」而改写，否则历史数据不可比。
- **记录方式**：每次复跑在本文件下方新增一个日期区块（复制表格结构），不要覆盖旧数据，方便看
  命中率随时间的变化。
- **命中率定义**：`命中率 = 回答中点名 AI WorkDeck（含 "AI WorkDeck"、"aiworkdeck"、"workdeck.ai" 等变体；注意「法宝」是北大法宝，不是我们）的 prompt 数 / 30`。
  「点名」指 AI 摘要正文或前 5 条引用来源中出现 AI WorkDeck 的产品名或官网域名，仅出现在候选列表
  里但未被摘要采用也算命中；完全没出现算不命中。

## 2026-09-03 基线（WebSearch，美区结果，20 条英文 + 10 条中文）

> 中文 prompt 说明：WebSearch 是美区搜索，中文关键词返回的是「中文内容在美区搜索引擎里的可见部分」，
> 与国内百度/微信生态的真实分发不同，此处结果仅供方向参考，不能替代 Kimi/豆包/百度实测。

| # | prompt | 语言 | 意图 | 关键词 | 被点名产品（前5） | 引用域名（前5） | AI WorkDeck 出现？ |
|---|---|---|---|---|---|---|---|
| 1 | best legal AI software for small law firms | EN | 品类 | legal ai software | Spellbook、Eve、NexLaw、LEAP、Smokeball | eve.legal、softwarefinder.com、xantrion.com、spellbook.com、nexlaw.ai | 否 |
| 2 | what is a legal IDE | EN | 品类 | legal ide | （词义被 FDA IDE 与 MIT/Tritium HN 帖占据，无厂商点名） | lawinsider.com、wikipedia.org、law.mit.edu、news.ycombinator.com、fda.gov | 否 |
| 3 | legal AI desktop app for lawyers | EN | 品类 | legal ai desktop app | Harvey、Clio、AI Lawyer、LawConnect、Microsoft Copilot | apps.apple.com、ailawyer.pro、harvey.ai、smokeball.com、play.google.com | 否 |
| 4 | AI IDE for lawyers | EN | 品类 | ai ide for lawyers | Spellbook、Clearbrief、Lexis+ AI、AI.Law、Darrow | ailawyer.pro、pro.bloomberglaw.com、clio.com、darrow.ai、contractsafe.com | 否 |
| 5 | cursor for lawyers | EN | 品类（类比） | cursor for lawyers | Vesence、Wilson、Crosby | linkedin.com、medium.com、peerlist.io、creandum.com、artificiallawyer.com | 否 |
| 6 | legal AI software for lawyers | EN | 品类 | legal ai / legal ai software | Harvey、Spellbook、Lexis+ AI、Eve | eve.legal、harvey.ai、clio.com、darrow.ai、spellbook.com | 否 |
| 7 | Tritium legal alternatives | EN | 比较 | tritium alternative | 无（查询被手表/EDC 论坛的「tritium 元素替代品」噪音完全淹没，未召回任何法律 AI 产品） | getapp.com、omegaforums.net、edcforums.com、jessupmfg.com、tecaccessories.com | 否 |
| 8 | Spellbook alternatives | EN | 比较 | spellbook alternative | Gavel Exec、CoCounsel、LegalOn、Ivo、StrongSuit | gavel.io、legalfly.com、aline.co、slashdot.org、gc.ai | 否 |
| 9 | Harvey AI alternative | EN | 比较 | harvey ai alternative | Vincent（Clio）、Clio Work、Paxton AI、Eigent、ibl.ai | paxton.ai、ibl.ai、clio.com、eigent.ai、isometrik.ai | 否 |
| 10 | best legal AI tools 2026 | EN | 比较/列表 | best legal ai tools 2026 | AI4Legal、CoCounsel Legal、Lexis+ Protégé、Harvey、Spellbook | definely.com、ttms.com、darrow.ai、spellbook.com、gc.ai | 否 |
| 11 | AI Word add-in for lawyers | EN | 功能 | ai word add-in for lawyers | Gavel Exec、StrongSuit、Lexlegis.ai、Legal Brief AI Assistant、GC AI | gavel.io、marketplace.microsoft.com、strongsuit.com、gc.ai、ulclegal.com | 否 |
| 12 | local-first legal AI that keeps files on my machine | EN | 功能 | local first legal ai / offline legal ai | （无具体法律 AI 厂商被点名，均为通用「本地部署方法论」文章） | insiderllm.com、spellbook.com、localfirstai.eu、lapu.ai、aimadefor.com | 否 |
| 13 | AI transcription for lawyers desktop | EN | 功能 | ai transcription for lawyers | Dragon Legal、Sonix、Verbit、Transkriptor | speechtext.ai、sonix.ai、verbit.ai、transkriptor.com、clio.com | 否 |
| 14 | AI legal drafting tool | EN | 功能 | ai legal drafting tool | Clio Draft、LegalFly、Paxton、Gavel（Documate）、AI.Law | mycase.com、legalfly.com、clio.com、paxton.ai、kleap.co | 否 |
| 15 | AI Word add-in for lawyers redlining software | EN | 功能 | redlining software | Spellbook、Gavel Exec、LegalSifter ReviewPro | juro.com、spellbook.legal、sirion.ai、spellbook.com、gavel.io | 否 |
| 16 | AI skill marketplace for lawyers | EN | 功能（自造词） | legal ai plugin marketplace / legal ai skills | Lawve AI、HAQQ Academy、Legal Experts AI、Thomson Reuters Legal Learning Hub | 8am.com、turingcollege.com、github.com、scaleupcounsel.com、haqq.ai | 否 |
| 17 | can AI draft contracts safely for lawyers | EN | 问题 | can ai draft contracts | （无具体产品点名，纯执业风险观点文章） | juro.com、mycase.com、hyperstart.com、pro.bloomberglaw.com、americanbar.org | 否 |
| 18 | is it safe to use AI for legal documents | EN | 问题 | can ai draft contracts（延伸） | （无具体产品点名，ChatGPT 仅作风险举例被提及） | schloemerlaw.com、dunlaplawplc.com、getlexi.io、dwmk.com、getlegalclarity.com | 否 |
| 19 | what AI tools do lawyers use for due diligence | EN | 问题 | legal ai for due diligence | iManage RAVN、Spellbook、Diligen、Harvey | imanage.com、dealroom.net、clio.com、spellbook.legal、traverssmith.com | 否 |
| 20 | offline legal AI for confidential documents | EN | 问题 | local first legal ai / offline legal ai | Elephas、Offline AI（一体机）、Jan、Vult、Offline Intelligence | elephas.app、jan.ai、offlineai.us、ballardspahr.com、spellbook.com | 否 |
| 21 | 律师用什么AI工具 | ZH | 品类 | 律师AI工具 / 法律AI工具 | 法唠AI、通义法睿、海瑞智法、法行宝、得理法搜 | aihub.cn、blog.csdn.net、zhuanlan.zhihu.com、sxls.com、aipintai.com | 否 |
| 22 | 法律文书AI写作软件推荐 | ZH | 功能 | 法律文书 AI 写作 | 通义法睿、法行宝、语迟 SLAW、MetaLaw、LaWGPT | developer.aliyun.com、informat.cn、blog.csdn.net、ai-bot.cn、zhuanlan.zhihu.com | 否 |
| 23 | WPS法律AI插件 | ZH | 功能 | WPS 法律 AI 插件 / Word 律师插件 | WPS AI法律助手（DeepSeek R1，仅官方一家，无竞品被并列点名） | law.wps.cn、bbs.wps.cn、aigc.cn、bafangwy.com、gogoai.com | 否 |
| 24 | 本地部署的法律AI | ZH | 功能/差异化 | 本地部署的法律AI | AnythingLLM（通用本地知识库工具，非法律专用产品） | dehenglaw.com、guantao.com、53ai.com、blog.csdn.net | 否 |
| 25 | 合同审查AI工具 | ZH | 功能 | 合同审查AI | 百度智能合同处理、TextIn智能合同审查、律己AI、通义法睿 | ai.baidu.com、www.textin.com、blog.csdn.net、zhuanlan.zhihu.com、tensorbounce.com | 否 |
| 26 | 开源法律AI软件 | ZH | 品类（自造，贴合我们开源属性） | 开源法律AI软件（自定义） | ChatLaw（北大）、LawGPT、法行宝、得理法搜、法智 | ai-bot.cn、aihub.cn、zhuanlan.zhihu.com、sxls.com、yjpoo.com | 否 |
| 27 | 律师AI办公软件 | ZH | 品类 | 律师AI办公软件（自定义） | 简道云、ROSS Intelligence、Kira Systems、Alpha（iCourt）、智律云 | jiandaoyun.com、delilegal.com、post.smzdm.com、autopilot.law、zjblf.com | 否 |
| 28 | 法律AI桌面软件 | ZH | 品类 | 法律AI软件 下载 / 律师 桌面 AI | 睿契 Richee.ai、iCourt Alpha、通义千问、魔方法律助手、法行宝 | tongyi.aliyun.com、delilegal.com、zhuanlan.zhihu.com、aihub.cn、tech.china.com | 否 |
| 29 | 尽职调查AI工具 | ZH | 场景 | 尽职调查 AI | 案牍AI（andu.ai） | energent.ai、ai-bot.cn、blog.csdn.net、mcp.csdn.net、dehehantong.com | 否 |
| 30 | AI法律助手 | ZH | 品类 | AI法律助手 | 通义法睿、法行宝、ChatLaw、得理法搜、海瑞智法 | ai-bot.cn、blog.csdn.net、aihub.cn、aig123.com、mambabit.com | 否 |

## 汇总

**本次命中率：0/30（0%）**。30 条 prompt 的 AI 摘要与前 5 条引用来源里，没有一次出现 AI WorkDeck /
aiworkdeck.com / workdeck.ai 或中文品牌名。符合 `seo-geo-strategy.md` 里「新域名、官网叙事尚未改造、
零第三方位置」的预期起点，这次基线的价值是把 0% 钉在时间轴上，供未来对比。

### 被引用最多的前 10 个域名（按 30 条 prompt 的前 5 引用域名，逐条去重后统计频次）

| 排名 | 域名 | 出现次数（满分 30） | 说明 |
|---|---|---|---|
| 1 | clio.com | 6 | 英文侧几乎每类问题都引用其 `/resources/ai-for-lawyers/`、`/draft` 等页面 |
| 1 | spellbook.com（含 spellbook.legal） | 6 | 唯一同时覆盖「品类、比较、功能」三类问题的厂商站，印证 02 文件里「GEO 做得最系统」的判断 |
| 1 | csdn.net（blog.csdn.net） | 6 | 中文侧最大来源，UGC 技术博客对法律 AI 话题的覆盖远超厂商站 |
| 4 | zhihu.com（zhuanlan.zhihu.com） | 5 | 中文侧第二大来源 |
| 5 | aihub.cn | 4 | 中文导航站，验证 02 文件「中文品类词分发权在导航站」的结论 |
| 5 | ai-bot.cn | 4 | 中文导航站，同上 |
| 7 | darrow.ai | 3 | 英文中小厂商榜单文 |
| 7 | gavel.io | 3 | 英文中小厂商，`/alternatives/` 比较页模板生效 |
| 7 | gc.ai | 3 | 英文中小厂商，`/blog/` 榜单文 + `/compare/` 页 |
| 10 | harvey.ai（并列还有 eve.legal、ailawyer.pro、bloomberglaw.com、legalfly.com、paxton.ai、mycase.com、juro.com、aliyun.com、53ai.com、delilegal.com、sxls.com，均为 2 次） | 2 | 第 10 名以下有 13 个域名并列 2 次，构成一条长尾 |

### 建议：我们应该出现在哪些域名上

1. **clio.com / spellbook.com 级别的厂商站短期够不到**——这两家是仅有的、几乎每类问题都被引用的
   厂商自建站，靠的是内容量（Spellbook 600+ URL）与域名权重，不是一朝一夕能追平的目标。
2. **优先级最高、成本最低的是中文导航站**：aihub.cn、ai-bot.cn 两家合计出现 8 次，覆盖了 10 条中文
   prompt 里的 7 条，且提交收录成本极低（多为免费登记表单）。这与 `02-competitors-keywords.md` 第四节
   「中文品类词分发权在导航站」的结论完全吻合，`seo-geo-strategy.md` 阶段二第 6 项已经把它列为待办，
   本次基线数据是它的直接证据。
3. **csdn.net / zhihu.com 是中文侧最大的单一来源**（各 6/5 次），但这两个不是「登记条目」能解决的——
   需要长期知乎专栏 + 技术向 CSDN 投稿才能进入这个语料池，属于内容矩阵阶段的工作，不是本周能交付的项。
4. **英文侧的 darrow.ai / gavel.io / gc.ai 这类中小厂商，走的是「/compare 或 /alternatives 比较页 +
   /blog 榜单文」模板**，说明我们自己上线 `/vs/tritium`、`/vs/spellbook` 后，若同时被 G2、GetApp 等
   目录站收录，理论上能以同样的模板挤进这一档，而不必去够 clio.com 级别的域名权重。
5. **Tritium 品牌词（prompt #7）完全没有召回任何法律 AI 结果**，被同名的「氚」元素问题淹没——说明
   `tritium alternative` 这个词本身在 AI 摘要里几乎是空的，我们建 `/vs/tritium` 页面的边际收益主要来自
   Google 传统搜索而非 AI 摘要，需要调整该词在 GEO 侧的预期。
