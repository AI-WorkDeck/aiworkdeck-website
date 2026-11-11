import { PLATFORM_TEMPLATE_ASSETS } from './plugin-template-assets';
import { PLATFORM_GUIDE, PLATFORM_MANIFEST, PLATFORM_COMMANDS } from './plugin-platform-guide';
import AdmZip from 'adm-zip';
import { toBaseLocale, type Locale } from '@/i18n-config';
import { siteConfig } from '@/lib/site-config';

/**
 * 插件模板（SDK）。
 *
 * 模板包含独立开发所需 SDK 与 CLI，由 /api/plugins/template 动态打包下载。
 * SDK 资源按字节镜像主仓；改动时一起更新 digest 与下载验证。
 *
 * 模板本身可直接 mvn package 后打包提交，跑得通再往里填自己的逻辑。
 */

const POM_XML = `<?xml version="1.0" encoding="UTF-8"?>
<project xmlns="http://maven.apache.org/POM/4.0.0"
         xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
         xsi:schemaLocation="http://maven.apache.org/POM/4.0.0 http://maven.apache.org/xsd/maven-4.0.0.xsd">
  <modelVersion>4.0.0</modelVersion>

  <groupId>com.example</groupId>
  <artifactId>my-plugin</artifactId>
  <version>1.0.0</version>

  <properties>
    <maven.compiler.source>21</maven.compiler.source>
    <maven.compiler.target>21</maven.compiler.target>
    <project.build.sourceEncoding>UTF-8</project.build.sourceEncoding>
  </properties>

  <dependencies>
    <!-- 工具注解来自 langchain4j，由宿主在运行时提供，务必用 provided：
         打进 JAR 会与宿主的同名类冲突，导致工具注册不上。 -->
    <dependency>
      <groupId>dev.langchain4j</groupId>
      <artifactId>langchain4j-core</artifactId>
      <version>0.36.0</version>
      <scope>provided</scope>
    </dependency>
  </dependencies>

  <build>
    <finalName>\${project.artifactId}-\${project.version}</finalName>
  </build>
</project>
`;

const TOOLS_JAVA = `package com.example.myplugin;

import dev.langchain4j.agent.tool.Tool;

/**
 * 插件工具类。
 *
 * 三条硬约定，违反任意一条工具都不会出现在 AI 面前：
 * 1. 必须有无参构造函数——宿主用反射实例化；
 * 2. 工具方法加 @Tool 注解，方法名即工具名，要与 manifest.json 的 tools[].name 一致；
 * 3. 参数与返回值用 String 最省事（复杂结构自己序列化成 JSON 字符串）。
 *
 * @Tool 里的描述是写给 AI 看的，直接决定它会不会在恰当的时候调用这个工具。
 * 写清楚"什么时候用"，比写"这个方法做什么"有用得多。
 */
public class MyTools {

    @Tool("统计一段中文文本的字数，返回可读的统计结果。用户问'多少字'时调用。")
    public String countChinese(String text) {
        if (text == null || text.isBlank()) {
            return "输入为空，字数 0";
        }
        long cjk = text.codePoints()
                .filter(cp -> Character.UnicodeScript.of(cp) == Character.UnicodeScript.HAN)
                .count();
        return String.format("总字符 %d，其中汉字 %d", text.length(), cjk);
    }
}
`;

const MANIFEST_JSON = `{
  "id": "my-plugin",
  "name": "我的插件",
  "version": "1.0.0",
  "description": "一句话说明这个插件替用户做什么。会展示在插件广场的卡片上。",
  "author": "你的名字或团队",
  "homepage": "https://example.com",
  "permissions": [],
  "tools": [
    {
      "name": "countChinese",
      "description": "统计中文文本字数",
      "permissions": []
    }
  ],
  "backendJars": ["my-plugin-1.0.0.jar"]
}
`;

const README_MD = `# 插件模板

## 三步跑通

\`\`\`bash
# 1. 编译（需要 JDK 21）
mvn package

# 2. 把 JAR 和 manifest.json 放进同一个目录
mkdir -p dist && cp target/my-plugin-1.0.0.jar manifest.json dist/

# 3. 打成 zip —— 注意是打包目录内容，不要多套一层目录
cd dist && zip -r ../my-plugin-1.0.0.zip . && cd ..
\`\`\`

得到的 \`my-plugin-1.0.0.zip\` 就可以提交到 ${siteConfig.origin}/${siteConfig.defaultLocale}/plugins/submit

## 本地先试

提交前建议先在自己机器上验证：把 \`dist/\` 整个目录复制到

- macOS / Linux：\`~/.aiworkdeck/plugins/my-plugin/\`
- 开发环境：\`<项目>/backend/plugins/my-plugin/\`

重启 AI WorkDeck，在「插件广场 → 已安装」里应该能看到它，启用后在对话中让 AI
调用你的工具试试。

## 改造成自己的插件

1. \`manifest.json\`：改 \`id\`（小写字母数字连字符，全局唯一）、\`name\`、\`description\`；
2. \`MyTools.java\`：换成你的逻辑，每个对 AI 暴露的方法加 \`@Tool\`；
3. 两边的工具名要对上——\`manifest.json\` 的 \`tools[].name\` 必须等于 Java 方法名；
4. 用到文件读写或联网，在 \`permissions\` 里如实声明（见下）。

## 关于 permissions

可选值：\`file_read\` \`file_write\` \`network\` \`editor\` \`ai\` \`im\`。

**如实声明**。审核时会拿它和 JAR 的静态扫描结果交叉核对：声明了没有 \`network\`
却引用了网络 API，会被直接驳回。反过来，用到了却没声明，同样驳回。

它不是运行时沙箱——插件与宿主同进程，技术上拦不住未声明的行为。它的作用是让审核
有据可依，也让用户在安装前知道这个插件会碰什么。

## 完整规范

${siteConfig.origin}/${siteConfig.defaultLocale}/plugins/develop
`;

/* ==========================================================================
 * Web 插件模板（NATIVE_PACK_DISTRIBUTION.md §11）
 *
 * 纯静态前端插件：不含 JAR，桌面端用 sandbox iframe（不含 allow-same-origin）
 * 承载 web/index.html，插件与宿主只通过 postMessage 桥通信。
 * ========================================================================== */

const WEB_MANIFEST_JSON = `{
  "id": "my-web-plugin",
  "name": "我的 Web 插件",
  "version": "1.0.0",
  "description": "一句话说明这个插件替用户做什么。会展示在插件广场的卡片上。",
  "author": "你的名字或团队",
  "homepage": "https://example.com",
  "frontendEntry": "web/index.html",
  "permissions": ["file_read"],
  "minHostVersion": "0.27.4",
  "backendJars": [],
  "tools": []
}
`;

/**
 * SDK 单文件实现。桌面端桥按同一契约实现，两侧任何一方改动都要同步另一侧。
 * 这里刻意不用模板字符串与可选链，保证老 WebView 也能直接跑。
 */
const WEB_SDK_JS = "// SPDX-FileCopyrightText: 2026 北京京微资易科技有限公司 and AI WorkDeck contributors\n// SPDX-License-Identifier: AGPL-3.0-or-later\n/**\n * AI WorkDeck 插件 SDK v1 —— postMessage 桥。\n *\n * 源头在桌面仓 sdk/plugin-sdk/，此为随模板分发的副本。\n * 契约（桌面端宿主按同一份实现，勿单方面改动）：\n *\n *   握手  宿主 -> 插件   { awd: 1, type: \"init\", context: {...} }\n *   请求  插件 -> 宿主   { awd: 1, type: \"call\", seq, method, params }\n *   响应  宿主 -> 插件   { awd: 1, type: \"result\", seq, ok, result | error: { code, message } }\n *\n * v1 方法：\n *   context.get   {}                  -> { pluginId, projectId, language, theme }\n *   files.list    {}                  -> { files: [{ path, name, size }] }   需 file_read\n *   files.read    { path }            -> { path, content, truncated }        需 file_read，文本上限 5 MB\n *   ui.toast      { message }         -> {}\n *   storage.get   { key }             -> { key, value }    插件级 KV，value 为 null 表示不存在\n *   storage.set   { key, value }      -> {}                插件级 KV，总量上限 64 KB\n *   evidence.link   { anchor: { selection: true } | { quote }, docPath?, targets: [{ path, locator?, relation?, method?, note? }] }\n *                                     -> { linkKey, targetIds }  需 editor；在当前 Word 文档的选区/引文上建底稿关联\n *   evidence.list   { docPath?, path?, sectionPath?, status? }\n *                                     -> { links: [{ linkKey, docPath, anchorText, sectionPath, status, targets: [{ targetId, path, locator, relation, method }] }] }  需 file_read\n *   evidence.locate { linkKey, targetId? }\n *                                     -> {}                需 editor；有 targetId 打开底稿定位，否则跳到文档里的锚点\n *\n * v2.6 新增（宿主 0.27.4 起）——主题通道，照 VS Code 给 webview 注入主题的机制：\n *   推送  宿主 -> 插件   { awd: 1, type: \"theme\", theme: \"light\"|\"dark\", tokens: { \"--awd-*\": \"...\" } }\n *   init 的 context 也带 theme 与 themeTokens 两个字段（老宿主只有 theme 字符串，\n *   没有 themeTokens——SDK 会降级为只挂 data-theme，不注入变量）。\n *   SDK 收到即自动：documentElement 挂 data-theme=\"light|dark\"、body 挂\n *   awd-theme-light / awd-theme-dark class、把 tokens 逐个写成 CSS 自定义属性。\n *   插件 CSS 因此可以直接用 var(--awd-surface) 这类语义令牌，零 JS 跟随主题；\n *   需要脚本联动的用 awd.theme.onChange(cb)。\n *\n * v2.5 新增（宿主 0.27 起；老宿主返回 unknown_method，插件要能降级）：\n *   tools.invoke  { name, args? }     -> { output }        直调本插件 manifest 声明的 JAR 工具；\n *                                        output 是工具原始字符串输出（通常为 JSON）。权限/配额/项目归属\n *                                        由宿主端点按 AI 链路同一套规则校验，工具名不属于本插件即 invoke_failed\n *   chat.send     { prompt }          -> {}                把 prompt 作为可见的用户消息发进 AI 对话\n *                                        （与启动面板快捷按钮同一条路），上限 4000 字\n *   ui.openFile   { path }            -> {}                需 file_read；把项目文件打开到工作台中栏\n *\n * v2.7 新增（宿主 0.27.4 起；老宿主对新方法返回 unknown_method，SDK 已按下述说明降级）：\n *   doc.exec      { action, params? }  -> { result }        需 editor；对当前聚焦文档执行编辑原语，\n *                                        action/params 与 AI 工具面的下发名同一套（doc_/sheet_/slide_ 全集\n *                                        的安全子集，白名单外返回 action_not_allowed）。写入走修订（Writer），\n *                                        署名 AI WorkDeck，用户可逐条接受/拒绝\n *   doc.active    {}                   -> { fileId, kind }  需 editor；当前聚焦文档（kind: writer|calc|impress），\n *                                        没有打开的文档时 fileId 为 null\n *   events.subscribe   { events: [..] } -> { subscribed }   订阅宿主事件（见下）；权限不足的事件名被静默剔除，\n *                                        以回声的 subscribed 集合为准\n *   events.unsubscribe { events: [..] } -> { subscribed }\n *   ai.request    { prompt, system?, purpose? } -> { text, modelId }\n *                                        需 ai 权限；经平台 Credits 通道调辅助模型（插件免带 Key），\n *                                        prompt+system 合计上限 16000 字符，每插件 10 次/分钟。\n *                                        要工具、要落文档、要让用户看见过程的场景走 chat.send，不走这条\n *\n *   事件推送  宿主 -> 插件   { awd: 1, type: \"event\", event, data }\n *   首批事件：files.changed（需 file_read）/ selection.changed（需 editor）/ project.switched。\n *   payload 刻意为空——事件是「该重拉了」的信号，数据由插件按各自权限的方法拉取。\n *   用 awd.events.on(name, cb) 即可（自动订阅/退订；老宿主上 on 照常返回退订函数，只是永不触发）。\n *\n * v2.9 新增（宿主 0.28 起）：\n *   settings.get  { key }              -> { key, value }    读 manifest.settings 声明的配置项\n *                                        （值统一是字符串；用户在插件广场详情页填写，插件只读）。\n *                                        secret 的项不提供给插件页面（permission_denied）；\n *                                        未声明的键 not_found\n *   事件 settings.changed：宿主设置表单保存后推送（只推给设置所属的插件），收到后重新 get\n *\n * v2.11 / SDK 1.5.0 (host 0.61.0+):\n *   im.request { action, params } -> object; requires im. Fixed messaging actions only.\n *   lawfirm.request { action, params } -> object; requires lawfirm. Law firm intake, conflict check, finance and dashboard actions.\n *   im.downloadAttachment { conversationId, attachmentId } -> { started, name }; authorized download via host.\n *   chat.addFile { path } -> {}; requires file_read. Adds material without sending an AI message.\n *   files.prepareDrag { path } -> validated file descriptor plus dragToken, dragType, expiresAt.\n *   files.endDrag {} -> {}; invalidates this iframe's prepared drag. Both require file_read.\n *   Prepare before dragstart; synchronously put dragType/dragToken into dataTransfer on dragstart.\n *   Drag tickets expire, are consumed once, and are cleared on project/account change or frame removal.\n *   account.changed is a data-free event: discard cached identity, messages and pending work.\n *   Older hosts return unknown_method; do not emulate IM with localStorage.\n *\n * SDK 1.6.0: services, MCP, host-managed connections, billing and editable settings.\n * All calls accept transport options { signal, timeoutMs }; timeout defaults to 60000 ms.\n * Timeout/abort discard late responses. Service requests also send best-effort cancellation.\n * unknown_method remains a rejected promise: offer an upgrade, never pretend success.\n *\n * 错误码：permission_denied（manifest 未声明所需权限）、unknown_method（宿主不认识的方法）、\n *   anchor_ambiguous（引文 0 或多处命中 / anchor 形状不对）、no_selection（要求选区但当前没有）、\n *   not_found（链接或文件不存在）、no_active_document（当前没有打开的 Word 文档）、\n *   invalid_params（参数缺失或形状不对）、invoke_failed（工具执行被拒或出错）、\n *   action_not_allowed（doc.exec 的原语不对插件开放）、ai_failed（模型调用失败）、\n *   quota_exceeded（存储/字数/频次超限）、experimental_not_allowed（x- 实验方法仅对 dev 安装开放）。\n *\n * 重要：本文件必须用普通同步 <script> 引入，且排在业务脚本之前——\n * 宿主在 iframe load 后立刻发 init，晚注册监听会错过握手，ready() 将永远挂起。\n */\n(function (global) {\n  'use strict';\n\n  var PROTOCOL = 1;\n  var seq = 0;\n  var pending = Object.create(null);\n  var resolveReady;\n  var readyPromise = new Promise(function (resolve) { resolveReady = resolve; });\n\n  function post(msg) {\n    // 插件运行在 opaque origin 的 sandbox iframe 里，拿不到宿主的真实 origin，\n    // 只能用 '*'；反向的来源校验由宿主端（校验 event.source 是本 iframe）负责。\n    global.parent.postMessage(msg, '*');\n  }\n\n  global.addEventListener('message', function (event) {\n    if (event.source !== global.parent) return;\n    var msg = event.data;\n    if (!msg || msg.awd !== PROTOCOL) return;\n\n    if (msg.type === 'init') {\n      awd.context = msg.context || {};\n      applyTheme(awd.context.theme, awd.context.themeTokens);\n      resolveReady(awd.context);\n      return;\n    }\n\n    if (msg.type === 'theme') {\n      applyTheme(msg.theme, msg.tokens);\n      return;\n    }\n\n    if (msg.type === 'event') {\n      var handlers = eventListeners[msg.event];\n      if (handlers) {\n        handlers.slice().forEach(function (cb) {\n          try { cb(msg.data || {}); } catch (e) { /* 插件回调抛错不打断其余 */ }\n        });\n      }\n      return;\n    }\n\n    if (msg.type === 'result') {\n      var entry = pending[msg.seq];\n      if (!entry) return;\n      entry.cleanup();\n      if (msg.ok) {\n        entry.resolve(msg.result);\n      } else {\n        var err = new Error((msg.error && msg.error.message) || '调用失败');\n        err.code = (msg.error && msg.error.code) || 'unknown_error';\n        entry.reject(err);\n      }\n    }\n  });\n\n  // ---- 主题与 Plugin UI v3.0 样式注入（v2.6 / v3.0）--------------------------\n  // 自动应用 + 回调通知。tokens 缺席（老宿主）时只挂 data-theme/class，\n  // 插件的 var(--awd-*) 走自己 CSS 里的 fallback 值。\n  // 同时在具备 document.head 的真实 DOM 环境里自动注入 <style id=\"awd-plugin-ui-v3\">，\n  // 提供 .awd-plugin-stage / .awd-plugin-header / .awd-plugin-grid / .awd-card / .awd-btn / .awd-safe-progress 等标准组件类。\n  var PLUGIN_UI_V3_CSS = [\n    ':root{color-scheme:light}:root[data-theme=\"dark\"]{color-scheme:dark}',\n    '.awd-plugin-stage{container-type:inline-size;box-sizing:border-box;width:100%;max-width:1120px;margin:0 auto;padding:var(--awd-space-5,20px) var(--awd-space-6,24px);font-family:var(--awd-font-sans,-apple-system,BlinkMacSystemFont,\"PingFang SC\",\"Microsoft YaHei\",sans-serif);font-size:var(--awd-font-size-body,13px);line-height:var(--awd-line-height-ui,1.5);color:var(--awd-text,#2B2A26)}',\n    '.awd-plugin-header{display:flex;flex-wrap:wrap;align-items:flex-start;justify-content:space-between;gap:var(--awd-space-3,12px);padding-bottom:var(--awd-space-4,16px);margin-bottom:var(--awd-space-4,16px);border-bottom:1px solid var(--awd-border-subtle,#EAE7DD)}',\n    '.awd-eyebrow{display:inline-flex;align-items:center;gap:6px;font-size:11px;font-weight:600;letter-spacing:.06em;text-transform:uppercase;color:var(--awd-accent-text,#2E5A50);margin-bottom:4px}',\n    '.awd-title{margin:0;font-family:var(--awd-font-serif,\"Source Han Serif SC\",\"Noto Serif CJK SC\",\"Songti SC\",serif);font-size:20px;font-weight:700;line-height:1.3;letter-spacing:-.01em;color:var(--awd-text,#2B2A26)}',\n    '.awd-subtitle{margin:4px 0 0;font-size:12.5px;line-height:1.55;color:var(--awd-text-2,#6B675C)}',\n    '.awd-header-actions{display:flex;flex-wrap:wrap;align-items:center;gap:var(--awd-space-2,8px)}',\n    '.awd-subnav{display:inline-flex;align-items:center;gap:2px;padding:3px;background:var(--awd-surface-2,#E9E6DC);border:1px solid var(--awd-border-subtle,#EAE7DD);border-radius:var(--awd-radius-md,6px);margin-bottom:var(--awd-space-4,16px)}',\n    '.awd-subnav-item{appearance:none;border:1px solid transparent;background:transparent;color:var(--awd-text-2,#6B675C);font:inherit;font-size:12px;font-weight:500;height:var(--awd-control-xs,24px);padding:0 12px;border-radius:var(--awd-radius-sm,4px);cursor:pointer;transition:all var(--awd-motion-fast,140ms) ease}',\n    '.awd-subnav-item.is-active,.awd-subnav-item[aria-selected=\"true\"]{background:var(--awd-surface,#FCFBF7);color:var(--awd-accent-text,#2E5A50);font-weight:600;border-color:var(--awd-border-subtle,#EAE7DD);box-shadow:var(--awd-shadow-btn,0 1px 2px rgba(42,38,30,.06))}',\n    '.awd-kpi-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:var(--awd-space-3,12px);margin-bottom:var(--awd-space-4,16px)}',\n    '.awd-kpi-card{background:var(--awd-surface,#FCFBF7);border:1px solid var(--awd-border,#DDD8CA);border-radius:var(--awd-radius-dialog,8px);padding:var(--awd-space-3,12px) var(--awd-space-4,16px);box-shadow:var(--awd-shadow-card,0 1px 3px rgba(42,38,30,.05))}',\n    '.awd-kpi-label{font-size:11px;font-weight:600;letter-spacing:.04em;color:var(--awd-text-2,#6B675C);margin-bottom:4px}',\n    '.awd-kpi-value{font-family:var(--awd-font-serif,\"Source Han Serif SC\",\"Noto Serif CJK SC\",\"Songti SC\",serif);font-size:20px;font-weight:700;font-variant-numeric:tabular-nums;color:var(--awd-text,#2B2A26);line-height:1.25}',\n    '.awd-plugin-grid{display:grid;grid-template-columns:minmax(0,1fr);gap:var(--awd-space-4,16px);align-items:start}',\n    '@container (min-width:640px){.awd-plugin-grid{grid-template-columns:minmax(260px,320px) minmax(0,1fr)}}',\n    '.awd-card{background:var(--awd-surface,#FCFBF7);border:1px solid var(--awd-border,#DDD8CA);border-radius:var(--awd-radius-dialog,8px);padding:var(--awd-space-4,16px);box-shadow:var(--awd-shadow-card,0 1px 3px rgba(42,38,30,.05));box-sizing:border-box}',\n    '.awd-card+.awd-card{margin-top:var(--awd-space-3,12px)}',\n    '.awd-card-header{display:flex;align-items:center;justify-content:space-between;gap:var(--awd-space-2,8px);margin-bottom:var(--awd-space-3,12px);padding-bottom:var(--awd-space-2,8px);border-bottom:1px solid var(--awd-border-subtle,#EAE7DD)}',\n    '.awd-card-title{margin:0;font-size:12px;font-weight:600;letter-spacing:.04em;text-transform:uppercase;color:var(--awd-text-2,#6B675C)}',\n    '.awd-btn{appearance:none;display:inline-flex;align-items:center;justify-content:center;gap:6px;min-height:var(--awd-control-md,32px);padding:0 12px;border-radius:var(--awd-radius-md,6px);border:1px solid var(--awd-border,#DDD8CA);background:var(--awd-surface,#FCFBF7);color:var(--awd-text,#2B2A26);font:inherit;font-size:12.5px;font-weight:500;cursor:pointer;box-shadow:var(--awd-shadow-btn,0 1px 2px rgba(42,38,30,.06));transition:all var(--awd-motion-fast,140ms) ease;box-sizing:border-box}',\n    '.awd-btn:hover:not(:disabled){background:var(--awd-surface-2,#E9E6DC);border-color:var(--awd-accent,#2E5A50);color:var(--awd-accent-text,#2E5A50)}',\n    '.awd-btn:disabled{opacity:.55;cursor:not-allowed}',\n    '.awd-btn-sm{min-height:var(--awd-control-sm,28px);padding:0 10px;font-size:12px}',\n    '.awd-btn-xs{min-height:var(--awd-control-xs,24px);padding:0 8px;font-size:11px}',\n    '.awd-btn-primary{background:var(--awd-accent,#2E5A50);border-color:var(--awd-accent,#2E5A50);color:var(--awd-text-on-accent,#FFF)}',\n    '.awd-btn-primary:hover:not(:disabled){background:var(--awd-accent-hover,#254B42);border-color:var(--awd-accent-hover,#254B42);color:var(--awd-text-on-accent,#FFF)}',\n    '.awd-btn-danger{background:var(--awd-danger-soft,#F9EBEA);border-color:var(--awd-danger,#B5483C);color:var(--awd-danger-text,#B5483C)}',\n    '.awd-input,.awd-select,.awd-textarea{box-sizing:border-box;width:100%;min-height:var(--awd-control-md,32px);padding:5px 10px;border-radius:var(--awd-radius-md,6px);border:1px solid var(--awd-border,#DDD8CA);background:var(--awd-surface,#FCFBF7);color:var(--awd-text,#2B2A26);font:inherit;font-size:13px}',\n    '.awd-input:focus,.awd-select:focus,.awd-textarea:focus{outline:none;border-color:var(--awd-accent,#2E5A50);box-shadow:0 0 0 2px var(--awd-accent-soft,rgba(46,90,80,.12))}',\n    '.awd-badge{display:inline-flex;align-items:center;gap:4px;height:20px;padding:0 8px;border-radius:999px;font-size:11px;font-weight:600;font-variant-numeric:tabular-nums;background:var(--awd-surface-2,#E9E6DC);color:var(--awd-text-2,#6B675C);border:1px solid var(--awd-border-subtle,#EAE7DD)}',\n    '.awd-badge-accent{background:var(--awd-accent-soft,#E6EFEA);color:var(--awd-accent-text,#2E5A50)}',\n    '.awd-badge-gold{background:var(--awd-gold-soft,#F4EFE4);color:var(--awd-gold-text,#7D6438)}',\n    '.awd-badge-info{background:var(--awd-info-soft,#E9EFF4);color:var(--awd-info-text,#3C5A73)}',\n    '.awd-badge-warning{background:var(--awd-warning-soft,#F8F0DF);color:var(--awd-warning-text,#8A5D14)}',\n    '.awd-badge-danger{background:var(--awd-danger-soft,#F9EBEA);color:var(--awd-danger-text,#B5483C)}',\n    '.awd-safe-progress{background:var(--awd-surface,#FCFBF7);border:1px solid var(--awd-border,#DDD8CA);border-left:3px solid var(--awd-accent,#2E5A50);border-radius:var(--awd-radius-dialog,8px);padding:12px 14px;margin-bottom:var(--awd-space-3,12px);box-shadow:var(--awd-shadow-card,0 1px 3px rgba(42,38,30,.05))}',\n    '.awd-safe-progress-head{display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:6px}',\n    '.awd-safe-progress-title{font-size:12.5px;font-weight:600;color:var(--awd-text,#2B2A26)}',\n    '.awd-safe-progress-pct{font-family:var(--awd-font-mono,ui-monospace,SFMono-Regular,Menlo,monospace);font-size:11.5px;font-variant-numeric:tabular-nums;color:var(--awd-accent-text,#2E5A50)}',\n    '.awd-safe-progress-track{height:5px;border-radius:999px;background:var(--awd-surface-2,#E9E6DC);overflow:hidden;margin-bottom:8px}',\n    '.awd-safe-progress-fill{height:100%;border-radius:999px;background:var(--awd-accent,#2E5A50);transition:width 220ms ease}',\n    '.awd-safe-progress-foot{display:flex;align-items:center;justify-content:space-between;gap:8px;font-size:11.5px;color:var(--awd-text-2,#6B675C)}'\n  ].join('\\n');\n\n  function ensurePluginUiStyle() {\n    try {\n      if (typeof document === 'undefined' || !document.head || !document.createElement) return;\n      if (document.getElementById && document.getElementById('awd-plugin-ui-v3')) return;\n      var styleEl = document.createElement('style');\n      styleEl.id = 'awd-plugin-ui-v3';\n      styleEl.textContent = PLUGIN_UI_V3_CSS;\n      if (document.head.firstChild && document.head.insertBefore) {\n        document.head.insertBefore(styleEl, document.head.firstChild);\n      } else if (document.head.appendChild) {\n        document.head.appendChild(styleEl);\n      }\n    } catch (e) { /* 无 DOM 环境静默 */ }\n  }\n  ensurePluginUiStyle();\n\n  var themeState = { mode: 'light', tokens: {} };\n  var themeListeners = [];\n  function applyTheme(mode, tokens) {\n    ensurePluginUiStyle();\n    themeState.mode = mode === 'dark' ? 'dark' : 'light';\n    if (tokens && typeof tokens === 'object') themeState.tokens = tokens;\n    try {\n      var rootEl = document.documentElement;\n      rootEl.setAttribute('data-theme', themeState.mode);\n      Object.keys(themeState.tokens).forEach(function (k) {\n        if (k.indexOf('--') === 0) rootEl.style.setProperty(k, String(themeState.tokens[k]));\n      });\n      if (document.body) {\n        document.body.classList.toggle('awd-theme-dark', themeState.mode === 'dark');\n        document.body.classList.toggle('awd-theme-light', themeState.mode !== 'dark');\n      }\n    } catch (e) { /* 无 DOM 环境静默 */ }\n    themeListeners.forEach(function (cb) {\n      try { cb(themeState.mode, themeState.tokens); } catch (e) { /* 插件回调抛错不打断其余 */ }\n    });\n  }\n\n  function bridgeError(code, message) {\n    var error = new Error(message);\n    error.code = code;\n    if (code === 'aborted') error.name = 'AbortError';\n    return error;\n  }\n\n  function call(method, params, options) {\n    var opts = options || {};\n    return new Promise(function (resolve, reject) {\n      var timeoutMs = opts.timeoutMs == null ? 60000 : opts.timeoutMs;\n      if (typeof timeoutMs !== 'number' || !isFinite(timeoutMs) || timeoutMs < 1 || timeoutMs > 300000) {\n        reject(bridgeError('invalid_params', 'timeoutMs must be between 1 and 300000 ms'));\n        return;\n      }\n      var signal = opts.signal;\n      if (signal && signal.aborted) {\n        reject(bridgeError('aborted', 'Call aborted'));\n        return;\n      }\n      var id = ++seq;\n      var timer;\n      function cleanup() {\n        delete pending[id];\n        clearTimeout(timer);\n        if (signal) signal.removeEventListener('abort', abort);\n      }\n      function abort() {\n        if (!pending[id]) return;\n        cleanup();\n        reject(bridgeError('aborted', 'Call aborted'));\n      }\n      pending[id] = { resolve: resolve, reject: reject, cleanup: cleanup };\n      timer = setTimeout(function () {\n        if (!pending[id]) return;\n        cleanup();\n        reject(bridgeError('timeout', 'Host call timed out: ' + method));\n      }, timeoutMs);\n      // Node-based developer harnesses must not be kept alive by unanswered mock messages.\n      if (timer && timer.unref) timer.unref();\n      try {\n        if (signal) signal.addEventListener('abort', abort, { once: true });\n        post({ awd: PROTOCOL, type: 'call', seq: id, method: method, params: params || {} });\n      } catch (error) {\n        cleanup();\n        reject(error);\n      }\n    });\n  }\n\n  // ---- 事件通道（v2.7）------------------------------------------------------\n  // on() 自动向宿主订阅（首个监听者时），退订函数在最后一个监听者移除时自动退订。\n  // 老宿主对 events.subscribe 返回 unknown_method：静默吞掉——on 照常工作，只是永不触发，\n  // 插件代码因此不需要为宿主版本写条件分支。\n  var eventListeners = {};\n  function syncSubscribe(method, name) {\n    call(method, { events: [name] }).then(null, function () { /* 老宿主 unknown_method，静默 */ });\n  }\n\n  var awd = {\n    /** SDK 版本，与桥协议版本无关 */\n    version: '1.8.0',\n    /** 握手拿到的上下文；ready() 之前为 null */\n    context: null,\n    /** 等待宿主握手，resolve 值即 awd.context */\n    ready: function () { return readyPromise; },\n    /** 原样调用任意 v1 方法，返回宿主的 result */\n    call: call,\n    files: {\n      /** -> Array<{ path, name, size }> */\n      list: function (options) {\n        return call('files.list', {}, options).then(function (r) { return (r && r.files) || []; });\n      },\n      /** -> { path, content, truncated } */\n      read: function (path, options) { return call('files.read', { path: path }, options); },\n      prepareDrag: function (path, rect, options) { return call('files.prepareDrag', { path: path, rect: rect }, options); },\n      endDrag: function (options) { return call('files.endDrag', {}, options); }\n    },\n    ui: {\n      /** 打开本插件已声明的工作区；无工作区返回 unavailable，旧宿主返回 unknown_method。 */\n      openWorkspace: function () { return call('ui.openWorkspace', {}); },\n      toast: function (message, options) { return call('ui.toast', { message: message }, options); },\n      /** 把项目文件打开到工作台中栏（需 file_read） */\n      openFile: function (path, options) { return call('ui.openFile', { path: path }, options); },\n      /**\n       * 渲染或更新 AWD Plugin UI v3.0 长耗时任务安全进度卡片（.awd-safe-progress）。\n       * target 可为选择器字符串或 DOM 元素；state 为 false/null 时清空。\n       */\n      progress: function (target, state) {\n        var el = null;\n        try {\n          el = typeof target === 'string' && typeof document !== 'undefined' && document.querySelector\n            ? document.querySelector(target)\n            : target;\n        } catch (e) { el = null; }\n        function render(next) {\n          if (!el || typeof document === 'undefined' || !document.createElement) return;\n          while (el.firstChild) el.removeChild(el.firstChild);\n          if (!next) {\n            el.hidden = true;\n            return;\n          }\n          el.hidden = false;\n          var box = document.createElement('div');\n          box.className = 'awd-safe-progress';\n          box.setAttribute('role', 'status');\n          box.setAttribute('aria-live', 'polite');\n\n          var head = document.createElement('div');\n          head.className = 'awd-safe-progress-head';\n          var titleEl = document.createElement('span');\n          titleEl.className = 'awd-safe-progress-title';\n          titleEl.textContent = next.title || '正在处理任务…';\n          head.appendChild(titleEl);\n\n          var pctNum = typeof next.percent === 'number' && isFinite(next.percent)\n            ? Math.max(0, Math.min(100, Math.round(next.percent)))\n            : null;\n          var pctEl = document.createElement('span');\n          pctEl.className = 'awd-safe-progress-pct';\n          pctEl.textContent = next.detail || (pctNum != null ? pctNum + '%' : '进行中');\n          head.appendChild(pctEl);\n          box.appendChild(head);\n\n          var track = document.createElement('div');\n          track.className = 'awd-safe-progress-track';\n          var fill = document.createElement('div');\n          fill.className = 'awd-safe-progress-fill';\n          fill.style.width = (pctNum != null ? pctNum : 38) + '%';\n          track.appendChild(fill);\n          box.appendChild(track);\n\n          var foot = document.createElement('div');\n          foot.className = 'awd-safe-progress-foot';\n          var noteEl = document.createElement('span');\n          noteEl.textContent = next.safetyNote || '本地与已保存进度不受影响，可随时安全中止';\n          foot.appendChild(noteEl);\n\n          if (typeof next.onCancel === 'function') {\n            var cancelBtn = document.createElement('button');\n            cancelBtn.type = 'button';\n            cancelBtn.className = 'awd-btn awd-btn-xs';\n            cancelBtn.textContent = next.cancelText || '取消';\n            cancelBtn.onclick = function () { next.onCancel(); };\n            foot.appendChild(cancelBtn);\n          }\n          box.appendChild(foot);\n          el.appendChild(box);\n        }\n        render(state);\n        return {\n          update: render,\n          clear: function () { render(null); }\n        };\n      }\n    },\n    tools: {\n      /** 直调本插件的 JAR 工具 -> 工具原始字符串输出（自行 JSON.parse） */\n      invoke: function (name, args, options) {\n        return call('tools.invoke', { name: name, args: args || {} }, options).then(function (r) {\n          return r && r.output != null ? r.output : '';\n        });\n      }\n    },\n    chat: {\n      /** 把 prompt 作为可见用户消息发进 AI 对话（起草类动作走这条，不直调工具） */\n      send: function (prompt, options) { return call('chat.send', { prompt: prompt }, options); },\n      addFile: function (path, options) { return call('chat.addFile', { path: path }, options); }\n    },\n    im: {\n      request: function (action, params, options) { return call('im.request', { action: action, params: params || {} }, options); }\n    },\n    notifications: {\n      publish: function (notification, options) { return call('notifications.publish', notification || {}, options); },\n      resolve: function (eventKey, state, options) { return call('notifications.resolve', { eventKey: eventKey, state: state || 'done' }, options); }\n    },\n    lawfirm: {\n      request: function (action, params, options) { return call('lawfirm.request', { action: action, params: params || {} }, options); }\n    },\n    storage: {\n      /** -> 存过的值，没有则 null */\n      get: function (key, options) {\n        return call('storage.get', { key: key }, options).then(function (r) {\n          return r && r.value !== undefined ? r.value : null;\n        });\n      },\n      set: function (key, value, options) { return call('storage.set', { key: key, value: value }, options); }\n    },\n    services: {\n      request: function (service, operation, params, options) {\n        var opts = options || {};\n        var alreadyAborted = opts.signal && opts.signal.aborted;\n        var requestId = opts.requestId || ('awd-' + Date.now().toString(36) + '-' + (++seq) + '-' + Math.random().toString(36).slice(2));\n        return call('services.request', { service: service, operation: operation, params: params || {}, requestId: requestId }, opts)\n          .catch(function (error) {\n            if ((error.code === 'aborted' || error.code === 'timeout') && !alreadyAborted) {\n              // Cancellation is best effort; an old host may reject it. Never convert the original error to success.\n              call('services.cancel', { requestId: requestId }).catch(function () {});\n            }\n            throw error;\n          });\n      },\n      cancel: function (params, options) { return call('services.cancel', params || {}, options); }\n    },\n    mcp: {\n      servers: function (options) { return call('mcp.servers', {}, options); },\n      call: function (serverId, name, args, options) { return call('mcp.call', { serverId: serverId, name: name, arguments: args || {} }, options); }\n    },\n    connections: {\n      list: function (options) { return call('connections.list', {}, options); },\n      // Token entry and OAuth belong to trusted host UI. No credential argument or secret result.\n      connect: function (id, options) { return call('connections.connect', { id: id }, options); },\n      disconnect: function (id, options) { return call('connections.disconnect', { id: id }, options); },\n      request: function (id, operation, params, options) { return call('connections.request', { id: id, operation: operation, params: params || {} }, options); }\n    },\n    billing: {\n      status: function (connectionId, options) { return call('billing.status', { connectionId: connectionId }, options); },\n      checkout: function (connectionId, options) { return call('billing.checkout', { connectionId: connectionId }, options); }\n    },\n    settings: {\n      open: function (options) { return call('settings.open', {}, options); },\n      update: function (values, options) {\n        var opts = options || {};\n        return call('settings.update', { values: values, scope: opts.scope, projectId: opts.projectId }, opts);\n      },\n      /**\n       * 读 manifest.settings 声明的配置项 -> 字符串值（v2.9，宿主 0.28+）。\n       * 与 storage 的区别：settings 是用户在插件广场详情页填写的配置（插件只读），\n       * storage 是插件自己的 KV。secret 项拿不到；配置变更会推 settings.changed 事件。\n       */\n      get: function (key, options) {\n        return call('settings.get', { key: key }, options).then(function (r) {\n          return r && r.value != null ? r.value : '';\n        });\n      }\n    },\n    theme: {\n      /** 当前主题：{ mode: 'light'|'dark', tokens: { '--awd-*': '...' } }。\n       *  SDK 已自动把 data-theme/class/CSS 变量挂到本页，多数插件写 CSS 即可，\n       *  不需要碰这个 API。 */\n      get: function () { return { mode: themeState.mode, tokens: themeState.tokens }; },\n      /** 主题切换回调 cb(mode, tokens)，返回退订函数。init 时已应用的主题不补发。 */\n      onChange: function (cb) {\n        if (typeof cb !== 'function') return function () {};\n        themeListeners.push(cb);\n        return function () {\n          var i = themeListeners.indexOf(cb);\n          if (i >= 0) themeListeners.splice(i, 1);\n        };\n      }\n    },\n    evidence: {\n      /** -> { linkKey, targetIds } */\n      link: function (params, options) { return call('evidence.link', params || {}, options); },\n      /** -> { links: [...] } 原始 result，不解包 */\n      list: function (params, options) { return call('evidence.list', params || {}, options); },\n      /** -> {} */\n      locate: function (params, options) { return call('evidence.locate', params || {}, options); }\n    },\n    doc: {\n      /** 对当前聚焦文档执行编辑原语 -> 原语的原始返回对象（需 editor 权限） */\n      exec: function (action, params, options) {\n        return call('doc.exec', { action: action, params: params || {} }, options).then(function (r) {\n          return r ? r.result : {};\n        });\n      },\n      /** -> { fileId, kind }；没有打开的文档时 fileId 为 null（需 editor 权限） */\n      active: function (options) { return call('doc.active', {}, options); },\n      /** 糖衣：读全文 -> 原语原始返回（含段落数组，形状见宿主 get_document_text 文档） */\n      getText: function (options) { return awd.doc.exec('get_document_text', {}, options); },\n      /** 糖衣：读当前选区 */\n      getSelection: function (options) { return awd.doc.exec('get_selection', {}, options); },\n      /** 糖衣：查找文本出现位置 */\n      find: function (text, options) { return awd.doc.exec('find_text_locations', { text: text }, options); },\n      /** 糖衣：光标处插入文本（Writer 走修订，署名 AI WorkDeck） */\n      insertText: function (text, options) { return awd.doc.exec('insert_at_cursor', { text: text }, options); },\n      /** 糖衣：在恰好命中一次的锚点文字上加批注 */\n      addComment: function (anchorText, text, options) {\n        return awd.doc.exec('add_comment', { anchorText: anchorText, text: text }, options);\n      }\n    },\n    events: {\n      /**\n       * 订阅宿主事件：files.changed / selection.changed / project.switched。\n       * cb(data) 在宿主推送时触发；返回退订函数。自动向宿主 subscribe/unsubscribe，\n       * 老宿主（无事件通道）上照常返回退订函数，只是永不触发。\n       */\n      on: function (name, cb) {\n        if (typeof cb !== 'function' || !name) return function () {};\n        var key = String(name);\n        if (!eventListeners[key]) {\n          eventListeners[key] = [];\n          syncSubscribe('events.subscribe', key);\n        }\n        eventListeners[key].push(cb);\n        return function () {\n          var handlers = eventListeners[key];\n          if (!handlers) return;\n          var i = handlers.indexOf(cb);\n          if (i >= 0) handlers.splice(i, 1);\n          if (handlers.length === 0) {\n            delete eventListeners[key];\n            syncSubscribe('events.unsubscribe', key);\n          }\n        };\n      }\n    },\n    ai: {\n      /**\n       * 面板内的一次性静默推理（需 ai 权限，走平台 Credits 的辅助模型）-> 输出文本。\n       * opts 可带 { system, purpose }；要工具/落文档/让用户看见过程的场景用 awd.chat.send。\n       */\n      request: function (prompt, opts) {\n        var p = opts || {};\n        return call('ai.request', { prompt: prompt, system: p.system, purpose: p.purpose }, p)\n          .then(function (r) { return r && r.text != null ? r.text : ''; });\n      }\n    }\n  };\n\n  global.awd = awd;\n})(window);\n";

const WEB_INDEX_HTML = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>我的 Web 插件</title>
<style>
  :root { color-scheme: light; }
  body {
    margin: 0; padding: 20px;
    font: 14px/1.7 system-ui, -apple-system, "PingFang SC", "Microsoft YaHei", sans-serif;
    color: #1f2421; background: #fff;
  }
  h1 { margin: 0 0 4px; font-size: 16px; font-weight: 600; }
  p.sub { margin: 0 0 18px; color: #6b7280; font-size: 12px; }
  section { margin-bottom: 18px; }
  h2 { margin: 0 0 8px; font-size: 12px; font-weight: 600; letter-spacing: .06em; text-transform: uppercase; color: #6b7280; }
  dl { display: grid; grid-template-columns: auto 1fr; gap: 4px 12px; margin: 0; }
  dt { color: #6b7280; }
  dd { margin: 0; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; word-break: break-all; }
  ul { margin: 0; padding: 0; list-style: none; }
  li { padding: 6px 0; border-bottom: 1px solid #eef0ef; display: flex; gap: 10px; }
  li:last-child { border-bottom: 0; }
  li .name { flex: 1; cursor: pointer; text-decoration: underline; text-underline-offset: 3px; }
  li .size { color: #9ca3af; font-variant-numeric: tabular-nums; }
  button {
    font: inherit; padding: 6px 14px; border-radius: 6px;
    border: 1px solid #d3d8d5; background: #fff; color: #1f2421; cursor: pointer;
  }
  button:hover { border-color: #1f4c3a; color: #1f4c3a; }
  pre {
    margin: 10px 0 0; padding: 10px; max-height: 180px; overflow: auto;
    background: #f6f7f7; border-radius: 6px; font-size: 12px; white-space: pre-wrap;
  }
  .empty { color: #9ca3af; }
</style>
</head>
<body>
  <h1>我的 Web 插件</h1>
  <p class="sub">模板面板：握手上下文、项目文件、toast、插件级存储各演示一次。</p>

  <section>
    <h2>上下文</h2>
    <dl id="ctx"><dd class="empty">等待宿主握手…</dd></dl>
  </section>

  <section>
    <h2>项目文件</h2>
    <ul id="files"><li class="empty">等待宿主握手…</li></ul>
    <pre id="preview" hidden></pre>
  </section>

  <section>
    <h2>动作</h2>
    <button id="toast">发一条 toast</button>
    <button id="count">记一次点击（storage）</button>
  </section>

  <script src="awd-plugin-sdk.js"></script>
  <script>
    (async function () {
      var ctxEl = document.getElementById('ctx');
      var filesEl = document.getElementById('files');
      var previewEl = document.getElementById('preview');

      // 一切都从 ready() 之后开始：在握手完成前调任何方法，消息会发出去但没人应答
      var ctx = await awd.ready();

      ctxEl.innerHTML = '';
      Object.keys(ctx).forEach(function (k) {
        var dt = document.createElement('dt'); dt.textContent = k;
        var dd = document.createElement('dd'); dd.textContent = String(ctx[k]);
        ctxEl.appendChild(dt); ctxEl.appendChild(dd);
      });

      // files.* 需要 manifest.permissions 含 file_read，未声明会抛 permission_denied
      try {
        var files = await awd.files.list();
        filesEl.innerHTML = '';
        if (!files.length) {
          filesEl.innerHTML = '<li class="empty">项目里还没有文件</li>';
        }
        files.forEach(function (f) {
          var li = document.createElement('li');
          var name = document.createElement('span');
          name.className = 'name';
          name.textContent = f.name || f.path;
          name.onclick = async function () {
            var doc = await awd.files.read(f.path);
            previewEl.hidden = false;
            previewEl.textContent = doc.content.slice(0, 2000) + (doc.truncated ? '\\n…（已截断）' : '');
          };
          var size = document.createElement('span');
          size.className = 'size';
          size.textContent = ((f.size || 0) / 1024).toFixed(1) + ' KB';
          li.appendChild(name); li.appendChild(size);
          filesEl.appendChild(li);
        });
      } catch (e) {
        filesEl.innerHTML = '<li class="empty">读取文件失败：' + (e.code || '') + ' ' + e.message + '</li>';
      }

      document.getElementById('toast').onclick = function () {
        awd.ui.toast('来自 ' + (ctx.pluginId || '插件') + ' 的问候');
      };

      document.getElementById('count').onclick = async function () {
        var n = (await awd.storage.get('clicks')) || 0;
        n = Number(n) + 1;
        await awd.storage.set('clicks', n);
        await awd.ui.toast('累计点击 ' + n + ' 次');
      };
    })();
  </script>
</body>
</html>
`;

const WEB_HOST_SIMULATOR_HTML = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<title>宿主模拟器 · AI WorkDeck 插件开发</title>
<!--
  宿主模拟器：假扮桌面端，让你不装 AI WorkDeck 就能开发调试 web/index.html。

  用法（推荐，起一个本地静态服务）：
      python3 -m http.server 8000        # 在模板根目录执行
      然后打开 http://localhost:8000/dev/host-simulator.html

  静态服务不能改写 URL：npx serve 默认开 clean URLs，会把 /web/index.html
  重定向到 /web，页面里相对引用的 awd-plugin-sdk.js 随之 404，面板就一直停在
  「等待宿主握手」。非要用它就在根目录放一份 serve.json：{"cleanUrls": false}。

  直接双击本文件（file://）多数浏览器会因为 sandbox iframe 是 opaque origin
  而拒绝加载子页面或屏蔽 postMessage，看到空白就是这个原因，改用上面的静态服务。

  这里的 sandbox 属性与桌面端一致：**没有 allow-same-origin**。
  插件与宿主不同源是安全模型的根基，调试时也不要为了方便加上它——
  加了之后能跑通的代码，装进桌面端会立刻失败。

  假数据在下面 FAKE_FILES / storage 里，按你的插件需要随便改。
-->
<style>
  body { margin: 0; font: 14px/1.6 system-ui, -apple-system, "PingFang SC", sans-serif; background: #f6f7f7; color: #1f2421; }
  header { padding: 12px 18px; background: #1f4c3a; color: #fff; display: flex; align-items: center; justify-content: space-between; }
  header strong { font-weight: 600; }
  header span { opacity: .7; font-size: 12px; margin-left: 10px; }
  .theme-toggle {
    font: inherit; font-size: 12px; padding: 6px 14px; border-radius: 6px;
    border: 1px solid rgba(255,255,255,.3); background: transparent; color: #fff; cursor: pointer;
  }
  .theme-toggle:hover { background: rgba(255,255,255,.12); }
  main { display: flex; gap: 16px; padding: 16px; align-items: flex-start; }
  .pane { background: #fff; border: 1px solid #e2e5e3; border-radius: 10px; overflow: hidden; }
  .pane h2 { margin: 0; padding: 8px 12px; font-size: 12px; font-weight: 600; color: #6b7280; border-bottom: 1px solid #eef0ef; }
  iframe { width: 380px; height: 560px; border: 0; display: block; }
  #log { width: 460px; height: 560px; margin: 0; padding: 12px; overflow: auto; font: 12px/1.6 ui-monospace, Menlo, monospace; white-space: pre-wrap; }
  .in { color: #1f4c3a; }
  .out { color: #6b7280; }
  .err { color: #b91c1c; }
  #toasts { position: fixed; right: 20px; bottom: 20px; display: flex; flex-direction: column; gap: 8px; }
  .toast { background: #1f2421; color: #fff; padding: 8px 14px; border-radius: 6px; font-size: 13px; }
</style>
</head>
<body>
<header>
  <div><strong>宿主模拟器</strong><span>假扮 AI WorkDeck 桌面端 · 协议 v1</span></div>
  <button id="themeToggle" class="theme-toggle" type="button">切换到深色</button>
  <button id="fireFilesChanged" class="theme-toggle" type="button">触发 files.changed</button>
  <button id="fireSelectionChanged" class="theme-toggle" type="button">触发 selection.changed</button>
</header>
<main>
  <div class="pane">
    <h2>插件面板（sandbox iframe，无 allow-same-origin）</h2>
    <iframe id="plugin" src="../web/index.html" sandbox="allow-scripts allow-forms"></iframe>
  </div>
  <div class="pane">
    <h2>桥消息</h2>
    <pre id="log"></pre>
  </div>
</main>
<div id="toasts"></div>

<script>
(function () {
  'use strict';

  var PROTOCOL = 1;
  var frame = document.getElementById('plugin');
  var logEl = document.getElementById('log');

  // AWD-TOKENS:BEGIN plugin-theme-tokens
  // 此段由 scripts/generate-tokens.mjs 生成，勿手改。改色改 design/tokens/awd-palette.json
  // 主题（v2.6）：token 表与桌面端同源，切换按钮拿它们 postMessage 给插件。
  var THEMES = {
    light: {
      '--awd-bg': '#F1EFE7',
      '--awd-surface': '#FCFBF7',
      '--awd-surface-2': '#E9E6DC',
      '--awd-surface-3': '#DFDBCE',
      '--awd-text': '#2B2A26',
      '--awd-text-2': '#6B675C',
      '--awd-text-3': '#A8A296',
      '--awd-border': '#DDD8CA',
      '--awd-border-subtle': '#EAE7DD',
      '--awd-border-strong': '#C3BCA9',
      '--awd-accent': '#2E5A50',
      '--awd-accent-hover': '#254A41',
      '--awd-accent-text': '#2E5A50',
      '--awd-accent-soft': '#E3EDE9',
      '--awd-mint': '#89A8A0',
      '--awd-bamboo': '#89A8A0',
      '--awd-danger': '#B5483C',
      '--awd-danger-text': '#9A3A30',
      '--awd-danger-soft': '#FAF0EE',
      '--awd-warning': '#B8842B',
      '--awd-warning-text': '#8A6320',
      '--awd-warning-soft': '#F8F1E2',
      '--awd-info': '#3C5A73',
      '--awd-info-text': '#2F4A60',
      '--awd-info-soft': '#EDF1F4'
    },
    dark: {
      '--awd-bg': '#191713',
      '--awd-surface': '#221F1A',
      '--awd-surface-2': '#2B2721',
      '--awd-surface-3': '#363129',
      '--awd-text': '#EDE9DF',
      '--awd-text-2': '#B0AA9C',
      '--awd-text-3': '#7D7768',
      '--awd-border': '#3D372E',
      '--awd-border-subtle': '#2B2721',
      '--awd-border-strong': '#524B3F',
      '--awd-accent': '#3E6E62',
      '--awd-accent-hover': '#4C8576',
      '--awd-accent-text': '#89A8A0',
      '--awd-accent-soft': 'rgba(137, 168, 160, 0.14)',
      '--awd-mint': '#89A8A0',
      '--awd-bamboo': '#89A8A0',
      '--awd-danger': '#CC6154',
      '--awd-danger-text': '#E8938A',
      '--awd-danger-soft': 'rgba(181, 72, 60, 0.16)',
      '--awd-warning': '#D19C3D',
      '--awd-warning-text': '#E0B461',
      '--awd-warning-soft': 'rgba(184, 132, 43, 0.15)',
      '--awd-info': '#5E8299',
      '--awd-info-text': '#93B3C6',
      '--awd-info-soft': 'rgba(60, 90, 115, 0.18)'
    }
  };
  // AWD-TOKENS:END plugin-theme-tokens
  var currentTheme = 'light';

  // ---- 假上下文：桌面端握手时下发的东西。theme/themeTokens 跟着切换按钮走 ----
  function getContext() {
    return {
      pluginId: 'my-web-plugin',
      projectId: 'demo-project',
      language: 'zh-CN',
      theme: currentTheme,
      themeTokens: THEMES[currentTheme]
    };
  }

  // ---- 声明的权限：改成你 manifest.json 里的那份，好验证 permission_denied 分支。
  //      要试 doc.exec 加 'editor'，要试 ai.request 加 'ai'（v2.7）----
  var PERMISSIONS = ['file_read'];

  // ---- 事件通道（v2.7）：事件名 -> 订阅所需权限；subscribed 是当前生效集合 ----
  var EVENT_PERMISSIONS = { 'files.changed': 'file_read', 'selection.changed': 'editor', 'project.switched': null, 'settings.changed': null };

  // ---- v2.9 设置假值：改成你 manifest.settings 里的键 ----
  var SIM_SETTINGS = { firmName: '示例律师事务所', autoRefresh: 'true' };
  var SIM_MANIFEST = {};
  var SIM_CONNECTIONS = {};
  var SIM_FAILURE = false;
  var SIM_READY = fetch('../manifest.json').then(function (response) {
    if (!response.ok) throw new Error('manifest.json unavailable');
    return response.json();
  }).then(function (manifest) {
    SIM_MANIFEST = manifest;
    PERMISSIONS = manifest.permissions || [];
    (manifest.settings || []).forEach(function (setting) {
      if (!setting.secret) SIM_SETTINGS[setting.key] = setting.default == null ? '' : String(setting.default);
    });
  });
  function simulated(result) { return { ok: true, result: result }; }
  function simError(code, message) { return { ok: false, error: { code: code, message: message } }; }
  function connection(id) { return ((SIM_MANIFEST.contributes || {}).connections || []).find(function (c) { return c.id === id; }); }
  function remoteGuard() {
    if (!need('network')) return denied('network');
    if (SIM_FAILURE) return simError('plugin_service_failed', 'Synthetic service failure; toggle failure to retry.');
    return null;
  }
  var subscribedEvents = {};
  function pushEvent(name, data) {
    if (!subscribedEvents[name]) { toast('插件未订阅 ' + name + '，未推送'); return; }
    var msg = { awd: PROTOCOL, type: 'event', event: name, data: data || {} };
    log('out', '<- ' + JSON.stringify(msg));
    frame.contentWindow.postMessage(msg, '*');
  }

  // ---- 假项目文件 ----
  var FAKE_FILES = [
    { path: 'docs/合同草稿.docx', name: '合同草稿.docx', size: 20480, content: '甲方：示例科技有限公司\\n乙方：……' },
    { path: 'docs/尽调清单.md', name: '尽调清单.md', size: 3072, content: '# 尽调清单\\n\\n- 营业执照\\n- 公司章程\\n' },
    { path: 'notes.txt', name: 'notes.txt', size: 128, content: '随手记：下周一开庭。' }
  ];

  var READ_LIMIT = 5 * 1024 * 1024; // 与桌面端一致：文本读取上限 5 MB
  var STORAGE_LIMIT = 64 * 1024;    // 与桌面端一致：插件级 KV 总量上限 64 KB
  var storage = {};

  function log(cls, text) {
    var line = document.createElement('div');
    line.className = cls;
    line.textContent = text;
    logEl.appendChild(line);
    logEl.scrollTop = logEl.scrollHeight;
  }

  function toast(message) {
    var box = document.getElementById('toasts');
    var el = document.createElement('div');
    el.className = 'toast';
    el.textContent = message;
    box.appendChild(el);
    setTimeout(function () { el.remove(); }, 2600);
  }

  function reply(seq, ok, payload) {
    var msg = { awd: PROTOCOL, type: 'result', seq: seq, ok: ok };
    if (ok) msg.result = payload; else msg.error = payload;
    log(ok ? 'out' : 'err', '<- ' + JSON.stringify(msg));
    frame.contentWindow.postMessage(msg, '*');
  }

  function need(permission) {
    return PERMISSIONS.indexOf(permission) >= 0;
  }

  function handle(method, params) {
    switch (method) {
      case 'context.get':
        return { ok: true, result: getContext() };
      case 'ui.openWorkspace': {
        var views = (SIM_MANIFEST.contributes || {}).views;
        if (!Array.isArray(views) || !views.some(function (view) { return view.placement === 'workspace'; })) {
          return simError('unavailable', 'This plugin has no declared workspace view.');
        }
        return simError('host_required', 'Opening the declared workspace requires a compatible host; the simulator does not open host tabs.');
      }
      case 'settings.open': return simulated({ opened: true, simulated: true });
      case 'settings.update': {
        var values = params.values;
        if (!values || typeof values !== 'object' || Array.isArray(values)) return simError('invalid_params', 'Expected values object');
        var keys = Object.keys(values);
        for (var i = 0; i < keys.length; i++) {
          var setting = (SIM_MANIFEST.settings || []).find(function (s) { return s.key === keys[i]; });
          if (!setting || setting.secret || ['user', 'project'].indexOf(setting.scope) < 0) return denied('settings scope');
        }
        keys.forEach(function (key) { SIM_SETTINGS[key] = String(values[key]); });
        pushEvent('settings.changed', {});
        return simulated({});
      }
      case 'connections.connect':
        if (!connection(params.id)) return simError('not_found', 'Undeclared connection');
        // A synthetic user completion only: no token input or remote login.
        SIM_CONNECTIONS[params.id] = true;
        return simulated({ opened: true, simulated: true });
      case 'connections.disconnect': {
        var guard = remoteGuard(); if (guard) return guard;
        if (!connection(params.id)) return simError('not_found', 'Undeclared connection');
        delete SIM_CONNECTIONS[params.id]; return simulated({});
      }
      case 'connections.list': {
        var guard = remoteGuard(); if (guard) return guard;
        return simulated({ connections: ((SIM_MANIFEST.contributes || {}).connections || []).map(function (c) {
          return { id: c.id, label: c.label || c.id, connected: !c.auth || c.auth.type === 'none' || !!SIM_CONNECTIONS[c.id], authType: (c.auth || {}).type || 'none', operations: Object.keys(c.operations || {}) };
        }) });
      }
      case 'connections.request': {
        var guard = remoteGuard(); if (guard) return guard;
        var c = connection(params.id);
        if (!c || !(c.operations || {})[params.operation]) return simError('not_found', 'Undeclared operation');
        if (c.auth && c.auth.type !== 'none' && !SIM_CONNECTIONS[c.id]) return simError('connection_required', 'Connect the synthetic service first');
        return simulated({ simulated: true, operation: params.operation, data: params.params || {} });
      }
      case 'mcp.servers': {
        var guard = remoteGuard(); if (guard) return guard;
        return simulated({ servers: (SIM_MANIFEST.contributes || {}).mcpServers || [] });
      }
      case 'mcp.call': {
        var guard = remoteGuard(); if (guard) return guard;
        var server = ((SIM_MANIFEST.contributes || {}).mcpServers || []).find(function (s) { return s.id === params.serverId; });
        if (!server || !(server.tools || []).some(function (t) { return t.name === params.name; })) return simError('not_found', 'Undeclared MCP tool');
        if (server.connectionId && !SIM_CONNECTIONS[server.connectionId] && (connection(server.connectionId).auth || {}).type !== 'none') return simError('connection_required', 'Connect the synthetic service first');
        return simulated({ content: [{ type: 'text', text: 'Synthetic MCP result: ' + JSON.stringify(params.arguments || {}) }], isError: false });
      }
      case 'billing.status':
        if (params.connectionId && !connection(params.connectionId)) return simError('not_found', 'Undeclared connection');
        return simulated({ provider: params.connectionId ? 'developer' : 'platform', active: false, simulated: true });
      case 'billing.checkout':
        if (params.connectionId && !connection(params.connectionId)) return simError('not_found', 'Undeclared connection');
        toast('Synthetic checkout only; no browser navigation or payment');
        return simulated({ opened: true, simulated: true });
      case 'services.request': {
        var permission = { speech: 'speech', tasks: 'tasks', clipboard: 'clipboard', ai: 'ai' }[params.service];
        if (permission && !need(permission)) return denied(permission);
        return simError('host_required', 'Real service operations require a compatible isolated host; the simulator never runs them.');
      }
      case 'services.cancel': return simulated({ cancelled: false, simulated: true });

      case 'im.downloadAttachment':
        if (!need('im')) return denied('im');
        return { ok: false, error: { code: 'host_required', message: '请在兼容宿主内下载已授权的聊天附件。' } };
      case 'notifications.publish':
      case 'notifications.resolve':
        if (!need('notifications')) return denied('notifications');
        return simError('host_required', 'Inbox notifications require a compatible host; the simulator does not deliver messages.');
      case 'im.request':
        if (!need('im')) return denied('im');
        return { ok: false, error: { code: 'im_unavailable', message: '模拟器不连接真实聊天服务；请在兼容宿主内验证 IM。' } };
      case 'chat.addFile':
      case 'files.prepareDrag':
      case 'files.endDrag':
        if (!need('file_read')) return denied('file_read');
        return { ok: false, error: { code: 'host_required', message: '请在兼容宿主内验证文件加入 AI 与拖拽。' } };
      case 'files.list':
        if (!need('file_read')) return denied('file_read');
        return { ok: true, result: { files: FAKE_FILES.map(function (f) {
          return { path: f.path, name: f.name, size: f.size };
        }) } };

      case 'files.read': {
        if (!need('file_read')) return denied('file_read');
        var hit = FAKE_FILES.filter(function (f) { return f.path === params.path; })[0];
        if (!hit) return { ok: false, error: { code: 'not_found', message: '文件不存在：' + params.path } };
        var content = hit.content;
        var truncated = content.length > READ_LIMIT;
        return { ok: true, result: { path: hit.path, content: content.slice(0, READ_LIMIT), truncated: truncated } };
      }

      case 'ui.toast':
        toast(String(params.message == null ? '' : params.message));
        return { ok: true, result: {} };

      case 'storage.get':
        return { ok: true, result: { key: params.key, value: storage[params.key] === undefined ? null : storage[params.key] } };

      case 'storage.set': {
        var next = Object.assign({}, storage);
        next[params.key] = params.value;
        if (JSON.stringify(next).length > STORAGE_LIMIT) {
          return { ok: false, error: { code: 'quota_exceeded', message: '插件存储超过 64 KB 上限' } };
        }
        storage = next;
        return { ok: true, result: {} };
      }

      // ---- v2.5：模拟器没有 JAR 工具与真对话，行为如实降级 ----
      case 'tools.invoke':
        return { ok: false, error: { code: 'invoke_failed', message: '模拟器没有 JAR 工具；该方法只在装进桌面端且 manifest 声明了 tools 时生效' } };

      case 'chat.send': {
        var prompt = String(params.prompt == null ? '' : params.prompt);
        if (!prompt) return { ok: false, error: { code: 'invalid_params', message: 'prompt 不能为空' } };
        if (prompt.length > 4000) return { ok: false, error: { code: 'quota_exceeded', message: 'prompt 超过 4000 字上限' } };
        toast('chat.send（模拟）：' + prompt.slice(0, 60));
        return { ok: true, result: {} };
      }

      case 'ui.openFile':
        if (!need('file_read')) return denied('file_read');
        toast('ui.openFile（模拟）：' + params.path);
        return { ok: true, result: {} };

      // ---- v2.9：settings.get（宿主 0.28+）——假配置表，改 SIM_SETTINGS 试你的键 ----
      case 'settings.get': {
        var sKey = String(params.key == null ? '' : params.key);
        if (!sKey) return { ok: false, error: { code: 'invalid_params', message: '缺少 key' } };
        if ((SIM_MANIFEST.settings || []).some(function (s) { return s.key === sKey && s.secret; })) return denied('secret setting');
        if (!(sKey in SIM_SETTINGS)) return { ok: false, error: { code: 'not_found', message: '未声明的设置项：' + sKey } };
        return { ok: true, result: { key: sKey, value: SIM_SETTINGS[sKey] } };
      }

      // ---- v2.7：doc.* / events.* / ai.request（宿主 0.28+）----
      case 'doc.exec': {
        if (!need('editor')) return denied('editor');
        var action = String(params.action == null ? '' : params.action);
        if (!action) return { ok: false, error: { code: 'invalid_params', message: '缺少 action' } };
        if (action === 'get_document_text') {
          return { ok: true, result: { result: { success: true, simulated: true, text: '（模拟文档正文）甲方：示例科技有限公司……', paragraphs: [{ index: 0, text: '（模拟文档正文）甲方：示例科技有限公司……' }] } } };
        }
        if (action === 'get_selection') {
          return { ok: true, result: { result: { success: true, simulated: true, text: '（模拟选区文字）' } } };
        }
        return { ok: true, result: { result: { success: true, simulated: true, note: '模拟器没有真编辑器，动作 ' + action + ' 视为成功；装进桌面端后按真实原语执行' } } };
      }

      case 'doc.active':
        if (!need('editor')) return denied('editor');
        return { ok: true, result: { fileId: 101, kind: 'writer' } };

      case 'events.subscribe':
      case 'events.unsubscribe': {
        var names = Array.isArray(params.events) ? params.events : [];
        names.forEach(function (n) {
          if (!(n in EVENT_PERMISSIONS)) return;
          var perm = EVENT_PERMISSIONS[n];
          if (perm && !need(perm)) return;
          if (method === 'events.subscribe') subscribedEvents[n] = true;
          else delete subscribedEvents[n];
        });
        return { ok: true, result: { subscribed: Object.keys(subscribedEvents) } };
      }

      case 'ai.request': {
        if (!need('ai')) return denied('ai');
        var p2 = String(params.prompt == null ? '' : params.prompt);
        if (!p2) return { ok: false, error: { code: 'invalid_params', message: 'prompt 不能为空' } };
        if (p2.length + String(params.system == null ? '' : params.system).length > 16000) {
          return { ok: false, error: { code: 'quota_exceeded', message: 'prompt+system 超过 16000 字符上限' } };
        }
        return { ok: true, result: { text: '[模拟 AI 响应] 收到 ' + p2.length + ' 字符的请求；装进桌面端后由平台辅助模型作答。', modelId: 'simulated' } };
      }

      // ---- evidence.*：模拟器没有真文档，给固定假值让插件的分支能跑通 ----
      case 'evidence.link':
        if (!need('editor')) return denied('editor');
        return { ok: true, result: { linkKey: 'EVID_MOCK', targetIds: [1] } };

      case 'evidence.list':
        if (!need('file_read')) return denied('file_read');
        return { ok: true, result: { links: [] } };

      case 'evidence.locate':
        if (!need('editor')) return denied('editor');
        return { ok: true, result: {} };

      default:
        return { ok: false, error: { code: 'unknown_method', message: '未知方法：' + method } };
    }
  }

  function denied(permission) {
    return {
      ok: false,
      error: { code: 'permission_denied', message: 'manifest.permissions 未声明 ' + permission }
    };
  }

  window.addEventListener('message', function (event) {
    // 只认来自被托管 iframe 的消息（桌面端同样校验来源窗口）
    if (event.source !== frame.contentWindow) return;
    var msg = event.data;
    if (!msg || msg.awd !== PROTOCOL || msg.type !== 'call') return;
    log('in', '-> ' + msg.method + ' #' + msg.seq);
    SIM_READY.then(function () {
      var out = handle(msg.method, msg.params || {});
      reply(msg.seq, out.ok, out.ok ? out.result : out.error);
    }).catch(function () { reply(msg.seq, false, { code: 'invalid_manifest', message: 'Simulator could not load manifest or execute fixture' }); });
  });

  // 桌面端的时序：iframe load 之后才握手
  frame.addEventListener('load', function () {
    var init = { awd: PROTOCOL, type: 'init', context: getContext() };
    log('out', '<- ' + JSON.stringify(init));
    frame.contentWindow.postMessage(init, '*');
  });

  var failButton = document.createElement('button');
  failButton.textContent = '切换服务失败 / Toggle synthetic failure';
  failButton.addEventListener('click', function () { SIM_FAILURE = !SIM_FAILURE; failButton.textContent = 'Synthetic failure: ' + SIM_FAILURE; });
  document.querySelector('header').appendChild(failButton);

  // ---- 浅色/深色切换：不装桌面端也能调两个主题 ----
  var themeToggleBtn = document.getElementById('themeToggle');
  themeToggleBtn.addEventListener('click', function () {
    currentTheme = currentTheme === 'light' ? 'dark' : 'light';
    themeToggleBtn.textContent = currentTheme === 'light' ? '切换到深色' : '切换到浅色';
    var msg = { awd: PROTOCOL, type: 'theme', theme: currentTheme, tokens: THEMES[currentTheme] };
    log('out', '<- ' + JSON.stringify(msg));
    frame.contentWindow.postMessage(msg, '*');
  });

  // ---- 事件通道（v2.7）：手动触发，模拟宿主里文件树刷新/选区变化 ----
  document.getElementById('fireFilesChanged').addEventListener('click', function () {
    pushEvent('files.changed', { projectId: 'demo-project' });
  });
  document.getElementById('fireSelectionChanged').addEventListener('click', function () {
    pushEvent('selection.changed', { fileId: 101 });
  });
})();
</script>
</body>
</html>
`;


const WEB_SDK_TYPES = "// SPDX-FileCopyrightText: 2026 北京京微资易科技有限公司 and AI WorkDeck contributors\n// SPDX-License-Identifier: AGPL-3.0-or-later\nexport as namespace awd;\nexport = awd;\ndeclare const awd: awd.SDK;\ndeclare global { interface Window { awd: awd.SDK } }\ndeclare namespace awd {\n  type Json = null | boolean | number | string | Json[] | { [key: string]: Json };\n  type Params = Record<string, unknown>;\n  interface CallOptions { signal?: AbortSignal; /** 1–300000 ms; default 60000. */ timeoutMs?: number }\n  interface RequestOptions extends CallOptions { requestId?: string }\n  interface SettingsOptions extends CallOptions { scope?: 'user' | 'project'; projectId?: number | string }\n  interface ConnectionSummary { id: string; label?: string; connected?: boolean; needsReconnect?: boolean; [key: string]: unknown }\n  interface McpServer { id: string; name?: string; [key: string]: unknown }\n  interface BillingStatus { provider: 'host' | 'developer'; active: boolean; plan?: string; /** Host status: false means cached/offline, not a fresh payment confirmation. */ refreshed?: boolean }\n  interface BridgeError extends Error { code: string }\n  interface Context { pluginId?: string; projectId?: number | string | null; language?: string; theme?: 'light' | 'dark'; themeTokens?: Record<string, string>; [key: string]: unknown }\n  interface File { path: string; name: string; size: number; [key: string]: unknown }\n  interface Rect { left: number; top: number; width: number; height: number }\n  interface Drag extends File { dragToken: string; dragType: string; expiresAt: number; hostHandle?: boolean }\n  interface Target { path: string; locator?: string; relation?: string; method?: string; note?: string }\n  interface EvidenceLink { anchor: { selection: true } | { quote: string }; docPath?: string; targets: Target[] }\n  interface NotificationInput {\n    /** Stable across retries; a different payload needs a new key. */\n    eventKey: string; title: string; body?: string; kind?: string; actionState?: 'none' | 'pending';\n    /** Opens only this plugin. The target never executes a business decision. */\n    target?: { kind: 'plugin'; pluginId: string; view?: string; recordId?: string };\n  }\n  interface ProgressState {\n    title?: string;\n    detail?: string;\n    percent?: number;\n    safetyNote?: string;\n    cancelText?: string;\n    onCancel?: () => void;\n  }\n  interface ProgressController {\n    update(next: ProgressState | null | false): void;\n    clear(): void;\n  }\n  interface SDK {\n    readonly version: string;\n    context: Context | null;\n    ready(): Promise<Context>;\n    call<T = unknown>(method: string, params?: Params, options?: CallOptions): Promise<T>;\n    files: {\n      list(options?: CallOptions): Promise<File[]>;\n      read(path: string, options?: CallOptions): Promise<{ path: string; content: string; truncated: boolean }>;\n      prepareDrag(path: string, rect?: Rect, options?: CallOptions): Promise<Drag>;\n      endDrag(options?: CallOptions): Promise<unknown>;\n    };\n    ui: {\n      /** Open this plugin's declared workspace. Rejects unavailable or unknown_method on older hosts. */\n      openWorkspace(): Promise<Record<string, never>>;\n      toast(message: string, options?: CallOptions): Promise<unknown>;\n      openFile(path: string, options?: CallOptions): Promise<unknown>;\n      progress(target: string | Element | null, state?: ProgressState | null | false): ProgressController;\n    };\n    tools: { invoke(name: string, args?: Params, options?: CallOptions): Promise<string> };\n    chat: { send(prompt: string, options?: CallOptions): Promise<unknown>; addFile(path: string, options?: CallOptions): Promise<unknown> };\n    im: { request<T = unknown>(action: string, params?: Params, options?: CallOptions): Promise<T> };\n    notifications: {\n      publish<T = unknown>(notification: NotificationInput, options?: CallOptions): Promise<T>;\n      resolve<T = unknown>(eventKey: string, state?: 'done' | 'cancelled', options?: CallOptions): Promise<T>;\n    };\n    lawfirm: { request<T = unknown>(action: string, params?: Params, options?: CallOptions): Promise<T> };\n    storage: { get<T = Json>(key: string, options?: CallOptions): Promise<T | null>; set(key: string, value: Json, options?: CallOptions): Promise<unknown> };\n    settings: {\n      get(key: string, options?: CallOptions): Promise<string>;\n      open(options?: CallOptions): Promise<unknown>;\n      /** Only declared, non-secret settings. Credentials belong to connections.connect host UI. */\n      update(values: Record<string, string>, options?: SettingsOptions): Promise<unknown>;\n    };\n    services: {\n      request<T = unknown>(service: string, operation: string, params?: Params, options?: RequestOptions): Promise<T>;\n      cancel(params: { requestId: string }, options?: CallOptions): Promise<unknown>;\n    };\n    mcp: { servers(options?: CallOptions): Promise<{ servers: McpServer[] }>; call<T = unknown>(serverId: string, name: string, args?: Params, options?: CallOptions): Promise<T> };\n    connections: {\n      list(options?: CallOptions): Promise<{ connections: ConnectionSummary[] }>;\n      connect(id: string, options?: CallOptions): Promise<{ opened: true }>;\n      disconnect(id: string, options?: CallOptions): Promise<unknown>;\n      request<T = unknown>(id: string, operation: string, params?: Params, options?: CallOptions): Promise<T>;\n    };\n    billing: { status(connectionId?: string, options?: CallOptions): Promise<BillingStatus>; checkout(connectionId?: string, options?: CallOptions): Promise<unknown> };\n    theme: { get(): { mode: 'light' | 'dark'; tokens: Record<string, string> }; onChange(cb: (mode: 'light' | 'dark', tokens: Record<string, string>) => void): () => void };\n    evidence: { link(params: EvidenceLink, options?: CallOptions): Promise<{ linkKey: string; targetIds: string[] }>; list<T = unknown>(params?: { docPath?: string; path?: string; sectionPath?: string; status?: string }, options?: CallOptions): Promise<T>; locate(params: { linkKey: string; targetId?: string }, options?: CallOptions): Promise<unknown> };\n    doc: {\n      exec<T = unknown>(action: string, params?: Params, options?: CallOptions): Promise<T>;\n      active(options?: CallOptions): Promise<{ fileId: string | number | null; kind: 'writer' | 'calc' | 'impress' | null }>;\n      getText<T = unknown>(options?: CallOptions): Promise<T>;\n      getSelection<T = unknown>(options?: CallOptions): Promise<T>;\n      find<T = unknown>(text: string, options?: CallOptions): Promise<T>;\n      insertText(text: string, options?: CallOptions): Promise<unknown>;\n      addComment(anchorText: string, text: string, options?: CallOptions): Promise<unknown>;\n    };\n    events: { on<T = Params>(name: string, cb: (data: T) => void): () => void };\n    ai: { request(prompt: string, options?: CallOptions & { system?: string; purpose?: string }): Promise<string> };\n  }\n}\n";
const WEB_MANIFEST_SCHEMA = "{\n  \"$schema\": \"https://json-schema.org/draft/2020-12/schema\",\n  \"$id\": \"urn:aiworkdeck:plugin-manifest:1.6\",\n  \"$comment\": \"SPDX-FileCopyrightText: 2026 北京京微资易科技有限公司 and AI WorkDeck contributors; SPDX-License-Identifier: AGPL-3.0-or-later\",\n  \"title\": \"AI WorkDeck plugin manifest (SDK 1.6)\",\n  \"type\": \"object\",\n  \"properties\": {\n    \"$schema\": {\n      \"type\": \"string\"\n    },\n    \"id\": {\n      \"type\": \"string\",\n      \"pattern\": \"^[a-z0-9][a-z0-9-]{1,49}$\"\n    },\n    \"name\": {\n      \"type\": \"string\",\n      \"minLength\": 1\n    },\n    \"version\": {\n      \"type\": \"string\",\n      \"pattern\": \"^[0-9]+\\\\.[0-9]+\\\\.[0-9]+(?:-[0-9A-Za-z.-]+)?(?:\\\\+[0-9A-Za-z.-]+)?$\"\n    },\n    \"description\": {\n      \"type\": \"string\"\n    },\n    \"author\": {\n      \"type\": \"string\"\n    },\n    \"homepage\": {\n      \"type\": \"string\"\n    },\n    \"icon\": {\n      \"type\": \"string\"\n    },\n    \"minHostVersion\": {\n      \"type\": \"string\",\n      \"pattern\": \"^[0-9]+\\\\.[0-9]+\\\\.[0-9]+$\"\n    },\n    \"frontendEntry\": {\n      \"type\": \"string\",\n      \"pattern\": \"^(?!.*(?:^|/)\\\\.\\\\.(?:/|$))(?!.*[\\\\\\\\%?#:])web/.+\\\\.html?$\"\n    },\n    \"permissions\": {\n      \"type\": \"array\",\n      \"items\": {\n        \"enum\": [\n          \"file_read\",\n          \"file_write\",\n          \"network\",\n          \"editor\",\n          \"ai\",\n          \"im\",\n          \"notifications\",\n          \"lawfirm\",\n          \"speech\",\n          \"tasks\",\n          \"clipboard\"\n        ]\n      },\n      \"uniqueItems\": true\n    },\n    \"backendJars\": {\n      \"type\": \"array\",\n      \"items\": {\n        \"type\": \"string\",\n        \"pattern\": \"^(?!/)(?!.*(?:^|/)\\\\.\\\\.(?:/|$))(?!.*\\\\\\\\).+$\"\n      }\n    },\n    \"skills\": {\n      \"type\": \"array\",\n      \"items\": {\n        \"type\": \"string\",\n        \"pattern\": \"^(?!/)(?!.*(?:^|/)\\\\.\\\\.(?:/|$))(?!.*\\\\\\\\).+$\"\n      }\n    },\n    \"packs\": {\n      \"type\": \"array\",\n      \"items\": {\n        \"type\": \"string\",\n        \"pattern\": \"^[a-z0-9][a-z0-9-]{1,49}$\"\n      }\n    },\n    \"tools\": {\n      \"type\": \"array\",\n      \"items\": {\n        \"type\": \"object\",\n        \"properties\": {\n          \"name\": {\n            \"type\": \"string\"\n          },\n          \"description\": {\n            \"type\": \"string\"\n          }\n        },\n        \"required\": [\n          \"name\"\n        ],\n        \"additionalProperties\": true\n      }\n    },\n    \"guide\": {\n      \"type\": \"object\"\n    },\n    \"settings\": {\n      \"type\": \"array\",\n      \"items\": {\n        \"$ref\": \"#/$defs/setting\"\n      },\n      \"maxItems\": 20\n    },\n    \"contributes\": {\n      \"type\": \"object\",\n      \"properties\": {\n        \"views\": {\n          \"type\": \"array\",\n          \"items\": {\n            \"$ref\": \"#/$defs/view\"\n          },\n          \"maxItems\": 2,\n          \"description\": \"Omitted preserves legacy UI. An empty array disables rail, panel and workspace entries; otherwise only declared placements are available. UI declarations do not grant permissions.\"\n        },\n        \"connections\": {\n          \"type\": \"array\",\n          \"items\": {\n            \"$ref\": \"#/$defs/connection\"\n          },\n          \"maxItems\": 10\n        },\n        \"templates\": {\n          \"type\": \"array\",\n          \"items\": {\n            \"$ref\": \"#/$defs/fileContribution\"\n          }\n        },\n        \"styleProfiles\": {\n          \"type\": \"array\",\n          \"items\": {\n            \"$ref\": \"#/$defs/fileContribution\"\n          }\n        },\n        \"themes\": {\n          \"type\": \"array\",\n          \"items\": {\n            \"$ref\": \"#/$defs/fileContribution\"\n          }\n        },\n        \"capabilities\": {\n          \"type\": \"array\",\n          \"items\": {\n            \"$ref\": \"#/$defs/capability\"\n          }\n        },\n        \"evidenceSources\": {\n          \"type\": \"array\",\n          \"items\": {\n            \"$ref\": \"#/$defs/evidenceSource\"\n          }\n        },\n        \"mcpServers\": {\n          \"type\": \"array\",\n          \"maxItems\": 8,\n          \"items\": {\n            \"$ref\": \"#/$defs/mcpServer\"\n          }\n        }\n      },\n      \"required\": [],\n      \"additionalProperties\": false\n    }\n  },\n  \"required\": [\n    \"id\",\n    \"name\",\n    \"version\"\n  ],\n  \"additionalProperties\": false,\n  \"$defs\": {\n    \"setting\": {\n      \"type\": \"object\",\n      \"properties\": {\n        \"key\": {\n          \"type\": \"string\",\n          \"pattern\": \"^[a-zA-Z0-9][a-zA-Z0-9._-]{0,63}$\"\n        },\n        \"type\": {\n          \"enum\": [\n            \"string\",\n            \"boolean\",\n            \"number\",\n            \"select\"\n          ]\n        },\n        \"label\": {\n          \"type\": \"string\"\n        },\n        \"description\": {\n          \"type\": \"string\"\n        },\n        \"default\": {},\n        \"options\": {\n          \"type\": \"array\",\n          \"items\": {\n            \"type\": \"string\"\n          }\n        },\n        \"secret\": {\n          \"type\": \"boolean\"\n        },\n        \"scope\": {\n          \"enum\": [\n            \"installation\",\n            \"user\",\n            \"project\"\n          ]\n        }\n      },\n      \"required\": [\n        \"key\",\n        \"type\",\n        \"label\"\n      ],\n      \"additionalProperties\": false\n    },\n    \"view\": {\n      \"type\": \"object\",\n      \"properties\": {\n        \"id\": {\n          \"type\": \"string\",\n          \"pattern\": \"^[a-z][a-z0-9-]{0,49}$\"\n        },\n        \"name\": {\n          \"type\": \"string\"\n        },\n        \"entry\": {\n          \"type\": \"string\",\n          \"pattern\": \"^(?!.*(?:^|/)\\\\.\\\\.(?:/|$))(?!.*[\\\\\\\\%?#:])web/.+\\\\.html?$\"\n        },\n        \"placement\": {\n          \"enum\": [\n            \"sidebar\",\n            \"workspace\"\n          ]\n        },\n        \"scope\": {\n          \"enum\": [\n            \"project\",\n            \"global\"\n          ]\n        },\n        \"defaultDock\": {\n          \"enum\": [\n            \"left\",\n            \"right\",\n            \"bottom\"\n          ]\n        },\n        \"allowedDocks\": {\n          \"type\": \"array\",\n          \"items\": {\n            \"enum\": [\n              \"left\",\n              \"right\",\n              \"bottom\"\n            ]\n          },\n          \"minItems\": 1,\n          \"uniqueItems\": true\n        }\n      },\n      \"required\": [\n        \"id\",\n        \"name\",\n        \"entry\",\n        \"placement\",\n        \"scope\"\n      ],\n      \"additionalProperties\": false\n    },\n    \"connection\": {\n      \"type\": \"object\",\n      \"properties\": {\n        \"id\": {\n          \"type\": \"string\",\n          \"pattern\": \"^[a-z][a-z0-9-]{0,49}$\"\n        },\n        \"label\": {\n          \"type\": \"string\",\n          \"minLength\": 1\n        },\n        \"baseUrl\": {\n          \"type\": \"string\",\n          \"pattern\": \"^https://[^\\\\s]+$\"\n        },\n        \"auth\": {\n          \"type\": \"object\",\n          \"properties\": {\n            \"type\": {\n              \"enum\": [\n                \"none\",\n                \"bearer\",\n                \"oauth2\"\n              ]\n            },\n            \"authorizationUrl\": {\n              \"type\": \"string\",\n              \"pattern\": \"^https://[^\\\\s]+$\"\n            },\n            \"tokenUrl\": {\n              \"type\": \"string\",\n              \"pattern\": \"^https://[^\\\\s]+$\"\n            },\n            \"clientId\": {\n              \"type\": \"string\",\n              \"minLength\": 1,\n              \"maxLength\": 512\n            },\n            \"scopes\": {\n              \"type\": \"array\",\n              \"items\": {\n                \"type\": \"string\",\n                \"minLength\": 1,\n                \"maxLength\": 200,\n                \"pattern\": \"^\\\\S+$\"\n              },\n              \"uniqueItems\": true\n            }\n          },\n          \"required\": [\n            \"type\"\n          ],\n          \"additionalProperties\": false,\n          \"oneOf\": [\n            {\n              \"properties\": {\n                \"type\": {\n                  \"const\": \"none\"\n                }\n              }\n            },\n            {\n              \"properties\": {\n                \"type\": {\n                  \"const\": \"bearer\"\n                }\n              }\n            },\n            {\n              \"properties\": {\n                \"type\": {\n                  \"const\": \"oauth2\"\n                }\n              },\n              \"required\": [\n                \"authorizationUrl\",\n                \"tokenUrl\",\n                \"clientId\"\n              ]\n            }\n          ]\n        },\n        \"operations\": {\n          \"type\": \"object\",\n          \"minProperties\": 1,\n          \"propertyNames\": {\n            \"type\": \"string\",\n            \"pattern\": \"^[a-zA-Z][a-zA-Z0-9._-]{0,63}$\"\n          },\n          \"additionalProperties\": {\n            \"type\": \"object\",\n            \"properties\": {\n              \"path\": {\n                \"type\": \"string\",\n                \"pattern\": \"^/(?!.*//)[a-zA-Z0-9/_-]*$\"\n              },\n              \"method\": {\n                \"enum\": [\n                  \"GET\",\n                  \"POST\"\n                ]\n              }\n            },\n            \"required\": [\n              \"path\",\n              \"method\"\n            ],\n            \"additionalProperties\": false\n          },\n          \"maxProperties\": 30\n        },\n        \"billing\": {\n          \"type\": \"object\",\n          \"properties\": {\n            \"statusOperation\": {\n              \"type\": \"string\",\n              \"pattern\": \"^[a-zA-Z0-9][a-zA-Z0-9._-]{0,63}$\"\n            },\n            \"checkoutUrl\": {\n              \"type\": \"string\",\n              \"pattern\": \"^https://[^\\\\s]+$\"\n            }\n          },\n          \"required\": [\n            \"statusOperation\",\n            \"checkoutUrl\"\n          ],\n          \"additionalProperties\": false\n        }\n      },\n      \"required\": [\n        \"id\",\n        \"label\",\n        \"baseUrl\",\n        \"auth\",\n        \"operations\"\n      ],\n      \"additionalProperties\": false\n    },\n    \"capability\": {\n      \"type\": \"object\",\n      \"properties\": {\n        \"id\": {\n          \"type\": \"string\",\n          \"pattern\": \"^[a-zA-Z0-9][a-zA-Z0-9._-]{0,63}$\"\n        },\n        \"capability\": {\n          \"type\": \"string\"\n        },\n        \"kind\": {\n          \"enum\": [\n            \"web\",\n            \"data\",\n            \"process\"\n          ]\n        },\n        \"entry\": {\n          \"type\": \"string\",\n          \"pattern\": \"^(?!/)(?!.*(?:^|/)\\\\.\\\\.(?:/|$))(?!.*\\\\\\\\).+$\"\n        },\n        \"protocol\": {\n          \"type\": \"string\"\n        },\n        \"runtime\": {\n          \"type\": \"string\"\n        }\n      },\n      \"required\": [\n        \"id\",\n        \"capability\",\n        \"kind\",\n        \"entry\",\n        \"protocol\"\n      ],\n      \"additionalProperties\": false\n    },\n    \"evidenceSource\": {\n      \"type\": \"object\",\n      \"properties\": {\n        \"sourceId\": {\n          \"type\": \"string\"\n        },\n        \"name\": {\n          \"type\": \"string\"\n        },\n        \"description\": {\n          \"type\": \"string\"\n        },\n        \"transport\": {\n          \"enum\": [\n            \"spi\",\n            \"mcp\"\n          ]\n        },\n        \"server\": {\n          \"type\": \"object\",\n          \"properties\": {\n            \"url\": {\n              \"type\": \"string\",\n              \"pattern\": \"^https://[^\\\\s]+$\"\n            },\n            \"tokenSettingKey\": {\n              \"type\": \"string\"\n            }\n          },\n          \"required\": [\n            \"url\"\n          ],\n          \"additionalProperties\": false\n        },\n        \"tool\": {\n          \"type\": \"string\"\n        }\n      },\n      \"required\": [\n        \"sourceId\",\n        \"name\"\n      ],\n      \"additionalProperties\": false\n    },\n    \"fileContribution\": {\n      \"type\": \"object\",\n      \"properties\": {\n        \"id\": {\n          \"type\": \"string\",\n          \"pattern\": \"^[a-zA-Z0-9][a-zA-Z0-9._-]{0,63}$\"\n        },\n        \"name\": {\n          \"type\": \"string\"\n        },\n        \"file\": {\n          \"type\": \"string\",\n          \"pattern\": \"^(?!/)(?!.*(?:^|/)\\\\.\\\\.(?:/|$))(?!.*\\\\\\\\).+$\"\n        },\n        \"genre\": {\n          \"type\": \"string\"\n        },\n        \"description\": {\n          \"type\": \"string\"\n        },\n        \"language\": {\n          \"type\": \"string\"\n        }\n      },\n      \"required\": [\n        \"id\",\n        \"name\",\n        \"file\"\n      ],\n      \"additionalProperties\": false\n    },\n    \"mcpServer\": {\n      \"type\": \"object\",\n      \"properties\": {\n        \"id\": {\n          \"type\": \"string\",\n          \"pattern\": \"^[a-z0-9][a-z0-9-]{0,39}$\"\n        },\n        \"transport\": {\n          \"const\": \"streamable-http\"\n        },\n        \"url\": {\n          \"type\": \"string\",\n          \"pattern\": \"^https://[^\\\\s]+$\"\n        },\n        \"credentialKey\": {\n          \"type\": \"string\",\n          \"pattern\": \"^[A-Za-z][A-Za-z0-9_-]{0,63}$\"\n        },\n        \"connectionId\": {\n          \"type\": \"string\",\n          \"pattern\": \"^[a-z][a-z0-9-]{0,49}$\"\n        },\n        \"tools\": {\n          \"type\": \"array\",\n          \"minItems\": 1,\n          \"maxItems\": 64,\n          \"items\": {\n            \"$ref\": \"#/$defs/mcpTool\"\n          }\n        }\n      },\n      \"required\": [\n        \"id\",\n        \"transport\",\n        \"url\",\n        \"tools\"\n      ],\n      \"additionalProperties\": false\n    },\n    \"mcpTool\": {\n      \"type\": \"object\",\n      \"properties\": {\n        \"name\": {\n          \"type\": \"string\",\n          \"pattern\": \"^[A-Za-z0-9_.-]{1,128}$\"\n        },\n        \"description\": {\n          \"type\": \"string\",\n          \"minLength\": 1,\n          \"maxLength\": 2000\n        },\n        \"inputSchema\": {\n          \"$ref\": \"#/$defs/mcpObjectSchema\"\n        }\n      },\n      \"required\": [\n        \"name\",\n        \"description\",\n        \"inputSchema\"\n      ],\n      \"additionalProperties\": false\n    },\n    \"mcpObjectSchema\": {\n      \"type\": \"object\",\n      \"properties\": {\n        \"type\": {\n          \"const\": \"object\"\n        },\n        \"description\": {\n          \"type\": \"string\",\n          \"maxLength\": 2000\n        },\n        \"title\": {\n          \"type\": \"string\"\n        },\n        \"properties\": {\n          \"type\": \"object\",\n          \"maxProperties\": 64,\n          \"propertyNames\": {\n            \"type\": \"string\",\n            \"pattern\": \"^[A-Za-z_][A-Za-z0-9_-]{0,63}$\"\n          },\n          \"additionalProperties\": {\n            \"$ref\": \"#/$defs/mcpSchema\"\n          }\n        },\n        \"required\": {\n          \"type\": \"array\",\n          \"items\": {\n            \"type\": \"string\"\n          }\n        },\n        \"additionalProperties\": {\n          \"type\": \"boolean\"\n        }\n      },\n      \"required\": [\n        \"type\"\n      ],\n      \"additionalProperties\": false\n    },\n    \"mcpSchema\": {\n      \"oneOf\": [\n        {\n          \"$ref\": \"#/$defs/mcpObjectSchema\"\n        },\n        {\n          \"type\": \"object\",\n          \"properties\": {\n            \"type\": {\n              \"const\": \"array\"\n            },\n            \"description\": {\n              \"type\": \"string\",\n              \"maxLength\": 2000\n            },\n            \"title\": {\n              \"type\": \"string\"\n            },\n            \"items\": {\n              \"$ref\": \"#/$defs/mcpSchema\"\n            }\n          },\n          \"required\": [\n            \"type\",\n            \"items\"\n          ],\n          \"additionalProperties\": false\n        },\n        {\n          \"type\": \"object\",\n          \"properties\": {\n            \"type\": {\n              \"const\": \"string\"\n            },\n            \"description\": {\n              \"type\": \"string\",\n              \"maxLength\": 2000\n            },\n            \"title\": {\n              \"type\": \"string\"\n            },\n            \"enum\": {\n              \"type\": \"array\",\n              \"minItems\": 1,\n              \"maxItems\": 100,\n              \"items\": {\n                \"type\": \"string\"\n              }\n            }\n          },\n          \"required\": [\n            \"type\"\n          ],\n          \"additionalProperties\": false\n        },\n        {\n          \"type\": \"object\",\n          \"properties\": {\n            \"type\": {\n              \"enum\": [\n                \"number\",\n                \"integer\",\n                \"boolean\"\n              ]\n            },\n            \"description\": {\n              \"type\": \"string\",\n              \"maxLength\": 2000\n            },\n            \"title\": {\n              \"type\": \"string\"\n            }\n          },\n          \"required\": [\n            \"type\"\n          ],\n          \"additionalProperties\": false\n        }\n      ]\n    }\n  }\n}\n";

const WEB_README_MD = `# AI WorkDeck Web plugin · SDK 1.8 preview

${PLATFORM_GUIDE.zh.notice}

${PLATFORM_GUIDE.en.notice}

## 开始 / Start

The basic manifest uses only the established file-read API. The optional
examples/platform-manifest.json demonstrates new host capabilities: replace the
placeholder services and review permissions before using it as manifest.json.
No new-host minimum release number is claimed while the host is unreleased.

Use Node.js 20+; keep scripts/ and sdk/plugin-sdk/ in their relative locations.
Do not bundle secrets or host trust markers. Package output must stay outside the plugin folder.

\`\`\`sh
${PLATFORM_COMMANDS}
\`\`\`

## 平台契约

${PLATFORM_GUIDE.zh.paragraphs.join('\n\n')}

## Platform contract

${PLATFORM_GUIDE.en.paragraphs.join('\n\n')}

## 给 Agent 的任务 / Agent task

See AGENT_TASK.md. Fill in your feature and acceptance criteria before handing it to an Agent.

## 调试边界 / Simulator limits

Serve the extracted directory over HTTP and open dev/host-simulator.html.
Use python3 -m http.server; if using npx serve, set cleanUrls: false to prevent
rewriting web/index.html and breaking its relative SDK URL.
The simulator reads your manifest and uses synthetic connections, settings and MCP results.
It never logs in, charges, calls remote services or plays real speech. Host service operations
return host_required unless explicitly simulated. Permission denial and a synthetic service failure
can be exercised with the simulator controls. Real authentication, project ACL, DNS restrictions,
MCP protocol sessions, payment entitlement and cancellation of real operations require isolated
compatible-host testing. Do not add allow-same-origin to the sandbox.

## Submission

Submit only when explicitly requested, using your locally supplied website session cookie.
Successful submission means pending review, not publication. Human review and signing remain required.

${siteConfig.origin}/${siteConfig.defaultLocale}/plugins/develop
`;

export type TemplateType = 'java' | 'web';

/** 生成模板 zip 的二进制内容 */
export function buildTemplateZip(type: TemplateType = 'java'): Buffer {
  const zip = new AdmZip();
  if (type === 'web') {
    zip.addFile('manifest.json', Buffer.from(WEB_MANIFEST_JSON, 'utf8'));
    zip.addFile('README.md', Buffer.from(WEB_README_MD, 'utf8'));
    zip.addFile('AGENT_TASK.md', Buffer.from(PLATFORM_GUIDE.zh.agent + '\n\n---\n\n' + PLATFORM_GUIDE.en.agent, 'utf8'));
    zip.addFile('examples/platform-manifest.json', Buffer.from(PLATFORM_MANIFEST, 'utf8'));
    zip.addFile('web/index.html', Buffer.from(WEB_INDEX_HTML, 'utf8'));
    zip.addFile('web/awd-plugin-sdk.js', Buffer.from(WEB_SDK_JS, 'utf8'));
    zip.addFile('web/awd-plugin-sdk.d.ts', Buffer.from(WEB_SDK_TYPES, 'utf8'));
    zip.addFile('manifest.schema.json', Buffer.from(WEB_MANIFEST_SCHEMA, 'utf8'));
    zip.addFile('sdk/plugin-sdk/awd-plugin-sdk.js', Buffer.from(WEB_SDK_JS, 'utf8'));
    zip.addFile('sdk/plugin-sdk/awd-plugin-sdk.d.ts', Buffer.from(WEB_SDK_TYPES, 'utf8'));
    zip.addFile('sdk/plugin-sdk/manifest.schema.json', Buffer.from(WEB_MANIFEST_SCHEMA, 'utf8'));
    for (const [name, content] of Object.entries(PLATFORM_TEMPLATE_ASSETS)) zip.addFile(name, Buffer.from(content, 'utf8'));
    zip.addFile('dev/host-simulator.html', Buffer.from(WEB_HOST_SIMULATOR_HTML, 'utf8'));
    return zip.toBuffer();
  }
  zip.addFile('pom.xml', Buffer.from(POM_XML, 'utf8'));
  zip.addFile('manifest.json', Buffer.from(MANIFEST_JSON, 'utf8'));
  zip.addFile('README.md', Buffer.from(README_MD, 'utf8'));
  zip.addFile(
    'src/main/java/com/example/myplugin/MyTools.java',
    Buffer.from(TOOLS_JAVA, 'utf8'),
  );
  return zip.toBuffer();
}

/** 供开发指南页直接展示的片段，避免文档与模板各写一份而走样 */
export const TEMPLATE_SNIPPETS = {
  tools: TOOLS_JAVA,
  manifest: MANIFEST_JSON,
  pomDependency: `<dependency>
  <groupId>dev.langchain4j</groupId>
  <artifactId>langchain4j-core</artifactId>
  <version>0.36.0</version>
  <scope>provided</scope>
</dependency>`,
  webManifest: WEB_MANIFEST_JSON,
  webUsage: `<script src="awd-plugin-sdk.js"></script>
<script>
  const ctx = await awd.ready();                   // { pluginId, projectId, language, theme, themeTokens }
  const files = await awd.files.list();            // 需 file_read
  const doc = await awd.files.read(files[0].path); // { path, content, truncated }
  await awd.ui.toast('已完成');
  await awd.storage.set('draft', { title: 'x' });  // 插件级 KV，上限 64 KB
</script>`,
};

const TOOLS_JAVA_EN = `package com.example.myplugin;

import dev.langchain4j.agent.tool.Tool;

/**
 * Plugin tool class.
 *
 * Three hard rules — break any one of them and the tool will not be visible to the AI:
 * 1. Must have a no-arg constructor (instantiated via reflection by the host);
 * 2. Annotate tool methods with @Tool; the method name is the tool name and must match manifest.json tools[].name;
 * 3. Use String parameters and return values for simplicity (serialize complex structures as JSON strings).
 *
 * The @Tool description is read by the AI and determines when it invokes this tool.
 * State clearly when to call it rather than only how it is implemented.
 */
public class MyTools {

    @Tool("Count characters and CJK characters in a text passage and return a readable summary. Call when the user asks for character or word counts.")
    public String countChinese(String text) {
        if (text == null || text.isBlank()) {
            return "Empty input: 0 characters";
        }
        long cjk = text.codePoints()
                .filter(cp -> Character.UnicodeScript.of(cp) == Character.UnicodeScript.HAN)
                .count();
        return String.format("Total %d chars, including %d CJK chars", text.length(), cjk);
    }
}
`;

const MANIFEST_JSON_EN = `{
  "id": "my-plugin",
  "name": "My Plugin",
  "version": "1.0.0",
  "description": "One sentence explaining what this plugin does for users, shown on the marketplace card.",
  "author": "Your Name or Team",
  "homepage": "https://example.com",
  "permissions": [],
  "tools": [
    {
      "name": "countChinese",
      "description": "Count characters in text",
      "permissions": []
    }
  ],
  "backendJars": ["my-plugin-1.0.0.jar"]
}
`;

const WEB_MANIFEST_JSON_EN = `{
  "id": "my-web-plugin",
  "name": "My Web Plugin",
  "version": "1.0.0",
  "description": "One sentence explaining what this plugin does for users, shown on the marketplace card.",
  "author": "Your Name or Team",
  "homepage": "https://example.com",
  "frontendEntry": "web/index.html",
  "permissions": ["file_read"],
  "minHostVersion": "0.27.4",
  "backendJars": [],
  "tools": []
}
`;

export const TEMPLATE_SNIPPETS_EN: typeof TEMPLATE_SNIPPETS = {
  tools: TOOLS_JAVA_EN,
  manifest: MANIFEST_JSON_EN,
  pomDependency: TEMPLATE_SNIPPETS.pomDependency,
  webManifest: WEB_MANIFEST_JSON_EN,
  webUsage: `<script src="awd-plugin-sdk.js"></script>
<script>
  const ctx = await awd.ready();                   // { pluginId, projectId, language, theme, themeTokens }
  const files = await awd.files.list();            // requires file_read
  const doc = await awd.files.read(files[0].path); // { path, content, truncated }
  await awd.ui.toast('Completed');
  await awd.storage.set('draft', { title: 'x' });  // plugin-scoped KV, capped at 64 KB
</script>`,
};

export function getTemplateSnippets(lang: Locale = 'zh'): typeof TEMPLATE_SNIPPETS {
  return toBaseLocale(lang) === 'en' ? TEMPLATE_SNIPPETS_EN : TEMPLATE_SNIPPETS;
}

/** SDK v1 方法表：模板 README 与开发指南页共用一份，避免两处走样 */
export const WEB_SDK_METHODS: { method: string; params: string; result: string; permission: string; permissionEn: string }[] = [
  { method: 'settings.open / settings.update', params: '{} / {values}', result: '{opened} / {}', permission: 'user / project settings; installation settings stay in trusted host UI', permissionEn: 'user / project settings; installation settings stay in trusted host UI' },
  { method: 'connections.list / connect / disconnect / request', params: '{id, operation?, params?}', result: 'connection state / service JSON', permission: 'network; host-held credentials and explicit developer trust', permissionEn: 'network; host-held credentials and explicit developer trust' },
  { method: 'mcp.servers / mcp.call', params: '{} / {serverId, name, arguments}', result: '{servers} / MCP CallToolResult', permission: 'network + project access; public HTTPS Streamable HTTP', permissionEn: 'network + project access; public HTTPS Streamable HTTP' },
  { method: 'billing.status / billing.checkout', params: '{connectionId?}', result: '{provider, active, plan?} / {opened}', permission: 'host purchase entitlement or developer subscription; no automatic charge', permissionEn: 'host purchase entitlement or developer subscription; no automatic charge' },
  { method: 'services.request / services.cancel', params: '{service, operation, params, requestId} / {requestId}', result: 'operation result', permission: 'explicit service catalog; per-operation permission checks', permissionEn: 'explicit service catalog; per-operation permission checks' },
  { method: 'context.get', params: '{}', result: '{ pluginId, projectId, language, theme, themeTokens }', permission: '-', permissionEn: '-' },
  { method: 'files.list', params: '{}', result: '{ files: [{ path, name, size }] }', permission: 'file_read', permissionEn: 'file_read' },
  { method: 'im.downloadAttachment', params: '{ conversationId, attachmentId }', result: '{ started, name }', permission: 'im（服务端附件权限校验，无需项目写权限）', permissionEn: 'im (server-side attachment ACL check; no project write permission required)' },
  { method: 'notifications.publish', params: '{ eventKey, title, body?, actionState?, target? }', result: 'notification', permission: 'notifications（当前账号收件箱；目标只打开本插件）', permissionEn: 'notifications (current account inbox; target opens only this plugin)' },
  { method: 'notifications.resolve', params: '{ eventKey, state }', result: 'notification', permission: 'notifications（只更新本插件消息，已读不会完成业务）', permissionEn: 'notifications (updates only this plugin’s notifications; marking read never completes business actions)' },
  { method: 'im.request', params: '{ action, params }', result: 'object', permission: 'im（宿主 0.61.0+；固定聊天动作，项目归档另需 file_write）', permissionEn: 'im (host 0.61.0+; fixed messaging actions, project archiving also requires file_write)' },
  { method: 'chat.addFile', params: '{ path }', result: '{}', permission: 'file_read（宿主 0.61.0+；添加材料，不自动发送）', permissionEn: 'file_read (host 0.61.0+; attaches material without auto-sending)' },
  { method: 'files.prepareDrag', params: '{ path }', result: '{ fileId, dragToken, dragType, expiresAt, ... }', permission: 'file_read（宿主 0.61.0+；短时单次拖拽票据）', permissionEn: 'file_read (host 0.61.0+; short-lived single-use drag ticket)' },
  { method: 'files.endDrag', params: '{}', result: '{}', permission: 'file_read（宿主 0.61.0+）', permissionEn: 'file_read (host 0.61.0+)' },
  { method: 'files.read', params: '{ path }', result: '{ path, content, truncated }', permission: 'file_read', permissionEn: 'file_read' },
  { method: 'ui.toast', params: '{ message }', result: '{}', permission: '-', permissionEn: '-' },
  { method: 'storage.get', params: '{ key }', result: '{ key, value }', permission: '-', permissionEn: '-' },
  { method: 'storage.set', params: '{ key, value }', result: '{}', permission: '-', permissionEn: '-' },
  { method: 'evidence.link', params: '{ anchor: { selection: true } | { quote }, docPath?, targets: [{ path, locator?, relation?, method?, note? }] }', result: '{ linkKey, targetIds }', permission: 'editor', permissionEn: 'editor' },
  { method: 'evidence.list', params: '{ docPath?, path?, sectionPath?, status? }', result: '{ links: [{ linkKey, docPath, anchorText, sectionPath, status, targets }] }', permission: 'file_read', permissionEn: 'file_read' },
  { method: 'evidence.locate', params: '{ linkKey, targetId? }', result: '{}', permission: 'editor', permissionEn: 'editor' },
  { method: 'tools.invoke', params: '{ name, args? }', result: '{ output }', permission: '-（工具须为本插件 manifest 声明）', permissionEn: '- (tool must be declared in this plugin’s manifest)' },
  { method: 'chat.send', params: '{ prompt }', result: '{}', permission: '-（上限 4000 字）', permissionEn: '- (up to 4,000 characters)' },
  { method: 'ui.openFile', params: '{ path }', result: '{}', permission: 'file_read', permissionEn: 'file_read' },
  { method: 'ui.openWorkspace', params: '{}', result: '{}', permission: '-', permissionEn: '-' },
  { method: 'doc.exec', params: '{ action, params? }', result: '{ result }', permission: 'editor（宿主 0.27.4+；action 为 doc_/sheet_/slide_ 安全子集）', permissionEn: 'editor (host 0.27.4+; action restricted to safe doc_/sheet_/slide_ subset)' },
  { method: 'doc.active', params: '{}', result: '{ fileId, kind }', permission: 'editor（宿主 0.27.4+）', permissionEn: 'editor (host 0.27.4+)' },
  { method: 'events.subscribe', params: '{ events: ["files.changed" | "selection.changed" | "project.switched"] }', result: '{ subscribed }', permission: '按事件（宿主 0.27.4+）', permissionEn: 'per event (host 0.27.4+)' },
  { method: 'events.unsubscribe', params: '{ events }', result: '{ subscribed }', permission: '-', permissionEn: '-' },
  { method: 'ai.request', params: '{ prompt, system?, purpose? }', result: '{ text, modelId }', permission: 'ai（宿主 0.27.4+；16000 字符、10 次/分钟，走用户 Credits）', permissionEn: 'ai (host 0.27.4+; 16,000 chars, 10 calls/min, billed via user Credits)' },
  { method: 'settings.get', params: '{ key }', result: '{ key, value }', permission: '-（宿主 0.28+；manifest 顶层 settings 声明的配置项，secret 项拿不到）', permissionEn: '- (host 0.28+; reads non-secret keys declared in top-level manifest settings)' },
];

export function getWebSdkMethods(lang: Locale = 'zh'): { method: string; params: string; result: string; permission: string }[] {
  const isEn = toBaseLocale(lang) === 'en';
  return WEB_SDK_METHODS.map(m => ({
    method: m.method,
    params: m.params,
    result: m.result,
    permission: isEn ? m.permissionEn : m.permission,
  }));
}
