# Security alert review — 2026-11-16

Scope: website CodeQL alerts 1–40 on baseline `138c4ca7ec58a1b6eaba88cfc47fcf43f3d34130`. No production deployment, signing-key change, entity migration, or provider request is part of this change. The source fixes require a later authorized deployment to affect production.

| Alerts | Resolution / boundary |
| --- | --- |
| 1–4 | Workflow default permissions explicitly limited to contents:read; existing job-specific artifact permissions preserved. |
| 5 | Build-artifact workflow uses `cache-mode: none`, which restricts runner cache tokens, including arbitrary cache API writes. This preserves reviewed source SHA selection without expanding token permissions. Official [workflow syntax](https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax#cache-mode). No deployment workflow triggered. |
| 6 | Replace ambiguous email regex with linear splitting/whitespace/domain checks and retain 254-character limit. Existing valid-address and authentication tests plus 100,000-character rejection pass. |
| 7 | Bypass detail-localization regexes for strings longer than 2048 characters; retain the original detail and normal short translations. Adversarial long detail regression passes. |
| 19–20 | Parse URL authority; only exact known namespace/loopback hosts are ignored. Adversarial suffix, path, query, userinfo and localhost-lookalike URLs are reported for both JVM and Web assets. |
| 21 | Live BQT script accepts only parsed HTTPS test origin with no userinfo. Seven invalid targets are rejected by the real script before creating data or making requests; the actual paid test is not run. |
| 24–36 | Explicit storage-entry ID/version/archive guards reinforce existing record lookup, manifest whitelist and root containment. Direct inspection helper misuse reproduced with a synthetic external JSON; existing HTTP route already had record validation. Not thirteen independently exploitable remote vulnerabilities. See per-flow notes below. |
| 37–40 | Fixed log message first arguments; request values passed separately. Prevents formatting directives from consuming diagnostic objects. 37–39 also have existing stored-order validation; no remote-code-execution claim. |

## Baseline triage evidence (before the fixes above)

| 告警 | 结论与证据 | 建议处置 |
|---|---|---|
| #8 `lib/api-keys.ts:36` insufficient-password-hash | 规则语义误报。被摘要的是服务器 `crypto.randomBytes(32).toString('base64url')` 生成的 256 bit Bearer key（生成点55/96附近），SHA-256作为数据库检索哈希；非人类口令。`findUserByApiKey` 等值查询且检查撤销；真正用户密码在 `lib/users.ts:109` 用带随机盐的异步 scrypt。不能因名字含 key 就换成密码KDF，否则影响token索引与兼容。 | 可 false positive，注明仅适用于当前服务器随机token生成路径，不声称所有SHA-256密码散列都安全。 |
| #9 `lib/captcha-challenge.ts:11` insufficient-password-hash | 规则将 `passwordError` 数据流误当密码。实际是随机24字节challenge id与6字符随机图形验证码答案的SHA-256；有效期3分钟，绑定账号/用途/IP，所有尝试均一次性消费，另有发码配额。答案不是账户密码。短码离线可穷举，不以随机token的256bit理由混为一谈；当前防护目标是在线机器人，数据库读泄露不在此规则所报密码场景。 | 可 false positive，处置理由写明短期一次性验证与口令哈希分离；附CN/Intl验证结果。无需在本次引入新生产pepper/密钥。 |
| #10 `lib/download-sign.ts:36` insufficient-password-hash | 语义误报：`AWD_DL_AUTH_KEY` 为CDN Type A共享签名密钥，输入是URI/时间/随机数/uid/密钥，不是存储用户密码。 | false positive；与#15分别解释，不合并成“MD5安全”。 |
| #11 `lib/gateway/asr.ts:107` insufficient-password-hash | 规则语义误报：输入为已鉴权用户ID，SHA256前16hex生成OSS对象命名空间；不是密码或Bearer凭据散列。之后 `assertObjectKeyOwnedBy` 比对所属前缀，随机UUID为对象名。命名空间哈希不是匿名化承诺。 | false positive；注明本结论只消除密码哈希误分类，不对64bit前缀做全局碰撞保证。 |
| #12 `lib/platform-ai/auth.ts:11` insufficient-password-hash | 规则语义误报：`createHmac('sha256', AWD_KEY_ENCRYPTION_SECRET)` 对包含站点与payload的消息作MAC，不是快速hash存密码。验证使用等长 `timingSafeEqual` 并实时检查父API key是否撤销、用户是否删除。 | false positive；不换KDF。 |
| #13 `scripts/verify-plugin-platform.mts:139` bad-tag-filter | 规则语义误报：从 `buildTemplateZip('web')` 生成并有SHA256指纹核对的固定host-simulator.html提取script，用 `vm` 在合成DOM里跑测试；该正则不是对不可信HTML的安全过滤器，也不接收用户上传包。匹配大写标签与否只影响模板测试失败。 | false positive，写明测试输入来源和用途；不为了消警扩展为HTML清洗器。 |
| #14 `lib/gift-codes.ts:54` biased-cryptographic-random | 数学误报：CODE_ALPHABET恰32字符，randomBytes每字节256种值，256=8×32。穷举0..255实测每个余数恰8次，取模无偏。12字符为60bit均匀熵，不是96bit。 | false positive。若改为randomInt只是可读性选择，无需宣称漏洞已修。未来字母表长度变化需重新校验。 |
| #15 `lib/download-sign.ts:36` weak-cryptographic-algorithm | MD5确属弱算法，但这里是阿里CDN固定Type A协议；host限定 `dl.aiworkdeck.com`、timestamp、随机nonce、服务端密钥。官方文档仍要求md5(URI-Timestamp-rand-uid-PrivateKey)。直接改为SHA256会让所有CDN下载鉴权失败。 | 不按false positive称MD5没问题；建议 narrow won't-fix/accepted vendor-protocol compatibility（若宿主使用code-scanning `won't fix`），记录官方协议、用途、替代协议迁移另行核实；不读取/改生产密钥。 |
| #16 `lib/gateway/adapters/qichacha.ts:76` weak-cryptographic-algorithm | MD5确实使用，但企查查官方api.qichacha.com协议要求uppercase MD5(key+Timespan+SecretKey)，当前客户端通过固定HTTPS域请求，API输入searchKey不进入密钥拼接。 | 同上，供应商固定协议窄例外，不声称代码已升级强算法；兼容迁移需上游支持。 |
| #17 `scripts/postpaid-ui-harness.mts:36` stack-trace-exposure | 开发测试脚本真实把异常字符串送给HTTP响应，但 `String(Error)` 通常仅名字/消息，并非e.stack。仅监听127.0.0.1随机端口；入口强制新空目录，合成用户/钱包/密钥，非Next生产路由。无已证实生产泄露。 | 可按测试上下文not used in production/false positive记录，或更简单加固为服务端console.error、响应固定`Internal error`；若改需保留本地调试日志。不要称生产漏洞。 |
| #18 `app/[lang]/admin/telemetry/TelemetryDashboard.tsx:224` xss-through-dom | XSS误报。`csvUrl`固定 `/api/admin/telemetry?from=...&to=...&format=csv`，`useAdminSite().url`要么原路径，要么固定 `/api/admin/sites/{cn|intl}/` 代理路径。日期仅插入查询串，无法改变协议/host/路径；React属性赋值不是innerHTML。4组恶意日期样本通过URL解析仍是同源固定路径。未做浏览器运行，这里依据源码数据流和URL解析。 | false positive。可选URLSearchParams可防query参数混入，但本条不是执行JS漏洞；不要因此改整页旧文案。 |
| #21 `scripts/live-bqt-e2e.mts:17` incomplete-url-substring-sanitization | **实际测试环境保护缺陷**。黑名单 `!base.includes('uat.bqt.com')` 对 `https://UAT.BQT.COM` 为true，而URL规范化主机仍uat.bqt.com；可误打生产，脚本说明会真实扣积分。已无网络复现。`lib/bqt-member.ts:26`已登记唯一测试主机`bqt-test.bqt.com`。 | 修为解析URL后精确允许HTTPS测试origin，拒绝userinfo、非标准端口及路径/query/hash（若确不需要）；用大小写生产、lookalike、userinfo与合法测试URL负/正例验证。不要实跑扣费脚本。 |
| #22 `scripts/verify-gateway.mts:126` incomplete-url-substring-sanitization | 测试mock路由以includes匹配bochaai.com，非产品授权/SSRF防线，但会把lookalike误当上游，导致测试可信度弱。vendorHandlers循环也使用includes。未发现由真实网络输入触发安全边界失守。 | 可false positive说明仅mock分发；更好的小改是 `new URL(url).hostname` 精确等于已登记host，同时处理相关循环并检查未mock出站策略。不要扩大网络调用。 |
| #23 `scripts/verify-web-plugins.mts:217` incomplete-url-substring-sanitization | 测试断言过滤scan.findings，固定fixture里检验w3命名空间没有入报告，不是安全放行逻辑。真正URL跳过规则位于lib/plugin-scan.ts #19/20，由主任务修。 | 可false positive；也可改为针对固定namespace fixture精确比对，与真正规则的恶意host/路径负例一起加强。 |
| #24 `app/api/admin/packs/[id]/route.ts:110` path-injection | 存在，主任务路径代理最初写25–36漏此项。已通知主任务纳入路径代理范围；本报告不作重复裁决。 | 与#25同流程数据流一起处理。 |
| #37 payment/query:137 | 插值字符串作为console.error首参并跟对象，格式串模式成立。但在此分支前 `getOrder(outTradeNo)` 精确查库，正常订单号由 `generateOrderNo(kind.toUpperCase())`（受控kind）生成字母数字，不含%。尚未证实正常HTTP能让任意格式符进入此分支。 | 固定首参+`%s`传值是最小防御加固，避免未来调用扩大输入；不要称已证明公网RCE。 |
| #38 internal/account:799 | 同#37；受鉴权及本人订单检查，号由generateOrderNo('RECHARGE')生成。 | 同上。 |
| #39 wx-mini/push:168 | 同#37，经过推送URL验签、订单精确查库，再回查上游结算后才能到拒绝结算日志。 | 同上；风险为日志诊断被格式符消费，不是任意代码执行。 |
| #40 wx-mini/push:182 | catch内首参直接插入外部OutTradeNo，后跟Error；即便查无订单之前DB异常也可进入，所以不能完全依赖订单字符集。仍要求已通过推送签名。 | 固定格式字符串、OutTradeNo作为参数，保留Error对象。合成 `util.format` 实测 `%j` 消费诊断对象，固定`%s`保留字面输入和对象。 |

## 官方协议证据（2026-11-16联网核验）

- 阿里云CDN Type A： https://help.aliyun.com/zh/cdn/user-guide/type-a-signing 。要求MD5拼接URI、timestamp、rand、uid、PrivateKey；有效期由CDN配置。本轮未读取实际CDN配置，所以代码注释中3600秒仅为项目记载，不能当成本轮现网实测。
- 企查查官方接口： https://openapi.qcc.com/dataApi/856 ，同`api.qichacha.com`主机，Token字段要求32位大写MD5(key+Timespan+SecretKey)。 https://openapi.qcc.com/services/after/faq 亦明确现行MD5验证与时间戳窗口。并非依赖第三方博客推断。


## Storage data-flow evidence

| Alert | Sink (original line) | Actual data flow and disposition |
| --- | --- | --- |
| 24 | admin packs GET fs.statSync (110) | admin authentication -> packArchivePath -> exact stored pack version and archive whitelist -> isInside. No demonstrated remote traversal. Reinforced by explicit input guards in packArchivePath. |
| 25 | admin packs GET fs.createReadStream (111) | Same validated return value and boundary as #24. No demonstrated remote traversal; same guard covers it. |
| 26 | readPackInspection existsSync (252) | HTTP route performs admin and getPack lookup first; function alone previously accepted traversal. New ID/version guard prevents direct function misuse. Baseline regression reproduced. |
| 27 | readPackInspection readFileSync (254) | Same as #26; synthetic external .inspection.json was readable directly before guard and rejected after. |
| 28 | packArchivePath existsSync (265) | exact entry and declared archive + isInside already protect accepted data. Explicit ID/version/archive guard added. |
| 29 | receiveUpload createWriteStream (506) | live draft token + owner + declared-file equality + isInside(temp/final). ID/version originated in validateManifestDraft; archive originated in validated components. Explicit filename guard added at upload boundary. |
| 30 | receiveUpload oversized rmSync (514) | Same guarded temporary path as #29; oversized test verifies partial file cleanup. |
| 31 | receiveUpload exception rmSync (523) | Same guarded temporary path as #29. No different path source; catch branch not separately fault-injected in this run. |
| 32 | receiveUpload short-body rmSync (528) | Same guarded temporary path as #29; short-body test verifies size_mismatch. |
| 33 | receiveUpload renameSync source (533) | Temporary path shares #29 guard. Successful real upload and hash verification exercised. |
| 34 | receiveUpload renameSync destination (533) | Final path shares #29 guard. Successful real upload and manifest registration exercised. |
| 35 | readPluginFile existsSync (462) | exact stored version + own-property file whitelist + isInside; accepted package rejects traversal/symlinks during submission. Explicit ID/version/entry validation added at read boundary. |
| 36 | readPluginFile readFileSync (463) | Same guarded path as #35. Real accepted nested file readable; ten invalid/undeclared inputs return undefined. |

These are not thirteen independently exploitable vulnerabilities. Whether CodeQL recognizes the new guards must be confirmed by remote analysis. If alerts remain, use this per-flow evidence rather than broad suppression. Symlink replacement by a local filesystem writer and concurrent directory mutation are not tested; the public submission process rejects symlink entries. No claim of defense against a hostile local filesystem operator.


## Validation and remaining boundaries

Clean npm ci, npm run check (including all locale checks), isolated package/plugin/mail/payment/captcha regressions, and candidate CI are required. The local tests use synthetic data and temporary working directories. Remote scan status and final merge SHA are recorded in dev-board #1732 / #1752 / #1755 / #1756 / #1757. This review does not claim production has changed or guarantee resistance to a hostile local filesystem writer.

Vendor MD5 protocols (#15/#16) remain compatibility exceptions, not an assertion that MD5 is strong. Revisit if either provider supports a compatible stronger protocol; do not unilaterally change signatures or production credentials. Captcha (#9) is a short-lived one-use challenge, not a stored account password; database compromise is outside that narrow finding disposition.
