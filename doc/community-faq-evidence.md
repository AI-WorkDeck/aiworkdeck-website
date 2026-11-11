# Community Edition FAQ evidence

Reviewed 2026-09-23 for dev-board #835. This is a source review, not a production retention audit or an independent end-to-end reproduction. No customer records or secret values were inspected.

## Source snapshots

| Source | Revision reviewed | Working tree |
| --- | --- | --- |
| Desktop/backend/Office (`1-2 checkba_cloud`) | `master`, `267ff330ad0346d1e37f50f4f22bf0f7a38dc36a` | Tracked files clean; unrelated untracked archives/tools excluded |
| Mobile (`1-3 aiworkdeck_mobile`) | `main`, `24904303e177b99cfd7733bc8d0963a1d37f1757` | Tracked files clean; old untracked review/build directories excluded |
| Website | `bb93e59ef5914f7aebb5e7b03db45e9c70585f50` plus the current FAQ working changes | Shared website review worktree; other agents own page/UI changes |
| Shared instructions | `shared`, `f5dc2c81641c4f9d184890da4304f5f2d071c2ec` | Clean; fast-forward synchronization reported up to date |

Desktop/backend and mobile paths below are relative to their source repositories. Website paths are relative to this repository. Local source roots are `/Users/zewei/Documents/2024-2044/5-Tech/1-2 checkba_cloud` and `/Users/zewei/Documents/2024-2044/5-Tech/1-3 aiworkdeck_mobile`.

## Desktop storage and model requests

- Desktop `desktop/main/services/backend-service.js:230,293`: packaged application starts the `desktop` profile, with the application data directory as backend working directory.
- `backend/src/main/resources/application-desktop.yml:12,17-21`: loopback listener and local H2 file database `~/.aiworkdeck/local.mv.db`.
- `backend/src/main/resources/application.yml:666-672`: default file storage is local, with root `data`. `application-desktop.yml:57-60` enables local-folder projects.
- `backend/src/main/java/com/checkba/service/ProjectAiMessageService.java:96-116`: project conversation content is persisted to the application's database. Desktop storage does not mean conversation history is never recorded.
- `application-desktop.yml:62-66`: automatic AI tagging is disabled for desktop import/save; explicit AI actions remain separate.
- Website `lib/ai-quota.ts:19-28`: desktop platform channel holds a provisioned OpenRouter key and calls OpenRouter directly; website manages key allowance and usage settlement, not every request body.
- Desktop `backend/src/main/java/com/checkba/service/ai/OpenRouterStreamingChatModel.java:150-165`: selected messages and tools become the outgoing model request. `application.yml:303-306` supplies the default OpenRouter API endpoint.
- `ChatModelFactory.java:475-485`: non-streaming platform model has response logging enabled. `OpenRouterStreamingChatModel.java:550-569` can log abbreviated malformed response payloads outside the private-writing path. These are local logs in desktop mode and may be server logs in hosted mode. Do not claim that all output/context is never logged.

## Phone captures and transfer retention

- Mobile `ios/Sources/Services/EvidenceStore.swift:18-32`: captures are stored under the app's Application Support/FieldEvidence directory, marked excluded from system backup. This check establishes the iOS implementation, not an identical backup guarantee for every mobile platform.
- Backend `service/mobile/MobileRelayStoreService.java:62-65`: current media relay TTL is **30 days**. Older mobile specification text saying seven days is stale.
- `MobileRelayStoreService.java:445-456`: receipt acknowledgement attempts to delete the blob, clears its locator, and retains the delivery-status row.
- `MobileRelayStoreService.java:488-497`: daily cleanup finds records older than 30 days and deletes remaining referenced blobs and records. Thirty days is a cleanup threshold, not a precise deletion deadline.
- `MobileRelayOssBlobStore.java:70-80`: deletion failures are caught and logged; bucket lifecycle is the remaining fallback. `deploy/cloud/setup-relay-oss.py:100-106` configures 35-day object expiration and seven-day incomplete multipart cleanup. The live bucket policy and physical deletion were not independently checked in this FAQ task.
- `MobileTransferService.java:543-558`: ordinary cross-device transfers have distinct expiry rules: PULL pending 24 hours, PULL staged seven days, PUSH staged 30 days; hourly cleanup. Do not apply the capture rule to every transfer.
- The phone's original, receiver's file and cloud relay object are separate copies. The iOS `purgeMedia` method exists but no call site was found in the reviewed iOS sources; do not promise that acknowledgement automatically deletes the phone original.

## Memory is persisted context, not model-weight training

All backend Java paths in this section are under `backend/src/main/java/com/checkba/`.

- `service/ai/memory/document/MemoryDocumentService.java:31,79-95,264-295`: personal/project memory uses a `remember.md` index and Markdown document content saved through repositories. It is not necessarily a standalone `.md` file on disk.
- `MemoryDocumentService.java:236-257`: readable local and organizational memory indexes are assembled into future request context.
- `service/ai/memory/MemoryPipelineService.java:64-105`: long-conversation summaries are produced; explicit memory tools persist facts; configured Git sync can export/push memory. These operations do not update a foundation model's weights.
- `service/ai/memory/document/RemoteMemoryOrganizationGateway.java:94-100,145-151`: team/firm memory writes go to the website `/api/account/memory` in desktop mode.
- Website `lib/shared-memory.ts:16-33,49-54`: team/firm membership and management permissions are checked, and Markdown content is stored in the server SQLite `shared_memory_document` table. Firm write permission requires a manager from its head team. Shared organizational memory is an explicit exception to local-only storage.
- Website `lib/shared-memory.ts:146-158` blanks content and marks a deleted row; backend local memory has logical deletion/tombstones (`MemoryDocumentService.java:136-150`). A UI delete operation is not proof of physical erasure from every backup or synchronized history.
- The statement that AI WorkDeck does not train its own foundation model on case material is a product-policy statement consistent with the user's direction and the inspected implementation. Absence of a training pipeline in the reviewed paths alone cannot prove every operational practice or a third-party provider's behavior.

## Office add-in and website exceptions

- Desktop repository `office-addin/taskpane/lib/settings.js:45-46,157` selects a configurable backend server; `office-addin/taskpane/lib/chatSession.js:1390` establishes its connection using that server URL. The add-in can connect to local or hosted services; it is not itself proof that execution is local.
- `office-addin/taskpane/lib/i18n.js:253-256` exposes the private/team-server or same-machine backend option. `deploy/cloud/README.md` documents the hosted Office task pane, shared backend and PostgreSQL deployment. `deploy/web/README.md` records limitations of the browser edition; do not promise identical browser/editor capabilities solely from deployment docs.
- Backend `service/ProjectAiMessageService.java:96-116` persists conversation content, including in hosted deployment. `service/addin/AddinConvSyncService.java:46-74` adds a separate content-bearing delivery outbox; `:101-117` deletes acknowledged/expired outbox rows, not the underlying conversation message. Its 30-day outbox TTL is not the conversation's retention period.
- Website `lib/skill-chat-store.ts:143-150` saves Skill drafting assistant `messagesJson`; `lib/ai-usage.ts:54-63` records model/cost/conversation metadata. Account, order, shared-memory and website-AI functionality must not be described as zero server retention.

## Self-hosting and own-model conversion point

Supported as a deployment evaluation offer, not an unconditional promise of complete offline feature parity:

- `README.zh-CN.md:49,64,173-186` describes open-source/self-hosted use and local components. These broad README statements must be read with the current implementation restrictions below.
- Backend `service/ai/ChatModelFactory.java:146-178` resolves configurable Ollama URL/model and BYOK OpenAI-compatible OpenRouter URL/key. `:529-535` constructs the Ollama client with the configured URL.
- `ChatModelFactory.java:305-314` gives an **explicitly selected local provider** priority over cloud model IDs. The explicit selection comes from `ai.activeProvider=OLLAMA` (`:114-125`); relying only on an inherited YAML default is not equivalent.
- `ChatModelFactory.java:323-333,344-351,544-548` still constrains model selection and identifies Ollama as an experimental ASK-only path without the same vision/tool support. A custom OpenAI-compatible endpoint needs model-ID and protocol/tool-capability validation; arbitrary self-hosted model compatibility is not established merely by an editable base URL.
- `deploy/web/README.md` documents `CLOUD_COLLAB_BASE_URL` to target an organization's server, but the account-bridge example validates credentials with the website. That example alone is not a disconnected deployment.
- `application.yml:470-489` documents outbound telemetry controls (rollups default on, detailed events default off) and feedback uploads; `:257-288` contains account/registry/telemetry services. Cloud OCR, web search/company data, cloud transcription, phone relay, website organizational memory, Git remotes, model downloads, plugins and any enabled third-party integrations each need explicit review or replacement. A local model does not close these other network paths.

Recommended public claim: an organization can evaluate deploying the Community Edition on its own server with its own model and locally configured services, **so the selected documents and processing workflow stay within its controlled network**. Contact the developer to validate required features, model compatibility, outbound services and deployment boundaries. Do not promise that installing the official desktop package on a firm server alone makes every feature fully offline.

## External-provider limits

Official documentation checked 2026-09-23:

- https://openrouter.ai/docs/guides/features/zdr — no-training and no-retention are different; ZDR controls provider inference routing, not all tools or application logging. Provider endpoints may differ, and prompt caching has its own meaning.
- https://openrouter.ai/docs/guides/privacy/provider-logging — provider retention policies.
- https://openrouter.ai/docs/guides/privacy/data-collection — data collection controls.

No explicit `provider.zdr` or `data_collection: deny` enforcement was found in the reviewed desktop request paths. The live account's privacy settings, guardrails, provider agreements and logging configuration were not audited. Consequently the FAQ must not promise blanket supplier zero retention, no training, a particular processing jurisdiction, or legal compliance solely from local storage.

## Review result and limits

The initial bilingual `lib/community-faq.ts` draft was checked against these findings; its distinctions between local storage, cloud processing, relay copies and organizational memory are consistent. Self-hosting CTA copy is owned by the page implementation task and must preserve the conditions above. No production software behavior or private deployment was exercised in this evidence review; no customer data or model request was sent.

## Plain-language rewrite (dev-board #855)

The FAQ copy was rewritten 2026-09-23 for readability and to lead with what protects the user's data. Factual scope is unchanged from the findings above; code-level terms (PULL/PUSH, thresholds, lifecycle fallback) were translated into plain descriptions. Two reassurances were added from the published privacy policies (`content/legal/privacy-*.ts`), present in both mainland and international versions: site-wide HTTPS, and no training on user content / no sale of personal data. The mainland-only statement that platform-sourced OCR/transcription relays are not logged was deliberately not used, because the FAQ is shared by both site systems.
