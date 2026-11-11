# Usage billing and cloud credit

Policy `2026-11-04` is opt-in. Existing request funding snapshots do not become debt. `AWD_POSTPAID_ENABLED` enables acceptance; `AWD_POSTPAID_CLEANUP_ENABLED` independently enables deletion authorizations. Both default off. Merge does not enable either feature or deploy the service.

Money uses existing ledger currency minor units, not displayed Credit quantities. Current-period subscription allowances and explicitly registered eligible promotional grants provide equal credit. Top-ups and creator proceeds do not create credit. Accepted official service requests spend gifts, then wallet, then credit. Third-party purchases cannot borrow. Reservations remove capacity; only delivered services create due debt. Verified recharge settles debt before increasing usable wallet balance; refund and chargeback preserve original funding and append repayment reversals.

Storage costs CNY 0.20 or USD 0.03 per GiB per 30 days; subscription includes 3 GiB. Downloads cost CNY 0.60 or USD 0.15 per GiB. Uploads are free. Storage integrates constant occupancy intervals with historical entitlement boundaries; unknown initial occupancy is borne by the platform. Fractional charges retain original funding and are carried using integers. Download quotes round up to reserve a safe budget; settlement uses actual successful output bytes and carries the remainder. A retry is a new chargeable HTTP attempt. Completed event IDs cannot authorize another stream. Each overdue case permits one completed export per resource version, with failed attempts limited to three file lengths before assisted export is required.

An over-limit case is not reset by partial repayment or renewal. Notification is due after 72 hours; cloud deletion requires 120 hours, the persisted reminder receipt, no unresolved payment verification, and the separate cleanup switch. The entire debt must be paid. Cleanup binds a fixed manifest, item hash, epoch and short-lived claim. First claim freezes cloud writes and increments the epoch. A completed receipt replay allows metadata reconciliation only, never a second deletion. Payment cannot revoke a claim already issued. Recovery after cleanup requires explicit resume with no debt and no unresolved claims; local files and automatic upload preferences are not changed by the account service.

The first notification ACK must arrive before the original cleanup deadline. A first ACK at or after that deadline enters review and cannot authorize a new deletion claim or renew an expired claim. The same applies to older receipts whose first-ACK time is unknown. This concerns the available ACK evidence, not an assertion that the notice itself was delivered late. Repeated ACKs preserve the original receipt/time and decision; partial repayment or renewed allowances do not release review. Full repayment resolves the case normally. There is no automatic review override or new universal 48-hour grace period. Storage still stops accruing at the original 120-hour deadline. Already-issued 60-second permits retain their established execution and exact-receipt recovery semantics; migration does not unfreeze an account or rewrite an in-progress cleanup as pending.

Expired ambiguous claims are not automatically cancelled. `AWD_POSTPAID_RECONCILIATION_ENABLED` is a separate, default-off operator control: executor termination and exact-object verification must precede a recorded evidence hash. Confirmed nonexecution can cancel the claim; confirmed deletion can mark it complete. This is an operator reconciliation contract, not a client self-service override.

OpenRouter provider spending limits are externally reserved before being enabled. Ambiguous provider writes retain reservations and require reconciliation; they are never silently refunded or retried. Legacy provider usage is settled under its prior funding rules before new credit is issued. Provider receipt polling charges cumulative cost to avoid repeated rounding. Accepted Skill calls use the same bounded request reservation and actual-receipt settlement as platform AI in both sites.

## Verification

Run each `scripts/verify-postpaid*.mts` in a fresh empty working directory with the repository tsconfig, Node 24 and tsx. Tests use synthetic accounts and injected providers, never real paid requests. Run `verify-postpaid-services.mts` once with `NEXT_PUBLIC_AWD_SITE=cn` and once with `intl`. `npm run check` checks TypeScript and all 20 locale dictionaries. Existing gateway, platform-AI, mobile-billing, transfer and subscription-allowance regressions must also pass.

The isolated UI harness renders the actual account component and uses actual account API handlers against synthetic SQLite. It verifies consent, account refresh, debt display and automatic repayment. This is not production deployment verification. Cross-service object ownership, manifests, notification delivery and actual stream byte receipts are the cloud backend's responsibility and require its separate integration tests.

## Accounts that have not accepted

With `AWD_POSTPAID_ENABLED` and the cloud `AWD_CLOUD_POSTPAID_ENABLED` on, an account that has not accepted policy `2026-11-04` keeps exactly the cloud access it had with postpaid off: an active subscription with included storage can use, read and write the cloud (`cloudAccess.reason='subscription'`), anyone else cannot (`policy_required`). Its credit limit stays 0, storage/egress events are rejected with `policy_required`, so it can never accrue postpaid debt. Accepting only adds the postpaid capability (gifts, then wallet, then credit, with the debt lifecycle); it never makes access worse. The cloud backend applies the same rule per account (`CloudStorageQuotaService.postpaidFor`).

## Shadow period

`AWD_POSTPAID_SHADOW_ENABLED` (site, default off) accepts the cloud's `shadow-storage`, `shadow-egress` and `shadow-unmapped` reports into `postpaid_shadow_event`, `postpaid_shadow_meter` and `postpaid_shadow_unmapped` (migration 48). These tables are never read by billing: shadow reports never spend, reserve, create debt or cases, change wallet, credit or access, notify, or clean up. Storage integrates the previous reading over each interval at the same prices, with the subscription's 3 GiB excluded per historical entitlement segment; the first reading is a baseline. Negative, future and out-of-order readings are stored as anomalies and not integrated. Precedence: an account that accepted the live policy is billed live, and its shadow reports are skipped (`skipped:'live'`); the cloud stops shadow reporting entirely while `AWD_CLOUD_POSTPAID_ENABLED` is on.

On the cloud, `AWD_CLOUD_POSTPAID_SHADOW=true` reads every mapped account's full billable occupancy every 10 minutes, records the bytes actually written by metered downloads (for streamed file responses, the response size, an upper bound), and hourly reports cloud accounts that hold data without an account mapping. Failures are logged and never affect requests.

### Reconciliation

On the site box, from the repository root (read-only; opens SQLite with `readonly` and `query_only`, never migrates):

```
NEXT_PUBLIC_AWD_SITE=cn node --experimental-strip-types scripts/postpaid-shadow-reconcile.mts --db data/awd.db [--from ISO] [--to ISO] > shadow-report.json
```

Use `intl` on the international box. The JSON report has, per account: storage GiB-days (total, included, billable), egress GiB, would-be charge in site minor units, current entitlements (subscription allowance, included 3 GiB, registered promotional grants, wallet, credit limit), how much allowance and wallet would cover, what remains owed, and whether it exceeds the credit limit now or in a 30-day projection. Anomalies: readings flagged at ingest, impossible integrals, rate or currency mismatches, paid orders in another currency, gaps over one hour, readings over the 100 GiB safety limit, accounts already on live billing, and unmapped cloud users. `checks` summarises the machine-checkable pass criteria.

### Pass criteria (proposed)

1. At least 7 consecutive days including a weekend (`checks.coverageAtLeast7Days`), both sites.
2. `noReadingAnomalies`, `noCurrencyMismatch`, `noLiveAccountsInShadow` are true; `noGapsOverOneHour` is true or every gap matches a recorded cloud restart.
3. `unmappedReportSeen` is true and `noUnmappedCloudUsers` is true, or every listed cloud user is mapped or confirmed non-billable.
4. For at least 5 sampled accounts, the latest shadow `storedBytes` is within 1% (or 1 MiB) of an independent measurement of that account's cloud data at the same time; metered egress is within 5% of web-server byte counts for the same routes and window.
5. No side effects: no `cloud_storage`/`cloud_egress` wallet ledger rows, no new `postpaid_debt` or `postpaid_case` rows, no write-access complaints from subscribers.
6. The owner reviews `overLimit` and `projectedOverLimit` accounts and total would-be revenue against the actual object-storage bill, and decides on communication or grants before acceptance opens.

### Go-live order

1. Deploy this site build and the cloud build containing the shadow reporter on both sites.
2. Site: `AWD_POSTPAID_SHADOW_ENABLED=true`, restart. Then cloud: `AWD_CLOUD_POSTPAID_SHADOW=true`, restart. Run the shadow period and reconciliation.
3. Cloud: `AWD_CLOUD_POSTPAID_ENABLED=true`, remove `AWD_CLOUD_POSTPAID_SHADOW`, restart. Nobody has accepted yet, so every account keeps its subscription rules; verify a subscriber can still upload and push.
4. Site: `AWD_POSTPAID_ENABLED=true`, restart. Acceptance opens.
5. Site: `AWD_POSTPAID_SHADOW_ENABLED=false`, restart. The shadow ledger is kept.

`AWD_POSTPAID_CLEANUP_ENABLED`, `AWD_CLOUD_CLEANUP_ENABLED` and `AWD_POSTPAID_RECONCILIATION_ENABLED` are not part of this sequence and stay off.

Run `scripts/verify-postpaid-shadow.mts` like the other postpaid scripts, once with `NEXT_PUBLIC_AWD_SITE=cn` and once with `intl`.
