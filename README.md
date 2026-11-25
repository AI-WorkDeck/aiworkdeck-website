<!-- SPDX-FileCopyrightText: 2026 北京公富信息技术有限公司 and AI WorkDeck contributors -->
<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->

# AI WorkDeck website

Source of the AI WorkDeck websites: product pages, downloads, the Marketplace (skills, plugins, MCP), accounts and billing, and the browser workbench at `/web/`.

- Mainland China: [www.aiworkdeck.com](https://www.aiworkdeck.com)
- International: [workdeck.ai](https://workdeck.ai)
- The desktop app and plugin SDK live in [AI-WorkDeck/aiworkdeck](https://github.com/AI-WorkDeck/aiworkdeck).

AI WorkDeck 官网源码：产品介绍、下载、Marketplace（技能、插件、MCP）、账户与计费，以及 `/web/` 网页工作台。桌面端与插件 SDK 在 [AI-WorkDeck/aiworkdeck](https://github.com/AI-WorkDeck/aiworkdeck)。

## Layout

| Path | What it is |
|---|---|
| `app/[lang]/` | Next.js pages, one route tree for all 20 interface languages |
| `app/api/` | API routes (accounts, registry, billing, web AI) |
| `components/`, `lib/` | Shared UI and server logic |
| `dictionaries/<locale>.json` | All user-visible text |
| `content/` | Release notes, articles, videos |
| `web-workbench/` | The `/web/` browser workbench (see `doc/web-workbench-deploy.md`) |
| `doc/`, `docs/` | Design notes and runbooks |

## Develop

Node 22.23.2 (the version CI uses).

```sh
npm ci
npm run dev       # http://localhost:3000
npm run check     # typecheck + locale parity; run before every commit
```

Rules for contributors and agents are in [CLAUDE.md](CLAUDE.md). The most important one: no hard-coded UI text; every string goes through `dictionaries/` (`npm run check:locales` enforces it).

## Deploy

Merging does not deploy. Production goes through the CI-built artifact and the gated promote workflow described in [DEPLOY.md](DEPLOY.md).

## License

[AGPL-3.0-or-later](LICENSE). Copyright 2026 北京公富信息技术有限公司 (BEIJING GONG FU INFORMATION TECHNOLOGY LIMITED) and AI WorkDeck contributors.
