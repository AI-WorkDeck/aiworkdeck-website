<!-- SPDX-FileCopyrightText: 2026 北京京微资易科技有限公司 and AI WorkDeck contributors -->
<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->

# AI WorkDeck Website (`aiworkdeck-website`) — Agent 入口

开始工作前请先阅读根目录 `CLAUDE.md`。

多语种令牌化必检（dev-board#1477）：所有新增或修改的页面、组件与 API 用户可见文案必须走 `dictionaries/<locale>.json` 与 `lib/api-locale.ts` 令牌化，严禁写死裸中文或内联三元表达式。每次提交或合并 PR 前必须运行 `npm run check`（含 `npm run check:locales`）并检查 diff，若有未令牌化文案或漏译词条，先补齐再提交/合并。
