# 个人页改造：账户中心与公开主页（2026-08-08）

两个「个人」页面此前都太空。本文是这次改造的设计与契约记录。

- `/{lang}/account` — 登录后自己看的账户中心
- `/{lang}/u/{username}` — 对外的公开贡献者主页

## 一、动因

改造前的实际状态：

| 页面 | 有什么 | 问题 |
|---|---|---|
| account | 首字母方块 + 昵称 + `@username · email` + 两个按钮，下方直接堆卡片 | 顶部一张卡只有三行字；下方六个分区一路垂直堆到底，没有分组，也没有任何摘要 |
| u/{username} | 首字母方块 + 昵称 + `@username` + bio + 三个数字 | bio **永远是空的**；无作品时整页只剩一行「暂无」 |

`bio` 空的根因不是没人填，是**全站没有写入路径**：`lib/users.ts` 只有 `createUser`，
没有任何 `updateProfile`；注册表单只收 username / email / password / displayName 四项。
字段自 skill 广场上线起就在接口里挂着，没有一个用户能给它赋值。

## 二、数据模型

`User` 只加一个字段：

```ts
avatarUpdatedAt?: string;  // ISO；有值 = 有头像
```

**不存文件路径**。文件名恒为 `<userId>.webp`，路径由代码拼接，用户提供的文件名一概不采信——
路径穿越从源头就没有入口。该字段同时充当缓存戳（`/api/avatar/<id>?v=<戳>`），
所以头像响应能挂 `immutable` 长缓存而不牺牲「换完立刻可见」。

`PublicUser` 增补 `avatarUpdatedAt`（公开主页要渲染头像），仍不含 `email` / `passwordHash`。

新增写入路径 `updateProfile(userId, { displayName, bio })`：

| 字段 | 约束 |
|---|---|
| displayName | 去空白后 1–24 字，必填 |
| bio | 去空白后 0–160 字，空串视为清空 |

写盘沿用 `users.json` 既有的「临时文件 + rename」原子写。那里的注释已经写明理由：
整份覆盖写期间被读到的半截 JSON 会让 `readUsers` 的 `JSON.parse` 抛错，
而每一次鉴权都要过这条路径，撕裂一次等于全站 500。

## 三、头像存储

落在 `data/avatars/<userId>.webp`，与 `awd.db`、`users.json` 同级。

选 `data/` 而不是 `public/` 的理由是两条，都不是风格问题：

1. `public/` 下的静态文件会**遮挡同名 app 路由**（favicon 那次踩过，官网 PR #30/#31）。
2. `data/` 已经是既定的运行时目录：不入库、部署不清、已在服务器备份口径内。

`.gitignore` 增补 `/data/avatars/`。两站（aiworkdeck.com / workdeck.ai）各存各的一份，
与现有「两站账户不互通」的形态一致，不引入跨站同步。

## 四、上传链路

| 端点 | 作用 |
|---|---|
| `PATCH /api/account/profile` | 改昵称与简介 |
| `POST /api/account/avatar` | 上传头像（multipart，字段名 `file`） |
| `DELETE /api/account/avatar` | 删头像，降级回首字母 |
| `GET /api/avatar/[userId]` | 读头像字节 |

前三个端点鉴权走 `resolveSessionOrKeyUser`（`awd_session` Cookie **或** `Bearer awdk_`，
2026-09-10 起，dev-board#565：桌面端「个人设置」改昵称、传头像要落到官网这份权威源）。
**只能写自己那一份**：目标 userId 取自凭据，不接受请求参数。契约见 `doc/desktop-contract.md`。

### 服务端一律重编码，绝不原样存盘

```
sharp(buffer, { limitInputPixels }) → 居中裁正方形 → 256×256 → webp
```

这一步同时解决四件事，缺一不可：

- **靠真实解码判定是不是图片**，而不是靠扩展名或 Content-Type（两者都是客户端说了算）
- **剥掉 EXIF**，其中包含拍摄定位
- **只取首帧**，杜绝动图头像
- **`limitInputPixels`** 挡住解压炸弹：几十 KB 的 PNG 可以声明上亿像素，解码即打满内存

入口再加一道 2MB 上限（前端同时拦一次，纯体验，不作为安全边界）。

`sharp` 此前是 Next.js 带进来的**传递依赖**，本次提升为 `package.json` 里的显式依赖——
依赖别人的依赖，哪天上游换了实现就当场炸。

### 缓存

`GET /api/avatar/[userId]` 回 `image/webp` + `Cache-Control: public, max-age=31536000, immutable`，
靠 URL 上的 `?v=avatarUpdatedAt` 破缓存。文件不存在回 404，前端 `onError` 降级首字母。

### 注销

`lib/account-deletion.ts` 现在抹 email / passwordHash / bio，本次同步抹 `avatarUpdatedAt` 并删文件。
墓碑行仍保留（不删行的理由见该文件注释：公开主页是唯一没做降级的调用点，
删行会让广场上该作者的每张卡片变成坏链接，且 username 被释放后会被新用户白捡历史归属）。

### 本轮不做

**头像不做前置审核，也不做后台下架入口。** 当前用户量下加一套审核流是空转成本；
真出问题时维护者有服务器磁盘访问权，删一个文件即可。
需要时再补 admin 侧的「清除该用户头像」，是独立的小改动，不影响本轮结构。

## 五、account 页

### 概览头部

替换原先那张三行字的个人卡：

- 左：头像 72px，hover 出「更换」遮罩，点击直接开编辑弹窗
- 中：昵称（`.font-display`）、`@username · email`、加入日期（精确到日）
- 右：摘要数字 —— **Credits 余额 / 已发布 Skills / 总下载**，`.font-display tabular-nums`，
  点击锚点滚到下方对应分区
- 按钮：编辑资料、查看公开主页、退出登录

**摘要数字服务端渲染。** `getBalance(userId)` 与 `getBalanceBreakdown(userId)` 是同步 SQLite 读，
Skills 数与下载数同样是本地读，所以头部没有加载闪烁。

**AI 额度不进头部。** `syncAiQuota` 要打 OpenRouter 远端，放进服务端渲染等于让整页
等一个跨境请求。它继续留在下方分区里客户端拉，拉不到按既有口径显示「—」而不是 0。

头部卡**不套用 DESIGN.md 的毛玻璃卡片模板**，沿用 account 页现有的白底实心卡：
毛玻璃是营销页语言，放在表单密集、要读数字的页面上压低可读性。整页统一，不让一张卡自立门户。

### 分区分组

组间用 eyebrow 细线标题分隔（DESIGN.md 四、版式语言）：

1. **开始使用** — 桌面连接（AWD Key）
2. **资产** — 钱包 Credits / AI 额度 / 购买与收益
3. **创作** — 我的 Skills
4. **账户安全** — 注销账户

桌面连接**仍排最前**，顺序不动。原注释写明了理由：那是新用户登录后唯一必须做的事，
不能让人为了拿一把 Key 先滚过钱包和 AI 额度两屏。分组只是给它加了个标题。

### 编辑资料弹窗

复用 `components/ui/dialog`（形态同 `RechargeDialog`）。头像选择/预览/移除、昵称、
带计数的简介。保存后 `router.refresh()`，服务端渲染的头部随之更新。

## 六、公开主页

深色 hero 卡保留。它是内嵌圆角卡而非通栏 hero，Navbar 落在其上方的浅色底上，
所以 `hasDarkHero` 判断**不需要**把这条路由加进去（DESIGN.md 硬红线 3 只约束通栏深色 hero）。

补进去的内容：

- **资料块**：真头像（无则首字母，深色底上走白/mint 描边）、昵称、`@username`、简介、
  加入日期精确到日（原先只到月）
- **成绩**：Skills 数、总下载、已发布插件数、最近更新时间；数字走 `CountUp`，入场 `Reveal`
- **空状态分两种视角**（靠服务端比对当前会话用户与主页归属人）：
  - 访客：这位贡献者还没有公开发布的 Skill + 去广场逛逛
  - 本人：你还没有公开作品 + 去投稿

## 七、口径与红线

- 余额一律叫 **Credits**，不写「元/余额」这类混淆说法（见 `doc/credits-redesign.md`）
- 文案不出现「登录」「未授权」「请先」三个子串——桌面端 `frontend/src/services/api.js`
  用它们判掉线并清会话
- 全站禁 emoji，图标一律 lucide 线性图标
- 动效尊重 `prefers-reduced-motion`；文字可见性不交给 JS 动画
- zh / en 两份词典同步，EN 站不出现任何中文，日期按 locale 格式化

## 八、验证

`scripts/verify-profile.mts`（仿 `verify-w*.mts`，在临时空目录里跑）：

- 资料字段边界：昵称空/超长、bio 超长、两端空白
- 真 PNG 能重编码成 256×256 webp
- 伪造扩展名的非图片字节被拒
- 超尺寸图片被居中裁剪为正方形
- 注销后头像文件与字段一并清掉
- `toPublicUser` 不泄露 email / passwordHash

外加 `npm run check`（typecheck）与 `npm run lint`，
以及本地 dev 走查两语种 × 两页面 × 有头像/无头像/无作品三态。
