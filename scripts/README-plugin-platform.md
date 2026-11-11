<!-- SPDX-FileCopyrightText: 2026 北京京微资易科技有限公司 and AI WorkDeck contributors -->
<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->

# Plugin platform verification

From the website root:

```sh
npm run test:plugin-platform
npm run typecheck
npm run build
```

The test command creates a new temporary working directory. Submission, sessions,
users and SQLite fixtures stay there; it does not use the website's real `data/`.
It calls the actual submission route with a synthetic local cookie and checks
401, accepted/pending and invalid/400 responses. No external login, payment or
service is called.

To additionally compare every downloadable SDK/CLI byte against the desktop
source, set `AWD_SDK_SOURCE` to the desktop repository root for the test command.
Without that variable, committed SHA256 digests still verify the template assets.
The test extracts the real template zip and runs its own CLI for validation and
packaging, with no desktop checkout dependency.

The generated simulator JavaScript is exercised in a VM with a small DOM shell.
This verifies its synthetic settings, connection and MCP paths, but is **not** a
browser, Electron, real OAuth, remote MCP lifecycle or payment test. Host services
return `host_required`; the simulator must never claim it executed them.

When the desktop SDK changes, update the JSON string literals in
`lib/plugin-template.ts`, the CLI/manifest type mirrors in
`lib/plugin-template-assets.ts`, and `scripts/plugin-template-digests.json`
together. Use `JSON.stringify` (or an equivalent JSON encoder), not JS template
literals: backslashes in regex and strings must survive unchanged. Keep the zip's
`scripts/` and `sdk/plugin-sdk/` relative layout so its CLI remains standalone.
