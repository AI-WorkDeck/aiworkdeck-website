// SPDX-FileCopyrightText: 2026 北京京微资易科技有限公司 and AI WorkDeck contributors
// SPDX-License-Identifier: AGPL-3.0-or-later

export const PLATFORM_MANIFEST = JSON.stringify({
  id: 'my-service-plugin', name: 'Service panel', version: '1.0.0', description: 'SDK 1.6 host preview example',
  author: 'Example developer', frontendEntry: 'web/index.html', permissions: ['network', 'ai', 'speech', 'tasks', 'clipboard'],
  settings: [
    { key: 'language', label: 'Language', type: 'string', scope: 'user', default: 'zh-CN' },
    { key: 'summaryStyle', label: 'Summary style', type: 'string', scope: 'project', default: 'brief' },
  ],
  contributes: {
    views: [{ id: 'service-panel', name: 'Service panel', entry: 'web/index.html', placement: 'sidebar', scope: 'project', defaultDock: 'left', allowedDocks: ['left', 'right', 'bottom'] }],
    connections: [{ id: 'service', label: 'My service', baseUrl: 'https://api.example.com', auth: { type: 'bearer' }, operations: { summarize: { method: 'POST', path: '/v1/summarize' }, status: { method: 'GET', path: '/v1/subscription' } }, billing: { statusOperation: 'status', checkoutUrl: 'https://example.com/subscribe' } }],
    mcpServers: [{ id: 'remote', transport: 'streamable-http', url: 'https://api.example.com/mcp', connectionId: 'service', tools: [{ name: 'summarize', description: 'Summarize supplied text', inputSchema: { type: 'object', properties: { text: { type: 'string' } }, required: ['text'], additionalProperties: false } }] }],
  },
}, null, 2);

export const PLATFORM_GUIDE = {
  zh: {
    title: 'SDK 1.6 平台接口（新版宿主预览）',
    notice: '本页 SDK 1.6 的视图、连接、MCP、分域设置、$schema/default 兼容修复和宿主服务接口需要新版宿主；本次代码尚未发版，现有已安装客户端不因此自动支持。模拟器只使用合成数据，不能代替新版宿主验收。',
    paragraphs: [
      '下载 Web 模板后，Node.js 20+ 可直接运行内附 scripts/plugin-dev.mjs，无需克隆宿主仓库。scripts/ 与 sdk/plugin-sdk/ 必须保持相对目录。先在模拟器完成界面调试，再在兼容的本地开发宿主测试权限、项目切换、禁用、取消和重连。示例域名只是占位符，不是可调用服务。',
      '插件权限与界面位置分开声明。contributes.views: [] 表示无独立入口，皮肤、模板等轻量插件只在对应功能中显示。sidebar 提供侧栏面板，workspace 提供左侧按钮和工作区标签；可同时声明两者，面板通过 awd.ui.openWorkspace() 打开自身已声明的工作区。仅 sidebar 不隐式创建标签，workspace 不强制打开空侧栏。未声明 views 的旧插件保持原有入口行为；新规则需要兼容宿主，旧宿主不会自动获得支持。',
      'views 的作用域为 project 或 global；每种位置最多一个视图，入口必须是包内 web/ 下文件。侧栏停靠可声明 left/right/bottom。settings 的 scope 默认为 installation，另支持 user/project；插件只能更新自身非敏感的 user/project 设置，installation 设置由可信宿主设置页维护。secret 不回传 iframe；用户服务凭据请使用 connections。',
      'connections 声明固定 HTTPS 服务来源及固定 GET/POST 操作路径，支持公开服务、Bearer 或 OAuth2 公共客户端 PKCE。awd.connections.connect 只打开宿主连接流程；令牌只在宿主保存。插件不能传任意 URL、Authorization 或任意宿主配置键。BYO 服务与宿主 AI、语音等通道是两种独立选择；使用宿主通道须相应权限及现有用量约束。',
      'OAuth 使用 Authorization Code + S256 PKCE：单机宿主采用实际监听端口的 http://127.0.0.1:<port>/api/plugins/oauth/callback，服务端部署需显式配置 ai.plugins.oauth-redirect-uri 为可信 HTTPS 地址，并在供应商登记。过期且不能刷新或被服务以 401/403 拒绝的连接返回 needsReconnect，用户应在宿主重新登录。',
      'MCP 当前仅支持公网 HTTPS Streamable HTTP，不支持 stdio、本地进程、私网地址或重定向。须声明 network、服务和全部工具；工具名和 inputSchema 必须与远端工具一致。参数根类型为 object，支持 object/properties/required/布尔 additionalProperties、array/items、string/enum、boolean/integer/number，以及 title/description；不支持 $ref、oneOf、nullable 或其他 JSON Schema 关键字。深度最多 8，单对象最多 64 属性，每服务最多 64 工具。connectionId 引用同插件同源连接；credentialKey 仅为已声明 installation secret 的兼容路径，不能读取任意全局设置。',
      '通过 dev/install 装入的插件默认无远程服务信任。管理员须在可信宿主设置页明确授权；授权绑定完整 manifest 的 SHA256，声明变化后重新授权。开发包不得携带 .awd-dev、.awd-service-trust 或 .awd-bundled 标记。授权不解除开发安装的 JAR/本地进程禁令。',
      'speech、tasks、clipboard 是宿主服务权限；services.request 仅接受宿主目录中的服务/操作，并非任意后端代理。用 services.cancel 取消同插件请求。无权限、宿主能力不存在或宿主版本过旧时，应显示明确说明，不能悄悄改走收费或外部服务。',
      '平台收费目前仅支持插件购买权益，提交价格是一次性买断价；不提供按调用代收或开发者分账接口。开发者自有服务可用 connections.billing 声明订阅状态操作和结账页。billing.checkout 只打开结账流程，不能把返回 opened 当成支付成功。',
      '平台 billing.status 主动刷新当前账户权益，refreshed 为 false 表示本次权益刷新未成功，active 可能来自仍有效的缓存，不能作为新支付确认。checkout 会等待浏览器打开结果并报告失败。服务插件须在真实宿主验收登录、令牌过期、订阅、MCP 错误、账户切换及共享/BYOK 选路；合成供应商只能证明宿主集成，不等于真实 OAuth 或支付认证。',
      '先在开发者中心完成免费资格审核，再生成投稿令牌并在本机临时环境变量 AWD_PLUGIN_TOKEN 中提供，不写入源码、Agent 指令或 zip。合法包仍进入 pending，等待人工审核与签名。开发安装、模拟器通过及 CLI 校验均不代表已上架或获准执行后端代码。',
    ],
    agentTitle: '交给 Agent 的完整任务指令',
    agent: `请基于下载的 AI WorkDeck Web 插件模板实现我的需求：[填写功能、输入、输出与验收标准]。
先读 README.md、sdk/plugin-sdk/awd-plugin-sdk.d.ts 和 manifest.schema.json，再规划最小权限。SDK 1.6 新能力需要尚未发版的新宿主；不要把模拟器成功当作现有客户端兼容证明。
只改插件目录。保留 scripts/ 与 sdk/plugin-sdk/ 相对结构；不要改 SDK 来绕过权限。界面遵循 --awd-* 主题变量、键盘可达、窄侧栏及明暗主题。
先按功能选择界面：轻量插件用 contributes.views: []；需要侧栏、工作区或两者时明确声明对应视图。只有已声明 workspace 才调用 awd.ui.openWorkspace()，并处理 unavailable/unknown_method；不为皮肤强加左侧按钮或标签。需要设置时区分 installation/user/project。用户密钥只通过宿主 connections 流程，不能进 iframe、日志、仓库或包。
选择宿主 AI/语音/任务/剪贴板通道或开发者自有 HTTPS 服务；前者声明相应权限，后者声明 network、固定 connections 操作。MCP 只用远程 HTTPS Streamable HTTP，显式声明每个工具和受支持的 inputSchema；禁止 stdio、私网、任意 URL 和任意系统配置读取。
用模拟器合成数据实现成功、权限拒绝、连接断开、失败重试与取消，不访问真实客户资料、登录或付费服务。真实宿主开发安装只使用我指定的隔离项目；服务访问须管理员在宿主设置页明确授权，manifest 改动后重新授权。
执行 node scripts/plugin-dev.mjs validate .；然后 node scripts/plugin-dev.mjs package . --out ../my-plugin.zip。检查压缩包无 .env、令牌、私钥和宿主信任标记。输出修改、验证结果、未验证边界与 zip 路径。
只有我明确要求提交时，再使用我本机提供的 AWD_PLUGIN_TOKEN，执行 submit 命令；不打印令牌。提交后报告 pending 审核状态，不声称已上架、已支付或已发布。`,
  },
  en: {
    title: 'SDK 1.6 platform APIs (new host preview)',
    notice: 'SDK 1.6 views, connections, MCP, scoped settings, $schema/default compatibility fixes and host services require the new host. This implementation has not been released; installed clients do not gain support automatically. The simulator uses synthetic data and is not host compatibility evidence.',
    paragraphs: [
      'The Web download includes a standalone Node.js 20+ CLI. Keep scripts/ and sdk/plugin-sdk/ in their relative locations. Test UI in the simulator, then permissions, project switching, disabling, cancellation and reconnection in a compatible isolated host. Example domains are placeholders, not working services.',
      'Permissions and UI placement are separate declarations. contributes.views: [] opts out of independent UI; lightweight themes and templates appear in their relevant host features. sidebar adds a panel, while workspace adds a rail button and a workspace tab. Declare both to let the panel open its own declared workspace with awd.ui.openWorkspace(). Sidebar-only plugins do not gain implicit tabs, and workspace-only plugins do not force an empty sidebar open. Legacy plugins omitting views retain their entry behavior. These rules require a compatible host; existing clients do not gain support automatically.',
      'Declare project/global scope, at most one view per placement, and an existing web/ entry. Sidebar docks are left/right/bottom. Settings default to installation scope; user/project settings may be changed by the plugin. Installation settings remain in trusted host UI. Secrets never return to the iframe; use connections for per-user credentials.',
      'Connections declare a fixed public HTTPS origin and fixed GET/POST operations. Authentication is none, Bearer or public-client OAuth2 PKCE. connect opens trusted host UI; tokens stay in the host. Never pass arbitrary URLs, authorization headers or host setting keys. BYO services and shared host AI/speech channels are separate choices with their own permissions and usage constraints.',
      'OAuth uses Authorization Code with S256 PKCE. A local host uses its actual port at http://127.0.0.1:<port>/api/plugins/oauth/callback; server deployments must set ai.plugins.oauth-redirect-uri to a trusted HTTPS callback and register it with the provider. Expired credentials without refresh or credentials rejected with 401/403 return needsReconnect and require host-side login again.',
      'MCP currently supports public HTTPS Streamable HTTP only: no stdio, local processes, private addresses or redirects. Declare network, every server and tool; remote names and schemas must match. Input roots are objects. Supported schema keywords are type/title/description, object properties/required/boolean additionalProperties, array items and string enum. Types include boolean/integer/number. No $ref, oneOf, nullable or other keywords. Limits: depth 8, 64 properties per object and 64 tools per server. connectionId references a same-origin connection in this plugin. Legacy credentialKey only references a declared installation secret.',
      'Development installs require explicit administrator service trust in the host settings page. Trust is bound to the full manifest SHA256 and expires when it changes. Packages must not contain .awd-dev, .awd-service-trust or .awd-bundled markers. Trust does not unlock development JARs or local processes.',
      'speech, tasks and clipboard permissions grant only catalogued services.request operations; this is not an arbitrary backend proxy. services.cancel cancels this plugin’s requests. Handle unsupported hosts, missing permissions and failures explicitly; do not silently switch to external or paid services.',
      'Platform billing currently covers plugin purchase entitlement only; submitted prices are one-time purchases. There is no platform per-call collection or revenue-sharing API. Developer-owned subscriptions may declare connections.billing status and checkout. An opened checkout is not a successful payment.',
      'Host billing.status refreshes the current account entitlement and returns refreshed; false means the refresh did not succeed and active may come from a still-valid cache, not a fresh payment confirmation. Checkout waits for the browser-opening result and rejects failures. Test actual host login, token expiry, subscription status, MCP errors, account switching and shared/BYOK routing; a synthetic provider verifies host integration, not live OAuth or payment certification.',
      'Complete the free developer eligibility review and generate a submission token in the developer center. Supply it through the local AWD_PLUGIN_TOKEN environment variable. Never put it in source, Agent prompts or packages. Valid submissions remain pending human review and signing; passing local validation is not marketplace approval.',
    ],
    agentTitle: 'Complete task to give your Agent',
    agent: `Implement this requirement using the downloaded AI WorkDeck Web plugin template: [feature, inputs, outputs, acceptance criteria].
Read README.md, sdk/plugin-sdk/awd-plugin-sdk.d.ts and manifest.schema.json first. Use minimum permissions. SDK 1.6 platform features require the unreleased new host; simulator success does not prove installed-client support.
Edit only this plugin. Preserve scripts/ and sdk/plugin-sdk/ layout. Do not modify the SDK to bypass checks. Support --awd-* theme tokens, keyboard interaction, narrow panels and light/dark themes.
Choose UI by function: contributes.views: [] for lightweight plugins, or explicitly declare sidebar, workspace, or both. Call awd.ui.openWorkspace() only for a declared workspace and handle unavailable/unknown_method. Do not add rail buttons or tabs to themes. Declare installation/user/project settings as needed. Credentials must use trusted host connections; never put tokens in the iframe, logs, repository or zip.
Choose shared host AI/speech/tasks/clipboard with the required permissions, or fixed HTTPS BYO operations with network permission. MCP must use public HTTPS Streamable HTTP and explicitly declared tools with the supported schema subset. No stdio, private hosts, arbitrary URLs or system settings.
Use synthetic simulator data to verify success, permission denial, disconnect, retry and cancel. Do not access customer data, real login or paid services. Use only my designated isolated project for host installation; ask the host administrator to grant service trust in settings after manifest changes.
Run node scripts/plugin-dev.mjs validate . and node scripts/plugin-dev.mjs package . --out ../my-plugin.zip. Verify no .env, credentials, private keys or host trust markers. Report changes, checks, unverified boundaries and zip location.
Only submit when I explicitly request it, using a locally provided AWD_PLUGIN_TOKEN without printing it. Report pending review accurately; never claim approval, payment or release.`,
  },
};

export const PLATFORM_COMMANDS = `node scripts/plugin-dev.mjs validate .
node scripts/plugin-dev.mjs package . --out ../my-plugin.zip
# Start the synthetic UI simulator, then open /dev/host-simulator.html
python3 -m http.server 8000
# Explicit development installation: select an isolated imported project/folder first.
# Replace PORT with the isolated host port. AWD_SESSION_ID is supplied locally if required.
# Do not paste credentials into source or an Agent prompt.
node scripts/plugin-dev.mjs install --endpoint http://127.0.0.1:PORT --project-id PROJECT_ID --folder-id FOLDER_ID
# Explicit marketplace submission only; provide AWD_PLUGIN_TOKEN locally.
node scripts/plugin-dev.mjs submit . --endpoint https://www.aiworkdeck.com/api/plugins --price-cents 0
node scripts/plugin-dev.mjs submissions --endpoint https://www.aiworkdeck.com/api/plugins`;
