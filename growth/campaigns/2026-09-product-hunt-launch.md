# 2026-09：Product Hunt 发布同步宣发（dev-board#370–#373）

## 目标

- PH 发布日（2026-09-02，太平洋时间 0:01 起，9 月为 PDT，即北京时间 **15:01**）
  把官网、X、公众号、小红书四个渠道的流量往 PH 页面导，并把 PH 流量往 GitHub / 官网导。
- PH 页面：<https://www.producthunt.com/posts/ai-workdeck>（post_id `1238385`）
- 发布日的北极星：PH 页面的评论数（真实反馈）> 票数。**PH 明令禁止「求点赞」**，
  所有文案只说「来看看、留个评论」，不说「帮我投票」。

## 渠道排期（北京时间）

| 时间 | 渠道 | 动作 |
| --- | --- | --- |
| 15:00 前 | 官网 | 徽章已上线（首屏源码链接旁 + 页脚），发布后自动显示票数 |
| 15:01 | PH | 发布生效；maker 第一条评论（下方「PH maker 首评」）立即发出 |
| 15:05 | X | 主推文 + 线程（英文），置顶 |
| 15:30 | 微信 | 朋友圈 / 律师群一句话 + 公众号文章 |
| 16:00 | 小红书 | 笔记发布 |
| 全天 | PH / X | 每条评论 1 小时内回复；每 4 小时看一次排名 |
| 次日 | X | 结果推文（排名 / 感谢），公众号不追发 |

## 物料清单

- [x] 官网徽章：`components/ProductHuntBadge.tsx`（首屏 dark、页脚 neutral 两处）
- [ ] PH 画廊图：官网首屏截图（`public/images/hero-dashboard.png` 原图）+ 修订留痕特写 + 时间轴/关系图
- [ ] X 主推文配图：同上第一张，1200×675
- [ ] 公众号封面：900×383，深绿底 + 白字「今天在 Product Hunt 发布」
- [ ] 小红书封面：3:4，手机截 PH 页面 + 桌面端窗口拼图

## 上线检查（对照 `../playbooks/viral-checklist.md`）

- [x] 不做利诱分享（无「转发得 Credits」类表述）
- [x] 微信内不放测试类外链；公众号文章外链走「阅读原文」+ 文内明文网址
- [x] 自嘲只嘲苦劳（「一个律师写的软件」是身份，不是「不专业」）
- [x] 无「包赢」类执业宣传违规表述
- [x] PH 流量高峰前加固已合（dev-board#344，PR #151）

---

## 一、PH maker 首评（英文，发布后第一时间贴到 PH 评论区）

> Hi Product Hunt, I'm Zewei, a practicing lawyer in Beijing and the maker of AI WorkDeck.
>
> I built this because my day is spent inside documents, not inside chat windows. Every AI tool I tried made me copy text out, paste an answer back, and lose the tracked changes in between. So I built the tool I wanted: an open-source desktop workbench where the editor, the case files, the evidence and the AI all live in one window.
>
> What it does today:
> - Office-grade editor (LibreOffice core) with AI-assisted, character-level tracked changes you accept one by one
> - Due-diligence checklists, litigation timelines and relationship graphs built from the documents themselves
> - Phone-to-desktop evidence capture (photo / audio straight into the case folder)
> - A plugin and Skill marketplace, so the workbench grows with your practice
> - Local-first: your files never leave your machine. The AI proposes, you decide.
>
> It's AGPL, the community edition is free, and the code is on GitHub. I'd love to hear what document-heavy work you'd want it to handle next. I'll be here all day answering questions.

---

## 二、X（@hanzewei）推文

### 主推文（发布时置顶，≤280 字符）

> AI WorkDeck is live on Product Hunt today.
>
> Your whole case in one window: an open-source desktop IDE for document work. Office-grade editor, AI tracked changes, due-diligence checks, timelines, evidence capture. Local-first, AGPL, free community edition.
>
> Built by a lawyer who was tired of copy-pasting into chat boxes.
>
> 👉 https://www.producthunt.com/posts/ai-workdeck

### 线程（回复主推文，逐条发）

**2/**
> Why "IDE for document work"?
>
> Developers got IDEs: code, tests, git, terminal, all in one window. Lawyers and other document workers got 14 tabs and a chat box.
>
> AI WorkDeck puts the editor, the case files, the evidence and the AI on one desk.

**3/**
> The part I'm proudest of: AI edits land as tracked changes, character by character.
>
> No "here's a rewritten paragraph, good luck diffing it." You see every insertion and deletion and accept them one at a time, the way you'd review a junior's draft.

**4/**
> Local-first is not a marketing word here.
>
> Files stay on your machine. The AI only sees what you send it, when you send it. For anyone under confidentiality obligations, that's the whole ballgame.

**5/**
> It's open source (AGPL) with a free community edition, and there's a plugin + Skill marketplace so the workbench grows with your practice: due diligence, transcription, redaction, PPT, and whatever you build.
>
> Code: https://github.com/zeweihan/aiworkdeck

**6/**
> If you live in documents, I'd genuinely like your feedback on the Product Hunt page, especially the "what should it do next" kind.
>
> https://www.producthunt.com/posts/ai-workdeck
>
> Thanks for reading. Back to answering comments.

### 中文版（可选，同账号第二条或转发时用）

> AI WorkDeck 今天在 Product Hunt 发布了。
>
> 一个律师写的开源桌面软件：Office 级编辑器、AI 修订逐字留痕、尽调清单、诉讼时间轴、手机取证直传，文档不出本机，AGPLv3，社区版免费。
>
> 做它只有一个原因：我受够了在聊天框和 Word 之间来回复制。
>
> 欢迎来 PH 页面看看、留个评论：https://www.producthunt.com/posts/ai-workdeck

### 次日结果推文（按实际排名填空）

> AI WorkDeck finished #__ on Product Hunt yesterday, with __ comments from people who actually live in documents.
>
> Every one of those comments is now an issue on GitHub. Thank you.
>
> If you missed it: https://www.producthunt.com/posts/ai-workdeck

---

## 三、公众号文章

### 标题（三选一）

1. 我把自己写的法律软件放到 Product Hunt 上了
2. 一个律师写了三年的软件，今天在 Product Hunt 发布
3. 律师不该在聊天框和 Word 之间来回复制：AI WorkDeck 今天全球发布

### 摘要（公众号「摘要」栏，≤120 字）

> 今天（北京时间 15:01 起），AI WorkDeck 在 Product Hunt 发布。这是一个律师给文档工作者写的开源桌面软件：编辑器、案卷、证据和 AI 收进同一个窗口，文档不出本机。这篇讲讲为什么做它，以及你能怎么帮忙。

### 正文

各位好，我是韩泽伟，执业律师，也是 AI WorkDeck 的作者。

今天（9 月 2 日）下午三点零一分，北京时间，AI WorkDeck 在 Product Hunt 上正式发布。

**先说 Product Hunt 是什么。** 它是全球最主要的新产品发布社区，每天上线的产品按用户投票和评论排名，Notion、Figma、Zapier 早年都从这里起步。一个中国律师写的法律工作台出现在那个榜单上，我自己觉得挺有意思，所以写这篇。

**为什么要做这个软件。**

我的工作日基本是在文档里度过的：合同、起诉状、尽调清单、证据目录。过去两年 AI 工具很多，我几乎都试过，最后的用法却出奇一致：从 Word 里复制一段，贴进聊天框，等回答，再复制回 Word。修订痕迹丢了，上下文丢了，案卷里其他几十份文件 AI 也看不到。

程序员早就有 IDE 了，代码、测试、版本管理、终端全在一个窗口里。我们这些「文档工作者」有的是十四个浏览器标签页加一个聊天框。

所以我想要的东西很具体：**一个窗口，装下整个案子。** 编辑器、案卷、证据、AI，都在这张案头上。这就是 AI WorkDeck 这个名字的意思。

**它现在能做什么。**

- **Office 级编辑器，AI 修订逐字留痕。** 内核是 LibreOffice。AI 改稿不是扔给你一段重写的文字让你自己对，而是像修订模式一样，每处增删都标出来，你一条一条采纳或拒绝，跟审一份实习生的初稿一样。
- **尽调清单、诉讼时间轴、关系图。** 从案卷文件本身长出来，不用另开 Excel 手工整理。
- **手机取证直传。** 微信小程序拍照、录音，直接进电脑上对应案子的文件夹。
- **插件与 Skill 生态。** 尽调、转录、脱敏、PPT，需要什么装什么；也欢迎你把自己的工作方法做成 Skill 发到广场。
- **文档不出本机。** 文件在你自己的电脑上，AI 只看到你此刻发给它的内容。做我们这行的，这一条没得商量。

软件是开源的（AGPLv3），社区版免费；AI 对话、转写、OCR 这些按用量计费，平台统一采购、成本加价两成，价格公开一致，没有议价。律所和企业内部部署有商业授权，明码标价在官网。

**你能怎么帮忙。**

Product Hunt 的规则是：发布当天的评论和投票决定排名，而且**明令禁止求投票**。所以我不求票，只说三件事：

1. 如果你能打开 producthunt.com，进来看看，**留一条评论**：你在文档工作里最想让它解决什么。这比一票有用得多，每条评论我都会回。
2. 如果打不开，来 GitHub：github.com/zeweihan/aiworkdeck，点个 Star，或者直接下载试试。
3. 把这篇转给一位每天在 Word 里加班的同行。

PH 页面：https://www.producthunt.com/posts/ai-workdeck
官网：www.aiworkdeck.com（国内站）/ www.workdeck.ai（国际站）

这个软件我写了很久，今天只是把它端到一个更大的桌子上。真正的产品是接下来的每一条反馈。

谢谢。

（文末「阅读原文」指向 PH 页面）

### 配图建议（按出现顺序）

1. 封面：深绿底，白字「今天在 Product Hunt 发布」，右下角小字 AI WorkDeck
2. PH 页面截图（发布后再截，带票数）
3. 官网首屏：一个窗口装下整个案子
4. AI 修订逐字留痕的特写（红绿修订痕迹）
5. 时间轴 / 关系图
6. 手机小程序拍照直传电脑的两联图
7. 文末：GitHub 仓库二维码 + PH 页面二维码并排

---

## 四、小红书笔记

### 标题（≤20 字，二选一）

- 一个律师写的软件，今天在 Product Hunt 发布了
- 律师做产品：把整个案子装进一个窗口

### 正文

> 我是执业律师，业余写了一个给法律人用的桌面软件，今天（北京时间 15:01）在 Product Hunt 全球发布。
>
> Product Hunt 是国外最大的新产品发布社区，每天上线的产品靠用户投票和评论排名。我一个人的作品和硅谷创业公司的产品排在同一天，说不紧张是假的。
>
> 它叫 AI WorkDeck，一句话：一个窗口，装下整个案子。
>
> 📄 Office 级编辑器，AI 改稿逐字留痕，一条条采纳
> 📋 尽调清单、诉讼时间轴、关系图，从案卷里自己长出来
> 📱 手机拍照录音，直接进电脑上对应案子的文件夹
> 🔒 文档不出本机，AI 只看你发给它的那一段
> 🆓 开源（AGPLv3），社区版免费
>
> 做它的原因很简单：我受够了在 Word 和聊天框之间来回复制，修订痕迹每次都丢。
>
> 如果你也是每天在文档里加班的人，欢迎来 PH 页面留一条评论：你最想让它帮你做什么。能打开的话搜「AI WorkDeck」就能找到；打不开来 GitHub 搜 aiworkdeck 也一样。
>
> 官网：aiworkdeck.com
>
> #法律人 #律师日常 #法律科技 #AI工具 #开源 #ProductHunt #独立开发 #律师 #法务 #文档工作

### 配图（3:4 竖图，4–6 张）

1. 封面：手机截 PH 页面（发布后）+ 一行大字「律师写的软件上 Product Hunt 了」
2. 桌面端整窗截图，标注「一个窗口装下整个案子」
3. AI 修订逐字留痕特写
4. 时间轴 / 关系图
5. 小程序拍照直传电脑两联图
6. 收尾：官网 + GitHub 地址卡片

### 评论区预埋（发布后自己先留一条）

> 补充：软件目前只有 Windows 和 macOS 桌面版，手机端是取证伴侣小程序，不是完整版。有问题直接评论问我。

---

## 复盘（发布后补）

- PH 最终排名 / 票数 / 评论数：
- 各渠道点击（PH utm：`badge-featured` / 推文 / 公众号「阅读原文」/ 小红书）：
- GitHub Star 增量、官网下载增量：
- 值得沉淀进 playbook 的一条：
