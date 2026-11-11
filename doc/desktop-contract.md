# 桌面端对接契约（官网 → 桌面）

本文件是官网侧对桌面端暴露的 HTTP 契约的**人读版本**，与 `scripts/contract-check.mts` 一一对应。
改端点必须同时改这两处，否则契约漂移只能等联调时才暴露。

对应总 Spec：`2026-08-05-commercialization-redesign.md` §9。

生产地址**两个**（双主站，2026-08-08）：

| 站点 | 地址 | 币种 | 支付 | 缔约主体 |
|---|---|---|---|---|
| 国内站 `cn` | `https://www.aiworkdeck.com` | CNY | 微信支付 | 北京京微资易科技有限公司 |
| 国际站 `intl` | `https://www.workdeck.ai` | USD | Stripe | 香港实体 |

**两站的本契约逐字相同**——端点集合、字段名、类型、状态码语义完全一致，
差异只体现在**值**上（`amountCents` 的币种含义、ai-usage 的 `exchangeRate` 与 `currency`）。
这条不变式是桌面端只用切一个 base-url 就能换站的前提，改契约前先确认没有推翻它。
机器可执行版本 `scripts/contract-check.mts` 因此一份脚本管两站，两个 `NEXT_PUBLIC_AWD_SITE`
取值下必须产出同样的形状。

见「站点」一节。

**Credits 重构（2026-08-08）**：余额、AI 额度、创作者收益统一为 Credits（站内唯一计价单位）。
设计见 `doc/credits-redesign.md`；本文档已按重构后的实现更新。

## 站点（2026-08-08）

### 账户不互通

两站是**独立的账户体系与独立的缔约主体**：各自一份 `data/`、一个 SQLite 库、一份 users.json。
`awdk_` Key、Credits 余额、entitlement、per-user 平台 AI 密钥全部按站。
桌面端靠 `~/.aiworkdeck/site.json` 决定打向哪个站（机器级状态，与 license/account 同目录）。

### 非签发站上的行为

一把国际站的 Key 打到国内站（或反之）：

| 端点 | 响应 | 桌面端如何处理 |
|---|---|---|
| `POST /api/license/verify-key` | **200** `{valid:false}` | 判 INVALID，报「Key 无效」并附站点提示 |
| `GET /api/account/*`（Bearer） | **401** | 判 UNAUTHORIZED，同上 |

`verify-key` 在这种情况下**必须仍然回 200**，不能改成 4xx：桌面端把 verify-key 的 4xx
判为「凭据明确失效」并抹掉 `license.json`。站点选错不该有这个后果。

桌面端在多站形态下会把「当前站点」与「另一站」的名字写进错误文案，
并在解锁页给一个「切换站点并重试」的按钮。桌面端**刻意不做「拿同一把 Key 依次探测两个站」**：
`awdk_` 是明文 bearer 凭据，把它发给一个不是它签发方的服务器等于向第三方泄露一把有效凭据。

### 反代红线：`/api/` 与 `/update/` 不得有任何 301/302

桌面端 `HttpAccountTransport` 用 JDK HttpClient，**默认 `Redirect.NEVER` 不跟随重定向**。
一个 301 会被 `AccountService.handle` 判成「预期外状态」→ MALFORMED，
用户看到「官网返回了预期外的状态」，没有任何线索。

这在 `workdeck.ai` 上是真实风险：新加坡 nginx 按访客 IP 做 geo 分流，境内访客默认
301 回国内站，而「注册在国际站、人在境内」是完全合理的场景。
vhost 里必须给 `^~ /api/` 与 `^~ /update/` 加优先级更高的 location 绕开 geo 判断。
配置源本在 `doc/nginx-workdeck-ai.conf`，验收动作在 `DEPLOY.md` §9.6 第 1 条。

### 金额字段的币种

`amountCents`、`balanceCents`、`priceCents`、`creditsCents` 一律是**该站币种的最小单位**：
国内站是人民币分，国际站是美元分。币种由站点决定，不由字段决定，
**金额类响应里不带 currency 字段**（同一个部署里不会出现第二种币种，带上只会诱导消费方去做多币种逻辑）。

唯一的例外是 `GET /api/account/ai-usage`（dev-board#853）：它下发的是**折算参数**而不是金额，
桌面端模型选择器要用 `exchangeRate × marginMultiplier` 把 OpenRouter 的美元单价换成本币实付价，
得知道本币符号，所以这里带 `currency`，并附汇率的来源与更新时间。

`exchangeRate` 是「本币 → 美元」：国际站恒为 1；国内站默认**跟随即时汇率**（人民币中间价，
约 12 小时刷新一次，后台可切手动覆盖），取不到即时值时回退站点默认值 7.3。
**它会随时间变化**——桌面端要按每次读到的值计算，不要缓存成常量。

## 鉴权方式

| 方式 | 头/凭据 | 用在哪 |
|---|---|---|
| 账户 Key（Bearer） | `Authorization: Bearer awdk_<43 字符 base64url>` | 桌面端全部账户类端点 |
| 官网会话 Cookie | `awd_session` | 官网页面自身；部分端点与 Bearer 二选一 |
| 匿名 | 无 | `POST /api/license/verify-key`、免费条目的 registry 端点 |

- 账户 Key 在官网账户页「桌面连接」生成，明文只显示一次，官网只存 SHA-256 哈希。
- 每账户同时最多 3 把有效 Key，可随时吊销；吊销后该 Key 立即失效（401 / `valid:false`）。
- Bearer 无效或缺失，账户类端点一律 **401** `{ "error": "unauthorized" }`。

## 跨域（浏览器环境插件，如 Office 任务窗格）

`/api/account/*` 与 `POST /api/license/verify-key` 支持配置驱动的 CORS（`middleware.ts`）：
环境变量 `PLUGIN_ALLOWED_ORIGINS` 为逗号分隔的完整 Origin 白名单；命中的来源获得
`Access-Control-Allow-Origin` 回显与 OPTIONS 预检（允许 `Authorization`/`Content-Type` 头）。
**未配置（默认）= 不放开**，行为与从前一致；其余端点不开 CORS。

## 端点一览

### POST /api/license/verify-key（匿名，解锁门用）

请求 `{ "key": "awdk_..." }`

响应恒为 **200**：

| 字段 | 类型 | 说明 |
|---|---|---|
| valid | boolean | Key 有效且未吊销 |
| plan | string | 仅 valid=true 时出现；`paid` / `free` / `expired`，口径见下 |

`plan = paid` 的判定口径（三者取或）：有成功的 recharge/purchase 订单（个人 Pro 订单 `pro:*` 除外）、有任意 `recharge`
或 `gift` 账本行、或有**仍在有效期内**的权益行（永久权益 expiresAt NULL 恒有效）。
`plan = expired`（2026-10-10 新增）：不满足 paid，但个人 Pro 权益已到期——到期的 Pro **不再**算 paid。
任何付费用户数 / 按席位统计同样只数有效期内的权益。后两条是为了覆盖兑换码——兑换码充值只写账本不产生订单，
权益兑换码两者都不产生，只看订单会让「用兑换码充到有余额」的账户报 `free`，
与同一接口返回的 `balanceCents` 自相矛盾。

- Key 无效、body 不是合法 JSON、字段缺失，一律 `200 { "valid": false }`。
- **不要用 4xx 表达「Key 无效」**：桌面端 `LicenseService` 把 4xx 判为 INVALID 并清除本地授权，
  把 5xx/超时判为 UNREACHABLE（保留授权、走 30 天离线宽限）。服务端异常应当以 5xx 出现，
  这样断网与故障不会误清用户授权。
- `plan` 的取值是 `paid` / `free`，**不是** 总 Spec §9 字面写的 `trial` / `paid`：
  「试用」是桌面端本地试用码解锁的状态，官网账户没有试用概念，返回 `trial` 会与桌面端语义打架。
  桌面端当前只看 `valid`，`plan` 仅作展示。

### GET /api/account/me（Bearer）

| 字段 | 类型 | 说明 |
|---|---|---|
| accountId | string | 账户终身稳定标识（users.json 的 uuid 主键，长度 <= 128），**不随 username/displayName 改名或 Key 轮换变化**（2026-08-06 定稿） |
| username | string | 登录名 |
| displayName | string | 昵称 |
| phone | string \| null | 经短信验证的手机号（11 位裸号），未绑定为 null（2026-08-20 新增，供 awdk-login 桥「桥接认领」做手机端账号归一，dev-board#30） |
| balanceCents | number | **可用 Credits**，整数分（未过期批次之和；Credits 重构后不再是「钱包余额最后一行」） |
| plan | string | `paid` / `free` / `expired`，口径同上 |
| avatarUpdatedAt | string \| null | 头像上传时点（ISO 8601），没有头像为 null（2026-09-10 新增，dev-board#564） |
| displayNameIsDefault | boolean | 展示名仍是系统默认值（2026-09-10 新增，dev-board#564） |
| createdAt | string | ISO 8601 |

- `accountId` 供桌面 server 模式桥接端点 `POST /api/auth/awdk-login`（桌面仓 `AwdkLoginService`）
  作 `account_binding.external_account_id` 的映射键：同一账户在 Key 轮换、改名后仍映射到
  同一个 server 用户。桌面侧对缺失 `accountId` 的响应按 MALFORMED 拒绝，不回落 username。

- `avatarUpdatedAt` 同时是取图地址上的缓存戳：`{base}/api/avatar/{accountId}?v={avatarUpdatedAt}`
  （`GET /api/avatar/{accountId}` 匿名可取，带 `?v=` 时挂 immutable 长缓存）。为 null 即「没有头像」，
  消费方降级成首字母，**不要拿裸地址当有图**。
- `displayNameIsDefault` 为真 = 展示名是系统给的，不是人名：空、等于打码手机号
  （`185****5325`）、等于打码邮箱、或等于 `username`。判定的唯一实现是 `lib/users.ts`
  的 `isDefaultDisplayName`，桌面端**不要自己再判一遍**（打码规则改了两边就分叉）。
  为真时桌面端与官网账户页各给一条「填写你的姓名」引导——手机号注册的同事在案卷参与人
  列表、版本时间线、批注作者里显示的就是这个值。

### PATCH /api/account/profile（Cookie 或 Bearer awdk_）

改展示名与简介。**官网是展示名与头像的唯一权威源**（dev-board#565）：桌面端「个人设置」
经本地后端透传到这里，本机只读一份刷新用的副本，不另存权威值。

请求体 `{ "displayName"?: string, "bio"?: string }`，缺省的字段不改。成功 **200**：

| 字段 | 类型 | 说明 |
|---|---|---|
| displayName | string | 改后的展示名（已 trim） |
| bio | string | 改后的简介，未设置为空串 |

| 状态 | error | 说明 |
|---|---|---|
| 401 | unauthorized | Cookie 与 Bearer 都没有或都无效 |
| 400 | bad_request | body 不是 JSON，或两个字段都没给 |
| 400 | invalid_display_name | 展示名为空或超过 24 字 |
| 400 | bio_too_long | 简介超过 160 字 |
| 400 | not_found | 账户不存在或已注销 |

`message` 文案**刻意不含「登录」「未授权」「请先」**三个子串：桌面端
`frontend/src/services/api.js` 拿它们判掉线并清会话，撞上会把人无端踢下线。

### POST /api/account/avatar（Cookie 或 Bearer awdk_）

`multipart/form-data`，字段名 `file`。图片一律经 sharp 重编码为 256×256 webp 后落盘
（剥 EXIF、只取首帧、限解码像素）。成功 **200**：

| 字段 | 类型 | 说明 |
|---|---|---|
| avatarUpdatedAt | string | 新的头像时点（ISO 8601），直接当 `?v=` 用 |

| 状态 | error | 说明 |
|---|---|---|
| 401 | unauthorized | 同上 |
| 400 | no_file | 表单里没有 `file` |
| 400 | too_large | 超过 2 MB |
| 400 | unsupported_format | 不是 JPG/PNG/WebP/GIF/AVIF/HEIC（**SVG 明确不收**） |
| 400 | invalid_image | 解不出图 |

### DELETE /api/account/avatar（Cookie 或 Bearer awdk_）

删头像，降级回首字母。成功 **200** `{ "avatarUpdatedAt": null }`（与 POST 同形状，
删完不必再问一次 `/me`）；未鉴权 **401**。

### GET /api/account/entitlements（Bearer）

响应 `{ "entitlements": [...] }`，每项：

| 字段 | 类型 | 说明 |
|---|---|---|
| feature | string | 权益名，见下方「权益命名」 |
| purchasedAt | string | ISO 8601 |
| orderId | string | 来源订单号；兑换码发放的记为 `gift:<兑换码>` |
| expiresAt | string \| null | **2026-10-10 追加（只加不改）**。NULL = 永久；个人 Pro 等限时权益为到期时间（ISO 8601 UTC）。已过期的权益不出现在列表里 |

### 试用计量 v0.1.1（2026-10-10 新增，来源 TRIAL-API-CONTRACT）

策略：14 天或 80 次 AI 回合，**先到为准**；**官网是权威**，桌面端只代理、缓存、展示，不判定、不扣减。
发放在注册 / 每次登录建会话时幂等完成（真付过钱的账户不发放；注册赠额不影响资格）。
条款类文案只写「以协议为准」。

#### GET /api/account/trial（Bearer awdk_）

响应 **200**：`granted, status, policy, daysQuota, callsQuota, callsUsed, remainingDays, remainingCalls,
trialStartedAt, trialEndsAt, region, serverTime`（字段集由 `scripts/verify-trial-api.mts` 钉住）。

- `status`：`none` / `active` / `exhausted_calls` / `expired_days` / `converted`；终态一经落库不回退。
- `remainingDays` 向上取整；用尽或到期时两项剩余都为 0。
- 未发放：`granted:false, status:"none", remainingDays:14, remainingCalls:80`，时间字段 null。
- 无 / 错 Key → **401**。

#### POST /api/account/trial/turns（Bearer awdk_）

请求 `{ turnId, outcome: "completed" | "awaiting_input", hasAssistantResult, endedAt }`。

- 按 `(accountId, turnId)` 幂等（`ai_turn_ledger` UNIQUE）：重复上报 `{ counted:false, duplicate:true }`。
- `awaiting_input` 与 `completed` 一样算 1 次；`hasAssistantResult !== true` 不计。
- 已转付费 / 未发放 / 已用尽 / 已到期 → 200 `counted:false`（不是错误）。
- 响应 `{ counted, duplicate, balance: <同 GET 形状> }`；请求体不合法 → **400** `{ error }`。
- 桌面上报失败不重试（v0.1.1）。

#### 用尽 / 到期拦截

试用用户（没有付过钱、Credits 为 0）用尽或到期时，`GET /api/account/ai-usage` 与
`POST /api/account/ai-key` 返回 **409** `{"error":"trial_exhausted"}` / `{"error":"trial_expired"}`。
有 Credits（如注册赠额）的账户照常放行，按 Credits 计费。

### POST /api/account/ai-key（Bearer 或 Cookie）

请求体为空。响应 **200**：

| 字段 | 类型 | 说明 |
|---|---|---|
| openrouterKey | string | provisioned OpenRouter runtime key 明文 |
| limitUsd | number | 该 key 当前累计额度上限（美元） |

- 幂等：已有未禁用的 key 直接返回同一把，不新建。
- **409** `{ error: "no_credits" }`：该账户 Credits 余额为空，去官网充值即可（**不再有「分配额度」这一步**）。
- 旧的 **409** `{ error: "no_allocation" }` 已下线。桌面端仍保留该分支的处理，只为兼容尚未升级的官网。
- **409** `{ error: "key_missing" }`：有分配记录但密钥缺失/解不开（异常态），需人工介入。
- **503** `{ error: "not_configured" }`：服务器未配置加密密钥，AI 额度功能整体不可用。

**调用方（2026-08-07 起有两类）**：

1. 桌面端本机——用本机连接的那把 awdk_ 取自己的 key；
2. **server 模式实例（插件云后端）代表某个已桥接用户取该用户的 key**。server 侧不保存
   awdk_ 明文，只在桥接登录（`POST /api/auth/awdk-login`）与用户显式刷新这两个时刻短暂持有它，
   换回的 runtime key 加密存在 server 库里，额度靠本端点发出的 key 自带的 limit 在 OpenRouter 侧强制。

因此**这个端点的幂等性是 server 侧 per-user 计费隔离的前提**：同一账户反复调用必须拿到同一把 key，
否则每次桥接都会换一把、把该账户的用量统计打散。桌面仓设计文档见
`docs/superpowers/specs/2026-08-07-per-user-platform-ai-key.md`（该仓路径）。

注：曾评估过「为 server 实例新增服务端-服务端凭据（凭 accountId 换任意账户的 key）」，
**未采纳**——一把长期主凭据泄露即可拉取全站 key。若将来出现第二方托管的 server 实例，
再单独立项做「per-account 授权 + 撤销」。

### GET /api/account/ai-usage（Bearer 或 Cookie）

**读取即同步**：把远端新增用量折成 Credits 扣减，并把 key 的 limit 重设为
「已用 + 折算(可用 Credits)」。成功恒 **200**：

| 字段 | 类型 | 说明 |
|---|---|---|
| configured | boolean | 服务端 AI 功能是否配置齐全（Management key + 加密密钥），恒出现 |
| exchangeRate | number | 本币→美元折算汇率，恒出现。国际站恒 1；国内站按下方 `exchangeRateSource` 取值，会随时间变化 |
| marginMultiplier | number | 毛利乘数（默认 1.2），恒出现 |
| currency | `'CNY'` \| `'USD'` | 本站币种，恒出现（dev-board#853 新增）。本币实付单价 = 美元单价 × exchangeRate × marginMultiplier |
| exchangeRateSource | `'live'` \| `'manual'` \| `'default'` | 汇率来源，恒出现（dev-board#853 新增）：即时汇率 / 后台手动覆盖 / 站点默认值（国际站恒为 `default`） |
| exchangeRateUpdatedAt | string \| null | ISO 时间，恒出现（dev-board#853 新增）：live 为本站取到该值的时刻，manual 为后台改动时刻（早年手填的值没有记录，为 null），default 为 null |
| **creditsCents** | number | **可用 Credits（分）。判断「能不能用平台 AI」看这个，不要看 hasKey** |
| **usageAvailable** | boolean | 上游用量是否取到。`false` 时 limit/usage/remaining 不可信 |
| hasKey | boolean | 该账户是否已有 provisioned key（按需自动签发，**不再代表「有没有分配过额度」**） |
| limitUsd | number | key 累计额度上限（美元） |
| usageUsd | number | 已用金额（美元） |
| remainingUsd | number | 剩余额度（美元） |
| disabled | boolean | 仅 hasKey=true 出现：key 是否已被止损禁用 |
| keyMasked | string | 仅 hasKey=true 出现：runtime key 打码 |

两条硬约束（改这个端点前务必读）：

1. **上游查不到用量时仍回 200 + `usageAvailable:false`，绝不降级成 4xx/5xx。**
   桌面端把 4xx 判为凭据失效：401/403 会立刻清空已购权益缓存（不吃 30 天宽限），
   verify-key 的 4xx 会抹掉 license.json。一次网络抖动不该让用户被踢回解锁页。
2. **`usageAvailable:false` 时前端必须显示「—」，不能显示 0。** 把「查不到」
   说成「你的额度是 0」比不显示更糟。`creditsCents` 是本地事实，此时照常可信。

`hasKey` 的语义变更是本次最容易漏改的地方：Credits 重构前它同时承载「没有 key」
与「没分配过额度」两个含义，桌面 admin.vue / wizard.vue / office-addin 三处 UI 都
依赖后者。现在 key 是按需自动签发的——新账户充完值到第一次调用之间 hasKey 仍为
false，但它明明可用。**判据一律改用 `creditsCents > 0`。**

### POST /api/account/purchase（Bearer 或 Cookie）

用 Credits 直接购买广场条目或功能解锁。请求 `{ "skuId": "skill:xxx" }`，
**价格由服务端 resolveSku 自查，不接受调用方传金额**。

成功 **200**：`{ ok, feature, priceCents, balanceCents, orderId }`。
扣减、发权益、创作者分成在同一事务里完成，履约逻辑与微信直付共用。

失败：

| 状态 | error | 含义 |
|---|---|---|
| 400 | invalid_sku | 商品不存在或已下架 |
| 400 | not_purchasable | 该条目免费 |
| 409 | already_owned | 已拥有（Credits 分文不扣，事务整体回滚） |
| 409 | insufficient_credits | Credits 不足 |

刻意不用 402：付费闸门的 402 是 registry bundle 端点的语义，这里复用会让桌面端
把「余额不够」当成「未购买」。也刻意不用 401/403，理由同 ai-usage 第 1 条。

### GET /api/account/ledger?limit=50（Bearer）

响应 `{ "entries": [...] }`（总 Spec 写作「流水数组」，实现是带 `entries` 包裹的对象，以本表为准），每项：

| 字段 | 类型 | 说明 |
|---|---|---|
| ts | string | ISO 8601 |
| kind | string | `recharge` / `ai_alloc` / `purchase` / `earning` / `adjust` / `gift` / `expire` / `service_spend` |
| amountCents | number | 整数分；`recharge`/`earning`/`gift` 为正，`ai_alloc`/`purchase`/`expire`/`service_spend` 为负 |
| meta | object \| null | 附加信息（订单号、兑换码等），字段不稳定，不要依赖具体键 |

`limit` 非法或缺省时回落 50，服务端硬上限 200。

**kind 是开放枚举，消费方必须容忍未知取值。** Credits 重构起余额按批次记账
（`doc/credits-redesign.md`），新增 `gift`（兑换码/赠送入账）与 `expire`（奖励批次到期作废），
后续还会随消费场景扩充。桌面端 `AccountController.platformUsage` 以 `kind == "ai_alloc"`
做过滤而非 switch，所以扩枚举对它是安全的；但任何新写的消费方都不许对 kind 做穷举分支。

`service_spend` 是**平台服务网关**（语音转写 / OCR / 搜索 / 企业数据…）的消费。
**网关只有这一个 kind**，具体是哪项服务在 `meta.service` 里——kind 每加一个都要同时改
本表、`scripts/contract-check.mts` 的 `KINDS`、词典的 `accountPage.kinds` 三处，而服务会一直加。
`meta` 的约定字段：`{ service, op, taskId?, phase?, units, unit }`。

`phase` 只出现在**预扣**（长任务，如语音转写）的流水上，一次任务留三行：
`hold`（占住估算额）→ `hold_release`（原批次原额退回，kind 是 `adjust`）→ `settle`（按上游真实
计量重扣）。账户页应按 `meta.taskId` 折叠成一行展示，不要把三行原样摆给用户。

**统计消费时不许对 `service_spend` 直接求和**：`hold` 那行已被 `hold_release` 全额冲销，
加进去等于把一场转写算两遍。正确口径是只算 `phase` 为空或 `settle` 的行，
桌面端要按服务分组的月度消耗直接取 `GET /api/gateway/usage`，别自己在客户端聚合流水。

#### 注册赠额（限时活动）

新账户在**注册那一刻**会收到一笔 `gift` 入账（`reward` 批次，24 个月有效期、不可退现）。
金额与活动窗口是服务端配置，桌面端**不要写死 19.9 元这个数**，也不要假设新账户余额为 0——
「零余额新用户」的引导形态只在活动关闭或赠额花完之后才出现。同一账户只发一次。

### GET /api/account/membership（Bearer 或 Cookie）

会员等级与成长值。未鉴权 **401** `{ "error": "unauthorized" }`。

成功 **200**（严格字段集，两站 CNY/USD 逐字相同，只有金额币种随站点）：

| 字段 | 类型 | 说明 |
|---|---|---|
| growthPoints | number | 成长值。`floor(topupCents/10) + floor(spendCents/20)`，只增不减（退款不回扣） |
| topupCents | number | 历史充值总额（分）：`kind='recharge'` 账本行之和 |
| spendCents | number | 历史真实消费总额（分）：`ai_alloc`/`purchase`/`service_spend` 扣减行取绝对值之和，**排除未结算预扣**（`meta.phase` 存在且不是 `settle` 的行，口径同 `/api/gateway/usage`） |
| tier | object | 当前档：`{ key, level, nameZh, nameEn, bonusPermille }` |
| nextTier | object \| null | 下一档：`{ key, level, nameZh, nameEn, threshold, remainingPoints }`；顶档为 null |
| tiers | array | 七档全集：`[{ key, level, nameZh, nameEn, threshold, bonusPermille }]`，按 level 升序 |

七档等级（数值是产品定稿）：

| level | key | nameZh | nameEn | threshold | bonusPermille |
|---|---|---|---|---|---|
| 1 | paralegal | 律师助理 | Paralegal | 0 | 0 |
| 2 | associate | 正式律师 | Associate | 300 | 10 |
| 3 | lead | 主办律师 | Lead Counsel | 1500 | 20 |
| 4 | senior | 资深律师 | Senior Counsel | 5000 | 40 |
| 5 | salaried-partner | 授薪合伙人 | Salaried Partner | 15000 | 60 |
| 6 | equity-partner | 权益合伙人 | Equity Partner | 50000 | 80 |
| 7 | managing-partner | 管理委员会合伙人 | Managing Partner | 150000 | 100 |

会员权益的硬实现只有充值赠送：充值订单结算入账后、同一事务内，按**含本笔后**的
成长值定档，赠送 `floor(充值金额 × bonusPermille / 1000)` 分。赠送是一笔 `gift`
账本行 + **reward 批次**（24 个月有效期、不可退现，`sourceKind='membership_bonus'`，
`meta.membershipBonus=true`）——绝不能做成 topup，否则可被「退未消耗余额」变相提现。
兑换码充值只写 `gift` 账本行，不计入 topupCents，也不触发赠送。

### 桌面充值：POST /api/payment/create 与 GET /api/payment/query

桌面端以 `awdk_` Bearer 直接下充值单并轮询结果（2026-08-27 起进入契约面）。
两端点原为网页 Cookie 会话专用，现改为**先 Bearer 后 Cookie**（`resolveKeyUser ?? getSessionUser`）：

- `POST /api/payment/create`：请求 `{ kind: "recharge", amount, description?, idempotencyKey? }`
  （amount 为整数分）。`recharge`/`purchase` 必须已鉴权，未鉴权 **401**；匿名 `support`
  打赏路径不变。成功 **200**，按通道二选一（`present` 是显式判据）：
  微信 `{ success, present: "qrcode", outTradeNo, codeUrl, qrCode, amount }`；
  Stripe `{ success, present: "redirect", outTradeNo, amount, redirectUrl }`。
- `GET /api/payment/query?outTradeNo=...`：带 userId 的订单只有**本人**可查
  （Bearer 或 Cookie 均可证明属主），非本人或不存在一律 404；匿名打赏订单凭订单号查。
  成功 **200** `{ success, order: { outTradeNo, status, amount, kind } }`。
  支付成功的结算（含会员充值赠送）由 notify 回调或本端点回查触发，幂等。

### 平台服务网关 /api/gateway/\*（Bearer）

用户只连一次账户，语音转写 / OCR / 搜索 / 企业数据等外部服务由官网持凭证代调，
成本折算成 Credits 从同一个余额扣。设计见桌面仓
`docs/superpowers/specs/2026-08-17-unified-credits-service-gateway-design.md`。

| 端点 | 幂等键 | 说明 |
|---|---|---|
| `POST /api/gateway/{service}/{op}` | **必需** | 同步代理入口 |
| `GET /api/gateway/pricing` | 不适用 | 单价表 + 余额 + 占用中的预扣，**展示用，不是扣费依据** |
| `GET /api/gateway/usage` | 不适用 | 本月各项服务的 Credits 消耗 |

`GET /api/gateway/pricing` 响应：

| 字段 | 类型 | 说明 |
|---|---|---|
| pricing | array | 每项 `{ service, op, unit, creditsPerUnit, maxUnitsPerCall, enabled }` |
| balanceCents | number | 当前余额（分） |
| pendingHoldCents | number | 正被未结算的长任务占用的金额（分）。账户页要能解释这笔钱去哪了 |

**刻意不下发 `costCentsPerUnit`**（我们的采购成本）。

`GET /api/gateway/usage` 响应（「平台服务」面板每项服务旁边那个数字）：

| 字段 | 类型 | 说明 |
|---|---|---|
| month | string | 自然月标识 `YYYY-MM`，**北京时间口径** |
| from / to | string | 统计区间（UTC ISO，左闭右开），对账时据此复现同一个数 |
| services | array | 每项 `{ service, cents, calls }`，按消耗降序；`service` 是 `meta.service` |
| totalCents | number | 本月合计（分），等于 services 各项之和 |
| balanceCents | number | 当前余额（分） |
| pendingHoldCents | number | 同 pricing 端点 |

**与 pricing 分成两个端点是刻意的**：单价几乎不动，桌面端给它挂 10 分钟 TTL 缓存；
用量花一笔就要变。合成一个端点，两种保鲜要求必然互相迁就——要么缓存把用量冻十分钟
（用户刚转写完看不到扣费），要么为了用量取消缓存（每次工具调用都重问一遍单价）。
**usage 不要缓存。**

统计口径（改这块之前先读 `lib/gateway/usage.ts`）：只算 `meta.phase` **为空或等于 `settle`**
的 `service_spend` 行。预扣任务留三行账，`hold` 那行已被 `hold_release` 全额冲销，
直接对 `service_spend` 求和会把 hold 和 settle 重复计入，一场转写显示成两倍价钱。

`POST /api/gateway/{service}/{op}` 成功 200：

```json
{ "ok": true, "data": { }, "billing": { "service": "search", "op": "web", "units": 1, "unit": "call", "chargedCents": 30 } }
```

重复请求（同一 `Idempotency-Key` 且上次已完成）回放原响应，并带响应头 `x-gateway-replay: 1`。

失败 `{ error, message }`：

| 状态 | error | 含义 | 桌面端该做什么 |
|---|---|---|---|
| 400 | bad_request | 缺幂等键 / 参数缺失 / 申报计量超 `maxUnitsPerCall` | 修请求，不要重试 |
| 401 | unauthorized | Bearer 无效 —— **唯一允许 401 的情形** | 提示重新连接账户 |
| 409 | service_disabled | 该服务尚未开放（合同/账号未就绪） | 显示「未开放」并给「改用自己的 Key」入口 |
| 409 | no_credits | 余额不足 | 指向充值 |
| 409 | in_flight | 同一幂等键的上次调用仍在途 | 稍候重试，**沿用同一个键** |
| 413 | bad_request | 请求体超 10 MB | 大对象走各自的直传路径 |
| 502 | upstream_failed | 上游供应商挂了 | 只说该服务暂不可用，其余服务不受影响 |
| 503 | not_configured | 我们没配好凭证 | 同 `service_disabled` 的形态 |
| 504 | upstream_failed | 上游超时 | 可带**同一个幂等键**重试 |

**三条硬约束，改这族端点时逐条核对：**

1. **业务错误绝不用 401/403。** 桌面端把 4xx 判为凭据失效，401/403 会让它立刻清空
   已购权益缓存。鉴权失败之外的一切都走 400/409/413/50x。
2. **`message` 不许含「登录」「未授权」「请先」三个子串。**
   `frontend/src/services/api.js` 拿它们判掉线并清会话，「余额不足请先充值」正好三个全踩中。
   `GatewayError` 构造器在服务端就拦住这类文案，`contract-check` 另有一条护栏。
3. **会扣费的 POST 必须带 `Idempotency-Key`**（8-128 位 `[A-Za-z0-9_-]`）。
   同一次用户动作的全部重试沿用同一个键。缺失直接 400——客户端超时而服务端已扣费成功
   是常态路径（OCR / 听悟建任务超过几秒很正常），没有幂等键就是一次重试扣两次钱。

#### 通用入口下的服务与操作

`{service}/{op}` 的全集如下。**请求参数里从不出现价格，也不出现计量数量**——
`units` 一律由服务端从上游响应里取（那一列写明取哪个值），客户端申报值只在
标注了「申报」的地方参与预扣估算与 `maxUnitsPerCall` 校验。

| service/op | 请求参数 | `data` 形状 | 计量单位与来源 |
|---|---|---|---|
| `search/web` | `{ query, count? }` | 博查原始响应 | `call`，一次调用 = 1 |
| `ocr/recognize` | `{ imageBase64 }`（可带 dataURL 前缀） | `{ content, raw }` | `page`，上游报了页数按它，没报按一次调用一页 |
| `qichacha/eci_info` | `{ searchKey }` | 企查查原始 `{ Status, Message, Result }` | `call`，一次调用 = 1 |
| `tushare/query` | `{ apiName, params?, fields? }` | Tushare 原始 `{ code, msg, data }` | `call`，一次调用 = 1 |
| `pkulaw/{search_article,get_article,get_law_list,get_law_item_content,law_recognition}` | `{ args }` | `{ raw }`（MCP JSON-RPC 响应正文，**桌面端自己解析**） | `call`，一次调用 = 1 |

**`tts/*` 已整体下线**（2026-08-17）。语音合成只剩桌面端本机 Kokoro 一条路，
没有平台代采这一档，适配器与定价行都已删除。调 `/api/gateway/tts/*` 回
`503 not_configured`（未知服务），与「未开放」不是一回事——后者是合同/账号未就绪的
产品状态，前者是这个服务压根不存在。

三条只属于这一族的约定：

1. **两家上游用响应体而不是 HTTP 状态表达失败**：企查查看 `Status`（非 `"200"`）、
   Tushare 看 `code`（非 `0`），网关把它们判成 `upstream_failed` 且**一分不扣**。
   只按 HTTP 状态判成功，会给一次「查无此企业」收全价。
2. **北大法宝的三个 MCP 端点写死在服务端**，`op` 是白名单，客户端指定不了 URL——
   否则网关就成了一个拿我们的凭证打任意地址的转发器。
3. **任何一家都可能是 `enabled=0`**（合同/账号未就绪时的状态）。桌面端会收到
   `409 service_disabled`，应显示「未开放」并给「改用自己的 Key」的入口，而不是报故障。
   开关随时可能被后台改，**不要在桌面端写死哪几家开着**——以 `GET /api/gateway/pricing`
   下发的 `enabled` 为准。（企查查与北大法宝曾默认关闭，自 2026-08-17 起统一采购、默认开放。）

### 语音转写 /api/gateway/asr/\*（Bearer）

语音是唯一走**异步长任务**的服务，所以不走通用入口，而是拆成三步：
控制面（余额、预扣、结算）经过官网，数据面（几百 MB 音频）**直传 OSS 不进 Next.js 进程**。

| 端点 | 幂等键 | 说明 |
|---|---|---|
| `POST /api/gateway/asr/ticket` | 不需要（不扣费） | 查余额 + 签直传凭证 |
| `POST /api/gateway/asr/submit` | **必需** | 预扣 + 建听悟任务 |
| `GET /api/gateway/asr/task/{id}` | 不适用 | 轮询；完成时结算并回结果、删中转对象 |

**第 1 步 `POST /api/gateway/asr/ticket`**，请求 `{ durationSec, format }`
（`format` ∈ mp3 / wav / m4a / aac / ogg / opus / webm / flac）。成功 200：

| 字段 | 类型 | 说明 |
|---|---|---|
| objectKey | string | 中转对象键，**带该账户的专属前缀**，submit 时原样回传 |
| uploadUrl | string | 预签名直传地址 |
| uploadMethod | string | 恒为 `PUT` |
| contentType | string | **必须逐字用它做请求头**——它进了签名，多发少发都会被 OSS 判签名不匹配 |
| expiresInSec | number | 直传地址有效期 |
| maxUploadBytes | number | 体积上限（与 `durationSec` 挂钩）。服务端在 submit 里复核，这里下发只为让客户端能提前自检 |
| estimatedCredits | number | 按申报时长的估算金额（分） |
| unit | string | 恒为 `minute` |
| balanceCents | number | 当前余额（分） |
| needsConfirm | boolean | 估算金额超过确认阈值，桌面端应在提交前让用户确认 |

**余额闸在这一步**：余额不足回 `409 no_credits`，且**一张上传凭证都不会签出**——
不能让用户先传完两小时录音再被拒。

**第 2 步 `POST /api/gateway/asr/submit`**，请求 `{ objectKey, durationSec }` + `Idempotency-Key`。成功 200：

| 字段 | 类型 | 说明 |
|---|---|---|
| taskId | string | 网关任务 ID。**必须落库**，重启后据此恢复轮询 |
| heldCents | number | 本次预扣金额（分），结算时按真实时长多退少补 |
| estimatedUnits | number | 申报时长折算的分钟数 |
| unit | string | 恒为 `minute` |
| pollAfterSec | number | 建议的轮询间隔（服务端节流窗口） |

`objectKey` 不属于该账户、对象不存在、或**实际体积与申报时长不符**一律 400，
且不会预扣、不会建任务。建听悟任务失败时预扣被原额释放，用户不花一分钱。

**第 3 步 `GET /api/gateway/asr/task/{id}`**。三种 `status`：

```json
{ "status": "processing", "taskId": "asr_...", "throttled": true }
{ "status": "failed", "taskId": "asr_...", "message": "...", "billing": { "chargedCents": 0 } }
{ "status": "completed", "taskId": "asr_...",
  "transcription": "<听悟转写结果原文>", "autoChapters": null,
  "summarization": null, "meetingAssistance": null,
  "billing": { "service": "asr", "op": "transcribe", "units": 42, "unit": "minute", "chargedCents": 420 } }
```

四份结果由官网代下载后原样转发（都是听悟结果文件的原始 JSON 文本），
增值三份取不到时为 `null`，不影响 `transcription` 这个主产物。

**三条只属于这条链路的硬约束：**

1. **计价用听悟返回的真实时长，不是 `durationSec`。** 客户端申报值只进过预扣估算与余额闸，
   且受 `maxUnitsPerCall` 约束。真实时长从转写结果的最后一个词的 `End` 时间戳算出——
   听悟的 `GetTaskInfo` 本身不返回时长。
2. **`taskId` 必须落库。** 释放与结算挂在桌面轮询上，用户合盖笔记本、换台机器办公，
   那笔预扣就只能等服务端超时回收（默认 4 小时）才退回。
3. **查不到的任务与不属于自己的任务给完全一样的 400**，不提供存在性探测。

### POST /api/account/redeem（Bearer 或 Cookie）

请求 `{ "code": "AWDG-XXXX-XXXX-XXXX" }`。大小写、空格、缺连字符都会被归一化。

成功 **200**：

| 字段 | 类型 | 说明 |
|---|---|---|
| ok | boolean | 恒为 true |
| kind | string | `recharge` 或 `entitlement` |
| amountCents | number | 仅 recharge：入账金额（分） |
| balanceCents | number | 仅 recharge：入账后余额（分） |
| feature | string | 仅 entitlement：发放的权益名 |

失败 `{ error, message }`（message 为面向用户的中文文案）：

| 状态 | error | 含义 |
|---|---|---|
| 400 | invalid_code | 格式不正确 |
| 404 | not_found | 码不存在 |
| 409 | already_redeemed | 该兑换码已被使用（一码一次，并发只有一个赢家） |
| 409 | revoked | 已被后台作废 |
| 409 | already_owned | 已拥有该权益，**码未被消耗**，可转赠他人 |

### GET /api/registry/skills/{id}/bundle、GET /api/registry/plugins/{id}/bundle

免费条目匿名可取，行为与商业化改造前一致。付费条目（`priceCents > 0`）要求 Bearer Key 且已购：

- 未带 Key 或未购买 → **402**

| 字段 | 类型 |
|---|---|
| code | string，恒为 `payment_required` |
| priceCents | number |
| itemName | string |

- 已购 → **200**，Skill 为 `{ id, version, files: { "skill.yml", "prompt.md" } }`；
  插件 bundle 结构与免费条目一致（含 `signature`）。
- `GET /api/registry/plugins/{id}/file` 同一闸门口径。
- registry 列表端点（`/api/registry/skills`、`/api/registry/plugins`）新增 `priceCents`、`pricingModel`
  字段，旧字段一字未动——旧版本桌面忽略未知字段即可。

### POST /api/skills、PUT /api/skills/{id}（Cookie 或 Bearer awdk_）

桌面端「发布到 Marketplace」（一句话写 Skill）经本地后端透传投稿，与官网投稿页同一套校验（`validateSkillInput`）。
鉴权 `resolveSessionOrKeyUser`，Bearer 优先；作者记为凭据的主人。

- `POST` body `{ id, name, description, triggers[], allowedTools[], output?, prompt, category?, priceCents? }`
  → `{ skill, badges }`；同 id 已存在 400 `id_taken`（桌面端据此改走 PUT）；字段不合规 400 `invalid_*`。
- `PUT /api/skills/{id}` 同 body → `{ skill }`，版本补丁位 +1；body **没带**的 `priceCents`/`category`/`icon` 沿用已发布值（带了含空值才改），桌面端更新不会把付费项清成免费；不是作者 403 `forbidden`，不存在 404 `not_found`。
  **桌面端把这个 403 当业务拒绝**（「这个 id 被别人占了」），不得据此判 Key 失效。
- 无凭据或 Key 无效 401 `unauthorized`。自测：`npm run test:skill-submit`。

## 团队（dev-board#496）

律所/团队实体与团队使用统计。层级是 **个人 → 团队 → 律所**：律所（`firm`）没有独立人员名单，
管理者就是**总部团队**（`firm.headTeamId`）的 OWNER/ADMIN，这样「一人一团队」不用破。
设计稿见 `TEAM_API_SPEC_dev-board-496.md` 第 4/5/6/10 节，官网实现在 `lib/team.ts`，
自测脚本 `scripts/verify-team.mts`（`npm run test:team`）。

鉴权走 `resolveSessionOrKeyUser`：**Bearer awdk_ 优先，`awd_session` Cookie 兜底**。
桌面端经本地 `AccountController` 透传（照 membership 那套）用 Bearer；官网账户页
「我的团队」分区在浏览器里直接 fetch，用会话 Cookie。两种凭据同时在场时以 Bearer 为准
（同一台机器上浏览器登着 A、桌面端连着 B 是常态）。Cookie 从 request 头上读，
不走 `next/headers` 的 `cookies()`——后者在契约脚本直接调 handler 时会抛，那条路径就永远测不到。

**与匿名 telemetry 是两条通道，不要合并**：`/api/telemetry/*` 无鉴权、无 accountId，
三处公开文档承诺「安装标识与账户无关」；团队统计带 accountId、要 Bearer、桌面端默认关闭
（`team.usage.enabled`）。表、端点、白名单全部另起。

| 方法 | 路径 | 权限 | 说明 |
|---|---|---|---|
| GET | `/api/account/team` | 任意 | 有团队：`{ team, myAccountId, myRole, joinCode?, members[], pendingInvites[], firm }`；无团队：`{ team: null, invites[] }`（发给我手机号的邀请） |
| POST | `/api/account/team` | 无团队者，已绑手机号 | `{ name }` → `{ team }`，创建者为 OWNER |
| PATCH | `/api/account/team` | OWNER/ADMIN | `{ name?, shareProjectNames? }` → `{ team }` |
| POST | `/api/account/team/join` | 无团队者，已绑手机号 | `{ code }` → `{ team }`，按团队邀请码加入（角色一律 MEMBER） |
| POST | `/api/account/team/join-code/regenerate` | OWNER/ADMIN | → `{ joinCode }`，旧码立即失效 |
| POST | `/api/account/team/firm` | 团队 OWNER 且本队未入所 | `{ name }` → `{ firm }`，本团队成为总部团队 |
| POST | `/api/account/team/firm/join` | 团队 OWNER 且本队未入所 | `{ code }` → `{ firm }`，团队并入律所 |
| PATCH | `/api/account/team/firm` | 总部 OWNER/ADMIN | `{ name? }` → `{ firm }` |
| POST | `/api/account/team/firm/join-code/regenerate` | 总部 OWNER/ADMIN | → `{ joinCode }` |
| DELETE | `/api/account/team/firm/teams/{teamId}` | 总部 OWNER/ADMIN，或该团队 OWNER 自退 | → `{ ok: true }`；**总部团队不可退出** |
| POST | `/api/account/team/invites` | OWNER/ADMIN | `{ phone, role }` → `{ invite }`，7 天有效 |
| DELETE | `/api/account/team/invites/{id}` | OWNER/ADMIN | 撤销（删行）→ `{ ok: true }` |
| POST | `/api/account/team/invites/{id}/accept` | 被邀请手机号本人（已绑手机号） | → `{ team }` |
| PATCH | `/api/account/team/members/{accountId}` | OWNER / ADMIN | `{ role?, title? }`（至少一项）→ `{ member }`；`title` 见下 |
| DELETE | `/api/account/team/members/{accountId}` | OWNER/ADMIN 或本人退出 | → `{ ok: true }` |
| POST | `/api/account/team/usage` | 团队成员 | 日聚合上报 → `{ date, projects }` |
| GET | `/api/account/team/summary?range=7\|30\|90&scope=team\|firm` | 团队成员 | 见下；`scope` 缺省 `team` |
| PUT | `/api/account/team/projects/{projectKey}/alias` | OWNER/ADMIN | `{ label }` → `{ ok: true }` |

`team` = `{ id, name, ownerAccountId, shareProjectNames, firmId, createdAt }`（`firmId` 未入所为 null）；
`members[]` = `{ accountId, displayName, role, title, joinedAt }`（`title` 职务，未设为 null）；
`invite` / `pendingInvites[]` / `invites[]` = `{ id, teamId, teamName, phone, role, createdAt, expiresAt }`；
`firm` = `null` 或 `{ id, name, headTeamId, isHead, joinCode?, teams[] }`，
`teams[]` = `{ id, name, memberCount, isHead }`（总部排在最前）。

**两个 `joinCode` 都是凭据，按角色缺字段而不是给 null**（客户端用「有没有这个字段」判要不要
渲染复制按钮，给 null 会渲染出一个空按钮）：
- `GET /api/account/team` 顶层的 `joinCode` = 团队邀请码，仅本队 OWNER/ADMIN 有；
- `firm.joinCode` = 律所邀请码，仅**总部团队**的 OWNER/ADMIN 有（子团队的 OWNER 也没有）。

邀请码格式：8 位大写字母数字，字母表 `23456789ABCDEFGHJKLMNPQRSTUVWXYZ`（**去掉 0/O/1/I**，
这个码要被人念出来、抄在纸上）。服务端接受小写与空格，规范化后再匹配，但不做 O→0 之类的字符替换。

`summary` = `{ range, scope, kpi, savedMinutesFormula, daily[], members[], projects[], teams? }`：

- `kpi` = `{ activeMembers, memberCount, appStarts, projectsCreated, activeMinutes, aiTurns, savedMinutes, agentEditActions, activeProjects, unassignedTasks }`
  （后三项 2026-11 新增：`agentEditActions` 窗口内 AI 编辑动作合计；`activeProjects` 窗口内有工时的不同项目数；
  `unassignedTasks` 各成员**最近一次上报**的未分派待办数之和，旧客户端不报则为 0）
- `savedMinutesFormula` = `{ perAgentEdit: 3, perAiTurn: 2 }`，**随响应下发不要在客户端硬编码**
  （`savedMinutes = agentEditActions × perAgentEdit + aiTurns × perAiTurn`，是估算，UI 必须写明公式）
- `daily[]` = `{ date, activeMembers, aiTurns, activeMinutes }`，只含有数据的日期，按日期升序
- `members[]` = `{ accountId, displayName, role, title, activeDays, activeMinutes, aiTurns, agentEditActions, projectsCreated, lastActiveDate, daily[], currentProject }`
  - `daily[]` = `{ date, activeMinutes }`，只含该成员有上报的日子，按日期升序（桌面端「本周」看板的周一至周五格子）
  - `currentProject` = `{ projectKey, label }` 或 null：最近一个有项目明细的日子里分钟数最多的项目；
    `label` 同 `projects[]` 口径（别名优先，团队关了项目名共享且无别名时为 null），可见范围与 `projects[]` 一致
- `projects[]` = `{ projectKey, label, minutes, members, aiTurns }`，按 `minutes` 倒序
- `teams[]` = `{ id, teamId, name, isHead, memberCount, activeMembers, activeMinutes, aiTurns, projectsCreated }`，
  **只在 `scope=firm` 且我是总部管理者时下发**；所内没数据的团队也会出现（值为 0），
  「这个队这段时间一条都没有」与「这个队不在所里」是两回事

规则与地雷：

- **一人一团队**（首期）：建队、接受邀请都会被 409 `already_in_team` 挡。库上有 `UNIQUE(accountId)` 兜底。
- **建队 / 凭团队邀请码加入 / 接受邀请，三条「成为团队一员」的路都要求当前账号已绑手机号**
  （维护者裁决，dev-board#496），否则 403 `phone_required`：邀请挂在手机号上、管理员移除/
  找人也是报手机号，一个没绑号的账号混进团队会让这些动作全部失灵。
- **邀请挂在手机号上**，被邀请人可以还没注册；`accept` 按**当前登录人的 phone** 匹配，
  没绑手机号 403 `phone_required`，号码对不上则是 403 `forbidden`（邀请 id 是可传播的
  字符串，不能当凭据用）——两者是不同的错误码，前者提示「先去绑手机号」，后者提示「这不是你」。
- 角色：OWNER 可改任何非 OWNER；ADMIN 只能动当前是 MEMBER 的人（能提成 ADMIN，提完就降不回来，
  收权只有 OWNER 说了算）；`role` 只接受 `ADMIN`/`MEMBER`，转让所有权本期不做。
- **OWNER 不可退出**（403 `owner_cannot_leave`）：队里没有 OWNER 就永久卡死。
  退队不删使用数据，历史 KPI 不缩水。
- **职务 `title`**（迁移 46，`team_member.title`）：自由文本 ≤ 30 字，只是展示标签，**不参与任何权限判定**。
  OWNER/ADMIN 可给队里任何人（含 OWNER 与自己）设；MEMBER 403 `forbidden`；空串或 null 清除；
  非字符串或超长 400 `bad_title`。同一请求带 `role` 与 `title` 时在同一事务里处理，任一步被拒整体回滚。
- 上报体可带 `unassignedTasks`（非负整数）：上报时刻本人名下项目里未完成且未分派的事项数，是快照不是当天历史值；
  只有计数，不含事项标题。
- 上报幂等：主键 `(accountId, date)`，同日重传整天覆盖，项目明细**整天替换**（重传里少掉的项目行会消失）。
- 上报限制：body ≤ 64KB（超出 413 `payload_too_large`）、同 accountId 每分钟 ≤ 10 次
  （超出 429 `rate_limited`，进程内计数）、`activeMinutes` 超 16 小时截断而不是拒收。
- **`shareProjectNames` 默认 true，项目名随上报直接落库**（律所内部共享项目名默认视为
  正常协作，维护者裁决 dev-board#496）；团队可以随时 PATCH 关掉，关掉后项目名一律不落库
  （客户端传了也丢弃，服务端自己挡一道）。面板显示 `projectKey` 短码，管理者可起别名；
  **别名优先于上报带来的项目名**。
- `range` 非法值回落到 7，不报错。
- MEMBER 调 `summary` 时 `members` 只含自己、`projects` 只含自己参与的；`kpi`/`daily`
  仍是全队合计（合计数没有归属，要挡的是「谁干了多少」）。MEMBER 也看不到 `pendingInvites`。
- `scope=firm` 只对**入所团队**可用（未入所 404 `no_firm`）。合计范围由 `scope` 决定、
  明细范围由角色决定：总部 OWNER/ADMIN 拿全所 `members`/`projects` 并附 `teams[]`；
  子团队 OWNER/ADMIN 拿全所 `kpi`/`daily` 合计 + **只有本团队**的明细；MEMBER 拿全所合计 + 只有自己。
  `scope` 非法值回落 `team`（与 `range` 同口径，展示选项不报错）。
- **建律所与并入律所只有团队 OWNER 能做**（ADMIN 不行）：这两件事改的是整个团队的归属，
  ADMIN 是被 OWNER 提上来管人的，不该替全队做归属决定。改所名、重置律所码则是 OWNER/ADMIN 都行。
- **总部团队不可退出、也踢不掉**（403 `head_cannot_leave`）：律所的管理权挂在总部团队上，
  总部一走就没人能管了（与「OWNER 不可退出团队」同一个道理）。解散律所本期不做。
- 退出/移出律所只改 `team.firmId`，使用数据一行不动——那些天的产出仍然发生过，
  抹掉会让律所历史 KPI 无声变小（与退队同一口径）。
- 用码加入一律是 **MEMBER**：码是公开传播的，凭一个码就能当管理员的团队没法要。
- 用码加入/并入时**先判「我已经有队/有所了」再判码对不对**：反过来的话，已经在队里的人
  拿一堆码来试，能靠 404/409 的差别把哪些码有效摸出来。
- 错误码：401 `unauthorized`；403 `forbidden` / `phone_required` / `owner_cannot_leave` / `head_cannot_leave`；
  404 `no_team` / `no_firm` / `bad_code` / `member_not_found` / `invite_not_found` / `team_not_found`；
  409 `already_in_team` / `already_in_firm` / `invite_accepted` / `invite_expired`；
  400 `bad_request` / `bad_name` / `bad_role` / `bad_title` / `bad_phone` / `bad_date` / `bad_shareProjectNames`；
  413 `payload_too_large`；429 `rate_limited`。**服务端故障照常 5xx**，不要降级成 4xx——
  桌面端把 4xx 判为「凭据/请求明确有问题」。


## 权益命名（entitlements.feature）

| 形式 | 例 | 来源 |
|---|---|---|
| 功能解锁 SKU | `clipboard.unlimited`、`stage.unlimited` | 购买 feature SKU 或权益兑换码 |
| 付费 Skill | `skill:<skillId>` | 购买或权益兑换码 |
| 付费插件 | `plugin:<pluginId>` | 购买或权益兑换码 |

桌面端 `FeatureCatalog` 必须与这里一致；官网侧生成兑换码时会按同一张表做白名单校验。

### 兑换码发放权益与购买的差别（有意为之）

权益兑换码只写 `entitlements` 一张表，**不写 `purchases`、不写 `creator_earnings`**：
- 赠送付费 Skill/插件时创作者拿不到七三分成——兑换码是平台自费的推广/补偿手段，
  没有真实收款可分。要给创作者结算，走正常购买链路或 admin 收益结算面板手工补。
- 该条目不出现在账户页「我的购买」，只出现在权益列表。
- 下载闸门只看 `entitlements`，所以兑换来的付费条目照常可安装。

白名单只在**生成**兑换码时校验一次，核销时不复查。条目下架/待审期间复查会把用户手里的
有效码变成不可兑（且用户多半不会再回来重试）；多发一条指向暂时不存在条目的权益是无害的，
条目重新上架后直接可用。

## 兑换码格式

`AWDG-XXXX-XXXX-XXXX`，12 位 base32（字母表 `A-Z2-7`，不含 0/1/8/9）。
与试用码 `AWD-T-...`（离线 Ed25519 签名、桌面内置公钥验签、不联网）刻意区分：
两者用途不同，前缀混用会让用户在解锁页与账户页之间反复试错。

## /captcha-embed 嵌入契约（桌面端登录页的人机验证）

桌面端主窗口是 `file://` 页面。Turnstile 按域名放行（控件允许域名 workdeck.ai / www.workdeck.ai /
aiworkdeck.us / www.aiworkdeck.us），在 `file://` 上直接 `turnstile.render` 必报 110200。
所以桌面端登录页不自己渲染控件，而是用 iframe 嵌官网托管的这一页，token 经 `postMessage` 交回。

### 页面

`GET /captcha-embed?lang=zh|en&theme=light|dark`

- **不带语言前缀**（middleware 豁免 locale 重定向）；`lang` 缺省 `en`，`theme` 缺省 `light`。
- 两站同一路径、同一契约：`cn` 渲染阿里云验证码 2.0，`intl` 渲染 Cloudflare Turnstile（`provider` 字段区分）。
- 透明底、无导航无页脚、`robots: noindex`。页面**不声明 color-scheme**：父页也别给 iframe 设
  `color-scheme`，两边不一致时浏览器会给 iframe 画不透明底。
- 响应头：CSP 与全站逐字相同，唯独 `frame-ancestors * file:`（`*` 不含 `file:`，必须单列）；
  `X-Frame-Options: ALLOWALL`（非法值，浏览器忽略；有 frame-ancestors 时 XFO 本来就不生效）。
- 本站未启用人机验证（公开参数或服务端密钥没配齐）时渲染空页，只发 `disabled`。

### 页面 → 父窗口

一律 `window.parent.postMessage(msg, '*')`（父窗口 origin 是 `null`，只能用 `'*'`），
所有消息带 `source: 'awd-captcha'`。父窗口按 `event.source === iframe.contentWindow` 与
`data.source` 过滤；**不要按 `event.origin` 写死**——`intl` 站境外访客可能被 nginx 引到 `.us`。

| 消息 | 何时 |
|---|---|
| `{source, type:'ready', provider:'turnstile'\|'aliyun'}` | 页面挂好消息监听、控件开始加载。收到它之后才可以发 `get-token` |
| `{source, type:'disabled'}` | 本站未启用人机验证。桌面端照常发请求、不带 token |
| `{source, type:'token', token}` | 控件自己产出 token（Turnstile 加载完自动产出；阿里云拖完拼图），或回应 `get-token`。**空串 = 未通过 / 未就绪** |
| `{source, type:'error', code}` | 控件报错。Turnstile 是它的错误码（如 `110200` 域名未放行）；阿里云是 SDK 的 `code`（如 `INIT_FAIL`）；脚本加载失败是 `script-load-failed` |
| `{source, type:'size', height}` | 控件容器高度变化（px）。Turnstile 平时隐形（高 0），可疑时弹交互挑战会长到约 65–70px，父窗口据此调 iframe 高度 |

同一枚 token 可能被发两次（控件回调一次、`get-token` 应答一次），以最后收到的为准。
token 一次性、几分钟过期，**每次发验证码请求前都 `get-token` 取新的**，别复用缓存的那枚。

### 父窗口 → 页面

`iframe.contentWindow.postMessage({source:'awd-captcha', type}, '*')`。页面只认来自父窗口、
`source === 'awd-captcha'` 的消息，别的一律忽略。

| 消息 | 页面行为 |
|---|---|
| `{source, type:'get-token'}` | 重置控件并取一枚新 token，回 `token` 消息（未通过回空串；Turnstile 最长等 60 秒，阿里云等用户拖完、最长 120 秒） |
| `{source, type:'reset'}` | 丢掉当前 token、控件回初始态，不回消息 |

父窗口发来的消息不含任何敏感数据，页面也不向父窗口暴露 token 之外的东西。

### 阿里云（`cn`）的尺寸

阿里云是 `popup` 模式：`get-token` 会在 iframe **内部**弹出拼图浮层（挂在 body 上、固定定位），
控件容器恒为 0 高，`size` 消息报不出它。桌面端对 `provider:'aliyun'` 要在发 `get-token` 前
把 iframe 撑到能容下拼图的尺寸，拿到 `token` 后再收回。

## 自测

契约的机器可执行版本：

```
mkdir -p /tmp/awd-contract && cd /tmp/awd-contract \
  && npx tsx --tsconfig <repo>/tsconfig.json <repo>/scripts/contract-check.mts
```

必须在空目录里跑（脚本会在 cwd 建 `data/`，与真实数据隔离）。
字段少一个、多一个、改名、类型变了都会失败。

团队端点（本文件「团队」一节）另有一份：

```
npm run test:team
```

同样在临时空目录里跑（脚本自己 `mktemp -d`），直接调 route handler，不起 next 服务。

`/captcha-embed` 嵌入契约要验真实响应头，只能对跑着的站点验（两站各构建、各起一次，各跑一遍）：

```
NEXT_PUBLIC_AWD_SITE=intl npm run build && npm run start   # 另一个终端；cn 同理
npx --yes tsx scripts/verify-captcha-embed.mts http://localhost:3000
```

## Pro 周期额度与钱包分账（2026-10-11，dev-board#1187）

人民币 Pro 仍为一次性购买 149 元 / 30 天，非自动续费。`lib/saas-pricing.ts` 是额度数值唯一来源；按 2026-10-11 追加指示采用 745 Credits / 周期、200 Credits / 7 天，后续调价仅影响新建周期（已发周期存数值快照）。额度按外部服务零售价计量，与钱包充值并非同一笔资产。1 Credit 的国内站零售标价为 1 元；按默认成本加成 1.2，745 Credits 全额兑现的采购成本约 620.83 元，未计支付、存储和运营成本。竞品没有公开统一 API 成本折扣率，不能把 5 倍额度描述为竞品事实。

- `balanceCents`（me/wallet/internal account balance）继续仅表示充值及奖励余额；既有充值批次有效期、可退款性质不变。
- 这些接口以及 `GET /api/account/ai-usage` 新增 `subscription`。字段为 `active, expiresAt, periodId, periodStart, periodEnd, monthlyLimitCents, monthlyUsedCents, weeklyStart, weeklyEnd, weeklyLimitCents, weeklyUsedCents, availableCents, walletFallbackEnabled, cloudStorageBytes, relayBytes`。时间均为 UTC ISO，未生效时周期日期/ID为 null、用量额度为 0。`expiresAt` 为整个 Pro 权益期限，`periodEnd` 为当前消费周期末，两者在预续费时不同。
- 周期从开通时刻起 30 天，周从周期开始起每 7 天重置，最后不足 7 天止于周期末；额度不结转。兼容旧年付 365 天订单：12 个周期，前 11 个 30 天、最后一个 35 天；年付仍不新售。
- `ai-usage.creditsCents` 是本次可使用的服务额度，新增 `walletBalanceCents` 表示真实钱包余额。订阅有效且未同意超额扣费时，前者只含当前周和周期均允许使用的额度，不含钱包。上游不可达时有效订阅返回 `usageAvailable:false, creditsCents:0`，不会凭旧子 key 的额度继续放行。
- `GET /api/account/subscription` 支持 Bearer/Cookie，返回 `{subscription}`；`PATCH` 接受严格布尔 `{walletFallbackEnabled}`。有效订阅默认不动钱包，用户明确开启后，先扣周期额度、再按现有单价扣充值/奖励钱包。订阅结束后，未开启钱包续用的原订阅 AI key 下调为已用量；后台轮询不能自动授权钱包，账户页到期后仍可明确开启钱包续用。新发起的网关随用随充调用沿原单价。变更同步 AI 上限失败返回 503 与已保存的 preference；客户端刷新后重试，不报告为同步成功。
- AI 和平台网关服务（含转写及跨设备中转）的额度共用。商城购买不使用订阅额度。网关预扣占用同一周/周期限额；失败退款回到原周期原周，即使其已结束也不变成新额度或现金。
- `wallet_ledger.amountCents` 仅表示实际钱包变动；订阅全额覆盖的消费流水为 0。`meta.billedCents` 表示零售用量、`meta.subscriptionCents` 表示订阅覆盖、`meta.walletCents` 表示钱包部分。订阅明细独立保存于 `subscription_usage`，绝不发放为可退现的 topup/reward。钱包浏览器接口也返回每笔 `subscriptionCents/billedCents`。
- 有效 `pro` 权益动态包含 `plan.pro, clipboard.unlimited, stage.unlimited, cloud.storage.3gb`；期限随 Pro 到期，用户另购的永久权益优先。`cloudStorageBytes=3*1024^3` 只在有效已付周期返回；`relayBytes=200*1024^2` 是临时占用上限，不是月流量或持久存储。
- 已付 `pro_payment` 行在首次读或消费时幂等补周期；新付款在结算事务内补周期。按 `outTradeNo+cycle` 唯一，预续费不能提前花下一周期额度。

AI 继续桌面直连 OpenRouter：官网按可用额度设置子 key 累计 limit，并通过请求/定时对账回抄用量。它不是逐请求代理，异步对账、上游延迟以及周/周期跨界存在归属延迟；不能宣传为逐 token 实时硬限。下调上限失败不能报告成功，同一用户同步串行避免重叠读重复扣费。生产仍须保持现有 reconcile 定时任务；长期离线持有的子 key 依赖上游已设置的累计限额，并不会在本机时间到点自动失效。本轮没有新增支付退款接口；这里的原路退款指失败服务/预扣退款，不代表 Pro 整单退费已经上线。

## 周期订阅与钱包（2026-10-11，dev-board#1187）

账户 me、wallet、ai-usage 新增 `subscription` 对象；字段见 DEPLOY.md「149 元 Pro 的周期额度与分账」。余额保持现金/奖励钱包意义，订阅额度独立、不退款成现金、不结转。ai-usage.creditsCents 为当前可调用AI额度，walletBalanceCents为钱包余额。超额钱包消费必须由用户显式开启。

`listEntitlements` 按活跃Pro派生 `plan.pro`、`clipboard.unlimited`、`stage.unlimited`、`cloud.storage.3gb`，每项带 expiresAt。桌面缓存必须保留并在离线时仍执行到期时间，永久购买的同名权益优先。不能只缓存feature字符串让订阅到期后多享30天离线宽限。

结算资金来源在调用授权时固定：网关同步调用/转写预扣保存 `periodId/weekStart/walletAllowed`，完成时沿原周期原周结算；AI key 用 `fundingJson` 保存上次授权来源，先回抄旧段用量再更新当前授权。跨到期不得把旧订阅调用改扣现金。上游仅提供累计用量，切换上限瞬间仍在途或延迟上报的请求无法逐笔定时归属，仍属上述直连机制的已知限制。

到期后已开启的钱包续用仍可撤销：平台 AI 按订阅历史及当前偏好确定现金授权，不能以旧 key 的授权状态覆盖用户新选择。`POST /api/account/ai-key` 对已有 key 也等待限额同步，失败返回 502、服务未配置返回 503、当前无可用额度返回 409 `no_credits`；不先返回旧限额。已缓存在客户端的 key 仍受上述直连机制边界约束。

## 官网账户页订阅入口（2026-10-15，dev-board#1298）

桌面端原有 `/{lang}/account` 链接落地后，在个人资料下方显示「个人 Pro 订阅」区（锚点 `#subscription`）。状态来自未过期的 `pro` entitlement；国内站复用定价页 `ProCheckout` 的一次性月付微信流程，开关仍由服务端 `PRO_PURCHASE_ENABLED` 控制。国际站明确提示未开放购买，不能将账户页上的订阅动作再次链接回自身。充值余额与订阅保持分开。回归：`npx tsx --tsconfig tsconfig.json scripts/verify-account-subscription.mts`；实际页面还须验证登录后入口 → 月付方案弹窗，不以组件渲染代替点击验收。

### 百炼可用模型门禁（dev-board#1667）

国内目录取工作空间推理授权与实测可用快照的交集。部署必须提供 BAILIAN_AVAILABLE_MODELS_FILE，格式为 {workspaceId, models, checkedAt, constraints?}；缺失或工作空间不符时拒绝展示。constraints 按模型 ID 记录实测的 {thinking:true, temperature?:1}，在预留计费前规范化请求，计价仍使用原模型，禁止把第三方直供 ID 静默替换为阿里托管 ID。新增模型须先验证普通/流式请求、支持的工具调用及用量回执，再原子更新快照；授权同步不能替代核验。图像模型单独验证。

上游未开通、权限、限流、参数及服务异常返回安全的对应文案；HTTP 200 内错误也分类。流内失败的用量仍保留待核对。

### 国内精简模型名单（#1667，2026-11-03）

用户要求仅保留五个系列的最新主力，DeepSeek分Pro/Flash两档。聊天候选固定为 qwen3.8-max、deepseek-v4-pro-0813、deepseek-v4.1-flash-1017、kimi/kimi-k3.1-pro、glm-5.3、MiniMax/MiniMax-M3.1-Flash，默认Qwen Max。仍与授权、实测可用、价格和能力目录取交集；未验证或供应商停用则隐藏，不用旧版本补位。新版本必须审阅名单、实际调用和用量回执后才纳入，不能按字符串排序自动选latest。百炼未提供DeepSeek V4.1 Pro，不得给V4 Pro贴4.1标签。此限制仅国内聊天模型；图片/语音专属功能及国际站保持原契约。本次仅合并，不部署。
