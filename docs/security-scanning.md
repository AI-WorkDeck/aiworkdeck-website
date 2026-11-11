# Repository security checks

This private repository uses the free scanning gate explicitly authorized by the owner on 2026-11-04 (dev-board#1700): Semgrep Community Edition, npm audit and Gitleaks. GitHub CodeQL/Advanced Security is not enabled on the Free organization plan. A passing check here must not be described as a CodeQL pass.

Source is scanned locally or on the repository's GitHub Actions runner, without a Semgrep cloud account or source upload. Scanner and community-rule versions are pinned in the workflow/scripts. All findings block the gate unless individually reviewed and documented. Scan errors also fail the check. Gitleaks reports redact matched values.

Following enterprise retirement (dev-board#1705), dependency updates and audits cover only the ordinary website root and Web workbench. No enterprise build, update or dependency exception remains. Static analysis and historical secret scanning continue unchanged.

## Dependency exception

`GHSA-g3hv-75wg-m249` affects minimatch versions below 11.0.1 (glob-pattern denial of service). ESLint and its plugins still depend on older minimatch callable APIs; minimatch 11 changes the public API and cannot safely be forced into these consumers. The upstream release does not backport its rewritten matching engine. In this repository the affected packages are lint tooling, with `dev: true` in the lockfiles, and process developer/repository-controlled file globs rather than HTTP request input.

`scripts/check-dependency-security.mjs` still audits **all** dependencies. Its exception applies only in the root workspace, expires on 2027-02-02, and applies only to this exact advisory, to its transitive dependents, and only when every affected lockfile node is explicitly dev-only. A new advisory, missing audit output, unresolved dependency edge, or production node fails the check. Re-evaluate when ESLint/plugin releases support minimatch 11. This is a recorded, scoped residual risk, not a claim of zero upstream advisories.

Sources: https://github.com/advisories/GHSA-g3hv-75wg-m249 and the minimatch 11 package documentation. Actual version compatibility and lockfile paths are recorded in dev-board#1700.

## Static-analysis scope and reviewed findings

The gate selects all HIGH/MEDIUM confidence security rules from the pinned official JavaScript, TypeScript, Python and GitHub Actions collections, plus all Bash security rules. The initial broad scan (605 rules, 1,128 files) also produced 1,067 results including portability/style checks and LOW-confidence audit heuristics. That broader report is retained locally in `~/.codex/artifacts/security-1700/semgrep-initial.json`; it is not represented as a zero-finding audit. Lower-confidence examples reviewed include dynamic filesystem calls (many use fixed storage roots/validated IDs), the Web workbench's escaped HTML helpers and textContent chat updates, and the artifact builder's argument-array subprocess wrapper. This sampling does not prove every low-confidence location safe.

Two upstream YAML/embedded-Bash rules (`curl-eval`, `gha-curl-pipe-shell`) raise internal matching errors with this pinned CE engine. The gate replaces those two checks with explicit checks of every Actions run step for remote download pipe/eval shell execution. Native Bash rules still run. Other scan errors, including timeouts, fail the gate. The disposable scan copy normalizes CRLF to LF; the source checkout is unchanged. Default Semgrep exclusions (including files over 1 MB and minified/generated assets) remain, so this is source analysis, not a binary/third-party bundle audit.

The single inline wildcard-postMessage exception is the existing captcha bridge to a desktop `file://` parent with an opaque origin. Incoming commands are restricted to `window.parent`; the protocol sends scoped, short-lived captcha responses rather than account/session credentials. This is an intentional protocol boundary, not a general wildcard exemption.

Gitleaks scans all fetched history and the current source tree. Ten historical fingerprints (including four legacy branch copies of the same verified source lines) are isolated synthetic credential fixtures in three test scripts. Current-source exceptions additionally require an exact source-line SHA256 and rule/path match, so replacing a fixture value at an old line number does not bypass the gate. No whole directory, test file, or secret rule is excluded.

Security fixes found during the audit: explicit 16-byte AES-GCM authentication tags, and HTTPS for Tushare requests. The HTTPS endpoint was probed with an intentionally invalid synthetic token and returned the expected authentication error over verified TLS; no real token was transmitted. Three syntax-equivalent changes let CE parse JSX ampersands, TypeScript inline type imports and a Word-HTML comment regex without suppressing files.
