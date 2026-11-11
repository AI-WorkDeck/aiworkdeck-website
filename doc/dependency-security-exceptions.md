# Dependency security exception

Reviewed 2026-11-04; expires 2027-02-02 (90 days). Owner: website maintainers; dev-board#1700.

Only GHSA-g3hv-75wg-m249 (minimatch <11.0.1, moderate globparts amplification) is temporarily accepted in the root workspace only, and only when every affected audit node is explicitly dev:true in its lockfile. web-workbench has no exception. The gate rejects any new advisory, runtime occurrence, malformed/network result or expired exception. Run `node scripts/check-dependency-security.mjs`; synthetic negative tests: `npx tsx scripts/verify-dependency-security.mts`.

Installed ESLint9/eslintrc/config-array/typescript-estree and import/react/jsx-a11y plugins use minimatch for repository lint configuration and source paths. These dependencies are not reachable in production (the root `npm audit --omit=dev` was zero in the #1700 verification). This assumes trusted lint source/config; do not run these tools on untrusted patterns. It is a constrained development exposure, not a repaired library.

The official minimatch11 package README states the new nonrecursive matching engine will not be backported and exposes named `minimatch`. Existing consumers still use callable CommonJS/default exports. Blindly overriding to v11 breaks their API, while npm audit suggests downgrading ESLint to v4. Neither is acceptable. Remove this exception when compatible consumer upgrades are available; re-review before expiry, never extend silently.

Historical #1700 evidence (before enterprise retirement): npm registry minimatch@11.0.1 metadata/README and installed consumer source inspection, three-workspace audits, root checks, enterprise typecheck/30 tests/production build, web150 tests/production build. At that verification, remaining alerts were #65/#66 of the 91 remote Dependabot alerts checked against updated lock versions; the other89 no longer match their vulnerable ranges. Evidence directory: ~/.codex/artifacts/website-security-1700/dependencies/.

Enterprise/frontend was retired on 2026-11-04 (dev-board#1705). Its dependency scanning, update jobs and exception have been removed. The active audit workspaces are root and web-workbench; the root exception keeps its original expiry and checks. Historical enterprise evidence above does not authorize further enterprise maintenance.
