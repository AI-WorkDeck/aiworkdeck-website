<!-- SPDX-FileCopyrightText: 2026 北京京微资易科技有限公司 and AI WorkDeck contributors -->
<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->

# 开发者申请与投稿凭据

开发者中心：`/{lang}/plugins/developer`。使用现有网站账号登录，保存自行声明的个人/组织信息、私有联系渠道、已开发作品或学习经历、计划功能和权限理由，再提交资格申请。初期申请免费；这不改变插件原有定价，也没有新增自动收费。

身份是申请人自行声明，不代表实名或 KYC。联系渠道若与已验证账号邮箱/已绑定手机号一致，可沿用账号验证；其他渠道由管理员实际联系后明确勾选确认。管理员界面不发送验证码、邮件或消息。开发者资格和每个插件的安全审核、签名相互独立。

## 状态与所有权

`draft → pending → approved/rejected`。申请人修改资料会回到 `draft`，需要重新提交；管理员可将 `approved` 暂停为 `suspended`，只能经管理员复核恢复。暂停用户保存资料仍为暂停，不能自行重新申请绕过限制。每次保存、申请与审核记录版本、操作者和资料快照。当前管理员采用既有共享管理员凭据，因此只能记录 `admin`，不能声称可以区分每位管理员。

每个写操作携带 `expectedVersion`；资料发生变化返回 `409 version_conflict`。历史记录和私有联系只在本人及管理员接口返回。账号注销同步删除资料、私有审核快照及全部投稿令牌；已发布插件保留原有 `authorId` 墓碑关联。

作品以真实投稿账号 `authorId` 关联，包内 `author` 不能用来认领其他作者作品。存量作者可继续用 Cookie 查询旧提交；已有上架版本不会自动下架。新投稿/更新和新审批都要求当前资格为 `approved`，包内实际权限不得超出已审核申请范围。修改资料、暂停资格不会替代管理员原有插件封禁动作。

## API

所有开发者设置接口仅接受网站登录 Cookie，不接受投稿 Bearer。私有响应 `Cache-Control: no-store`。设置写请求必须有 JSON Content-Type 与完整 Origin，Origin 必须是本站固定 HTTPS 地址（或实际同 Host 的本机回环测试地址），并与代理保留的 Host 一致；不采用客户端提供的 X-Forwarded-Host 授权。

| 入口 | 请求 | 结果 |
| --- | --- | --- |
| `GET /api/developers` | Cookie | `profile, history, tokens, plugins`；令牌仅元信息，无原文/哈希 |
| `PUT /api/developers` | `{profile,expectedVersion}` | `{profile}`；首次版本为 `0` |
| `POST /api/developers/apply` | `{expectedVersion}` | `{profile}` |
| `POST /api/developers/token` | `{label,expiresInDays}` | 一次性 `{token,id,label,createdAt,expiresAt,scope}` |
| `DELETE /api/developers/token` | `{id}` | `{ok:true}`，仅本人可撤销 |
| `GET /api/admin/developers` | 既有管理员 Cookie | `{developers}`，含联系资料、历史、实际插件权限 |
| `POST /api/admin/developers` | `{userId,expectedVersion,action,note,contactChecked}` | `{profile}` |

`profile` 字段：`kind` (`individual/organization`)、`displayName`、`organization`（个人可空）、`contactType` (`email/phone/other`)、`contact`、`experience`、`plan`、`permissions`。管理员 `action` 为 `approve/reject/suspend`；驳回及暂停需 `note`。不在已验证账号渠道内的联系必须显式 `contactChecked:true` 才可通过。

投稿令牌为密码学随机 256 位，只持久化 SHA256，默认 30 天，允许 1–90 天，最多 10 个同时有效令牌。元信息有到期、最后使用、撤销时间。只在 `/api/plugins` 的 GET/POST 解析 Bearer，分别查询本人提交和提交新版本。令牌不能操作账户资料、支付、管理员审核或再次签发令牌。撤销、到期、资格失效、账号注销即时阻止后续请求；等待上传体时会再次检查，不能用先通过的授权继续落盘。

显式 `Authorization` 存在但格式/令牌无效时返回 `401 invalid_plugin_token`，不会回退 Cookie。未登录为 `401 unauthorized`，资格未通过为 `403 developer_approval_required`，包权限超过申请为 `403 developer_permissions_required`。成功投稿维持 `{plugin:{id,version,status,scan}}`，`status` 为 `pending`，仍等人工安全审核与签名。

## 交给 Agent

先在网站亲自完成资格申请、获得通过并生成令牌，将它放入本机环境变量 `AWD_PLUGIN_TOKEN`。不要把原文粘进 Agent 提示、仓库或 ZIP。令牌失效可在开发者中心生成新的并撤销旧的。CLI 示例及 `submissions` 状态查询见官网开发指南和下载模板；远程投稿使用 HTTPS。

可给 Agent 的任务指令：

> 阅读下载模板 README、manifest schema 和 SDK 类型。按我描述的需求开发，最小化权限，不读取无关文件，不调用付费服务。先 validate，再 package，在隔离宿主验证。仅当我明确要求提交时使用本机已有 AWD_PLUGIN_TOKEN 投稿，不打印它；返回提交 ID、版本和审核状态，不能把 pending 说成已上架。遇到资格/权限错误应报告需更新的申请信息，不自动扩大权限或申请审批。

SDK 1.6 新接口以及 `$schema/default` 兼容修复需要尚未发版的新宿主；官网模板可下载不代表现有已安装客户端已支持。

## 验证边界

`npm run test:developers` 在全新临时 cwd/SQLite 中运行真实 route/store 测试；CI 执行该命令。`npm run test:plugin-platform` 检查模板真实 ZIP、CLI 和投稿校验。生产身份、实际联系验证、真实支付、真实邮件/短信、生产部署不属于本轮本地验收。
