<!-- SPDX-FileCopyrightText: 2026 北京京微资易科技有限公司 and AI WorkDeck contributors -->
<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
# Opt-in real website browser acceptance

Run from the website checkout. Default is a plan-only dry run: it does not launch a browser, read credentials or make a network request.

```
node web-workbench/tests/live-browser.mjs
```

The operator prepares the same-origin website backend, real provider configuration, sufficient balance and a **dedicated password-enabled test account**. The script does not create an account, add credit, provision a database or bypass account binding. `AuthForms.tsx` exposes `#auth-account` and `#auth-password` behind Email/Password legacy tabs. Its normal form posts `/api/auth/login`, creates the session cookie and follows `next`. A required phone-binding gate or unavailable password login fails the run before model calls. The script verifies a successful login HTTP status and expected landing page, then checks `/api/auth/me` against an operator-provided expected user ID.

For the CN site, use a dedicated account with a legitimately bound mainland phone and an existing normal password. The password form resolves its username/email, not its phone number. Do not substitute an international/local account, a personal account, an app-store review identity, a fixed review code or an injected session. Use `WEB_LIVE_BASE_URL=https://www.aiworkdeck.com`, `WEB_LIVE_LANG=zh`, `WEB_LIVE_CURRENCY=CNY`, and a separately approved budget in CNY minor units (人民币分). Credentials must remain in protected operator configuration and enter only through the process environment. A phone-only account without a password requires a separate normal SMS UI flow with real captcha/code delivery; this password harness does not support or bypass it. Missing legitimate credentials means authenticated acceptance remains unverified.

Provide these only through the invoking process environment; do not paste passwords into shell history, source files, CI logs or this document:

| Variable | Meaning |
| --- | --- |
| `WEB_LIVE_BASE_URL` | Origin such as `http://localhost:PORT` or an HTTPS website; no path/query/credentials |
| `WEB_LIVE_ACCOUNT` | Dedicated test account username/email accepted by normal login |
| `WEB_LIVE_PASSWORD` | Its password |
| `WEB_LIVE_EXPECTED_USER_ID` | Expected dedicated account ID, checked before model calls |
| `WEB_LIVE_CURRENCY` | Exact capabilities currency, e.g. `CNY`; no exchange-rate assumption |
| `WEB_LIVE_MAX_TOTAL_CENTS` | Explicit combined maximum reservation across both requests, in that currency; not a target spend |
| `WEB_LIVE_APPROVED` | Must be `1` for a real run |
| `WEB_LIVE_DEDICATED_ACCOUNT` | Must be `1`; operator confirms this is not a personal/production customer account |
| `WEB_LIVE_OUTPUT_DIR` | Optional fresh output directory; existing receipt is never overwritten |
| `WEB_LIVE_LANG` | `zh` by default or `en` |
| `PUPPETEER_EXECUTABLE_PATH` | Optional Chrome/Edge executable; default is macOS Edge |
| `WEB_LIVE_HEADED` | Optional `1` for visible browser |

After the operator has injected these settings, explicitly execute:

```
node web-workbench/tests/live-browser.mjs --live
```

Both `--live` and the two approval/identity environment flags are necessary. `--dry-run` overrides `--live`. No `.env` file is loaded automatically. Child browser processes do not inherit `WEB_LIVE_*` credentials. The temporary browser profile is separate from all installed browser profiles and removed after the run. The script never reads or writes cookies directly; the normal website response sets them.

Flow: password form → expected identity → visible homepage CTA → production workbench/LOWA → actual Chinese IME input → real chat → settled receipt → select the synthetic payment clause → real rewrite → verify the model changed only 30 to 45 → click Apply → saved tracked changes → reload → real Download DOCX button → inspect exported XML for final text, marker and deletion revision.

The harness injects the repository's unchanged host relay into the page through CDP for editor positioning/readback. This calls the production iframe/UNO engine; it does not replace the editor or intercept its results. Manual editing uses CDP IME input; send/apply/download use visible product controls. No `/test-support/` server route is needed.

Request interception is a **blocking guard only**, never a response fixture: at most one normal login and two completion POSTs may proceed, in chat/rewrite order, after identity and budget checks. Unexpected same-origin mutations are aborted. All allowed requests go to the real website; no response is synthesized. A timeout/error ends the run; it never retries completion. The finalizer queries known request IDs with GET to preserve fee state. An unsettled or unknown receipt fails acceptance and stays unknown in the output. Re-running the command can spend again; review prior receipts first and keep the project-wide budget ledger.

Normal logout is also required for acceptance. After reading final fee receipts, the finalizer checks the already-verified dedicated identity again, permits at most one same-origin `POST /api/auth/logout`, and requires `/api/auth/me` to return `user:null`. An already-anonymous context needs no POST. This cleanup exception remains available after the run deadline; further AI and login mutations remain blocked. `logoutVerified` records the result. Logout failure or timeout downgrades the run to `failed_or_unconfirmed`, records `cleanup.logoutRequired`, and retains the accounting receipts. No logout response body or cookie is logged.

If identity verification never completed, logout is deliberately skipped and recorded as `not_attempted_identity_unverified` with `logoutVerified:false`. A successful login could have created a session before navigation or identity verification failed. Closing the browser and removing its profile do **not** revoke that server session; the operator must check residual sessions for the dedicated test identity without affecting personal accounts or deleting the account/ledger. Normal logout covers only the current browser session, not older sessions from previous runs.

Offline logout regression is included in `npm test --prefix web-workbench`, or run `node --test web-workbench/tests/live-logout.test.mjs` alone. It reads the actual sibling harness and tests its logout helper, mutation guard and finalizer with synthetic fetch/browser responses; it launches no browser and makes no network or model calls.

Outputs: `receipt.json` (safe stage/status, hashed account identity, request IDs, selected receipt fields, budget, exported file hash), four workbench screenshots, and the downloaded **synthetic** DOCX. There are no account-page screenshots, cookies, HARs, headers, passwords, provider keys or raw exception strings. A workbench failure screenshot is retained when available. All account setup, live fees and backend reconciliation remain operator responsibilities. The receipt's `passed` proves this invocation only; dry-run/syntax checks do not validate live behavior.

Cold starts allow up to 610 seconds per workbench wait, with immediate failure when the product reports a terminal startup error. The product warns after three minutes and stops after ten; the whole live run has a 30-minute deadline plus bounded cleanup. This does not extend AI response deadlines or increase the two-completion limit. `webResources` records same-origin public editor paths, relative request/response timing, completion/failure state and transfer bytes, including unfinished requests at failure. It never stores query strings, headers or response bodies. A run does not restart on timeout.

For local cold-start UI regression, run `node web-workbench/tests/boot-browser.mjs`. It builds only the workbench shell into a temporary directory, serves existing local editor assets, accelerates only the host startup clocks, and delays delivery of the real editor ready message. It checks the slow prompt, real phase text, late success and sample-document readback; a separate silent iframe fixture checks the terminal error UI. Screenshots explicitly represent accelerated local testing, not a ten-minute production run. No public build output is replaced and no paid model is called.
