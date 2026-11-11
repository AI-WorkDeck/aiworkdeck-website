# OpenRouter 账号轮换运行手册

适用场景：当前 OpenRouter 账号被上游（Anthropic / Google / OpenAI）以 ToS 为由封禁（403），需要把所有用户迁到新账号铸造的子 key，且不丢用量、不重复扣费。

## 原理

- 用户钱包的扣费完全来自各 key 的远端 `usage`（`settleUsage` 回抄）。轮换不碰这条口径，只保证「旧 key 的最后一分钱用量先结算、再禁用」。
- 每个 `openrouter_keys` 行带 `mgmtAccount`（management key 的 sha256 前 12 位，只存指纹，不存 key）。读取、改限额、禁用某个 key 时自动使用铸造它的账号的 management key。
- 迁移 50 会给存量行回填指纹：配了 `OPENROUTER_PROVISIONING_KEY_RETIRED` 则记为旧账号，否则记为当前账号。回填前就是 NULL 的行，在配了旧 key 时一律按旧账号处理。
- 轮换对每把旧账号的活跃 key：结算 -> 禁用 -> 读禁用后的最终用量再结算 -> 标记退役（`disabledAt`）并写入 `openrouter_rotated_key`。不主动铸新 key。
- 用户下一次 `syncAiQuota`（打开账户页 / 桌面端轮询 / 每小时对账）发现没有有效 key，会在新账号下铸造，limit = 折算（钱包余额），而余额已被上面的结算扣过，因此新 limit = 剩余，不会重复发放。
- 对账循环（`/api/admin/ai/reconcile`）继续用旧账号 key 回读退役 key，把迟到用量结算进钱包；超过 7 天宽限期，或用量连续 24 小时不变，或远端 404，即收口。
- 已知边界：新 key 铸造后到迟到用量被回读之间，用户可能多花一点；钱包不够扣时只扣到 0 并写 `admin_audit: ai_usage_shortfall`，由平台承担，口径与既有逻辑一致。
- 后付费用户（`postpaid_external_budget` 有记录）不在本流程范围，会被标为 `skipped_postpaid`，需人工处理（后付费目前开关全关）。

## 步骤

1. 环境变量（`.env` / 进程管理器）：
   - `OPENROUTER_PROVISIONING_KEY` = 新账号的 management key
   - `OPENROUTER_PROVISIONING_KEY_RETIRED` = 旧账号的 management key
2. 部署含迁移 50 的版本并重启（迁移自动回填指纹）。重启后新用户立即在新账号下铸 key，旧 key 仍由旧账号读取，不会 404。
3. 先 dry-run（只读，不写库、不发任何写请求，输出每个会被处理的用户和当前远端用量）：
   `npx tsx --tsconfig tsconfig.json scripts/openrouter-rotate.mts`
   也可调 `POST /api/admin/ai/rotate`（默认 dry-run，管理员 cookie）。确认列表与预期一致（目前 5 个用户 / 5 个活跃 key）。
4. 正式执行（幂等，可重复跑）：
   `npx tsx --tsconfig tsconfig.json scripts/openrouter-rotate.mts --apply`
   或 `POST /api/admin/ai/rotate` body `{"dryRun": false}`。任何一项 `failed` 时退出码为 1，修好原因后直接重跑即可。
5. 验证：
   - 让一个测试用户打开账户页或触发 `POST /api/account/ai-key`，确认铸出新 key（OpenRouter 新账号后台可见 `awd-user-<id>`），并实际调用一次 Claude 成功。
   - 管理后台「AI」页的 OpenRouter 账号行：有效 key 应全部是 current，「待回读的退役 key」等于被轮换的数量，并在宽限期后归零。
   - 对账 cron 照常每小时跑；退役 key 的迟到用量会自动结算。
6. 宽限期（7 天）后「待回读」为 0，再从环境中移除 `OPENROUTER_PROVISIONING_KEY_RETIRED`。在此之前不要移除，否则读不到旧 key 的用量。

## 排错

- `retired_key_missing`：未配置 `OPENROUTER_PROVISIONING_KEY_RETIRED`，轮换拒绝执行，不改任何数据。
- `same_account`：两个 key 是同一账号。
- 日志 / 错误信息里只会出现账号指纹，不会出现 key 材料。
