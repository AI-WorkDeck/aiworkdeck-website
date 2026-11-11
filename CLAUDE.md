<!-- SPDX-FileCopyrightText: 2026 北京京微资易科技有限公司 and AI WorkDeck contributors -->
<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->

# AI WorkDeck Website (`aiworkdeck-website`) — Agent 入口与根记忆

## 多语种令牌化硬规则与合并前必检（dev-board#1477）

1. **Day-One 全量令牌化，严禁写死文案**：
   - 所有页面（`app/[lang]/**`）、组件（`components/**`）的用户可见文案一律收口至 `dictionaries/<locale>.json`，通过字典令牌读取，严禁在 TSX 中写死裸中文或硬编码中英二元三元表达式（`lang === 'zh' ? ... : ...`）。
   - 双语/多语种数据层对象使用 `i18n-config.ts` 的 `pickLocale(map, lang)` / `toBaseLocale(lang)` 读取；日期与数字格式化使用 `LOCALE_META[lang].bcp47`。
   - 所有面向用户的 API 路由（`app/api/**`）与服务层（`lib/**`）错误/状态文案一律通过 `lib/api-locale.ts`（`resolveRequestLocale` + `pickLangText`）按请求语言返回。
   - **RTL 与 Geo-IP 分流**：`ar`（阿拉伯语）下 `<html dir="rtl">`，组件横向偏移与内边距优先使用 Tailwind 逻辑类（`start-*`、`end-*`、`ps-*`、`pe-*`、`ms-*`、`me-*`、`border-s`、`text-start`），代码块/URL/邮箱保持 `ltr`；中间件 `middleware.ts` 对未设置 `awd_lang` Cookie 的首访请求优先按 Geo-IP 国家头（`extractGeoCountry` + `matchCountryToLocale`）路由至对应默认语言。
2. **合并 PR 前必检与自动补齐**：
   - 每次提交或合并 PR 前，必须运行 `npm run check`（含 `tsc --noEmit` 与 `npm run check:locales`）并核对 PR diff。
   - 若发现未令牌化的硬编码文案、占位符 `{placeholder}` 不一致或词条缺失，**必须在当前分支补齐语言令牌与多语种词条、确保 `npm run check` 全绿后再提交/合并**。
