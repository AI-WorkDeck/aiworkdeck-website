<!-- SPDX-FileCopyrightText: 2026 北京京微资易科技有限公司 and AI WorkDeck contributors -->
<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->

# Web 工作台构建与发布

此流程发布同域 `/web/` IDE、LOWA 和 `/api/web/*`，复用现有官网 Next/PM2 与 Actions `DEPLOY_SSH_KEY`，无需新 DNS、本机 SSH、Java、Maven、Electron 或完整 H5 构建。合并不等于部署。当前实现准备好后，仍须总调度完成 G3/G4 验收再手动发布；本文和 CI 不触发真实 AI 调用。

## 构建输入与产物

在仓库根目录使用 Node 22.23.2（与既有北京 PM2 版本一致；[官方发行摘要](https://nodejs.org/dist/v22.23.2/SHASUMS256.txt)已核实可用）：

```sh
npm ci
npm ci --prefix web-workbench
npm run prepare:assets --prefix web-workbench
npm test --prefix web-workbench
node --test scripts/web-artifact.test.mjs
npm run build:web
node scripts/web-artifact.mjs pack
node scripts/web-artifact.mjs verify public/web "$(git rev-parse HEAD)"
npm run build
```

`build:web` 只构建独立工作台和 vendored 编辑器。根 `build` 仍只构建 Next；`prebuild` 只执行 `web-assert-release.mjs` 门禁，未设置 `AWD_WEB_RELEASE_SHA` 时无操作。不得在 `prebuild` 将线上 `public/web` 边删边重建。`web-workbench/source-manifest.json` 固定来源版本及源码哈希，`asset-manifest.json` 固定引擎、字体、大小和 SHA-256。下载的压缩 wasm/data 保持原字节。任何不匹配均失败；不得降级到 `latest`、外域运行时引擎或忽略校验。离线输入可用 `AWD_EDITOR_ASSETS_DIR`，仍执行同样校验。

CI 用 `release-manifest.json` 记录提交、Node 版本、引擎版本及每个文件的 SHA-256；再打包 `web-workbench.tar.gz` 并生成整体摘要。Actions artifact 名为 `web-workbench-<commit>`，保留 30 天。其定位是本次发布的传输与审查凭证，不承诺永久下载地址。源码及锁文件保留在 Git；已发布完整目录保留在服务器 `.web-releases/<commit>-<archive hash prefix>/`。保留 `LICENSE`、`UPSTREAM.md`、来源清单与依赖版权告示，不将客户文件、账号状态或供应商密钥打进产物。

## 必须验收的运行条件

- `public/web` 在服务器首次安装前应不存在；后续由安装器管理为符号链接。已有普通目录会拒绝覆盖，先按维护流程备份与迁移，不能 `rm -rf` 掩盖冲突。
- `/web/` 及编辑器保持同域，`COOP: same-origin`、`COEP: require-corp` 和允许本地 WASM/worker 的路径级 CSP 生效。勿修改全站隔离策略。
- manifest 标注 `br` 的 `soffice.wasm`/`soffice.data` 必须响应 `Content-Encoding: br`；wasm 类型为 `application/wasm`。不要再次压缩这些字节。此版本不把带固定路径的 wasm/data 标作永久缓存。
- `/web/` 不得被 locale 或国际站 geo 规则转到其他域。`/api/web/*` 应沿用现有 `/api` 无缓存、不缓冲 SSE 代理与足够读取超时。CN、国际、美国 Host 分别验证；不复制跨 Host Cookie。
- 新 Web AI 默认关闭，验收后才设置 `WEB_AI_ENABLED=1` 并更新 PM2 环境；保持现有服务器 `OPENROUTER_API_KEY` 配置，密钥只在服务端。固定模型 `qwen/qwen3-235b-a22b-2507`，最多 2048 输出 tokens，供应商价格上限为输入 $1/M、输出 $2/M，最终以 API 实现的校验为准。不接受浏览器覆盖模型/费用/账号。
- AI 资格、预留和结算必须通过 `verify-web-ai` 在 cn/intl 的隔离数据库测试。开发验证总预算人民币 100 元不代表产品免费额度；不修改 Skill AI 的既有补贴规则。无资格、缺少配置、未启用和未确认的用量都不能显示成功或假零费用。
- 首次发布前完成有正常登录与合法额度的合成账号真实 AI 验收。禁止读取 Cookie/token 代替登录或开启生产 review-account 验证绕过。

## 发布顺序

1. 审阅 PR、所有相关 CI、真实浏览器编辑/导出/刷新、AI 请求及账目证据。合并后只从 `master` 手动执行现有「CI 与手动部署」workflow，目标默认 `both`。PR/push 仅检查并上传产物，不部署。
2. 本次 run 构建一次 Web 产物；部署 job 下载、验证整体摘要，通过已固定主机公钥的现有 SSH key 上传。没有新增凭据或发布服务。
3. 在任何新 Next 构建和重启之前，先以 `git pull --ff-only` 准备 checkout 并断言 HEAD 等于本次 commit；安装器校验每个文件和固定资产，再保留上一版 `assets/`、`editor/assets/` 的哈希文件，将完整目录移入 `.web-releases/`，通过 rename 原子切换 `public/web` 链接并记录 `.web-previous`。重试同一已安装产物不会覆盖回滚指针。安装失败不会进入新官网构建/重启，因此不会先公开新 CTA 再补编辑器。
4. 在 Web 已就绪后才运行原有 Next 构建换入与服务器特有依赖流程。远端导出 `AWD_WEB_RELEASE_SHA`，npm prebuild 门禁确保 checkout、产物提交和审核提交一致。国际站 opaque 脚本即使再次 pull 遇到 master 前进，也会在 Next 构建/重启之前失败。国内站重启前 unset 该变量；国际脚本完成后再以空值更新 PM2，避免运行时残留旧发布 SHA。新 API 必须兼容仍打开的协议 v1 客户端。
5. 原有首页/registry/数据库健康检查之后，校验三个 Host 的 `/web/`、editor HTML、实际发布提交、隔离头和引擎 MIME/encoding。健康检查不自动调用收费 AI。仍须浏览器实际验收 `crossOriginIsolated`、手动编辑、保存、导出，以及经批准的受控 AI 路径。

安装失败会保留旧链接。PM2 重启或线上健康检查失败时，workflow 失败并沿用既有告警行为，不自动假报已发布或无限重试收费操作。新静态资源安装至 Next 重启之间，旧进程仍保留旧文件扫描结果；已加载页面引用的旧哈希资源已保留。首次安装时旧官网尚无新 CTA，新官网首次重启之前产物和同提交门禁均已通过。后续 Web 升级时，若用户在这段构建窗口刷新 `/web/`，新 HTML 引用的新哈希可能暂时 404；若构建失败应回滚 Web 链接。要消除此后续升级窗口，需要把激活移至 Next postbuild/PM2 前，或另行部署 Nginx 静态 alias，不能仅凭文件原子切换宣称全程无中断。PM2 重启窗口也沿用官网既有可用性限制。

## 回滚与保留

在经过批准的 Actions 维护操作中执行回滚，不依赖开发者本机 SSH。官网 Next 按 `scripts/deploy-build-swap.sh` 保留的 `.next-old` 回滚；Web 原子指回 `.web-previous` 对应目录，然后重启该站 PM2：

```sh
# 已进入正确站点根目录；确认 .web-previous 指向预期上一版后运行。
test -d .web-previous
node --input-type=module -e 'import fs from "node:fs/promises"; import path from "node:path"; const target=await fs.realpath(".web-previous"); const temp="public/.web-rollback-"+process.pid; await fs.symlink(path.relative(path.resolve("public"),target),temp); await fs.rename(temp,"public/web");'
# 按原有流程恢复 .next-old，再 pm2 restart <该站进程> --update-env。
```

只回滚 Web 时 API 必须继续兼容 v1。账本/数据库不随静态或 Next 回滚而回退，未结算请求保留对账记录。首次安装没有上一版 Web，不能宣称可回滚到不存在的编辑器。

当前固定路径编辑器依赖要求新旧 `asset-manifest.json` 完全一致；引擎/字体变化会拒绝安装，需另行改为版本化 editor URL 并重新验证，防止旧会话混用不兼容引擎。应用代码哈希资源逐版保留，不自动清理。后续容量维护应保留当前、上一版和仍可能被打开页面引用的资源；删除历史目录必须另行审查，不在本 MVP 发布脚本中隐式执行。

## 独立的真实 AI 验证（当前未执行，预留人民币 2 元）

`.github/workflows/web-ai-validation.yml` 与发布 workflow 独立，只能由主调度在预算分配和源代码审阅完成后，从 `master` 人工 `workflow_dispatch`。填写 `reviewed_sha` 为待验证 PR 的完整 40 位提交 SHA，`budget_confirmation` 为 `APPROVE_MAX_0.12_USD`，以及不含敏感信息的 `budget_reference`。没有 push、PR、定时或上游工作流触发器；同一 run 的重跑被拒绝，失败后不得未经对账重新发起付费调用。主调度已预留人民币 2 元用于该验证；预留不等于执行授权。提交此 workflow 不代表批准执行，仍须主调度明确人工触发。

固定在北京服务器新建 `/tmp/awd-web-ai-<run id>/`，上传该 SHA 的 `git archive` 并核对摘要，在临时 source 下安装锁定依赖。服务器 Node 必须为已部署的 22.23.2。安装过程不继承生产应用环境；只在临时进程中，将固定 `AWD_SMOKE_CONFIG_FILE` 路径交给已审阅的 smoke 脚本，只读现有 `data/ai-config.json` 的 API key 字段。密钥不经 runner、不作为参数/产物下载、不打印。若配置只存在于 PM2 环境且 JSON 文件没有 key，则明确失败，不读取 PM2 环境来绕过。

先执行 `scripts/web-ai-live-smoke.mts --dry-run` 并断言计划，再允许脚本在隔离 temp cwd 中创建合成用户、session、钱包及 SQLite 数据库，运行 `chat` 和 `rewrite` 各一次。固定模型 `qwen/qwen3-235b-a22b-2507`，每次 provider 上限 $0.056192，两次总上限 $0.112384；人工预算授权向上取整为 $0.12。无论退出码是否为零，只输出白名单 receipt：审核 SHA、模型、`callCount`、逐次安全 `requestId`/`generationId`、状态、已知费用及合成账本计费结果。失败也保留已知调用记录；缺失值为 null，不能报假零。安装/执行原始日志均不上传、不在失败时 dump；未知结果标为 `failed_or_unconfirmed`，总费用未知，应先保留人民币 2 元预算直到供应商账目确认。

安全回执通过 `AWD_SMOKE_RECEIPT_FILE` 直接写到独立的 `/tmp/awd-web-ai-receipts/<run id>.json`，目录权限 0700、文件权限 0600；每次调用前后及信号收尾都写入脚本白名单，不依赖 SSH 成功返回后才复制。工作流结束时再按白名单校验并保存标准回执；读取失败才从临时 stdout 尝试解析受支持 receipt，绝不 raw dump。SSH 意外断线或中止时，独立回执不随临时执行目录清除，可能只含最近确认的状态，仍应按未知费用对账。主调度完成供应商费用核对和记账后，通过受审 Actions 维护操作读取白名单/清理该确切回执；不得直接输出整个文件或原始日志。

脚本自身清理合成数据；远端 shell trap 和 Actions `always()` 只清理执行临时树，不删除独立安全回执，`TMPDIR` 也限定在执行树内。断网/服务器异常导致清理无法完成时，清理 step 应失败，主调度通过既有受审 Actions 维护通道补清该确切路径；不要把未验证清理标成成功。整个流程不修改生产 checkout、用户、账本或配置，不重启 PM2、不启用公开 Web AI，也不创建外部登录或鉴权旁路。真实验证必须审阅所选 SHA 的 smoke 脚本及调用链，不能把任意未审源码交给持有服务器权限的运行环境。


## 手动部署的 Web AI 开关

部署 workflow 的 `web_ai` 输入可选 `preserve`（默认）、`enable`、`disable`，对选中的每台服务器分别生效。服务器核对 checkout SHA 后、构建和重启前运行 `node scripts/web-ai-flag.mjs ACTION RUN_ID`。只有 `.env.local` 的 `WEB_AI_ENABLED` 被改为 `1` 或 `0`；其他配置字节、文件权限和所有者保留，原子替换。`preserve` 不读取或写入配置。

`enable` 在服务器进程内只读检查已有 OpenRouter key（生产 dotenv 优先级、进程环境或 `data/ai-config.json`），缺少或未解析的引用即硬失败；不生成、复制、输出或导出密钥，也不打印整份环境。更高优先级的进程或 `.env.production.local` 开关与目标冲突时拒绝修改。已有 PM2 进程的独立环境覆盖仍需部署操作者核对；本脚本不读写 PM2 环境。部署后必须以已登录专用账号的 capabilities 验证实际启用状态。

仅原值 `0`、`1` 或未设置会写入 `.web-releases/web-ai-flags/RUN_ID.json`（0600），不保存完整环境或密钥。部署中途失败不会自动重启旧版本；需要恢复本次单项修改时，在同一 checkout 执行 `node scripts/web-ai-flag.mjs restore RUN_ID`，再走现有受控重启流程。恢复只改开关，保留后来其他配置编辑；开关已被其他操作改动则拒绝覆盖。回执须保留至部署验收或回滚完成。两站不是分布式事务，一站失败时由操作者根据各站回执分别恢复。


## 北京 Nginx 的 Web 专用 include

北京现有 vhost 的 JS/CSS 正则 location 会截获 `/web/` 资源而不转发 Next。`doc/nginx-web-workbench.locations.conf` 仅供总调度审阅后手动加载进 **www.aiworkdeck.com 的现有 `server {}` 上下文**。基础设施只读检查确认：`/www/server/panel/vhost/nginx/www.aiworkdeck.com.conf` 第 12 行已加载 `/www/server/panel/vhost/nginx/extension/www.aiworkdeck.com/*.conf`，第 241 行是截获 JS/CSS 的正则。因此本次唯一新增文件目标为 `/www/server/panel/vhost/nginx/extension/www.aiworkdeck.com/awd-web.conf`，无需修改主 vhost；部署前确认该目标尚不存在。不要把 location 文件放进全局 `http {}`，或覆盖整个 vhost。本仓库 CI 不修改 Nginx。国际站现有代理已经覆盖资源，无需同步套用北京修复。新加坡的中国站海外反代另一个 `www.aiworkdeck.com.conf` 已将 `location /` 转发 `https://8.152.169.44` 并保留 Host/XFF；已检查的显式缓存仅涉及 `/_next/static`、`/_next/image`，全局缓存继承尚待基础设施核实，不据此声称全链路无缓存。国际站 PM2 dump 中 Web AI 开关未设置（基础设施只读报告），最终仍以部署后的实际 capabilities 为准。

文件只含 `location ^~ /web/` 和 `location = /web`，都以无 URI 后缀的 `proxy_pass http://127.0.0.1:3000` 保留完整路径和查询串。精确 `/web` 不能省略：[Nginx 的 slash-ending proxy location 会自动将无斜杠入口 301 到有斜杠入口](https://nginx.org/en/docs/http/ngx_http_core_module.html#location)，而 Next 会把 `/web/` 308 到 `/web`，只加前缀块会构成循环。`^~` 避免静态正则截获子路径；不增加 `/api`、`/_next`、ACME 或其他路径的规则。

Host、客户端地址链及原始 scheme 传给 Next。代理缓存与二次 gzip 关闭；保留客户端 Accept-Encoding 和 Next 的 `Content-Encoding: br`、MIME、缓存、COOP/COEP/CORP/CSP 响应头，不按扩展名重新设置 wasm MIME，也不对已压缩 wasm/data 再压缩或解码。加载前核对所在 server 没有额外 `add_header`/内容过滤器与 Next 的路径级 CSP 或预压缩字节冲突；本 include 不重写全站安全头。`proxy_pass_header` 允许上游这些头通过，但不会消除父级额外添加的重复头。

受控操作顺序：

1. 确认新 include 的确切目标路径没有旧文件，记录本次文件 SHA-256；只放入此文件（若已有专属 glob，无需修改 vhost；若无，由总调度审阅并仅添加对应一行 include）。
2. 用服务器现有 Nginx 二进制和配置参数运行 `nginx -t`。失败则移除本次新增文件/引用，不执行 reload。这里要求目标机器实测；开发机没有 Nginx，未声称语法已由 Nginx 验证。
3. 检查通过后只运行现有 Nginx 的 `nginx -s reload`，不 stop/restart，不改证书或 certbot hooks。等待 3 秒，再核对进程与源站。
4. 用 `scripts/web-healthcheck.sh www.aiworkdeck.com 8.152.169.44 RELEASE_SHA` 验证 `/web/` 最终 200、隔离头和 wasm/br MIME；额外请求产物中真实 JS/CSS 哈希 URL，确认 200 且类型正确。检查 `/web` 不再跳回 `/web/`；浏览器从官网 CTA 打开真实 LOWA。需要比对压缩字节时，curl 保留 Content-Encoding 原字节（不要加 `--compressed`），与发布 manifest 中 SHA-256 核对。同时复核既有 `/api` 无重定向行为。
5. 回滚只移除本次新增 include 文件（及本次新增的单行引用，如果有）；重新 `nginx -t`，通过后 `nginx -s reload`，等待 3 秒并验证原路由。不要覆盖 vhost、删除其他 include 或重启整个服务。

## 0.76.0 发布：固定隐藏元数据的公开副本

2026-11-03 实测：官方 Web 清单包含 `editor/lowa/.encodings.json`（50 字节），但 Next 的静态文件处理不公开该点号文件，原 URL 落入页面路由并返回 500。两区只为 `/web/editor/lowa/.encodings.json` 增加精确 Nginx `location =`，没有放开其他隐藏文件。该规则直接读取当前站点 `public/web-encoding-0760.json` 的公开副本：

- 北京：`/www/wwwroot/www.aiworkdeck.com/new/public/web-encoding-0760.json`；vhost 为 `/www/server/panel/vhost/nginx/www.aiworkdeck.com.conf`。
- 新加坡：`/www/wwwroot/workdeck.ai/app/public/web-encoding-0760.json`；vhost 为 `/www/server/panel/vhost/nginx/workdeck.ai.conf`，规则位于国际站 server，不能套进另一域名的 server。

副本绑定本次构建源码 `3feab22a335a4690821b561a99d3f12a369ca408`，`release-manifest.json` SHA-256 为 `948bfcc39809c77ad17d24bf4e652d7e61b5d265e4be76096ab139c55bf356ff`，元数据 SHA-256 为 `4650a8026a11119d502d223b6e94dedff33eed8e2a4785f63b0efd2f3caef16d`。复制前核对清单及源文件完整哈希，目标必须不存在或内容同 SHA；副本权限 0644。不修改 `.web-releases` 父目录的 0700 权限，更不能递归开放：该目录还可能包含私有的 `web-ai-flags` 运维回执。

精确 location 使用 `application/json`、`Cache-Control: no-cache`，保留 `next.config.ts` 中全局安全头及 `/web/editor/` 的 CSP、COOP/COEP/CORP。修改前保存原配置字节、所有者、权限及 SHA；`nginx -t` 通过后仅 reload，失败恢复原配置并重新检查、reload。**下一轮 Web 发布或回滚必须按当次官方清单刷新此副本并验证原 URL 的完整 SHA；若清单不再包含该文件，应删除此精确 alias 和已确认属于本流程的副本。不能让 0.76.0 副本长期覆盖新清单。** 不以 reload 命令成功代替公开 URL 的 200、完整文件 SHA 和安全响应头验收。

这次文档补记不改变已发布二进制；线上 Next/Web 仍绑定上述 `3feab22` 源码及对应官方 CI 制品。
