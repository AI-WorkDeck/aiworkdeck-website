# 宝塔面板 (BT Panel) 部署指南 - Next.js Website

由于本项目使用了 Next.js 的 Middleware 和 i18n 国际化功能，**必须使用 Node.js 服务运行**，不能仅作为静态 HTML 部署。

---

## 0. 合并与部署分开

**2026-10-31 / #1648：以下旧服务器构建入口暂时停用。两部署job在首步明确失败，
不读取部署凭据、不SSH；新手动Next产物工作流仅构建与验包。安全切换边界见文末
「CI预构建Next产物」；上线改走带人工审批的 `promote-next-artifact.yml`，见文末
「门控 Next 产物上线」。不能照旧接管命令重跑高内存构建。**

`.github/workflows/ci.yml` 在 PR 和 master push 时只运行检查。收到本次明确部署指示后，
再通过 `workflow_dispatch` 手动部署北京国内站、新加坡国际站或两站；转移仓库、推送或合并
代码都不等于授权部署。以下说明部署工作流的行为及失败时的手动接管方式。

部署流程：`typecheck + build` 与两站契约脚本先跑，全绿才部署；每台部署完
核对线上 `git rev-parse HEAD` 等于本次提交，再打健康检查。国际站复用服务器上已有的
`/root/deploy-intl.sh`（§9.3 那三道坑都在里面），工作流不重抄它的步骤——抄成两份必然会漂。

健康检查有意针对各自最阴的失败模式：国内站验 `/api/registry/skills` 有条目（顺带证明
`npm run seed` 真的生效了）；国际站在服务器上实际 `require("better-sqlite3")` 探一次
（§9.3 坑 3 的静默 500），并确认 `POST /api/license/verify-key` 是 200 而不是 301。

**前置条件**：仓库 Settings → Secrets and variables → Actions 里要有 `DEPLOY_SSH_KEY`
（能登两台 ECS 的私钥，即本地 `~/.ssh/id_ed25519`）。没配的话部署两个 job 失败，
CI 检查照常跑。两台的主机公钥已钉在工作流里，不需要额外 secret。

**手动触发**：Actions → 「CI 与手动部署」→ Run workflow，可选只部署 `cn` 或 `intl`。

仓库规范地址为 `AI-WorkDeck/aiworkdeck-website`，2026-11-11 起公开（旧私有仓 `aiworkdeck_website` 已归档，历史只在旧仓）；公开桌面端仓库为
`AI-WorkDeck/aiworkdeck`。仓库转移后核对部署密钥与 `DEPLOY_SSH_KEY` 的关联，并从两台
生产机分别用 `git ls-remote` 验证拉取权限。更新 origin 时保留原 SSH Host 别名
（北京 `aiworkdeck-github`、新加坡 `github-awdweb`），不要复制密钥或运行部署脚本来验权限。

**失败时怎么接管**：先看 job 日志；国际站的完整输出在服务器 `/root/deploy-intl.log`。
手动接管就照下面各节做，命令是同一套。工作流里**没有** `git reset --hard` 也没有
`git clean`（服务器 checkout 上有未提交的订单数据与 certbot 的 `public/.well-known/`），
只做 `git pull --ff-only`——拉不动会硬失败，那时上服务器看一眼，别绕过它。

---

## 1. 准备工作

1.  **安装 Git**: 为了方便拉取代码部署，需要在服务器安装 Git。
    *   在宝塔面板点击「终端」，输入 `git --version` 检查是否已安装。
    *   如果未安装，请根据系统执行命令：
        *   CentOS/RedHat: `yum install git -y`
        *   Ubuntu/Debian: `apt-get install git -y`
2.  **安装 Node.js**: 在宝塔面板的「软件商店」中搜索并安装 "Node.js版本管理器"，建议安装 Node.js v18 或 v20 版本。
3.  **安装 PM2**: 在「软件商店」中安装 "PM2管理器" (通常包含在 Node.js 管理器中，或者单独安装)，用于守护进程。

## 2. 获取代码 (Git)

### 首次部署 (git clone)
推荐使用 Git 拉取代码，方便后续更新。

1.  进入网站根目录：
    ```bash
    cd /www/wwwroot/www.aiworkdeck.com
    ```
2.  初始化并拉取代码 (注意：请确保目录下为空，或仅有系统生成文件)：
    ```bash
    # 使用 SSH 方式 (无需输入密码，但需先配置公钥)
    git clone git@github.com:AI-WorkDeck/aiworkdeck-website.git .
    ```
    *注意：首次连接 GitHub 可能会提示 `Are you sure you want to continue connecting (yes/no/[fingerprint])?`，请输入 `yes` 并回车。*
    *如果提示目录不为空，可以先清空目录，或者手动上传代码。*

### 后续更新 (git pull)

**提交前先在本地跑一遍**（生产构建已不做类型检查，见 next.config.ts 的说明）：

```bash
npm run check
```

改过**支付、Credits、账户契约**的任何文件，还要跑下面**四个**脚本，**两个站点各一遍**
（本仓库没有测试运行器，这四个脚本就是这三条链路唯一的自动化护栏）。把 `SITE=cn` 改成
`SITE=intl` 再跑一遍：

```bash
SITE=cn; for s in contract-check verify-payments verify-credits verify-profile; do (cd "$(mktemp -d)" && NEXT_PUBLIC_AWD_SITE=$SITE npx tsx --tsconfig <repo>/tsconfig.json <repo>/scripts/$s.mts) || { echo "FAILED: $SITE / $s"; break; }; done
```

**每次运行都要一个全新空目录**，`mktemp -d` 就是干这个的。脚本会在 cwd 下建 `data/awd.db`，
而它们用的是固定的 `outTradeNo`：在还留着上次库文件的目录里重跑，第二次必然报
`UNIQUE constraint failed: orders.outTradeNo`——这是脏目录的假失败，不是代码坏了。
此处原先写的 `mkdir -p /tmp/awd-verify` 正好踩这个坑：第一次干净，第二次起全是假红。

- `contract-check.mts`——桌面端对接契约：逐个调总 Spec §9 的端点，断言字段名与类型逐字对齐。
- `verify-payments.mts`——`settleFromChannel` 的四条拒绝路径（订单不存在 / 通道不符 /
  **币种不符** / 金额不符）、重投幂等与 Stripe webhook 验签。币种那条最容易被漏：USD $100.00
  与 ¥100.00 的 minor units 都是 10000，不比 currency 就能拿一笔 100 美元的支付结掉一张
  100 元的订单。
- `verify-credits.mts`——批次记账 / 有效期 / 消费顺序 / 原批次退款，外加**从 v6 库跑完整套迁移**。
  它的 [A] 段复用 `lib/db.ts` 导出的 `MIGRATIONS` 跑前 6 条造出历史库，再交给 `getDb()`
  把剩下的迁移跑完，所以**加新迁移不需要回来改这个脚本**。（2026-08-09 之前这里手抄了一份
  DDL，漏建迁移 9 要改的 `orders` 和迁移 10 要建索引的两张 telemetry 表，自 PR#40 落地起
  这条护栏就一直是红的，没人发现——改成跑真迁移正是为了断掉这种腐坏。）
- `verify-profile.mts`——资料字段边界 / 头像重编码 / 路径穿越 / 注销清理。

服务器实际路径是 `/www/wwwroot/www.aiworkdeck.com/new`，PM2 进程名 `aiworkdeck-website`。
一条命令完成部署：

```bash
ssh -i ~/.ssh/id_ed25519 -o IdentitiesOnly=yes root@8.152.169.44 'export PATH=/root/.nvm/versions/node/v22.23.2/bin:$PATH && cd /www/wwwroot/www.aiworkdeck.com/new && git checkout -- package-lock.json && git pull && npm install && bash scripts/deploy-build-swap.sh && pm2 restart aiworkdeck-website --update-env'
```

**那个 `export PATH` 不是可选的（2026-08-08 踩到）。** 这台机上：

| | 版本 |
|---|---|
| PM2 跑应用用的解释器 | **v22.23.2**（`pm2 describe` 的 interpreter 一栏） |
| 默认 shell 的 `node` / `npm` | **v20.20.2** |

不显式切 v22，`npm install` 会把 `better-sqlite3` 这个原生模块**按 v20 重编**，
而应用进程是 v22——ABI 对不上，加载即失败。表现和国际站那次一模一样、同样阴：
`npm install` 与 `npm run build` **全部成功**、页面**全部正常渲染**（静态页），
只有碰数据库的 API 路由 500，错误只在 `pm2 logs --err` 里。

自检一行（部署后跑，必须在 v22 下）：

```bash
/root/.nvm/versions/node/v22.23.2/bin/node -e 'const D=require("better-sqlite3"); new D(":memory:").exec("create table t(a)"); console.log("OK")'
```

同一个坑的另一面：`scripts/backup-db.mjs` **不能用 `/usr/bin/node` 跑**（v20，会段错误
`exit 139`）。crontab 里那条本来就写的是 nvm v22 的绝对路径，别"顺手简化"成 `node`。

`git checkout -- package-lock.json` 也不是可选的：服务器工作区常年有
`M package-lock.json`（服务器上 `npm install` 带出来的），不清掉 `git pull` 会直接中止。

- **合并 master 不会部署**：取得本次部署授权后，可手动触发工作流，或按上文接管命令执行。
- 源站是**北京 ECS `8.152.169.44`**（2026-08-05 从张家口轻量机 47.92.111.102 迁来，轻量机已退役）。
  海外线路走新加坡 `8.219.94.204`，形态是**缓存反代**而非应用副本，回源北京，所以只需部署北京这一台。
  部署后可两台分别直连自检：
  `curl -s --resolve www.aiworkdeck.com:443:8.152.169.44 https://www.aiworkdeck.com/zh | grep -c <新版特征串>`
- `--update-env`：改过 `.env.local` 时必须加，否则 PM2 继续用旧环境变量启动。
- 命令用 `&&` 串联，**任一步失败后面都不会执行**。若 build 挂了，PM2 里的老进程会继续
  读已被覆盖成残缺的 `.next`，表现为站点返回 200 但样式全裸。所以看到 build 报错
  （尤其是 `Killed`）不要以为「反正老版本还在跑」，必须修好重新构建。
- `better-sqlite3` 是原生模块，上面部署命令里的 `npm install` 会在服务器上自动编译，
  但**必须在 PM2 用的那个 node 版本下编**（见上）；若编译报错先确认服务器装有构建工具链
  （`gcc`/`make`/`python3`）。

#### 账本数据库备份

钱相关数据（订单/账本/权益）存在 `data/awd.db`（SQLite），**必须纳入服务器备份**。
`scripts/backup-db.mjs` 用 `VACUUM INTO` 生成一致性快照到 `data/backups/`，自动保留最近 14 份。
crontab 示例（每天凌晨 3 点备份）：

```cron
0 3 * * * cd /www/wwwroot/www.aiworkdeck.com/new && /usr/bin/node scripts/backup-db.mjs >> /var/log/awd-db-backup.log 2>&1
```

#### data/ 其余持久化文件与服务器资产备份

`data/` 下不止数据库：avatars/、pack-submissions/、pack-publish/、packs.json、
users.json、skills.json、sessions.json、plugin-files/、gateway-config.json 等
全是持久化状态。`scripts/backup-data.mjs` 把整个 `data/`（排除 backups/ 与数据库
三件套）打成 tar 放进 `data/backups/`，同样保留 14 份；`--extra name=/abs/path`
可追加站点之外的资产（pack 分发件 `/www/wwwroot/plugin-packs`、北京机云后端
`/opt/aiworkdeck/cloud/data` 反馈收件箱），extra 各保 3 份（追加型内容，兜误删即可）。
产物 0600（内含密钥与用户数据）。**备份不出本机**：把北京机用户数据同步到境外机
就是数据出境，隐私政策承诺过全境内。crontab 见下方汇总。

#### 构建内存

生产机 1.8G 内存且同时跑着另外三个站点，留给构建不到 1G。2026-07-27 曾因此被 OOM
killer 杀在 TypeScript 检查阶段。现已把类型检查从生产构建移除（`typescript.ignoreBuildErrors`），
正常情况够用。若将来代码量增长又出现 `Killed`，按这个顺序处置：

```bash
# 1) 先看是不是内存不足（available 低于 500M 就危险）
free -h

# 2) 显式限制 Node 堆——小内存机器上设小反而更容易成功，V8 会更早触发 GC
NODE_OPTIONS="--max-old-space-size=1024" npm run build
```

## 3. 安装依赖与构建

在宝塔面板中打开「终端」，进入网站目录：

```bash
cd /www/wwwroot/www.aiworkdeck.com
```

执行以下命令安装依赖并构建：

```bash
# 安装依赖
npm install

# 构建项目
npm run build
```

构建成功后，会生成 `.next` 目录。

## 4. 启动服务

使用 PM2 启动 Next.js 服务（默认端口 3000）：

```bash
# 使用 npm start 启动，并命名为 website-nextjs
pm2 start npm --name "website-nextjs" -- start
```

*如果端口 3000 被占用，可以在 `package.json` 的 start 脚本中修改端口，例如 `next start -p 3001`，或者使用命令 `PORT=3001 pm2 start npm --name "website-nextjs" -- start`。*

确保服务已启动：
```bash
pm2 list
# 或者
curl http://127.0.0.1:3000
```

## 5. 配置 Nginx 反向代理

回到宝塔面板 -> 「网站」 -> 点击你的网站名 -> 「配置文件」。
将原来的配置替换为我们提供的 Nginx 配置（注意保留 SSL 等原有证书配置）。

核心更改是将请求转发到本地的 3000 端口：

```nginx
    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
```

## 6. 保存并重启 Nginx

保存配置文件，Nginx 通常会自动重载。如果没有生效，可以在软件商店重启 Nginx。
7.  此时访问 `www.aiworkdeck.com` 应该就能看到你的 Next.js 网站了。

## 7. 环境变量（Skill 广场后台与 AI 辅助）

在项目根目录创建 `.env.local`（已 gitignore）：

```bash
# 管理后台口令（必须 ≥16 位随机串；未配置则 /zh/admin 整体不可用）
AWD_ADMIN_TOKEN=<随机长口令>

# OpenRouter（可选：也可登录 /zh/admin 后在「AI 配置」页填写，写入 data/ai-config.json；环境变量优先）
# OPENROUTER_API_KEY=sk-or-...
# OPENROUTER_MODEL=anthropic/claude-sonnet-4.5

# 插件 CORS 白名单（可选：Office 任务窗格等浏览器环境插件跨域调 /api/account/* 与
# /api/license/verify-key 时才需要；逗号分隔完整 Origin；不配置 = 不放开，默认安全）
# PLUGIN_ALLOWED_ORIGINS=https://addin.example.com,https://localhost:3000

# 后台「用户反馈」分区（dev-board#152）：云端反馈收件箱的取件密钥，
# 值 = 北京 ECS /opt/aiworkdeck/cloud/env 里的 FEEDBACK_OPTIMIZER_TOKEN。
# 不配置时分区显示配置指引；运行期读取，pm2 restart --update-env 即生效。
# AWD_FEEDBACK_INBOX_TOKEN=<取件密钥>
# AWD_FEEDBACK_INBOX_BASE=https://addin.aiworkdeck.com   # 默认值，通常不用配

# 官网「提交需求」表单（/feature-request，dev-board#240）：提交投进云端反馈收件箱
# （公开 ingest 端点，无需密钥），同时给这个邮箱发一封即时通知（发信走 AWD_MAIL_* 那套
# Resend 凭据）。不配置 = 不发通知邮件，提交本身不受影响。
# AWD_FEATURE_REQUEST_NOTIFY_TO=<优化者/维护者邮箱>
```

### 7.0 AI 计费汇率（dev-board#853，**仅大陆站**）

国内站 Credits 是人民币分，折成 OpenRouter 美元额度用的汇率现在默认**跟随即时汇率**，
不需要任何环境变量。三级裁决：后台「汇率来源」为**手动**且填了手动值 → 手动值；
否则即时汇率（上一次有效值）；再否则站点默认值 7.3。国际站本币是美元，恒为 1，一次都不拉。

- **数据源**：首选中国外汇交易中心人民币汇率中间价
  `https://www.chinamoney.com.cn/r/cms/www/chinamoney/data/fx/ccpr.json`，
  备选 Frankfurter（欧洲央行参考汇率）`https://api.frankfurter.dev/v1/latest?base=USD&symbols=CNY`。
  这是北京机新增的两条**服务端出站**请求，只取公开汇率、不带任何用户数据。
- **刷新**：读汇率时发现缓存超过 12 小时就在后台刷新，当前请求照用旧值；失败后 30 分钟内不重试。
  结果缓存在 `data/fx-rate.json`（可删，删了下次读取重新取；取到之前用站点默认值）。
- **护栏**：只接受 [5, 10] 内的值；与上一次有效值相比单次变动超过 5% 不采用、记
  `[fx-rate]` 日志、继续用旧值，后台 AI 配置页会显示「最近一次被拒的取数」。
  长时间停在被拒状态说明真实汇率确已大幅移动，去后台切手动。
- **老文件迁移**：`data/ai-config.json` 里原有的 `exchangeRate`（多半是 7.3）**不会**再压住即时汇率——
  没有 `exchangeRateMode` 键的文件一律按「自动」处理，那个数只保留为手动备用值。
  上线后无需操作；想继续用固定汇率就去后台把「汇率来源」切到手动。
- 自测：`npm run test:fx-rate`（打桩，不碰网络；CI 契约矩阵两站各跑一遍）。

### 7.1 手机号验证码登录（**仅大陆站**）

大陆站以手机号为账号本体（注册与登录合一）。四个变量缺任何一个 = 短信不启用，
此时登录页的手机号方式会回「本站短信服务暂不可用」，**存量账号的邮箱口令登录不受影响**。

```bash
# 阿里云短信（RAM 子用户 awd-gateway-sms，只授 AliyunDysmsFullAccess）
AWD_SMS_ACCESS_KEY_ID=<RAM AccessKeyId>
AWD_SMS_ACCESS_KEY_SECRET=<RAM AccessKeySecret>
AWD_SMS_SIGN_NAME=京微资易科技
AWD_SMS_TEMPLATE_CODE=SMS_483655011
```

存量邮箱账号的补绑硬期限（默认 `2026-09-30`）：

```bash
NEXT_PUBLIC_AUTH_PHONE_BINDING_DEADLINE=2026-09-30
```

**这个变量带 `NEXT_PUBLIC_` 前缀，改了必须重新 `npm run build`**，
`pm2 restart --update-env` 不够（与 `NEXT_PUBLIC_AWD_SITE` 同一条约定；
手动部署工作流每次都会重 build，所以走该工作流时不用额外操作）。
它同时供服务端判闸与登录页文案显示——两处共用一个源，防止「页面写着还能用到 X 日、
实际早就登不进去」。

**国际站不要配这一组**：`.ai` 那台没有短信通道（Twilio 未开通），
端点在两站都存在但 intl 上会明确回「本站不支持手机号方式」。

### 7.2 邮箱验证码登录（**仅国际站**）

国际站以邮箱为账号本体（注册与登录合一），与大陆站的手机号是同一条分叉的两半。

**为什么必须有这条**：intl 此前只有账号口令一条登录路，而注册时收的 `email`
**从来没被验证过**（`createUser` 只做格式校验）。后果是登录安全性完全押在口令强度上，
且我们握着的联系方式没有任何证据——出事时联系不上人。验证码登录同时解决这两件事：
「能登进来」本身就是「这个邮箱是他的」的证据，落在 `users.json` 的 `emailVerifiedAt`。

两个变量缺任何一个 = 邮箱验证码不启用。此时登录页的「邮箱验证码」方式会回
「本站暂未启用邮箱验证码，请改用密码登录」，**口令登录与口令注册都照常可用**。

```bash
# Resend（HTTP API，不走 SMTP）。发信域名必须是 Resend 里已验证的那个，
# 且只能加子域——根域 workdeck.ai 挂着 QQ 企业邮箱，动 MX 会把收信打掉。
AWD_MAIL_RESEND_KEY=re_xxxxxxxxxxxxxxxxxxxx
AWD_MAIL_FROM="AI WorkDeck <no-reply@send.workdeck.ai>"
```

**上线顺序是安全的，不用担心中间态**：`mailEnabled()` 为假时口令注册不会被关掉
（`app/api/auth/register/route.ts` 的闸是 `emailIsAccount() && mailEnabled()`），
所以「代码已部署、密钥还没注入」这个必然出现的窗口里，intl 不会变成谁都注册不了的站。
配好密钥重启之后口令注册才关闭，新用户一律走验证码。这与大陆站短信那条闸同一口径。

**没配密钥时登录页长什么样**：验证码那个页签**根本不渲染**，页面就是今天的样子
（Sign in / Register + 口令）。服务端算好 `codeChannelReady` 传给 `AuthForms`——
这两个判定读的是不带 `NEXT_PUBLIC_` 前缀的密钥变量，客户端组件自己判会一律得出「没配」，
所以必须由 `/account` 与 `/start` 两个服务端页面传下去（`lib/login-channel.ts`）。
大陆站同理，两站共用这一条。

**不验证域名会怎样**：`send-code` 会拿到 Resend 的 4xx，用户看到
「Could not send the code, please try again shortly」——原始 message 只进日志不外露。
所以密钥配上但域名没验证 = 邮箱这条路是死的，而口令**注册**那条已经关了
（口令登录不受影响，存量用户仍能进来，影响面是新注册）。
**注入密钥之前先确认发信域名在 Resend 里是 verified。**

**大陆站不要配这一组**：那边账号本体是手机号，端点存在但会明确回
「本站不使用邮箱验证码」。

### 7.3 人机验证（两站都要，供应商不同）

挡「脚本批量请求验证码」。**它不是限流的替代品**——`lib/code-send-guard.ts` 那两道闸
（按 IP + 全局熔断）是 always-on 的兜底，这一层只是把成本抬高。

两站用不同供应商，分的是**网络可达性**不是账号体系：Turnstile 的
`challenges.cloudflare.com` 在大陆访问不稳，用它等于把大陆用户挡在门外。

```bash
# ---- 国际站（intl）：Cloudflare Turnstile ----
NEXT_PUBLIC_AWD_TURNSTILE_SITE_KEY=0x4AAAAAA...    # 公开，控制台 Site Key
AWD_TURNSTILE_SECRET=0x4AAAAAA...                  # 服务端，控制台 Secret Key

# ---- 大陆站（cn）：阿里云验证码 2.0 ----
NEXT_PUBLIC_AWD_ALIYUN_CAPTCHA_SCENE_ID=zf9a86sp   # 控制台「场景管理」
NEXT_PUBLIC_AWD_ALIYUN_CAPTCHA_PREFIX=<控制台上与 SceneId 并排显示的那串>
AWD_ALIYUN_CAPTCHA_ACCESS_KEY_ID=<RAM awd-gateway-captcha>
AWD_ALIYUN_CAPTCHA_ACCESS_KEY_SECRET=<同上>
```

- **`NEXT_PUBLIC_` 那几个改了必须重新 build**（构建期 inline），与 `NEXT_PUBLIC_AWD_SITE`
  同一条约定；两个密钥是运行期读的，`pm2 restart --update-env` 即可。
- **公开参数与密钥都配上才启用**（`captchaEnabled()`）。缺任何一项＝完全惰性：
  控件不渲染、服务端不校验、一次网络调用都不发。所以「代码已部署、密钥还没注入」
  这个必然出现的中间态是安全的，与短信/邮件那两条闸同一个形状。
- **阿里云的 `prefix`（身份标）在控制台「概览 → 实例基本信息」卡片里，不在场景管理页**——
  它是**实例级**的、所有场景共用，所以场景列表里没有。也没有 API 能取
  （实测 `DescribeCaptcha` / `ListCaptchaScene` 一系列全是 404）。当前值 `cj5ukv`。
- 同一张卡片上还有个「密钥（ekey）」，那是**加密模式**用的。场景的加密模式开关默认关，
  关着就用不到 ekey；要开的话是另一套流程（回调参数会被加密），代码得另外改。
- **`prefix` 与 `region` 必须在脚本加载之前挂到全局 `window.AliyunCaptchaConfig`**，
  传进 `initAliyunCaptcha` 是不生效的。2026-08-18 实测过：只传给 init 时
  `AliyunCaptchaConfig` 恒为 undefined、控件起不来，而且**不报错**。
- 服务端校验的两层判定：外层 `Success` 只表示「这次 API 调用成功」，
  `Result.VerifyResult` 才是「人过了没」。**只看外层会让这条闸完全失效且日志一切正常**，
  `scripts/verify-captcha.mts` 专门钉住它。
- 上游校验服务连不上时**放行并打 error 日志**，不是拒——否则 Cloudflare/阿里云抖一下
  我们就全站登不进来。放行不等于没防线：Layer 1 的 IP 限流与全局熔断照常生效。

**开启前必须先做完桌面端 token 透传**（见下）。桌面端登录是
`桌面 → 本机 Java /api/account/login/send-code → AccountService → 官网 send-code`，
请求体是 Java 那边拼的、只有 `phone` 一个字段。官网一旦强制校验而桌面端没带 token，
**桌面端登录当场就断**。手机端（原生 iOS / 小程序）同理。

微信支付相关（回调/回查验签必需）：

```bash
WXPAY_APPID=<公众号/应用 appid>
WXPAY_MCHID=<商户号>
WXPAY_APIV3_KEY=<APIv3 密钥，32 位；用于回调报文 AES-256-GCM 解密>
WXPAY_SERIAL_NO=<商户 API 证书序列号；用于请求签名>
WXPAY_PRIVATE_KEY_PATH=./wxpay/apiclient_key.pem

# 验签模式二选一，按商户平台-API安全的实际配置：
# A) 微信支付公钥模式（2024 年后新商户号只有这一种）
WXPAY_PUBLIC_KEY_ID=PUB_KEY_ID_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
WXPAY_PUBLIC_KEY_PATH=./wxpay/pub_key.pem   # 默认值，文件从商户平台下载
# B) 平台证书模式：无需上面两项，代码会自动去 /v3/certificates 拉平台证书
```

公钥 ID 就是微信回调/应答 `Wechatpay-Serial` 头里的值；配错或不配，回调一律按验签失败拒绝（fail closed），
表现为「收到钱但订单永远不置为已支付」。

**微信支付 APP 支付（安卓 `com.aiworkdeck.mobile.cn`，dev-board#428，仅国内站）**：

```bash
# 不设 = APP 支付通道不存在：手机端内部口 create-recharge(channel='wxpay-app') 回 503 channel_unavailable，
# 不建单、不调微信。Native 扫码 / Stripe / App Store / 小程序虚拟支付都不受影响。
WXPAY_APP_APPID=<开放平台「移动应用」的 AppID，wx 开头；不是上面 WXPAY_APPID 那个>
```

- 商户号、商户私钥、APIv3 key、验签公钥全部与 Native 共用，不需要另配。国际站（USD）即使配了也不开放。
- 回调地址是 `${NEXT_PUBLIC_BASE_URL}/api/payment/notify/app`（下单时随单下发，商户平台不用配）。
- 商户侧前置（缺一项都会在下单或调起时失败）：
  1. 微信开放平台已认证开发者账号下创建「移动应用」，Android 包名 `com.aiworkdeck.mobile.cn`，
     应用签名填正式签名证书 MD5 **去冒号小写** `dfea3ae5537b22e1f0c0878352360ded`
     （即 `df:ea:3a:e5:53:7b:22:e1:f0:c0:87:83:52:36:0d:ed`）；审核通过后拿到的 AppID 就是 `WXPAY_APP_APPID`。
  2. 商户平台【产品中心 → APP 支付】已开通，并在【产品中心 → AppID 账号管理】把上面那个 AppID 与本商户号**关联并确认**。
  3. 签名与包名任何一项和安装包不符，SDK 调起会直接回 errCode=-1，服务端看不到任何日志——先核这两项。
- 开启后先用真机做一笔小额真实支付，确认 `/api/payment/notify/app` 回调入账、`query` 回 paid，再放开安卓端入口。
  验证脚本：`npm run test:wxpay-app`（不联网，cn/intl 两站在 CI 都跑）。

改动 `.env.local` 后需 `pm2 restart aiworkdeck-website --update-env` 生效。

#### 个人 Pro 购买开关 `PRO_PURCHASE_ENABLED`（仅国内站）

```bash
# 不设 = 默认开（等同生产现状；默认值见 lib/pro-purchase-flag.ts 的 PRO_PURCHASE_ENABLED_DEFAULT）
# 应急止血：
PRO_PURCHASE_ENABLED=false
```

- 取值：`false` / `0` / `off` / `no` → 关；`true` / `1` / `on` / `yes` → 开；不设或其它值 → 默认值。
- 关闭后：定价页 Pro 卡「直接升级 Pro」变为禁用的「Pro 购买暂未开放」，不发起建单；
  `/api/payment/create` 对 `pro_monthly`（及 #228 旧 `pro:monthly`）回 403 `pro_purchase_disabled`，不落单、不调微信。
  打赏 / 充值 / 已付订单回调与履约**不受影响**。
- 年付不可购（monthly-only）：`pro_yearly` 与旧 `pro:yearly` 恒回 400 `not_purchasable`，与开关无关。
- 生效：API 侧改 `.env.local` 后 `pm2 restart aiworkdeck-website --update-env` 即生效；
  定价页按钮在服务端渲染时读取，若页面被静态化需重新 `npm run build` 再重启。只重启时 API 已拒单（双保险），
  但旧按钮点了会报「Pro 购买暂未开放」。


### 7.4 审核专用账号的固定验证码（dev-board#699）

Office 插件要上 Microsoft Marketplace，微软要求提供**永久有效、无需开发者介入**的测试账号
——审核员不会联系我们，也收不到我们邮箱里的验证码。这两个变量给指定的邮箱/手机号开一个
固定码，插件登录链路（插件云后端 → 官网 `POST /api/auth/exchange-key` 的 `{email, code}`）
即可直接走通。iOS / 微信小程序审核用的是桌面仓 `ReviewAccountGate.java` 那条，同一口径。

```bash
# 逗号分隔，写规范化后的形式（邮箱一律小写；手机号 11 位，+86 与连字符会被归一）
AUTH_REVIEW_ACCOUNT_IDENTITY=appreview@example.com,13800138000
# 6 位数字，所有标识共用。写进审核备注给审核员看
AUTH_REVIEW_ACCOUNT_CODE=246813
```

- **默认关**：两项任意一个为空即全关，不存在「配了一半」的中间态。
- **只对列出的标识生效**，别的邮箱/手机号一律走原路；只开在免密登录（`signin`）上，
  绑定手机号（`bind`）不走旁路。
- 命中的标识**不发信/不发短信、不落 `mail_send_log` / `sms_send_log`、不占冷却与日配额**，
  也不消耗该地址已发出的在途验证码、不计失败次数——审核员可以无限次登录。
- **码不是 6 位数字就拒绝启动**（模块加载即抛）。配歪了的旁路比没有旁路更糟：症状要等
  审核员登不进去才看得见，那时排查方向已经跑到客户端去了。
- 启用时服务端日志会打一行 `审核账号旁路已启用：…`（标识打码）。生产上开着这条口子是
  有意为之还是配漏了，只能靠它区分。
- 运行期读取，`pm2 restart aiworkdeck-website --update-env` 即生效，不用重 build。

**运维红线：**

- **审核账号里不放任何真实数据**。谁拿到那 6 位码就能登进这些账号，而这个码是写在审核
  备注里给外部人看的。审核账号首次登录会自动建号（`findOrCreateByEmail`），无需人工预建。
- **审核结束就把 `AUTH_REVIEW_ACCOUNT_IDENTITY` 清空**，这条旁路即关闭，不用改代码。
- 契约由 `scripts/verify-review-account.mts` 钉住（`npm run test:review-account`，CI 两站各跑一遍）。

### 7.1 平台服务网关的供应商凭证

网关代用户调外部服务，凭证只存服务器。**环境变量优先于 `data/gateway-config.json`**
（后者由 admin 页写入，`data/` 整个目录已 gitignore）。缺任何一项，对应服务回
`not_configured` 而不是半残执行。

```bash
# 博查搜索
# GW_BOCHA_API_KEY=sk-...

# 阿里云共用 RAM 凭证（听悟 ASR / OSS 走这组，**给最小权限**）
# GW_ALIYUN_AK_ID=LTAI...
# GW_ALIYUN_AK_SECRET=...

# 通义听悟（语音转写）
# GW_TINGWU_APP_KEY=<控制台项目 AppKey>
# GW_TINGWU_REGION=cn-beijing            # 听悟目前只有北京地域

# 音频中转 OSS（**私有读写 bucket**，绝不能是公共读）
# GW_OSS_BUCKET=awd-asr-relay
# GW_OSS_ENDPOINT=oss-cn-beijing.aliyuncs.com

# 阿里云 OCR：RAM 最小权限下 ocr:* 与 tingwu:*+OSS 是两个互斥的子用户，
# 所以 OCR 有一组专用凭证；不配时回落上面那组共用 AK（老部署不用动）
# GW_OCR_AK_ID=LTAI...
# GW_OCR_AK_SECRET=...
# GW_OCR_ENDPOINT=ocr-api.cn-hangzhou.aliyuncs.com

# 语音合成没有平台代采这一档：桌面端只用本机 Kokoro（桌面仓 #386），
# 官网侧的 tts 适配器与定价行已删除。别再配 GW_ELEVENLABS_*，配了也不会被读到。

# 企查查
# GW_QICHACHA_KEY=...
# GW_QICHACHA_SECRET=...

# Tushare 金融数据
# GW_TUSHARE_TOKEN=...

# 北大法宝（**token 通常绑订阅主体**）
# GW_PKULAW_TOKEN=...

# 成本台账（dev-board#219）：阿里云账户余额自动拉取。
# 专用 RAM 子用户 awd-gateway-billing，只挂 AliyunBSSReadOnlyAccess——不回落共用组，
# asr 子用户没有 BSS 权限，回落只会把「没配」变成「恒 403」。
# GW_BILLING_AK_ID=LTAI...
# GW_BILLING_AK_SECRET=...

# 成本预警邮件收件人（配了且本站有 Resend 密钥才会发；72 小时内不重发）
# AWD_COST_ALERT_EMAIL=...

# 新用户注册赠额（限时活动）。默认 1990 分 = 19.9 元，落 reward 批次。
# 配成 0 = 关闭活动；窗口两侧都可以不设。
# GW_SIGNUP_GRANT_CENTS=1990
# GW_SIGNUP_GRANT_START_AT=2026-08-17T00:00:00+08:00
# GW_SIGNUP_GRANT_END_AT=2026-12-31T23:59:59+08:00
```

**配好凭证不等于服务已开放。** 每项服务还有一行 `service_pricing`，
`enabled=0` 时网关回 `service_disabled`（桌面端显示「未开放」+「改用自己的 Key」），
与「凭证没配」的 `not_configured` 是两件事。

**改价与开关都在后台，不必再写 SQL：** `/zh/admin` →「服务定价」，
可改采购成本 / 加价率 / 单次上限 / 开放开关，页面上直接显示派生出来的单价与毛利率，
保存即生效（下一次调用就按新价扣），并写一条 `admin_audit` 留痕。

单价的派生是 `creditsPerUnit = ceil(costCentsPerUnit × marginMultiplier)`，
**向上取整**不是四舍五入——成本 2 分 × 1.2 = 2.4，四舍五入回 2 分就是零毛利。
代价是低价项的实际毛利率高于名义加价率，以后台那一列的真实数字为准。

**bucket 的生命周期规则是必配项，不是可选优化。**
代码在转写完成、任务失败、以及预扣超时回收三条路径上都会主动删对象，
但这三条都依赖「有人来收尾」——进程被杀、机器换了、cron 停了，都会让一段客户的
会议录音留在里面。规则是第二道，与代码删并列，两道都要：

```
OSS 控制台 → 该 bucket → 数据管理 → 生命周期
  规则名：asr-relay-purge
  前缀：asr/
  策略：文件创建 1 天后删除（含未完成的分片上传碎片）
```

选 1 天而不是更短：预扣的默认存活时长是 4 小时（`GW_HOLD_TTL_MINUTES`），
规则比它短就会在任务还能正常完成的时候把音频抽走。

RAM 子用户的权限按最小给：OSS 侧只需要该 bucket 的
`PutObject` / `GetObject` / `HeadObject` / `DeleteObject`，
听悟侧只需要 `CreateTask` / `GetTaskInfo`。

### 7.3.1 账目公开（dev-board#611 / #612）

「每半年公布一次账目与使用情况」这个承诺的落点：官网 `/transparency` 公开页 +
后台「商业化 → 账目公开」编辑器 + 导出给 GitHub 的 Markdown。

```bash
# 跨站取数共享密钥（openssl rand -base64 32）。**两台服务器必须配同一个值**——
# 它不是内部记账口那种一站一把的密钥，而是「这两台机器互相认得」的凭据。
# 未配置 = /api/transparency/auto 对任何请求回 404，后台的「自动取数」只出本站数字，
# 界面上写明「国际站：未拉取」。功能不残废，只是少算一半，且说清了少在哪。
# AWD_TRANSPARENCY_SYNC_TOKEN=<随机长口令>
```

**凭证目录 `data/transparency-receipts/` 必须进持久化与备份口径**，与 `data/avatars/`
同级同待遇（见上方「data/ 其余持久化文件与服务器资产备份」）。捐赠凭证是账目公开的
证据，丢了就只剩一串数字，补不回来。

半年一次的流程（都在国内站后台做，国内站是账目的唯一真源，国际站只展示）：

1. `/zh/admin` →「账目公开」→ 新建期次（`2026H1` / `2026H2`，按北京时间的 1 月 1 日与 7 月 1 日切分）。
2. 点「自动取数」：注册数、安装数、下载数、各通道收入、OpenRouter 与网关服务的成本
   一次填满，并把国际站的数字合并进来。**它不会覆盖你已经手填的值**（要重来就勾「覆盖已填值」）。
3. 补手工项：各通道的渠道费（按微信商户账单 / Stripe 结算报表 / ASC 财务报告填，
   界面上给了建议估算口径）、发起人前期垫付、捐赠金额与受赠机构、备注、美元折人民币汇率。
4. 上传捐赠凭证（JPG / PNG / WebP / PDF，单个 ≤ 8 MB）。**未发布期次的凭证对外一律 404**。
5. 「公开发布」→ `/zh/transparency` 与 `/en/transparency` 立刻可见。
6. 「导出 Markdown」→ 把文件贴到 GitHub 仓库（`AI-WorkDeck/aiworkdeck`）作为同一期的另一份公示。

发布后改错字不会把它撤下线（状态与内容是两件事）；要撤回就点「撤回公布」，
该期连同它的凭证立刻从公开面消失。

### 7.4 跨设备文件传输的内部记账口（dev-board#251）

云后端（`addin.*` 那台机的 Spring mobile 服务，与本站同机部署）代账户按 transfer
计价扣/退 Credits，走 `POST /api/internal/transfer`。这不是给外部客户端用的
网关端点，鉴权是共享密钥，不是 Bearer awdk_：

```bash
# 内部记账口共享密钥（openssl rand -base64 32，两站各自独立生成，不能共用）。
# 未配置 = 该端点对任何请求都回 404（与路由不存在无法区分），跨设备传输功能
# 在云后端那侧会表现为「未在此服务器开通」。
# AWD_TRANSFER_BILLING_SECRET=<随机长口令>
```

云后端那侧对应配 `TRANSFER_BILLING_BASE_URL=http://127.0.0.1:<本站 next 端口>` 与
`TRANSFER_BILLING_SECRET=<同上>`（两个变量名故意不同，提醒这是两套配置各自的环境）。

**nginx 必须加一条兜底**，公网侧直接拒掉这条内部路径：

```nginx
location ^~ /api/internal/ { return 404; }
```

这**不是**「纯粹的防御纵深」——代码侧刻意不判来源 IP（Next 在反代后面拿到的
remote addr 恒是 nginx 自己，判它等于没判），所以这条 404 与共享密钥是并列的
两道边界，缺一道都不行。规则的仓库源本：

| 站点 | 源本 | 线上位置 |
|---|---|---|
| 国际站 workdeck.ai | `doc/nginx-workdeck-ai.conf`（`^~ /api/` 上面一段） | `/www/server/panel/vhost/nginx/workdeck.ai.conf` |
| 国内站 www.aiworkdeck.com | `deploy/nginx/internal-deny.conf` | 宝塔 vhost（配置文件不在仓库，把那一行抄进去） |

两站都要 `nginx -t && nginx -s reload`。**核对命令见 §7.5 末尾**——
2026-09-04 复审发现这条规则从来没有真正进过仓库里的任何一份配置（`grep api/internal`
在 git 历史里零命中），线上是否有过同样无据可查。

### 7.5 手机端统一账户的内部记账口（dev-board#425）

手机端（iOS / 小程序 / 安卓 / 鸿蒙）登录的是 Java 云后端，与官网账户是两个身份空间；
官网这边开一条窄口子让云后端代用户解析账号、读余额、下充值单、查单、销号，走
`POST /api/internal/account`。七个 action：`resolve` / `wx-phone` / `balance` /
`create-recharge` / `confirm-appstore` / `query` / `delete-account`
（`delete-account` 见 §7.6，`confirm-appstore` 与 `create-recharge` 的 iOS 内购分叉见 §7.8）。
同 §7.4，鉴权是共享密钥，不是 Bearer awdk_：

```bash
# 手机端记账口共享密钥（openssl rand -base64 32，两站各自独立生成）。
# **必须与 AWD_TRANSFER_BILLING_SECRET 不同**：那条口子只按现算价扣/退，
# 这条会建单收钱、会建账号，一把密钥泄漏不该同时把两件事都交出去。
# 未配置 = 该端点对任何请求都回 404（与路由不存在无法区分），手机端在云后端
# 那侧会表现为「本服务器未开通统一账户」。
# AWD_MOBILE_BILLING_SECRET=<随机长口令>
```

云后端那侧对应配 `MOBILE_BILLING_BASE_URL=http://127.0.0.1:<本站 next 端口>` 与
`MOBILE_BILLING_SECRET=<同上>`。

**还有第三个键，而且它是一道合规护栏，不要顺手打开**：云后端的 `MOBILE_BILLING_RECHARGE_ENABLED`（对应 `mobile.billing.recharge-enabled`）**默认 false**，关着时 `POST /api/mobile/billing/recharge` 与 `GET /api/mobile/billing/recharge/status` 一律回 `kind=DISABLED` 并在到达 `resolve(create=true)` 之前短路；`GET /api/mobile/billing/balance` 不受它影响。
打开它的前置条件是 **dev-board#434（官网账户注销传导）先落地**：手机端一旦能在官网建号，就落入 App Store 5.1.1(v)「App 内能建账号就必须能在 App 内删账号」，而现在 `AccountDeletionService` 只删云后端本地表、不通知官网，内部口也还没有 delete action。所以配完上面两个键不等于功能齐了——第三个键要等 #434。

**nginx：必须确认线上 vhost 已经有 §7.4 那条 `location ^~ /api/internal/ { return 404; }`。**
本路由落在同一个前缀下，所以不需要**再加**一条新规则——但那条规则本身在
2026-09-04 之前只写在本文档里，仓库里的两份配置源本都没有它，因此
**上线本功能前必须逐站核对一次**，不能默认它已经在了：

```bash
# 1) 直接看线上 vhost 有没有这条（最权威）
ssh <国际站> "grep -n 'api/internal' /www/server/panel/vhost/nginx/workdeck.ai.conf"
ssh <国内站> "grep -n 'api/internal' /www/server/panel/vhost/nginx/www.aiworkdeck.com.conf"
# 两条都必须打印出 `location ^~ /api/internal/ { return 404; }`；任何一条没输出就是没配。

# 2) 从公网黑盒验一遍（在服务器之外的机器上跑）
curl -sS -i -X POST -H 'content-type: application/json' -d '{}' \
  https://www.aiworkdeck.com/api/internal/account | head -20
```

黑盒这条要看的**不是状态码**——没配 secret 时应用自己也回 404，两者状态码一样。
要看的是响应体与响应头：nginx 的 `return 404` 发的是它自带的 HTML
（`<center>nginx</center>`），而请求真的打到 Next 时回的是**空体**（本路由的
`authGate404()`）。看到空体就说明这条 nginx 规则不在，请求穿透到了应用。

改完两站都要 `nginx -t && nginx -s reload`；国际站还要把 `doc/nginx-workdeck-ai.conf`
与线上重新逐字对齐（§9.3 那句「已与线上逐字同步」在这次改动后需要重新成立）。

**云后端那侧的红线**（官网这边无从校验，只能靠共享密钥限定调用方）：
`resolve` 的手机号/邮箱只能取自云后端会话对应的 User 实体，**绝不接受请求体传入**，
且只能在云后端已经核销过验证码之后调用——否则这就是一个手机号枚举 + 任意建号的口子。

**`resolve` 的 `create` 参数**（dev-board#425 复审 C1）：缺省 **false**，只查不建。
只有「用户显式发起充值」这一个动作才允许传 `create: true`；读余额那条路必须
`create=false`，否则「新用户打开一次设置页」就会在官网建出一行含明文手机号的真账户，
而手机端的注销流程只删 Java 侧绑定、从不通知官网——App 自己建的账号 App 内删不掉，
直接踩 App Store 5.1.1(v)。`create: true` 建号时会按官网 sms-login 的同一口径发注册
赠额（`lib/signup-grant.ts`，幂等靠 `credit_lots.refOrderId`）。

**`wx-phone`：微信手机号一键登录的换号口（dev-board#534）。** `{"action":"wx-phone","code":"<小程序 getPhoneNumber 的 code>"}` → `200 {"phone":"138…"}`。
小程序的 code 只能由持 AppSecret 的服务端去换，而 `WX_MINI_APP_SECRET` 在**官网这台**
（§7.6 那份，dev-board#305 起就在），云后端没有第二份，所以借这条口子换号，
换回来后由云后端自己 `findOrCreateByPhone` + 签会话。
**与公开路由 `/api/auth/wx-phone` 的区别：这条不建官网账户、不发赠额、不记
`wx-phone.jsonl`**——手机端用户此刻只是在登录云后端，官网账号仍然只在「用户显式
发起充值」（`resolve` 的 `create=true`）时才建。它与 `resolve` 一样**不带 accountId**。
四种失败：

| 响应 | 含义 | 云后端该做的 |
|---|---|---|
| 400 `{"error":"unsupported_region"}` | 微信绑的是境外号，或 countryCode 说 86 但号码不合法 | 提示「目前仅支持中国大陆手机号」 |
| 401 `{"error":"invalid_wx_code"}` | code 无效/过期/被重放 | 提示「微信授权已过期，请重试」 |
| 503 `{"error":"wx_not_configured"}` | 本站没配 AppSecret（国际站恒如此） | 提示改走短信验证码登录 |
| 400 `{"error":"bad_request"}` | 请求体不是 JSON，或 code 缺失/超 128 | 客户端 bug，按失败处理并打日志 |

**两种 404 的形状不同，云后端必须分开处理**：

| 响应 | 含义 | 云后端该做的 |
|---|---|---|
| **非 JSON body** 的 404（本路由发的是空体；被 nginx 那条规则挡下时是 nginx 自带的 HTML） | env 未配置 / secret 不符 / 打错了地址被 nginx 挡下 | 归为「上游不可用」并 `log.warn`；**绝不能**译成「这个用户没有账户」 |
| 带 `{"error": "account_not_found"}` 的 404 | 真的没有这个账户 | 未关联 / 清掉失效绑定去自愈 |
| 带 `{"error": "order_not_found"}` 的 404 | 单号不存在或不属于该账户 | 按未找到订单处理 |

密钥配错一个字符就会让全量用户被告知「还没关联统一账户」、而日志里一条痕迹都没有——
这是第一版真实存在的形态，两种 404 分开就是为了堵它。

### 7.6 小程序虚拟支付充值与注销传导（dev-board#427 / #434，**仅大陆站**）

小程序里卖的是「代币道具」，走微信**虚拟支付**（米大师 `/xpay`），与网页扫码的
微信支付 Native 是两条完全不同的通道：钱先进虚拟支付账户、T+3 分账，iOS 端还会被
微信路由到 Apple 支付。官网这侧是 `lib/payments/wxvp-adapter.ts` +
`app/api/wx-mini/push`，订单上记 `channel='wxvp'`。

```bash
# --- 虚拟支付（公众平台 → 虚拟支付 → 基础配置里抄）---
# 现网 AppKey。它是**收款密钥**：进了小程序包就等于把收款能力发出去，
# 因此签名一律在服务端算，AppKey 只存在于本文件。
# WXVP_APP_KEY=<现网 AppKey>
# 沙箱 AppKey（WXVP_ENV=sandbox 时才用到）
# WXVP_APP_KEY_SANDBOX=<沙箱 AppKey>
# OfferID（非密，公众平台基础配置里那个数字）
# WXVP_OFFER_ID=1450637533
# 环境：sandbox | production（缺省 production）。**部署级常量，不按请求切**——
# 切错等于用错密钥验签、用错账本收钱。联调期整站 sandbox，验收后改 production 重启。
# iOS 端的 Apple 支付没有沙箱，只能现网小额真付。
# WXVP_ENV=production

# --- 消息推送（公众平台 → 开发管理 → 开发设置 → 消息推送）---
# 与公众平台那侧填的 Token 同值（自己取，随机长串即可）。
# **未配置 = /api/wx-mini/push 整条路由回空体 404**，与路由不存在不可区分。
# WXVP_PUSH_TOKEN=<随机长口令>
```

还要 `WX_MINI_APP_SECRET`（小程序 AppSecret，dev-board#305 起就在服务器上）：
`jscode2session` 换 openid + session_key、stable_token 调 `/xpay/*` 都靠它。
**session_key 是用户登录态**，只在内存里用于算用户态签名，不落库、不进响应、不打日志。

上线顺序上有一条**先后依赖**：官网这侧部署完、路由起来了，用户才能去公众平台
「消息推送」里填配置（保存时微信会立刻 GET 一次做 echostr 校验，路由没上线必然失败）：

| 公众平台字段 | 填什么 |
|---|---|
| URL | `https://www.aiworkdeck.com/api/wx-mini/push` |
| Token | 与服务器 `WXVP_PUSH_TOKEN` **同值** |
| 数据格式 | JSON |
| 消息加解密方式 | **明文模式**（安全模式的推送会被本路由 400 拒掉，本轮不做 AES） |

**为什么推送与轮询两条腿都要**：`wx.requestVirtualPayment` 的 success 回调会丢
（微信异常退出就丢了），只靠轮询用户付了钱看不到余额；只靠推送则推送延迟时前台一直转圈。
官方文档也明写两者至少实现一个、一起用更可靠。两条腿都**不采信报文里的金额**，
一律回 `/xpay/query_order` 复核后走 `settleFromChannel`，重复到达幂等。

**注销传导（dev-board#434）**：`delete-account` 这个 action 是 `resolve` 的
`create=true` 的对偶——手机端一旦能在官网建号，就落进 App Store 5.1.1(v)
「App 内能建账号就必须能在 App 内删账号」。它复用网页自助注销的同一套闸门与墓碑口径
（`lib/account-deletion.ts`），四种返回：

| 响应 | 含义 | 云后端该做的 |
|---|---|---|
| 200 `{"deleted": true, ...}` | 官网侧已注销 | 继续删本地 |
| 200 `{"deleted": false, "blocker": ..., "message": ...}` | 有闸门（余额可退 / 收益未结 / 分配对账中），官网**一个字节都没写** | 本地也不许删，把 message 原样给用户 |
| 502 `{"error": "key_disable_failed"}` | 远端 AI 通道没作废成功，同样什么都没删 | 本地不删，提示稍后再试 |
| 404 `{"error": "account_not_found"}` | 查无账户或已是墓碑 | 视为官网侧已无可删，继续删本地 |

**`MOBILE_BILLING_RECHARGE_ENABLED=true` 的前置条件就是这条 action 上线**（见 §7.5 末段）。

验证脚本（两站各跑一遍，CI 里已在跑）：

```bash
REPO="$PWD"; d="$(mktemp -d)"
(cd "$d" && NEXT_PUBLIC_AWD_SITE=cn npx tsx --tsconfig "$REPO/tsconfig.json" "$REPO/scripts/verify-wxvp.mts")
# §7.5 的 wx-phone action（dev-board#534）：微信接口用 fetch 打桩，覆盖五种出口
d2="$(mktemp -d)"
(cd "$d2" && NEXT_PUBLIC_AWD_SITE=cn npx tsx --tsconfig "$REPO/tsconfig.json" "$REPO/scripts/verify-wx-phone.mts")
```

它把两个签名算法跟微信官方文档 §2.6 里的示例向量对拍。**这两条是整条链路里唯一
没法靠联调兜底的部分**：签错了微信只回 `-15005` / `-15006` 两个数字，不会告诉你
错在 uri、body 还是 AppKey 选错了环境。

### 7.6b 律所审计日志上报（readiness S20，官网 → 案件库）

方向与 §7.7 相反：入所/退所/被移出、角色变更、建所与重置律所码、官网口令登录失败、账户 Key 签发与吊销只在官网发生，
官网把它们推给**同机案件库**的内部口 `POST {AWD_FIRM_AUDIT_URL}/api/internal/firm-audit`（`lib/firm-audit.ts`），
写进律所管理员在桌面端「设置 → 审计日志」看的同一份日志。后台发送、不挡请求；失败按同一 `eventId` 重试 3 次，案件库按它去重。
不报口令、验证码、Key 明文或哈希；没有律所的账号不报。

```bash
# 同机案件库地址（直连回环，不走公网）与共享密钥（openssl rand -base64 32）。
# 密钥必须与名录 / 计费 / 中转的各把都不同；案件库侧 /opt/aiworkdeck/case/env 配 AWD_AUDIT_INGEST_SECRET=<同值>。
# 两个变量任一未配 = 一条都不发（国际站与本地开发的默认态）。
# AWD_FIRM_AUDIT_URL=http://127.0.0.1:9797
# AWD_FIRM_AUDIT_SECRET=<随机长口令>
```

案件库那侧这条口子只在 case profile 打开，四道闸任一不过回裸 404（开关、密钥、常量时间比较、回环来源）；
公网 nginx 的 `location ^~ /api/internal/ { return 404; }` 同样覆盖它。验证脚本：`npm run test:firm-audit`（CI 两站各跑一遍）。

### 7.7 协作加人的名录查询内部口（dev-board#550 #551，**仅大陆站**）

官方案件库（`case.aiworkdeck.com`，backend.jar 的第二实例）「把同事加进案卷」时，
本地 `app_users` 表里只有**桥接过案件库**的人，于是在官网注册过、也登录过桌面端的
同事会被告知「没有这个用户」（2026-09-10 线上核实：表里只有 3 个人）。这条口子让
案件库回官网按手机号/邮箱确认账户是否存在、以及双方的团队/律所归属，走
`POST /api/internal/collab-directory`。同 §7.4 / §7.5，鉴权是共享密钥，不是 Bearer awdk_：

```bash
# 名录查询内部口共享密钥（openssl rand -base64 32）。
# **必须与 AWD_TRANSFER_BILLING_SECRET、AWD_MOBILE_BILLING_SECRET 都不同**：
# 那两条会扣钱、会建单建号，这条只读名录，一把密钥泄漏不该同时把三件事都交出去。
# 未配置 = 该端点对任何请求都回 404（与路由不存在不可区分），案件库那侧
# `AccountDirectoryClient` 会表现成「未在此服务器开通」并退回今天的本地行为。
# **只有国内站需要配**：案件库只在国内站派生，国际站不配 = 恒 404，这是有意的。
# AWD_COLLAB_DIRECTORY_SECRET=<随机长口令>
```

案件库那侧对应配 `COLLAB_DIRECTORY_BASE_URL=http://127.0.0.1:<本站 next 端口>` 与
`COLLAB_DIRECTORY_SECRET=<同上>`（`/opt/aiworkdeck/case/env`，变量名故意与官网这侧不同，
提醒这是两套配置各自的环境）。

**这条口子只回名录信息，不发任何凭据**：账户是否存在、`username`、`displayName`、
`phone`、以及双方的 `teamId` / `firmId`。**不回**邮箱、头像、角色、团队名、律所名——
案件库只需要 `phone` 去认领桥接用户，其余都是泄露。与 `doc/desktop-contract.md` 里
被否决的「凭 accountId 换任意用户 key」不是一类：那是通用凭据，这条一个字节都不写。
资格判定（同律所或同团队）在案件库那侧，官网只提供归属事实。

**nginx 不需要新加规则**：本路由落在 `/api/internal/` 前缀下，§7.4 那条
`location ^~ /api/internal/ { return 404; }` 已经覆盖。但那条规则在 2026-09-04 之前
只写在本文档里，**上线前仍要按 §7.5 末尾那两条命令逐站核对一次**，不能默认它已经在了
（黑盒判据同样是响应体：nginx 的 404 是自带 HTML，穿透到应用则是空体）。

验证脚本（CI 里两站各跑一遍）：

```bash
npm run test:collab-directory
```

### 7.8 iOS App 内购充值（dev-board#426，**仅大陆站**）

iOS App 里卖的是 App Store 上的消耗型内购商品（大陆版 App `6803309103` 的
`credits.cny.50/100/300`），走 **Apple IAP**——App Store 审核指南 3.1.1 把 App 内
解锁功能的额度充值钉死在 IAP 上，3.1.3 的六类豁免一条都套不上（设计
`2026-09-04-mobile-recharge-design.md` §2.1）。官网这侧是
`lib/payments/appstore-adapter.ts` + `app/api/appstore/notifications`，
订单上记 `channel='appstore'`。

**与其它三条通道最大的不同：服务端不发起收款、也无从回查。** 钱是 iOS 端在
StoreKit 里付给苹果的；App Store Server API 的所有查询端点都要 transactionId，
而建单时还没有交易，**没有任何端点支持用 `appAccountToken` 反查**。所以
`appstoreAdapter.queryCharge()` 恒为 `null`，到账只有一条路：客户端把
`Transaction.jwsRepresentation` 回传给 `confirm-appstore`，官网验签后入账。

```bash
# --- Apple 内购（ASC → App Information / App Store Connect API）---
# App 的 bundle id。验签时逐字比对 JWS 里的 bundleId，不符一律拒。
# APPSTORE_BUNDLE_ID=com.aiworkdeck.mobile.cn
# ASC 上的 App 数字 id（大陆版）。生产环境的验签器**必须**有它，缺了构造都构造不出来。
# APPSTORE_APP_APPLE_ID=6803309103
# 环境：sandbox | production（缺省 production）。**部署级常量，不按请求切**——
# 生产部署收到沙盒交易一律拒，否则任何人都能用 Xcode 里的沙盒购买免费换 Credits。
# 退款通知（Server Notifications）是例外：它按 payload 自称的 environment 分流，
# 因为那条路只会**追回** Credits、从不发币。
# APPSTORE_ENV=production
```

这三个都**不是密钥**（bundle id 与 App id 都是公开信息），但少任何一个
`confirm-appstore` 都会回 `503 payment_channel_unavailable`。

**还有一道站点币种闸：只有 CNY 站点认这条通道。** `lib/payments/appstore-catalog.ts`
目前只有大陆版三档（CNY 面值），真在国际站配上 `APPSTORE_*` 就会按
`credits.cny.50 = 5000` 发 5000 **美分**的 Credits。国际版 `credits.usd.*` 要开时
（先看设计 §1 的结论 1：不进 App Store 小企业计划的话国际版每笔都在亏钱），
得先把目录表做成按站点取，再放开 `appstoreAdapter.isConfigured()` 里那一行。

**三张苹果根证书随代码走**（`lib/payments/apple-roots/`）：
`@apple/app-store-server-library` 的 `SignedDataVerifier` 做完整的 x5c 三级链校验，
但**不内置根证书**。下载地址与 sha256（2026-09-13 取，`scripts/verify-appstore.mts`
的第 0 段每次 CI 都会重新核对）：

| 文件 | 下载地址 | sha256 |
|---|---|---|
| `AppleRootCA-G3.cer` | `https://www.apple.com/certificateauthority/AppleRootCA-G3.cer` | `63343abfb89a6a03ebb57e9b3f5fa7be7c4f5c756f3017b3a8c488c3653e9179` |
| `AppleRootCA-G2.cer` | `https://www.apple.com/certificateauthority/AppleRootCA-G2.cer` | `c2b9b042dd57830e7d117dac55ac8ae19407d38e41d88f3215bc3a890444a050` |
| `AppleIncRootCertificate.cer` | `https://www.apple.com/appleca/AppleIncRootCertificate.cer` | `b0b1730ecbc7ff4505142c49f1295e6eda6bcaed7e2c68c5be91b5a11001f024` |

（最后一张在 apple.com/certificateauthority 的页面上，但 href 指向 `/appleca/`，
且要带常见 User-Agent 才下得动——直接 curl `/certificateauthority/` 那个路径是 404。）
**苹果轮换根证书时要人工同步**，这是这条通道唯一的人工维护项；证书快到期时
上面那段 CI 断言会先红。

**ASC 要配的通知 URL**（App Store Connect → App → App Information →
App Store Server Notifications，**沙盒与生产各填一次**，可以填同一个地址）：

| 字段 | 填什么 |
|---|---|
| Version | **Version 2** |
| Production Server URL | `https://www.aiworkdeck.com/api/appstore/notifications` |
| Sandbox Server URL | 同上（路由按 payload 的 environment 自行分流） |

本轮只处理 `REFUND` / `REVOKE`：苹果对 IAP 有单方面退款权，`REFUND` 是
**退款已经成功之后**才发的通知，不接它用户就能「买 Credits → 向苹果退款 →
Credits 照样留在账上」。其它类型（`CONSUMPTION_REQUEST` / `TEST` / …）记日志回 200。

**内部口新增的 action（§7.5 那条口子，同一把 `AWD_MOBILE_BILLING_SECRET`）**：

`create-recharge` 的 `channel` 多认一个 `'appstore'`（此时 `productId` 必填、
不要 `wxCode`），回 `{"present":"native","outTradeNo":…,"amountCents":…,"appAccountToken":"<UUID>"}`。
iOS 端把 `appAccountToken` 原样交给 `Product.PurchaseOption.appAccountToken(_:)`。
**同一把幂等键重放回的是同一个 token**——换一个新 UUID 等于让已经付掉的那笔购买
再也对不回这张单。

`confirm-appstore`：`{"action":"confirm-appstore","accountId":…,"outTradeNo":"<可省>","signedTransaction":"<JWS>"}`
→ `200 {"status":"paid","paid":true,"amountCents":5000}`（与 `query` 同形状）。
`outTradeNo` 可省：App 被杀、换设备重装后 `Transaction.unfinished` 里的交易可能
配不上本地单号，此时官网用 JWS 里的 `appAccountToken` 反查 `providerRef`。

| 响应 | 含义 | 云后端该做的 |
|---|---|---|
| 400 `{"error":"transaction_invalid"}` | 验签失败 / appAccountToken 或 productId 与订单不符 / 沙盒交易打到生产部署 | 译成 `REJECTED`，**客户端不要 finish 这笔交易**，留给人工 |
| 409 `{"error":"transaction_reused"}` | 这张收据已经结过别的单，或这张已付单收到了另一张收据 | 译成 `REJECTED`（「该交易已使用」）；后者意味着用户可能被扣了两次钱，要告警 |
| 409 `{"error":"settlement_mismatch"}` | 金额/币种/通道三比对不过（正常情况下不该出现） | 归为服务端异常，留人工核查 |
| 404 `{"error":"order_not_found"}` | 单号不存在、不属于该账户，或 appAccountToken 反查不到 | 译成 `NOT_FOUND` |
| 503 `{"error":"payment_channel_unavailable"}` | 本部署没配 `APPSTORE_*` | 译成 `UNAVAILABLE`，提示稍后再试 |

**客户端顺序不能反**：确认返回 `paid` 之后才 `transaction.finish()`；未确认前绝不
finish，否则收据就丢了、这笔钱再也入不了账。

**两条钱的口径（设计 §4.3，改之前先读那一节）**：

1. **IAP 单不发会员充值赠送**。大陆版 IAP 实测净收 84.24%，而 Credits 的综合毛利
   只有 15%~25%；再叠一档最高 10% 的赠送会把这笔单的净利直接打成负数。
   `lib/wallet.ts` 的 `settleOrderPaid` 里有一行 `if (isAppstore) return result;`
   就是它，**不是遗漏，别顺手补齐**。
2. **IAP 到账不计入可退现**。批次仍是 `topup`（IAP 买的 Credits 不许设有效期，
   审核指南 3.1.1 原文），但打上 `sourceKind='appstore'`，`getRefundableCents()`
   把它排除在外。不这么做就有一个现成的套利口：用 Apple 付款买 Credits
   （我们只净收 84.24%），再按注销流程要求 100% 原路退现。

**本轮的已知缺口**：退款追回时若 Credits 已被花掉一部分，**追不回的那部分没有
欠账能力**（wallet 不支持负余额），只会在日志里打一条 `error`
（`退款追回不足：… 需人工处理`）。要接欠账得先给钱包加负余额语义，本轮不做。

验证脚本（两站各跑一遍，CI 里已在跑）：

```bash
REPO="$PWD"; d="$(mktemp -d)"
(cd "$d" && NEXT_PUBLIC_AWD_SITE=cn npx tsx --tsconfig "$REPO/tsconfig.json" "$REPO/scripts/verify-appstore.mts")
```

它用 openssl 现场自签一条三级链（带库真正会检查的两个 Apple 私有扩展 OID），
把「验签通过 → 入账」这条路真跑一遍——苹果不会给我们一张能重放的生产收据，
这段不自己造就只能靠上线后的真钱去试。

## 8. 种子数据（策展账号 + 精选 Skill）

```bash
npm run seed
```

只增不改不删、幂等：已存在的用户名 / Skill ID 一律跳过，可放心在生产执行。

## 9. 国际站 workdeck.ai（新加坡 ECS）

同一份代码、两个部署、**两份数据**。国际站不是国内站的镜像，是一个独立的商业实体：
美元计价、Stripe 收款、香港主体、非中国法、无 ICP 备案、默认英文。
**两站账户不互通**（各自一份 `data/`、一个 SQLite 库、一份 users.json），这是接受的代价。

设计文档在桌面仓 `docs/superpowers/specs/2026-08-08-dual-site-architecture.md`。

### 9.1 分叉点只有一个

`lib/site-config.ts`，由 `NEXT_PUBLIC_AWD_SITE` 驱动（缺省 `cn`，所以北京机什么都不用改）。

**它必须是 `NEXT_PUBLIC_` 前缀**：`i18n-config.ts` 被一批 `'use client'` 组件 import，
`middleware.ts` 跑在 Edge Runtime——这两处的 `process.env` 都是构建期 inline 的，
非 `NEXT_PUBLIC_` 变量在那里恒为 `undefined`，会**静默回落 cn 分支**。

**推论：改 `NEXT_PUBLIC_AWD_SITE` 必须重新 `npm run build`，`pm2 restart --update-env` 不够。**
这与第 2 节说的「改 `.env.local` 加 `--update-env`」是两码事，别混。

### 9.2 新加坡机的形态变化

改造前：`8.219.94.204` 是 `www.aiworkdeck.com` 的**缓存反代**（回源北京）+
`workdeck.ai` 的 geo 分流镜像。
改造后：多跑一个**独立的 Next 进程**承载 workdeck.ai。
`www.aiworkdeck.com` 的缓存反代职责一字不动。

| | 北京 8.152.169.44 | 新加坡 8.219.94.204 |
|---|---|---|
| 域名 | www.aiworkdeck.com | www.workdeck.ai |
| 目录 | `/www/wwwroot/www.aiworkdeck.com/new` | `/www/wwwroot/workdeck.ai/app` |
| PM2 进程名 | `aiworkdeck-website` | `workdeck-intl` |
| 端口 | 3000 | 3000（不同机器，不冲突） |
| `NEXT_PUBLIC_AWD_SITE` | 不设（= cn） | `intl` |
| 数据 | `data/awd.db` 等 | **自己的一份** |

### 9.3 首次部署（2026-08-08 已完成，下面是实录）

新加坡这台机与北京那台有三处不同，照北京的做法直接抄会连着踩三个坑：

**坑 1：没有 aiworkdeck_website 的 git 凭据。**
机上原有的 `songtalk_deploy_key` 是仓库级部署密钥，认证成 `zeweihan/songtalk`，
拉不动本仓库。已新建 `~/.ssh/awdweb_deploy_key` 并作为**只读** deploy key 加进仓库设置，
`~/.ssh/config` 里配了 `Host github-awdweb`。克隆地址因此是
`git@github-awdweb:AI-WorkDeck/aiworkdeck-website.git`。

**坑 2：Python 3.6，node-gyp 编不动 better-sqlite3。**
系统 `python3` 是 3.6.8，node-gyp 11 要 3.8+。已 `dnf install python3.11`，
**但没有改 `/usr/bin/python3` 的指向**——这台机上还跑着 songtalk / fengshui / hr / fskanyu
四个站，动 alternatives 会波及它们。安装时显式指定：

```bash
PYTHON=/usr/bin/python3.11 npm install
```

**坑 3（最阴的一个）：better-sqlite3 的预编译产物要 GLIBC 2.33，本机是 2.32。**
表现极具迷惑性：`npm install` 与 `npm run build` **全部成功**，页面也全部正常渲染
（那些是静态页），只有碰数据库的 API 路由 500，错误只在 `pm2 logs --err` 里：
`ERR_DLOPEN_FAILED: /lib64/libc.so.6: version 'GLIBC_2.33' not found`。

`npm rebuild --build-from-source` 不管用——better-sqlite3 的加载器**优先取
`prebuilds/`**，编出来的 `build/Release/` 它根本不看。所以要覆盖过去：

```bash
cd node_modules/better-sqlite3 && PYTHON=/usr/bin/python3.11 npm run build-release
cp -f build/Release/better_sqlite3.node prebuilds/linux-x64.node
```

编译约 5 分钟且会把 SSH 会话挤掉，**用 `nohup` 后台跑**。
**每次 `npm install` 之后都要重做这两步**，否则会被 npm 用预编译产物覆盖回去。
自检一行：

```bash
node -e 'const D=require("better-sqlite3"); new D(":memory:").exec("create table t(a)"); console.log("OK")'
```

**坑 4：坑 3 的副作用会让下一次 `git pull` 直接失败。**
从源码重建 better-sqlite3 会让 npm 往 `package-lock.json` 里写回一行
`"hasInstallScript": true`，于是这台机的工作区永远是脏的，下次部署第一步就撞上：

```
error: Your local changes to the following files would be overwritten by merge:
	package-lock.json
Aborting
```

`&&` 串联的部署命令到此为止，**后面几步一步都不会跑**，而 PM2 里的老进程还在正常
服务——所以现象是「部署命令跑完了，站点却还是旧版」，不看日志根本发现不了
（2026-08-09 部署 #47 时踩到，卡了半小时才看出来）。

那一行是 npm 生成的、不是手写内容，直接还原即可。把它放进部署命令的最前面：

```bash
git checkout -- package-lock.json 2>/dev/null || true
```

服务器上已存好一份完整的部署脚本 `/root/deploy-intl.sh`（含这道还原、better-sqlite3
重建、自检与 `pm2 restart`），后续更新用 `nohup setsid /root/deploy-intl.sh >
/root/deploy-intl.log 2>&1 &` 跑，然后看日志尾部是否出现 `=== DEPLOY DONE ===`。

### 9.3.1 首次部署命令

```bash
ssh -i ~/.ssh/id_ed25519 -o IdentitiesOnly=yes root@8.219.94.204 'mkdir -p /www/wwwroot/workdeck.ai && cd /www/wwwroot/workdeck.ai && git clone git@github-awdweb:AI-WorkDeck/aiworkdeck-website.git app'
```

然后写 `.env.local`（见 9.4），再：

```bash
ssh -i ~/.ssh/id_ed25519 -o IdentitiesOnly=yes root@8.219.94.204 'cd /www/wwwroot/workdeck.ai/app && PYTHON=/usr/bin/python3.11 npm install && (cd node_modules/better-sqlite3 && PYTHON=/usr/bin/python3.11 npm run build-release && cp -f build/Release/better_sqlite3.node prebuilds/linux-x64.node) && npm run build && PORT=3000 pm2 start npm --name workdeck-intl -- start && pm2 save'
```

**后续更新**（开头必须先还原 package-lock，见坑 4；`npm install` 之后必须重做
better-sqlite3 那两步，见坑 3）：

```bash
ssh -i ~/.ssh/id_ed25519 -o IdentitiesOnly=yes root@8.219.94.204 'cd /www/wwwroot/workdeck.ai/app && git checkout -- package-lock.json 2>/dev/null; git pull && PYTHON=/usr/bin/python3.11 npm install && (cd node_modules/better-sqlite3 && PYTHON=/usr/bin/python3.11 npm run build-release && cp -f build/Release/better_sqlite3.node prebuilds/linux-x64.node) && bash scripts/deploy-build-swap.sh && pm2 restart workdeck-intl --update-env'
```

这条一次跑完约 10 分钟，中途 SSH 会话可能被 better-sqlite3 的编译挤掉，
所以更稳的做法是用服务器上已备好的 `/root/deploy-intl.sh`（见坑 4）。

nginx vhost 的源本在本仓库 `doc/nginx-workdeck-ai.conf`（**已与线上逐字同步**），抄到
`/www/server/panel/vhost/nginx/workdeck.ai.conf`，`nginx -t` 通过再 `nginx -s reload`。
**服务器上改了要同步回仓库**，否则下次有人照着仓库改就会把线上配置改坏。

改造时最容易删掉的两块，删了都不会立刻报错：
- `^~ /lowa-engine/`：桌面端编辑器从这里取 LibreOffice WASM 引擎，wasm/data 存的是
  **brotli 字节**必须带 `Content-Encoding: br`。与站点无关，一字不能动。
- `^~ /.well-known/acme-challenge/` → `/www/wwwroot/acme-aiworkdeck`：证书续期路径，
  删了要等到 90 天后证书过期才发作。

反过来，**必须删掉**的是原先 `/_next/static/` 与 `/_next/image` 反代北京的缓存段：
国际站现在自己产资源，哈希与北京那份对不上，反代过去等于把 JS 换成另一份构建的产物。

### 9.4 国际站的 `.env.local`

```bash
# 站点标识。改它必须重新 build（见 9.1）
NEXT_PUBLIC_AWD_SITE=intl

# 国际站对外联系邮箱（可选，默认 hi@workdeck.ai）
# 缔约主体本身（真善美承澤有限公司 / Zhen Shan Mei Grace Legacy Limited、
# 公司注册编号 79530779、注册办事处地址）已硬编码在 lib/site-config.ts——
# 公司登记资料是公开记录不是密钥，与国内站主体同一形态。
NEXT_PUBLIC_AWD_INTL_CONTACT_EMAIL=hi@workdeck.ai

# 管理后台口令（与国内站**必须不同**，两站是两套数据）
AWD_ADMIN_TOKEN=<随机长口令>

# Stripe。密钥只存在这里，绝不进仓库、绝不进任何聊天记录
STRIPE_SECRET_KEY=sk_live_...
STRIPE_WEBHOOK_SECRET=whsec_...

# OpenRouter（平台 AI 通道的 provisioning）
# OPENROUTER_API_KEY=sk-or-...

NEXT_PUBLIC_BASE_URL=https://www.workdeck.ai
```

**`STRIPE_WEBHOOK_SECRET` 未配置时代码会拒绝所有 webhook**，不留「没配就跳过验签」的分支。
表现与微信侧公钥 ID 配错时一样：收到钱但订单永远不置已支付。配完先用 Stripe CLI 或
Dashboard 的 "Send test webhook" 打一发确认。

Stripe Dashboard 里 webhook 端点填 `https://www.workdeck.ai/api/payment/stripe/webhook`，
**只订阅 `checkout.session.completed` 一个事件**。代码刻意不为
`payment_intent.succeeded` / `charge.succeeded` 写第二个入账分支——
Stripe 对同一笔支付会发多个事件且可乱序可重投，多个分支各入账一次就是重复发 Credits。

### 9.5 两站都要挂的 cron

```cron
# 账本备份（两台机各自跑，路径不同）
0 3 * * * cd <站点目录> && /usr/bin/node scripts/backup-db.mjs >> /var/log/awd-db-backup.log 2>&1

# 【仅新加坡】插件 registry 从北京镜像。国际站没有签名私钥、不能自己上架插件（见 §9.7），
# 只能拉北京已签名的产物。不挂 = 国际站插件广场永远空（dev-board#136 就是漏了这条）。
37 * * * * /usr/bin/bash /root/sync-plugins-from-bj.sh >> /var/log/awd-plugin-mirror.log 2>&1

# data/ 其余持久化文件 + plugin-packs + 云后端数据（两台机各自跑；北京机才有云后端数据）
10 3 * * * cd <站点目录> && /usr/bin/node scripts/backup-data.mjs --extra plugin-packs=/www/wwwroot/plugin-packs --extra cloud-data=/opt/aiworkdeck/cloud/data >> /var/log/awd-data-backup.log 2>&1

# 奖励 Credits 到期作废
0 4 * * * curl -fsS -X POST -H "Cookie: awd_admin=$AWD_ADMIN_TOKEN" http://127.0.0.1:3000/api/admin/credits/expire >> /var/log/awd-credits-expire.log 2>&1

# 遥测 24 个月过期清理（隐私政策已对外承诺，不挂 = 违诺）
0 5 * * * curl -fsS -X POST -H "Cookie: awd_admin=$AWD_ADMIN_TOKEN" http://127.0.0.1:3000/api/admin/telemetry/purge >> /var/log/awd-telemetry-purge.log 2>&1

# 成本台账：拉外部服务余额落快照 + 跌破阈值发预警邮件（dev-board#219）。
# 不挂 = 日耗推算没有数据点、余额见底只有开后台才看得见。
30 8 * * * curl -fsS -X POST -H "Cookie: awd_admin=$AWD_ADMIN_TOKEN" http://127.0.0.1:3000/api/admin/costs/refresh >> /var/log/awd-cost-refresh.log 2>&1
```

后两条做成 HTTP 端点用 curl 调、而不是新写 `.mjs` 脚本，有两个理由：
只有一份到期逻辑（脚本里另写一遍 SQL 迟早与 lib 漂移）；
以及服务器上 `/usr/bin/node` 是 v20，跑碰 `better-sqlite3` 的脚本会**段错误**，
而端点跑在 PM2 的 node 里天然没这个问题。

### 9.6 部署后自检

```bash
curl -s --resolve www.workdeck.ai:443:8.219.94.204 https://www.workdeck.ai/ -o /dev/null -w '%{http_code} %{redirect_url}\n'
```

必须确认的四条：

1. `GET https://www.workdeck.ai/api/license/verify-key` **必须直接可达，不能是 301**。
   桌面端 JDK HttpClient 默认不跟随重定向，一个 301 会被判成「预期外状态」。
   从境内 IP 复验这一条（这正是 geo 分流最容易做错的地方）。
2. 页脚**不出现任何 ICP 备案号**（.ai 不可备案，渲染备案号是虚假标注）。
3. `/en/legal/terms` 的缔约主体是香港实体、争议解决是 HKIAC，不是北京仲裁委员会。
4. 价格显示是 `$` 不是 `¥`。
5. `GET https://workdeck.ai/api/registry/plugins` **返回非空**（与国内站条目一致）。
   空数组说明 §9.7 的镜像没挂或没跑过——国际站插件广场会是空的（dev-board#136）。
6. **美国分站 aiworkdeck.us 也要过一遍**（§9.8）：`/en` 200、页脚是 `Zhen Shan Mei Grace Legacy US Limited`、
   `/en/about` 是特拉华州主体；而 `/en/legal/terms` 的缔约主体**仍是香港实体**（这是有意的）。
   两个 Host 打的是同一个进程，代码坏了两边一起坏，nginx 坏了只坏一边——所以要分别看。

### 9.8 美国分站 aiworkdeck.us（dev-board#569，2026-09-10 上线）

**不是第三个站**。aiworkdeck.us 是美国公司（Zhen Shan Mei Grace Legacy US Limited）名下的域名，
解析到新加坡机，nginx 第二个 vhost 反代**同一个** `workdeck-intl` 进程：同一份数据、同一套账户、
同一个 `NEXT_PUBLIC_AWD_SITE=intl` 构建。与 workdeck.ai 的差别只有两处，全部按请求的 Host 判断
（`lib/site-config.ts` 的 `publicEntityForHost` + `lib/request-entity.ts`）：

- 页脚与公司页 `/{lang}/about` 展示美国主体与发起人信息（供美国来的合规核验当公开来源）。
- 其余不变：法律文本的缔约主体仍是香港公司（Stripe 收款主体没变），canonical / hreflang /
  sitemap / robots 全部仍指 workdeck.ai——.us 对搜索引擎是国际站的**别名**，不是第二个站。

分流：`workdeck.ai` 对**美国 IP** 的访客 301 到 `www.aiworkdeck.us`（`/api/`、`/update/`、`/_next/`
照旧不做任何 301；搜索引擎与社交预览爬虫豁免，否则 Googlebot 从美国抓取会把整站换成 .us）。
.us 自己对境内 IP 的 301 回国内站与 workdeck.ai 一样。

服务器上的东西（都在新加坡机）：

| 项 | 位置 |
|---|---|
| vhost | `/www/server/panel/vhost/nginx/aiworkdeck.us.conf`——**从 `doc/nginx-workdeck-ai.conf` 的 server 块 sed 派生**，命令在那个文件头部；改了 workdeck.ai 的 server 块必须重新派生 |
| 美国 IP 清单 | `/www/server/nginx/conf/us_ip.conf`，由 `/www/server/nginx/conf/gen-us-ip.py`（源本 `deploy/nginx/gen-us-ip.py`）生成，cron 每月 1 日 04:23 |
| 证书 | certbot `aiworkdeck.us`（webroot，账户 46c4…），续期钩子 `reload-nginx.sh` 通用 |
| 日志 | `/www/wwwlogs/aiworkdeck.us.log`（与 workdeck.ai 分开，看流量时别漏） |
| 拨测 | 北京机 `site-probe.json` 多了 `aiworkdeck.us 美国分站` 一条（从北京看到的是 301 回国内站，算通） |

核对办法（维护者在境内，没有美国出口）：`geo $awd_from_us` 带 `proxy 127.0.0.1`，在新加坡机上
用 X-Forwarded-For 冒充：

```bash
# 美国访客打 workdeck.ai → 301 到 .us
curl -s -o /dev/null -w '%{http_code} %{redirect_url}\n' -H 'X-Forwarded-For: 8.8.8.8' \
  --resolve www.workdeck.ai:443:127.0.0.1 https://www.workdeck.ai/en
# Googlebot 从美国抓 workdeck.ai → 200（豁免）
curl -s -o /dev/null -w '%{http_code}\n' -A 'Googlebot/2.1' -H 'X-Forwarded-For: 8.8.8.8' \
  --resolve www.workdeck.ai:443:127.0.0.1 https://www.workdeck.ai/en
# 美国访客打 .us 自己 → 200，不许自己 301 自己
curl -s -o /dev/null -w '%{http_code}\n' -H 'X-Forwarded-For: 8.8.8.8' \
  --resolve www.aiworkdeck.us:443:127.0.0.1 https://www.aiworkdeck.us/en
# 桌面端接口面对美国 IP 也不许 301
curl -s -o /dev/null -w '%{http_code}\n' -X POST -H 'X-Forwarded-For: 8.8.8.8' \
  --resolve www.workdeck.ai:443:127.0.0.1 https://www.workdeck.ai/api/license/verify-key
```

### 9.7 插件 registry：北京是唯一真源，国际站只镜像

插件签名私钥 `AWD_PLUGIN_SIGNING_KEY` **只在北京**（桌面端内置的验签公钥两站共用）。
国际站没有私钥，`approvePlugin` 会以 `signing_not_configured` 失败——**它不能自己上架插件**，
只能服务北京已签名的产物。skill registry 不同：skill 是纯文本、从 repo `content/seed`
构建期 seed，两站天然各有一份；插件是运行时上传+签名的，只有北京有。

镜像脚本 `scripts/sync-plugins-from-bj.sh`（新加坡机上放 `/root/`，§9.5 cron 每小时跑）：
用 `sg_to_bj` 密钥从北京 rsync `data/plugin-files/` + `data/plugins.json`（先字节后清单，
清单原子替换），本站 `/api/registry/plugins` 现读 fs 直出、无需 pm2 restart。

**发新插件的完整动作 = 北京 `publish-plugin` 上架 + 等国际站 cron 同步（或手动跑一次镜像脚本）。**
只在北京上架、不同步 = 国际站装不到（dev-board#136 就是这么漏的）。国际站的
`data/plugins.json` 由镜像单向覆盖，别在国际站手工改它。

如果你执行了 `git pull` 和 `npm run build`，但网站依然显示旧内容，可能是因为 **Next.js 构建缓存** 或 **PM2 进程** 未正确重载。

请尝试执行以下「强制更新」流程：

1.  **删除旧构建文件 (关键)**：
    ```bash
    rm -rf .next
    ```
2.  **重新构建**：
    ```bash
    npm run build
    ```
3.  **彻底重启 PM2 进程** (先删再起，比 restart 更彻底)：
    ```bash
    pm2 delete aiworkdeck
    pm2 start npm --name "aiworkdeck" -- start
    ```
4.  **浏览器缓存**：
    确保你在浏览器使用了无痕模式 (Incognito) 访问，或者强制刷新 (Mac: `Cmd + Shift + R`, Win: `Ctrl + F5`)。

---

## 11. 发版窗口：为什么不是 `npm run build`

**两条部署路径（CI 的国内站、服务器上的 `/root/deploy-intl.sh`）都跑
`bash scripts/deploy-build-swap.sh`，不要改回 `npm run build`。**

### 就地构建会打断正在服务的站点

`next start` 在跑的时候就地 `next build`，会把正在服务的 `.next` 边写边换。
已经被请求过的路由不受影响——它们的模块早进了 Node 的 module registry，不再碰盘；
**但任何还没被加载过的路由，整场构建期间都是 500**。

本地实测（2026-08-18）：18 秒的构建里，83 次冷路由请求有 **50 次 500**，
坏在 +0.8s ~ +20s。生产机内存小、构建以分钟计，窗口只会更长；低流量站在上次重启后
大部分路由本来就是冷的。这也解释了为什么这个问题一直没被发现——热路由一切正常，
访问日志里只是零星 500。

`deploy-build-swap.sh` 把构建挪到 `.next-build`，成功后才原子换入。换完之后：

- 构建期间线上完全不受影响（老 `.next` 一个字节没动）；
- **构建失败线上继续跑旧版本**，不再留下没有 BUILD_ID 的残缺产物
  （`next.config.ts` 里记的 2026-07-27 事故形态，此前只靠「生产构建不跑类型检查」缓解）；
- 上一份产物留在 `.next-old`，可以一条命令回滚。

剩下的窗口只有 pm2 重启那一两秒。

### 回滚

构建是好的但代码有问题时，不用等重新构建：

```bash
ssh -i ~/.ssh/id_ed25519 root@8.152.169.44 'cd /www/wwwroot/www.aiworkdeck.com/new && mv .next .next-bad && mv .next-old .next && pm2 restart aiworkdeck-website --update-env'
```

### `AWD_BUILD_DIST_DIR` 只能行内赋值

`next start` 读的是同一份 `next.config.ts`。这个变量一旦进了 shell 环境，
`pm2 restart --update-env` 会把它带进运行时，线上进程就去读暂存目录了。
`deploy-build-swap.sh` 用的是行内赋值，`scripts/verify-deploy-swap.sh` 钉着这一条。

### 上游不在时的兜底页

重启那一两秒（以及进程真的崩掉时）nginx 默认给的是白底 `502 Bad Gateway`。
`deploy/nginx/` 下三个文件是兜底：`unavailable.conf`（片段）、`503.html`、`503.json`。

**这是兜底不是维护开关**：没有任何标志位要人去设、去清，也就不存在「部署挂在半路、
站点永远停在维护页」这种状态；上游一活过来自动恢复。

装法（两台都要）：

```bash
# 页面与 JSON（两台同路径）
scp deploy/nginx/503.html deploy/nginx/503.json root@<host>:/www/wwwroot/awd-maintenance/
# 国内站：宝塔的 extension 目录，vhost 里已有 include .../extension/www.aiworkdeck.com/*.conf
scp deploy/nginx/unavailable.conf root@8.152.169.44:/www/server/panel/vhost/nginx/extension/www.aiworkdeck.com/awd-unavailable.conf
# 国际站：vhost（源本 doc/nginx-workdeck-ai.conf）里 include 这个路径
scp deploy/nginx/unavailable.conf root@8.219.94.204:/www/server/nginx/conf/awd-unavailable.conf
# 两台都要
ssh root@<host> 'nginx -t && nginx -s reload'
```

验证方法是**加一个指向死端口的临时 location**，不要真去停 pm2：

```nginx
location ^~ /__awd_503_probe { proxy_pass http://127.0.0.1:59999; }
location ^~ /api/__awd_503_probe { proxy_pass http://127.0.0.1:59999; }
```

reload 后 `curl` 这两条，页面应当是 **503 + text/html**、接口应当是 **503 + application/json**，
测完把临时 location 删掉再 reload。

**`error_page` 那行的 `=503` 不能省。** 写成 `= @awd_unavailable`（不带状态码）时响应会变成
静态文件的 **200**——实测踩到，后果是实打实的：官网表单侧 `res.ok` 为 true，
登录表单会把这张兜底页当成登录成功直接跳转；搜索引擎也会把它当正文收录。

**`if` 里只能用 `rewrite ... break`。** `default_type` 写在 `if` 里 `nginx -t` 直接报
`directive is not allowed here`，所以 JSON 不是 `return` 出来的，而是让 nginx 去发一个
真的 `.json` 文件，Content-Type 交给 mime.types。

## 12. 原生资源包（native pack）分发

第四种分发形态：被代码消费的重资源（脚本运行时 / 平台二进制 / 静态资产）。
契约见桌面仓 `docs/NATIVE_PACK_DISTRIBUTION.md`；官网这边只做**受理、审核、签名、出发布件**，
上架是服务器上的一条命令。

### 12.1 两台都要做的一次性配置

```bash
# 1) 静态镜像目录（nginx 直出，不经 Node 应用层）
mkdir -p /www/wwwroot/plugin-packs

# 2) nginx 两段：^~ /plugin-packs/ 与 ^~ /api/packs/upload
#    国际站源本在 doc/nginx-workdeck-ai.conf；**国内站走宝塔面板，要手工抄一份过去**
nginx -t && nginx -s reload
```

`/api/packs/upload` 那段是全站唯一放大 `client_max_body_size` 的路由（320m），
并且必须带 `proxy_request_buffering off`——否则 nginx 会先把整个几百 MB 的请求体
落到自己的临时文件里，应用侧的流式落盘就成了摆设。其余路由维持 100m 不要动。

### 12.2 环境变量

pack 与 JAR 插件**共用同一对 Ed25519 密钥**，没有新增变量：
`AWD_PLUGIN_SIGNING_KEY` 未配置时后台的「通过并签名」按钮直接禁用。
公钥即桌面端的 `ai.plugins.registry-public-key`。

### 12.3 上架一个通过审核的资源包

后台点「通过并签名」只产出发布件到 `data/pack-publish/<id>/<version>/`（outbox），
**不会上架**。推镜像与切指针是这条命令：

```bash
cd <站点目录>
scripts/publish-pack-outbox.sh <id> <version> --check   # 先只验产物
scripts/publish-pack-outbox.sh <id> <version>           # 落地 + 切指针
```

幂等，可重复跑。**两台都跑完、都验过才对外宣布**——只推一台就切指针，另一台会给
客户端 404（lowa r4 踩过一次）。新加坡侧按 lowa-engine 的惯例用 `sg_to_bj` 密钥
从北京拉同一份目录，拉完在 SG 上再跑一次本脚本。

封禁一个已上架的包：后台点「封禁下架」（客户端沿 `/api/registry/packs/revoked` 拉取），
**同时**手工把镜像上的版本目录删掉并把 `<id>/manifest.json` 指针回退，
否则封禁只挡住已装用户，新装的人照样能下到。

### 12.4 磁盘

`data/pack-submissions/`（提交件）与 `data/pack-publish/`（发布件）各存一份完整字节，
单个提交上限 300 MB，也就是一个包最多占 600 MB。生产机磁盘不宽裕，
**上架并两台验证完成后，可以删掉对应的 `data/pack-publish/<id>/<version>/`**
（镜像上那份才是对外服务的）；`data/pack-submissions/` 是审核留底，
驳回的提交已由受理逻辑自动删除，通过的按需人工清理。

这两个目录与 `data/packs.json` 都是持久化资产，纳入服务器备份口径时别只想着 `awd.db`。

### Pro 分账升级待发布核对（2026-10-11，dev-board#1187）

本变更仅代码交付，不触发部署。未来获明确发布授权后：先备份 `data/awd.db`（含 WAL 一致性），升级会自动执行迁移 36，新增 `subscription_period/subscription_usage/subscription_preferences` 及 `openrouter_keys.fundingJson`，不重写旧钱包和支付订单。先部署官网再配套桌面/云端，以便后者读到新增 `subscription`；旧客户端原余额字段仍可读。

已有已付 Pro 订单首次读取即幂等补足周期，未来周期不可提前消费；配额取 `lib/saas-pricing.ts` 的初值并写周期快照。确认本次定价数值后再上线，勿把调价当成修改历史周期。执行 `verify-subscription-allowance`、`verify-pro-subscription`、`verify-credits`、`verify-gateway`、`verify-transfer-billing`、`contract-check` 与 `verify-mobile-billing`（空临时目录，测试数据库不得指向生产）。确认现有 `/api/admin/ai/reconcile` 定时任务正常，并用测试账户检查零钱包 Pro、周额度用尽、超额钱包开关关闭/开启、订阅到期与服务退款。不要对真实用户发起收费调用进行验证。

OpenRouter 仍是桌面直连和异步回抄，边界见 `doc/desktop-contract.md` 新增分账章节。Pro 支付的整单退款尚无自动业务入口；回滚二进制前须评估旧版本不认识独立额度池的情况，数据库不要反向删除新账表。

## 149 元 Pro 的周期额度与分账（dev-board #1187/#1189）

`lib/saas-pricing.ts` 的 `SUBSCRIPTION_LIMITS` 是默认额度单一来源：74500 cents / 30 天、20000 cents / 7 天，即 745 / 200 Credits。2026-10-11 用户追加要求按 ¥149 对应 745 Credits 同步更新周/月额度；周 200 沿用此前对应方案。两道上限同时生效，前三周各用 200 后本周期只剩 145。价格仍为149元、微信一次性购买30天，不是自动续费。

数据库新增 `subscription_period`、`subscription_usage`、`subscription_preferences`。每笔已付 `pro_payment` 幂等补周期，含旧付款、预续费及历史年付；每周期快照额度，调默认值不会追改已发周期。充值/奖励 `credit_lots` 与 `wallet_ledger.amountCents` 继续只记钱包余额变动；服务消费 meta 同时记 `billedCents/subscriptionCents/walletCents`，周期消耗另在 usage 表。网关失败退款回原周期、原周，不转成钱包、不补到新周期。Pro订单整单退款未新增支付通道。

`/api/account/{me,wallet,ai-usage}` 和 `/api/internal/account` balance 返回 `subscription`：active、expiresAt、periodStart/End、monthlyLimit/UsedCents、weeklyStart/End、weeklyLimit/UsedCents、availableCents、walletFallbackEnabled、cloudStorageBytes、relayBytes。钱包余额字段语义不变；ai-usage.creditsCents是当前可用AI额度，另带walletBalanceCents。`/api/account/subscription` GET/PATCH查询/切换超额钱包支出；默认关闭，不自动花充值余额。到期附赠功能停止，单独购买永久功能仍保留。

OpenRouter 桌面直连保留既有子key机制：按可用金额设limit，并经现有cron/读额度对账。它不是逐请求代理，可能存在同步窗口内已在途消费、用量延迟或跨周期结算；短缺记 `admin_audit.ai_usage_shortfall`，不能宣传绝无超用。部署前须确认原cron正常，不能只上线页面。`verify-subscription-allowance.mts` 使用隔离临时数据库与上游桩验证，不证明生产真实付款/扣费已完成。

发布顺序需另获用户授权：官网账本/API → 云后端目录/持久存储与200MB临时池 → 新桌面和手机。旧客户端仍用原device/key路由，新的统一目录接口返回projectUid与locations。只有官网改好不代表云端已落实3GB；上线后专用QA账户须走完整路径。现存超过200MB临时配额的文件仍可下载/确认，不追删；新增上传等腾出空间。服务器密钥继续按外部服务总表原位管理，不在此复制。

跨期结算回归覆盖 AI 到期、转写与同步网关跨周/跨周期/跨到期：已授权工作沿原 `periodId/weekStart/walletAllowed` 结算，未授权现金不可扣；原订阅 AI key 到期默认停用，用户可在账户页明确开启钱包续用。仅累计用量的 OpenRouter 直连仍无法逐请求辨别切换时尚在途或延迟上报用量，生产不能据此宣称逐 token 严格周期归属。

### 维护者后台双站切换（dev-board#1596）

`/zh/admin` 与 `/zh/admin/telemetry` 顶部可选择国内站/国际站，选项保存在当前页面
`adminSite=cn|intl` 参数中。登录只校验入口站的 `AWD_ADMIN_TOKEN`；所有远端管理请求
（含社区管理、反馈附件、账本票据和 CSV/资源包下载）由入口站服务器受限转发。
两站数据库、用户登录、账务及币种保持分离，不做数据合库或同步。

启用前需先将本版本部署到两站，以提供 `X-AWD-Admin-Site` 响应标识。仅需要国内入口时，
只在北京官网原有 `.env.local` 新增 `AWD_ADMIN_RELAY_TOKEN`，值对应国际站现有
`AWD_ADMIN_TOKEN`；若也需要从国际入口管理国内站，则在新加坡原有 `.env.local`
配置同名变量，值对应国内站管理口令。凭据仍按基础设施总表在服务器原位管理，不进入
仓库、任务卡、浏览器配置或构建公开变量。轮换目标站管理口令时须同步更新入口站配置。
更新运行环境后按既有 PM2 流程加载环境。本次代码交付不等于已经配置或部署。

这是明确的管理信任：配置后，持有入口站管理口令的人可管理两站。未配置时本地后台照常
使用，远端 tab 显示“尚未连接”；远端认证失败、响应站点不符、跳转或网络故障均报连接
错误，绝不回退到本地数据。上游域名固定为站点配置中的官方 HTTPS 域名，不接受任意 URL。
普通接口超时 30 秒，附件/资源包下载 5 分钟；上传请求上限 12 MiB，下载流式传输。
切换站点会重建面板，清空未保存表单；旧请求只可能完成在原目标，不会改写新站点表单。
服务端不转发浏览器 Cookie/Authorization，上游 Cookie 和重定向不返回浏览器。
生产写操作只接受本入口站已登记的 HTTPS Origin（兼容 Nginx 后的内部 HTTP 地址）。

验证：`npx tsx --tsconfig tsconfig.json scripts/verify-admin-relay.mts`，分别在
`NEXT_PUBLIC_AWD_SITE=cn` 和 `intl` 执行；CI 双站契约任务已纳入该测试。测试使用合成
凭据/网络响应，不访问生产服务；正式配置后仍需验收实际国内登录→国际 tab→统计与下载。

## 专用 App Review 赠予授权（dev-board#1622）

`scripts/grant-review-access.mts` 是维护者在服务器运行的受限操作工具，不是公网接口。
仅处理代码固定的 Apple 专用审核邮箱，且必须同时通过北京云端原位
`/opt/aiworkdeck/cloud/env` 中的审核身份列表、只读数据库既有用户检查和正常审核登录。
`--cloud-user-id` 必须是事先核实的原审核用户 ID；不能用新建用户代替。配置有多个身份时
只选该邮箱，不取列表第一项，也不会为其他审核身份授权。码、账户 Key、runtime key
不写文件、不写审计、不打印；输出只有状态、业务 code 和固定错误分类。

首次 `grant` 建立或复用无付款/余额/订阅历史的专用官网账户，经正常桥接认回原手机用户。
赠予记录写入 `admin_audit`，引用为 `complimentary-review:<grant-id>`；同时写三段连续
30 天标准预算周期和到期的 `pro` 权益，共 90 天。没有支付订单、`pro_payment`、现金
或注册赠额；钱包续用关闭，普通计费规则不变。标准周期额度取 `SUBSCRIPTION_LIMITS`。
同 ID、同理由重跑只恢复未完成的关联，不改起止日、不补回已用额度、不追加周期；同 ID
改身份或理由拒绝。撤销或过期的 ID 不能重开，另一 ID 也不能叠加到该账户已有赠予上。

不需要构建、重启或发布整站。审阅和隔离测试通过后，可只把两个新文件按原相对目录上传到
root 专属目录（目录 0700、文件 0600）：

```
/root/awd-review-access-1622/lib/review-access.ts
/root/awd-review-access-1622/scripts/grant-review-access.mts
```

在**北京现有官网工作目录**运行，使用生产应用相同的 Node 解释器和该目录已有的
`node_modules/tsx/dist/cli.mjs`，`--tsconfig` 指向官网现有配置。例如先进入
`/www/wwwroot/www.aiworkdeck.com/new`，再执行（替换已核实的用户 ID）：

```sh
NODE_OPTIONS="${NODE_OPTIONS:+$NODE_OPTIONS }--dns-result-order=ipv4first --no-network-family-autoselection" node node_modules/tsx/dist/cli.mjs --tsconfig tsconfig.json /root/awd-review-access-1622/scripts/grant-review-access.mts status --grant-id app-review-1622 --cloud-user-id <confirmed-id>
NODE_OPTIONS="${NODE_OPTIONS:+$NODE_OPTIONS }--dns-result-order=ipv4first --no-network-family-autoselection" node node_modules/tsx/dist/cli.mjs --tsconfig tsconfig.json /root/awd-review-access-1622/scripts/grant-review-access.mts grant --grant-id app-review-1622 --cloud-user-id <confirmed-id> --reason 'dev-board#1622: Apple review access, 90 days'
```

工具从当前官网目录加载原位 `.env.local`，通过该目录 tsconfig 的 `@/lib` 解析现有
业务库；不把数据库或 env 复制到脚本目录。 本轮北京原位实测，独立 Node CLI 的默认 fetch 对管理 API 连接超时，经真实业务库连续两次只读复验，须在本次进程环境 `NODE_OPTIONS` 同时传入 `--dns-result-order=ipv4first --no-network-family-autoselection` 后该组合的两次真实业务库只读请求均返回 HTTP200。tsx 会启动子进程，直接在父 node 命令加 flag 不会继承；仅 ipv4first 仍曾超时。上述写法保留原有选项并只作用于本次运行，不修改普通网站网络配置。不应在未知版本、测试目录、国际站或默认 Node
ABI 不同的环境执行。运行账号须能以 postgres 身份只读检查 `aiworkdeck_cloud`。
执行前按现有服务器备份流程，同时保留 `data/awd.db` 的一致性 SQLite 备份与
`data/users.json` 的原位备份（账户仍在 JSON 中，只有数据库备份不够）。不要把密钥或
用户数据下载到本机、任务附件或脚本 bundle。

关联时临时生成 `awdk_`，走现有 `/api/auth/awdk-login`，确认返回的是原审核用户；
此外检查云端 `/api/platform-ai/key/status`、官网真实 provider 额度及订阅。
`tryProvision` 本身会吞失败，因此桥接 `code:0` 不等于开通成功。最终分别撤销该次
`awdk_` 和 `awdt_`；撤销账户 Key 不会删除已加密保存的个人 runtime key。桥接响应丢失时
按本次随机设备名查找并清理，不撤销原有设备。临时 Key ID 和随机设备名（均非凭据）在
出站前写入审计；同 ID 重跑会先清理前一次未完成记录。任何部分失败会退出非零，保留赠予记录供
同 ID 重试；不要另换 ID 重复发放。

工具不替用户同意资料处理。取得授权后，在该专用审核账号中用正常界面/API明确启用备份、
日程和助理，并只放合成审核材料。最后用正常流程完成一轮实际助理及日程验证；这会产生
真实 provider 消费，不能把上述只读状态/额度检查称为已经调用 AI。

撤销时使用原 ID：

```sh
NODE_OPTIONS="${NODE_OPTIONS:+$NODE_OPTIONS }--dns-result-order=ipv4first --no-network-family-autoselection" node node_modules/tsx/dist/cli.mjs --tsconfig tsconfig.json /root/awd-review-access-1622/scripts/grant-review-access.mts revoke --grant-id app-review-1622 --cloud-user-id <confirmed-id>
```

撤销先结束本赠予的周期和仍由它持有的权益，再同步真实 provider 上限并复查。
provider 不可达或降限失败时保留 `revocationPending=true`，须重跑，不能报告已全部撤回。
保留审计和用量，不删除账户、合成资料或后来真实购买的订阅。正常到期按现有订阅门禁生效；
runtime key 不因 SQLite 到期自动删除，provider 上限仍须既有额度同步或上述 `revoke`
动作回收。审核完成应主动执行撤销；不要把缓存密钥存在当成仍有订阅，也不要把本地过期
当成已验证 provider 停用。普通余额查询有短缓存，撤销后立即看到旧状态时须等缓存过期复核。

隔离验证（所有云端/provider响应均为合成，不访问生产）：

```sh
task_review_root="$PWD"
task_review_tmp=$(mktemp -d)
cd "$task_review_tmp"
NEXT_PUBLIC_AWD_SITE=cn "$task_review_root/node_modules/.bin/tsx" --tsconfig "$task_review_root/tsconfig.json" "$task_review_root/scripts/verify-review-access.mts"
```

另在源码树运行 `npm run check`，并在空临时目录运行既有
`scripts/verify-subscription-allowance.mts`、`scripts/verify-pro-subscription.mts`。

## 国内平台 AI：百炼（dev-board#1625）

国内构建 `NEXT_PUBLIC_AWD_SITE=cn` 使用北京接入点百炼；国际构建继续 OpenRouter。国内缺配置时明确不可用，不自动回落 OpenRouter。供应商密钥只保留服务器环境：

- `DASHSCOPE_API_KEY`：百炼专用业务空间 API Key；不把阿里云 AK/SK 当模型 Key，不下发共享 Key。
- `BAILIAN_WORKSPACE_ID` 与 `BAILIAN_BASE_URL=https://<workspace>.cn-beijing.maas.aliyuncs.com/compatible-mode/v1`。
- `BAILIAN_DEFAULT_MODEL=qwen3.8-flash`（默认值）。可用模型/工具/视觉能力及阶梯价格来自百炼目录；需要同时在业务空间授予相应模型权限。未知计价单位、价格区间或缺输出单价的模型不提供聊天调用。
- `AWD_KEY_ENCRYPTION_SECRET` 沿原位使用，派生 AI 专用 `awdai_` 签名令牌；令牌绑定本站、用户与未撤销的账户 Key，不能调用账户管理 API。撤销账户 Key 同时撤销该 AI 令牌。

客户端 `POST /api/account/ai-key` 携带 `X-AWD-AI-Protocol: 2`；国内返回 `provider=bailian`、同站 `baseUrl=/api/account/ai/v1`、`apiKey=awdai_...` 和 `defaultModel`，旧客户端得到 `client_upgrade_required`，不会继续领 OpenRouter Key。网关的 `/models`、`/usage`、`/chat/completions` 使用限权令牌。国际保留既有 `openrouterKey` 兼容字段。

百炼请求在现有 Credits / 订阅账本内预扣上界，保存请求 ID、模型价格快照、汇率、原资助周期；接收供应商可信 usage 后，同一事务原路退预占并按实际用量扣款。用户断线仍继续读取有时限的供应商回执。模型内容与完整请求不落账本；只保存请求哈希、用量和价格。图片/音频输入按模型输入上限保守预占，实际扣款仍按回执；余额不足不会发起付费请求。

旧国内 OpenRouter Key 在账户首次迁移时先远端禁用，再查询累计用量结清；原记录与历史金额不重写。`POST /api/account/ai-key` 在 `await retireOpenRouter(user.id)` 完成后才返回新令牌，国内额度同步同样先完成该账户迁移。延迟用量由原 `reconcileAllQuotas` 后台对账入口继续回查，正常百炼请求不持续依赖 OpenRouter。

首次上线按以下顺序执行，**不要先批量停用旧 Key 再等待网站 CI 与构建**（dev-board#1637）：

1. 确认支持协议 2 的正式桌面完整包、签名更新清单与镜像已实际可下载；云 Java 先完成暂存。备份两站数据库、配置及可恢复的网站产物/依赖，核对账户与配置隔离，锁定本次网站 SHA。
2. 启动两站既有部署流程，旧 Java 暂时保持。当前 `ci.yml` 只有 check/contracts 前置门禁，没有“构建完成后暂停激活”的输入；不得按预计时长提前切云。国内新站实际激活且只读模型目录检查通过后，立即衔接北京 cloud、case 和新加坡云 Java 切换，逐处检查健康，减少新旧凭据协议不匹配的窗口。
3. 两站网站与云服务均就绪后，再用目标国内站的原 cwd、原环境，按账户逐一执行 `scripts/platform-ai-reconcile.mts migrate-account USER_ID`，结清剩余活跃旧 Key，并复查已自动退役的记录。不要读取或停用国际站的 Key，不以真实用户登录或试问代替迁移验收。
4. 第一处失败即停止批次，保留退出状态与断点，不输出凭据或原始上游响应。检查活跃旧 Key 数量、退役记录的 `lastCheckedAt`，并通过管理 API 只读核对远端 `disabled`、累计用量与本地结算水位。`settleUsage` 现有每 Key 0.005 USD 阈值内差额应如实记录，不能把阈值内余量称为绝对归零。按账户重查沿既有事务水位结算，不能重复扣费或把未知用量当作零。

**上游停用不能靠文件回退恢复。** 新站激活后，即使批处理尚未开始，也可能已有账户自动迁移；不能以“没有运行批处理”推断无人迁移。恢复 `.next-old`、环境文件、SQLite 或本地 JSON 都不会重新启用远端 Key。停用请求超时先只读查询远端状态；停用成功但结算失败则保留待核实记录并完成对账，不还原整库丢掉其间订单、支付或用量。网站构建层回退也须先核实已迁移范围，禁止旧版本继续签发旧凭据。当前工具没有已验证的重新启用流程，优先修复新站继续服务；若需恢复旧供应商，须另行核对远端状态、额度、撤销记录与结算水位，不能批量启用后声称回退成功。

验证范围：上述顺序与恢复边界基于 `ai-key`、额度同步和 `retireOpenRouter` 的源码契约核查，不是生产迁移完成的证明。实际部署、退役/结清、隔离付费验收和旧手机重新登录恢复的已验/未验范围，应分别记录在当次发布回执；没有真实回执不得标为已验证。

运维工具必须在目标站原 cwd 和环境运行（不输出供应商凭据）：`list` 查看未决记录，`reconcile` 回收超时预占并复查旧 Key；已发上游但 15 分钟没有可核实回执的请求原路退款并记 `refunded_pending`，所有新平台 AI 请求暂停，禁止把未知用量认作零。维护者核实供应商账单后，用 `close-refunded-incident USER_ID REQUEST_ID INCIDENT_REFERENCE` 留审计引用解除；此动作不追扣已退款用户。旧 Web AI 的独立有限恢复和熔断机制继续保留。

北京接入点不等于所有模型均只在中国大陆推理；数据处理范围按百炼各模型当前服务说明，不对用户承诺全模型境内或零留存。

`BAILIAN_AUTHORIZED_MODELS_FILE` 指向运维导出的非密 JSON（`workspaceId`、`updatedAt`、`models: string[]`），必须与配置工作空间一致。目录只展示此授权快照与供应商实时目录、可计价能力的交集；缺少快照时拒绝提供模型。新增模型授权后更新快照，无需把密钥写入该文件。

Skill 帮写保留原“免费且限流、额度不足由平台承担”政策；国内流读取与页面断连解耦，按请求开始时价格、毛利和资助周期结算，仅保留轻量 `skill_ai_request` 回执，不保存 prompt。缺回执明确显示 `ai_usage_pending` 且暂停新免费调用，不显示零费用。`skill-list` 查看未决回执；供应商账单核对后可执行 `skill-close-incident USER_ID REQUEST_ID INCIDENT_REFERENCE`，未核实成本由平台承担，留审计引用，不事后追扣。

## CI 预构建 Next 产物（dev-board#1648，仅准备，不部署）

Next16.4.3 Turbopack 曾在生产小内存机器造成 OOM；构建到暂存目录能保护旧 `.next`，
但不能隔离系统内存和依赖目录。新增 `next-build-artifact.yml` 只接受手动触发，
没有 SSH、部署、种子或重启步骤。PR／push 不触发它，也不替代既有发布审核。

输入须为实际审阅的40位 `source_sha`、已有Web构建的 `web_run_id`、两站公开配置JSON。
工作流源码检出到 `ops/`，应用按显式SHA另检出到 `app/`；合并CI工具不偷换应用来源。
固定Node22.23.2、`npm ci`，两站分别以 `npm run build -- --webpack` 构建，
保留原prebuild门禁；provenance记 `buildMode: webpack`，消费者也须核对。`41191464127` 的whole因部署失败而红，
但同来源23e的 `Typecheck + Build` 成功，`web-workbench-<SHA>` 可按官方artifact digest、
内层tar摘要及原 `web-artifact.mjs verify` 核验后复用；保留whole失败记录。
`AWD_WEB_RELEASE_SHA` 必须启用原 `web-assert-release.mjs`，不能用缺Web内容的Next构建绕门。

公开配置只允许这7个键：`NEXT_PUBLIC_AWD_SITE`、`NEXT_PUBLIC_BASE_URL`、
`NEXT_PUBLIC_AWD_INTL_CONTACT_EMAIL`、`NEXT_PUBLIC_AWD_ALIYUN_CAPTCHA_SCENE_ID`、
`NEXT_PUBLIC_AWD_ALIYUN_CAPTCHA_PREFIX`、`NEXT_PUBLIC_AWD_TURNSTILE_SITE_KEY`、
`NEXT_PUBLIC_AUTH_PHONE_BINDING_DEADLINE`。通过既有原位白名单工具提供公开值，
不导出全部服务器环境；未知键硬失败。缺省字段仍保持缺省，不能为了CI补造新值；
CN原SITE缺省经实际确认后记为 `inferredDefault:cn`，Intl必须显式匹配。构建子进程使用
独立HOME和最小环境，拒绝源码根 `.env*`／既有数据库，不读取用户库或服务端凭据。

产物包含完整 `.next`（排除cache）、package／lock、next配置、公开配置、HTTP smoke结果
和provenance逐文件SHA清单；不含data、env、任何node_modules或 `*.node`。
原Turbopack会为external包生成 `.next/node_modules` 链接；copytree解引用后包含整包
及better-sqlite3原生二进制，故这里改用webpack且继续严格拒绝，而非删掉运行依赖。
固定16.4.3运行器从
`.next/server/preview-props.json` 读取preview参数，不能只留下旧版prerender字段；
包校验检查该文件／字段、BUILD_ID和完整server/static，并解开最终tar再次核清单。
HTTP smoke禁用继承代理并拒绝全部重定向，逐响应核URL仍为localhost；显式Host与
awd_site Cookie按站点设置，另核本机未授权admin响应的X-AWD-Admin-Site。
检查使用独立端口、空data的临时cwd，覆盖中英文updates含0757、start、Web首页、
无效license响应和better-sqlite3内存库；不启动浏览器、不测试真实登录／验证码／付费AI。
此处是运行兼容证据，不代表已经完成完整网站UI或生产部署验收。

构建产物不携带native依赖。目标机必须在自己的Node与冻结lock下单独准备、实际加载
better-sqlite3并核ABI；此目标原位检查不能证明CI捆绑native与SG的glibc兼容。CI22.23.2与SG22.22.2是不同patch，不能报告为完全同版本。
安装产物前还需审阅source/site/public-config指纹、官方artifact摘要、目标依赖与回退。
本任务不实现消费／替换 `.next`。旧 `ci.yml` 的国内 `npm install`＋生产构建及国际
`/root/deploy-intl.sh` 仍是高风险旧路径，两deploy job现均在任何凭据准备／SSH前明确exit1，无绕过开关，避免误跑
旧入口继续触发OOM；PR／push检查及原部署条件不变，不把跳过或绿色空跑当部署完成。
新workflow只产包；生产切换须由另行审阅的promoter核身份／配置／依赖／回退后执行。

### 百炼实测可用快照（#1667）

部署前同时配置 BAILIAN_AVAILABLE_MODELS_FILE（格式与授权快照相同，另含 checkedAt、可选 constraints）。目录只显示授权与实测可用交集，缺快照失败关闭；不要仅同步推理授权就发布目录。constraints 记录只能思考的模型及其固定温度，在预估和预留费用前应用。思考模式不支持指定某一函数的 tool_choice，普通智能体使用自动工具选择。国内生产上线需先原位备份并准备已验证快照，再切换包含本修复的 Next 产物；国际 OpenRouter 不改。

2026-11-03补充：#1667进一步将国内聊天菜单收窄为config.ts中的六个明确候选，默认qwen3.8-max；BAILIAN_DEFAULT_MODEL不再扩展菜单或改回已移除旧型号。可用快照不等于菜单，最终仍取候选/授权/实测/可计价交集。六项均已完成真实普通回复、流式工具调用与结算验证；MiniMax文本服务已开通，应用输出上限8192已实测。DeepSeek按请求开始时的北京时间峰谷价格结算，预留采用峰值。Web固定内部Flash模型不进入可选菜单。本次用户明确只合并、不部署，旧生产状态保持。

## 门控 Next 产物上线（promote-next-artifact.yml，#1648 后续）

**用途**：把 `next-build-artifact.yml` 已构建、已验包的产物推上**一个**站点。服务器上
不跑 `next build`／`npm run build`／`deploy-build-swap.sh`／`/root/deploy-intl.sh`，
旧 `ci.yml` 两个部署 job 仍首步 exit 1（`scripts/promote-next-artifact.test.mjs` 钉着）。

**怎么跑**：先跑 `next-build-artifact.yml`（产物保留 7 天，其中引用的 Web 工作台产物只保留
3 天，须在 3 天内上线），记下 run ID；然后 Actions →「Promote verified Next artifact (gated)」→
从 master 运行，填 `site`（cn／intl）、`artifact_run_id`、`source_sha`（与 provenance 一致的
40 位 SHA）。两站分两次跑；同站并发排队、不取消正在跑的。

**流程**：

1. `verify`（无 secret、无 SSH）：校验输入；核 run 是本仓库 master 上成功的
   `next-build-artifact.yml`；按官方 artifact digest 下载；复用 `next-ci-artifact.py` 的
   `extract_tar`／`verify` 核源 SHA、站点、`buildMode: webpack`、公开配置指纹、lock、
   逐文件 SHA；再按 provenance 记录核 Web 工作台产物的 ZIP／tar 摘要。产出逐文件清单。
2. `promote` 挂 `production-<site>` Environment，**审批通过才开始**，此后才拿得到
   `DEPLOY_SSH_KEY`。SSH 用钉死的主机公钥（与 `ci.yml` 同两条）。
3. 上传到 `$APP/.promote/<site>-<sha>-<run>-<attempt>/`：`rsync --partial --append-verify`
   断线续传、最多 6 次，服务器端 `sha256sum -c` 全量复核。
4. `prepare`（后台跑 + 轮询状态文件，SSH 断了不影响；**不动线上**）：再核 tar 摘要、
   解包按清单精确核文件集与逐文件 SHA；`MemAvailable ≥ 2200MB`、磁盘 ≥ 2GB 才继续；
   `git fetch` 后要求 SHA 在 origin/master 上且当前 HEAD 可快进到它，且 package／lock／
   next.config 与该提交逐字节一致；在暂存目录按冻结 lock `npm ci`，经 `systemd-run`
   限 1600M 内存（2026-11 两机升 8G 后由 900M 上调，900M 时 npm ci 被 cgroup OOM）（没有 systemd-run 就拒绝）；真加载 better-sqlite3 并核 ABI 与 CI 一致，
   加载失败且是国际站时按 §9.3 坑 3 用 python3.11 从源码重编覆盖 prebuilds 再验。
5. `activate`：`git merge --ff-only` 到 SHA（不 reset --hard、不 clean）→
   `web-install-artifact.mjs` 原子换 Web 工作台 → `seed.mjs`（幂等只增）→ 并入上一代
   静态 chunk → `.next`、`node_modules` 换入，上一份留在 `.next-old`／`.node_modules-old`
   → `pm2 restart --update-env` → 本机健康检查（`/en/start`；国内 registry 非空；国际
   verify-key 200；better-sqlite3 加载；pm2 解释器版本）。任何一步失败**自动回滚**并失败。
6. 外部健康检查（与 `ci.yml` 旧 job 同一套，含 `web-healthcheck.sh`）；失败则工作流
   调 `rollback` 并以失败结束。

`.env*`、`data/`、crontab 都不碰；种子数据只增不改，回滚不撤销。

**人工回滚**（上线后才发现问题）：

```bash
ssh root@<IP> 'bash <APP>/.promote/<本次目录>/promote-next-artifact.sh rollback <APP>/.promote/<本次目录>'
```

回到换入前的 `.next`／依赖／Web 版本，checkout 用 `git reset --keep` 退回（有本地改动
会被覆盖时直接拒绝，不丢服务器上的未提交数据），然后重启 pm2。

**一次性配置**（仓库管理员；私有仓库的 required reviewers 需 GitHub Team 及以上套餐）：

```bash
R=AI-WorkDeck/aiworkdeck-website
REVIEWER_ID=$(gh api users/zeweihan --jq .id)
for env in production-cn production-intl; do
  printf '{"prevent_self_review":false,"reviewers":[{"type":"User","id":%s}],"deployment_branch_policy":{"protected_branches":false,"custom_branch_policies":true}}' "$REVIEWER_ID" \
    | gh api -X PUT "repos/$R/environments/$env" --input -
  gh api -X POST "repos/$R/environments/$env/deployment-branch-policies" -f name=master -f type=branch
  gh secret set DEPLOY_SSH_KEY --env "$env" --repo "$R" < ~/.ssh/id_ed25519
done
```

两个 Environment 都配好后，删除仓库级 `DEPLOY_SSH_KEY`（`gh secret delete DEPLOY_SSH_KEY
--repo "$R"`）：只要仓库级那份还在，任何分支上改过的 workflow 都能不经审批读到它，审批门
就只拦住了这一个工作流。旧 `ci.yml` 部署 job 首步即 exit 1，不需要它。
