# Unified password sign-in (dev-board #1299)

All regular clients use the existing account + password exchange. A contact OTP is required when a new or previously passwordless account creates its first password, and when a user resets their password. Existing usernames, user IDs, balances and permissions remain unchanged. Mainland contact normalization accepts spaces, punctuation and +86; the international site uses normalized email. Account lookup prioritizes an exact phone, then email, then legacy username. If a historical numeric username equals another account’s phone, the phone owner remains authoritative for that identifier; the legacy user can use their distinct verified email or phone. Users are never automatically merged.

## HTTP contract

| POST route | Input | Successful response |
| --- | --- | --- |
| `/api/auth/{sms,mail}-login/send-code` | `phone` or `email`, existing `captchaToken` | `{ok:true}` |
| `/api/auth/{sms,mail}-login/verify` or `/api/auth/exchange-key` | `phone` or `email`, `code` | `{passwordSetupRequired:true,setupToken,expiresAt,account}` |
| `/api/auth/password/setup` | `setupToken,password` | `{ok:true}` |
| `/api/auth/password/reset/send-code` | `phone` or `email`, `captchaToken` | `{ok:true}` |
| `/api/auth/password/reset` | `phone` or `email`, `code,password` | `{ok:true}` |
| `/api/auth/login` | `account,password,rememberMe` | existing user envelope and session cookie |
| `/api/auth/exchange-key` | `account,password,deviceName` | existing user/key envelope |

`expiresAt` is a Unix timestamp in milliseconds. Setup/reset return no session or key. After success, sign in with the password. Passwords retain the existing 8–72 JavaScript UTF-16 code-unit policy, including all whitespace, and are hashed using scrypt.

An ordinary OTP for an account with a password returns HTTP 409 `password_login_required`; first-contact send also rejects that account. Invalid/used/expired setup tickets return 401 `invalid_setup_token`; invalid OTPs return 401 `invalid_code`; password policy returns 400 `invalid_password`; login/reset throttling returns 429 `too_many_attempts`. CAPTCHA and delivery retain the existing regional configuration and error contracts.

Website handoffs use `/{lang}/account?flow=register` or `?flow=reset`. Only these flow names are accepted, including when a browser already has a session. Successful setup/reset explicitly invites users arriving from an app to return to that app and sign in. No credential or ticket is placed in a URL. Existing WeChat referral tags matching `^u-[a-z0-9][a-z0-9-]{2,29}$` (maximum 64 characters) pass through registration only; successful first-contact verification records the existing conversion-log fields without contact data or credentials.

## Persistence and security boundaries

Migration 39 creates `password_credential` and `password_setup_ticket`. Legacy users continue using their existing JSON scrypt hash until their first setup/reset; thereafter the SQLite hash and version are authoritative. Every users-module read overlays that credential, including profile updates and account lookup. Deletion clears both stores and the version. This avoids attempting a non-atomic password + one-time-token update across JSON and SQLite.

Setup tickets contain 32 random bytes, live ten minutes, persist only as SHA-256, and are consumed with the password write inside one `BEGIN IMMEDIATE` transaction. New challenges invalidate earlier setup tickets for the same account. Password hashing occurs before the transaction, followed by a fresh ticket/user check. OTP verification also uses an immediate transaction, including its failed-attempt counter; reset consumes its separate `password_reset` scene atomically with the new credential and key revocation. Errors are returned from the transaction before throwing so failed attempts are not rolled back.

Reset revokes existing website API keys, and the credential version invalidates existing website sessions. Login checks the hash again inside the session/key issuance transaction to prevent an in-flight old-password login from minting a fresh credential after reset. Java bridge tokens are a separate lifecycle: this change does **not** promise immediate logout of every app/device.

Unverified legacy `/api/auth/register` is closed even if delivery is unconfigured; password login remains available. Old WeChat tickets can only request setup, never mint a regular session around the password requirement.

## Existing store-review compatibility

The existing review exception remains limited to both an identity listed in `AUTH_REVIEW_ACCOUNT_IDENTITY` and the exact configured `AUTH_REVIEW_ACCOUNT_CODE`. It can still produce the original session/key, via the secondary “App store review” entry. Merely matching an identity or using an ordinary delivered OTP does not enable the exception. Setup, password reset and phone binding do not accept the fixed review code as a recovery credential. Review accounts remain demo-only and must never contain real user data. No real review account was used in development verification.

## Verification

Run in a fresh directory for **each** script/site, never against an existing workspace:

```sh
repo=/absolute/path/to/website
fixture=$(mktemp -d)
cd "$fixture"
NEXT_PUBLIC_AWD_SITE=cn "$repo/node_modules/.bin/tsx" --tsconfig "$repo/tsconfig.json" "$repo/scripts/verify-password-flow.mts"
```

Repeat for `intl`. The script uses synthetic accounts, intercepted delivery and two independent Node processes for setup replay races. It covers absence of early sessions/keys, hash-only tickets, normalization, password whitespace, OTP scene isolation, failed-attempt persistence, reset invalidation, legacy credential migration/deletion, review-only compatibility and regional CAPTCHA enforcement. CI runs the same test in its existing CN/INTL matrix. Real delivery, production data migration and already installed client releases require the coordinated rollout checks; isolated contract tests do not establish production delivery.


## CN 历史手机端邮箱账号迁移

国内站仍以手机号为首次验证身份，不开放一般邮箱注册/重置入口。旧手机端邮箱用户使用 `/zh/account?flow=register&legacyEmail=1`（忘记密码为 `flow=reset`），参数只表达迁移意图，URL 不传邮箱或凭据。国际站忽略此参数，迁移 API 返回 `400 legacy_email_not_supported`。

全流程只使用官网 cookie：先手机号验证、创建密码、官网密码登录，再进入「验证原邮箱，保留手机端原数据」。已有有效手机号+密码会话直接进入邮箱验证。完成前必须留在官网，不能先回 App 用新手机号建立 Java 账号，否则旧邮箱 ID 与新手机号 ID 会冲突，服务端应安全拒绝而非合并。成功后回 App 以**原邮箱+新密码**登录，Java 经官网 `verifiedEmail` 复用原 ID 并补手机号。官网不会调用 Java 桥，也不自动跳回 App。

- `POST /api/auth/legacy-email/send-code`：`{email,captchaToken}`，必须有有效 `awd_session`、phone 和 passwordHash；只接受 cookie，不接受 Bearer。复用站点 CAPTCHA、邮件 IP/全局发送限流、冷却/每日配额。
- `POST /api/auth/legacy-email/verify`：`{email,code}`，返回 `{ok:true}`。不新建用户、会话或 API key。OTP 用途为 `legacy_email_bind:<websiteUserId>`，同时隔离账号、邮箱、用途；验证码只存 hash、单次消费，错误次数持久化。普通登录、重置、其他用户及商店审核固定码不能旁路。
- 绑定保留 website ID、phone、密码 hash/version，写入规范化 email 和 emailVerifiedAt。邮箱已属另一活跃官网 ID（含未验证记录）返回 `409 email_conflict`；本账号已有不同已验证邮箱返回 `409 verified_email_conflict`，不自动合并或换绑。无会话 401；无手机号/密码 403。
- 用户 JSON 的同步读改写函数均使用同一 SQLite immediate 锁，防止并发 profile/avatar/create/delete 写回旧快照丢失绑定。验证码消费与绑定在锁内完成；JSON 文件与 SQLite 不是跨存储崩溃原子事务，因此进程在文件写入后、SQLite提交前异常退出时需重新验证，不能声称具有分布式事务保证。

国内邮件需 `AWD_MAIL_RESEND_KEY`、`AWD_MAIL_FROM`。2026-10-15 主任务只读核实 CN 主机 `.env.local` 两项非空；未读取或复制内容，未验证运行时加载或真实投递。部署前仍需用隔离验收账号完成真实验证码收发和旧邮箱数据复用验收。

`verify-legacy-email-migration.mts` 在独立临时目录使用合成用户/会话、种入测试验证码及内存拦截的 CAPTCHA/邮件响应，覆盖 CN/INTL 站点隔离、认证、用途、冲突、稳定身份、两进程争绑、profile/create 并发写和注销；不表示真实邮件交付已验收。
