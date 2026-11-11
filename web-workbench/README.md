<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
# AI WorkDeck browser workbench

This is the corresponding source for the public `/web/` frontend and its pinned editor integration. It contains no website backend, environment settings, account data or test documents. AGPL-3.0-or-later applies to the workbench; third-party notices are in `UPSTREAM.md`, `licenses/` and `vendor/core/`.

## Reproduce the frontend

Requires Node.js 20+ with npm. Extract this directory beneath a disposable parent directory: the build writes `../public/web/`.

```
npm ci --ignore-scripts
npm run prepare:assets
npm run build
npm run preview
```

Open the printed localhost URL in current Chrome or Edge. The asset preparation script downloads exact pinned files and rejects SHA-256 or length mismatches. No credentials are needed to build or edit documents. The production AI endpoints are separate website services; local preview has AI disabled. Tests optionally use an explicitly labeled synthetic response and never imply a live model call.

`npm test` runs storage, version binding and SSE parser tests. `npm run test:browser` needs Microsoft Edge at the default macOS path, or `PUPPETEER_EXECUTABLE_PATH` pointing to Chrome/Edge. It uses a separate temporary browser profile, synthetic documents and random localhost port.

After building, `node tests/build-output.mjs` verifies the actual source archive against working sources and pinned vendor hashes. `node tests/runtime-browser.mjs` checks immediate runtime consumption, full-font readiness, explicit delivery failures and canceled transfers using the real built iframe. `node tests/fonts-browser.mjs` verifies four complete font families, original-font fallback, Chinese input, saved reload and actual DOCX download. Browser tests use local assets; they do not establish production latency or HTTP/2 behavior.

`node tests/progress-browser.mjs` checks the loading overlay under local network throttling, holds the real ready event to verify the initialization stage, and checks failure/retry, reduced motion and the desktop download link. Progress measures decoded content of six main resources (WASM, data and all four fonts), using totals derived from hash-verified build inputs. It does not describe wire bytes or include later JS/metadata requests. A single backpressured stream preserves immediate WASM compilation without a second retained body. Unknown/mismatched totals and initialization are indeterminate; resource completion never displays 100%. Native editor ready switches to indeterminate document opening; subsequent document operations hide the startup meter. No 100% completion screen is shown while a saved document is still being read or opened. Existing three-minute warning and ten-minute failure limits remain in force.

## Deployment contract

Serve the generated directory at `/web/` on the same origin as the website API. All workbench/editor responses need `Cross-Origin-Opener-Policy: same-origin` and `Cross-Origin-Embedder-Policy: require-corp`. Serve `.wasm` as `application/wasm` and `.data` as `application/octet-stream`; the pinned wasm/data bytes are Brotli-encoded and must have `Content-Encoding: br` (see `asset-manifest.json`). Do not recompress them. Invalid status, MIME, encoding, WASM or package length fails startup explicitly; runtime delivery has no raw-file or repeated-fetch fallback. CSP must permit the editor's WASM and blob workers. The preview server demonstrates the static headers.

The browser calls GET `/api/web/capabilities?lang=zh|en`, POST `/api/web/chat` (SSE), and GET `/api/web/requests/:requestId?lang=zh|en` using same-origin credentials. AI uses the website account's paid available balance. Cancellation stops receiving; it does not promise zero cost or cancel server settlement. Unknown charges remain unknown until a receipt is obtained. No completion request is automatically repeated.

Documents and chat history are stored in this browser's IndexedDB. Downloads are the portable backup. AI receives body paragraphs. Direct editing can additionally read bounded basic tables on demand; headers, footers and footnotes are excluded. Oversized contexts are rejected rather than silently truncated.

## Source and notices

The build emits `source.zip` from an explicit allowlist and `source-manifest.json` with the upstream editor provenance. It never includes `.env`, `.cache`, `node_modules`, generated output, test results or the private website backend. Keep the public source download and notices available with deployments. The base editor snapshot and explicitly recorded backports are verified against their distributed file hashes before building.

The shell's semantic tokens are in `src/tokens.css`, based on the website's approved palette. This release provides a light shell with responsive side panels; it does not claim a separately verified dark theme or full mobile Office feature parity.

### Compressed font delivery

`editor/compressed/` contains Brotli-encoded representations, while the original font paths remain raw and pinned. Serve each compressed response with `Content-Encoding: br` and its decoded font MIME type from `representation-manifest.json`. Do not apply that header to the retained original files or compress an already Brotli-encoded response again. Next headers and the preview server implement this contract; an upstream static-file proxy must do so as well. Release inventory hashes describe bytes on disk/on the wire; representation decoded hashes describe the original font bytes delivered to the editor. Deployment verification must check both separately. The runtime already requires Brotli support for its WASM/data resources.

`src/runtime-transport.js` starts consuming WASM through `WebAssembly.compileStreaming` and data through `arrayBuffer()` while the four complete fonts load. Once both runtime responses and all fonts are ready, the pinned engine receives the compiled module and decoded package through its existing `instantiateWasm` and synchronous `getPreloadedPackage` hooks. The package length must match the engine's own metadata. The adapter releases its references after handoff and aborts outstanding fetches on failure/disposal. Native compilation already in progress cannot be interrupted, so late results are ignored. No HTML preload, homepage prewarming, font subset or delayed font registration is used. Fonts and aliases still enter MEMFS at `onRuntimeInitialized`, before native main. This scheduling candidate needs production HTTP/2 comparison; local tests do not promise a ten-second cold start.

## Direct document editing

The default AI mode can locate body text without a manual selection, replace/delete/insert literal text, change basic character and paragraph formatting, create basic tables and set individual cells. Every action uses browser-owned opaque targets and a document-version lease. Arbitrary native commands, code, network access and cross-document actions are unavailable. Merged/split/nested table restructuring, row/column deletion and other desktop tools are outside this version. Each batch requires non-overlapping targets; replacing and formatting the same target takes separate calls with fresh context.

A run uses at most four separately billed generations, with at most one tool call per generation and 24 edits in total. The final generation summarizes verified results. The website persists user/document/run identity, generation order, expiry and the initial quote and enforces the run reservation ceiling alongside the existing per-generation ledger. The UI displays actual settled totals and keeps uncertain fees separate. A complete, settled generation is required before dispatching any tool. Neither a broken stream nor a page reload automatically repeats edits.

Native edits are read back and saved through the IndexedDB version check. Stop prevents later operations; an in-flight edit still finishes its required readback/save and may leave a partial result. Unknown native outcomes block further writes. A memory-only checkpoint supports restoring the entire run while this page remains open and the document has not changed afterward. Reloading or switching documents invalidates this guarded restore; download DOCX backups for durable recovery. Tracked changes are enabled, but the run checkpoint—not a single Undo command—is the complete rollback mechanism.

`node tests/agent-editor-browser.mjs` checks native tools against real LOWA with local assets and no model. `node tests/agent-ui-browser.mjs` exercises the full UI using explicitly synthetic SSE and real editing/storage. `node tests/agent-live-browser.mjs` defaults to a dry-run plan; opt-in live acceptance requires a dedicated account, explicit per-run spend limit and authorization flags. It makes no automatic retries and never treats fixture tests as evidence of real AI success.

`node tests/ime-preedit-browser.mjs` checks the real built DOCX iframe using Chromium CDP composition: visible native preedit text/caret, selection and horizontal scrolling, Chinese text commit, save and reload. Requests are restricted to local read-only preview resources; it makes no AI calls. This verifies browser composition handling, not a physical operating-system IME. The selected upstream patch and base snapshot are recorded separately in `source-manifest.json` and `UPSTREAM.md`.

### Temporary project and local copies

A stable temporary project is always available in the project picker. Existing projects,
including a legacy “My workspace”, retain their identities and contents. The last selected
project is restored; new browsers start in the temporary project.

“Copy to project” copies selected files and conversations into an existing formal project.
It saves current edits first, then commits all copies in one IndexedDB transaction. Originals
remain unchanged. Copies receive new IDs; conversation file context follows selected file
copies, while unselected file references are detached from live context. Past proposals and
operation logs remain readable but cannot apply or undo source actions. Target history,
including legacy history, is retained. This is browser-local storage, not Java/cloud content
synchronization. New controls have tokens for all 20 website locales; existing editor text
continues to use its current Chinese/English support.

Regression: `npm test`; after preparing assets and building, run
`node tests/project-copy-browser.mjs` with an isolated Edge profile (created by the test).
The browser regression uses synthetic local data and makes no paid AI calls.
