<!-- SPDX-FileCopyrightText: 2026 北京京微资易科技有限公司 and AI WorkDeck contributors -->
<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
# Apple monthly Pro (dev-board #1655)

The existing CNY Pro benefits apply: 745 Credits per paid period, 200 Credits per seven-day window, and 3 GiB persistent storage. These are service allowances, not wallet cash. Product `pro.monthly.cny.149` is an Apple calendar-month subscription; signed purchaseDate/expiresDate define each period. Existing WeChat 30-day purchases remain unchanged. No USD price or Stripe recurring product is introduced.

## Internal mobile bridge

All requests use the existing `/api/internal/account` secret gate. The Java bridge must resolve accounts only when the user explicitly buys; capability reads never resolve or create accounts.

- `appstore-subscription-capability`: no accountId; returns `{available,productId}`. Available only on CNY deployments with configured Apple verification and `APPSTORE_SUBSCRIPTIONS_ENABLED=true` (default off).
- `prepare-appstore-subscription`: authenticated accountId; returns `{productId,appAccountToken}`. Token is stable per account. Returns 409 `existing_subscription` if other-source Pro is still active, avoiding an overlapping purchase. Restore/manage do not require prepare.
- `confirm-appstore-subscription`: accountId and signedTransaction; verifies using the configured Apple environment, returns `{status:"CONFIRMED",subscription}`. Receipt errors are 400; account/product/period mismatch is 409. Finish StoreKit transactions only after confirmation. Closing sales must not prevent existing paid transactions from being confirmed.
- Existing balance snapshot includes optional `autoRenew: {provider:"appstore",productId,enabled,expiresAt} | null`. Dates are ISO UTC strings. Enabled is nullable until signed renewal metadata arrives; null does not mean canceled. Clients must show StoreKit's displayPrice, never format the product ID as a local price.

## Accounting and lifecycle

A stable appAccountToken and originalTransactionId bind the subscription to one account. Transaction IDs are unique and never grant recharge Credits. Every signed transaction writes one shared subscription_period. Replays do not reset usage. Renewal status uses signed timestamps so old notifications cannot undo cancellation. Cancellation leaves paid time intact; expiry stops access without requiring another notification. No unconfirmed billing-grace extension is granted.

Apple-derived entitlement `pro.appstore` is separately stored and folded into effective Pro/derived features. Refund/revoke truncates only the affected transaction period; older receipts cannot revive it. A newer, signed REFUND_REVERSED notification can explicitly restore it. Independent Pro, permanent features and wallet balances remain untouched. Revoking an earlier period never revokes a later renewal. Apple sandbox notifications cannot grant production service.

Account deletion tombstones the binding and periods with the other financial records. It does not cancel the Apple billing agreement: mobile deletion UI must keep the Apple manage-subscriptions guidance. Restore under a different account is rejected; it cannot move paid entitlements silently.

## Release and verification

Deploy the backend and Java bridge before exposing the mobile entry. Keep APPSTORE_SUBSCRIPTIONS_ENABLED off until the Apple product is approved, purchase/restore/cancel/renew/refund are tested in an isolated matching environment, and the production notification URL is confirmed. Draft product creation is not sale approval. Do not switch production APPSTORE_ENV to sandbox for testing.

`verify-appstore.mts` uses a generated test trust chain and real JWS verification, internal HTTP routes and SQLite to cover purchase, cross-account/environment rejection, renewals, replay, cancellation, refund, refund reversal, permanent entitlement and rollout gates. Existing `verify-pro-subscription.mts` and `verify-subscription-allowance.mts` protect one-time purchases and shared funding. Run all in empty directories; `npm run check` covers types and locales. These tests do not claim an actual Apple sandbox charge or an approved store product.

### ASC draft verified 2026-11-03

App `6803309103`, group `22539871`, subscription `6830036439`. Chinese and English metadata saved; CHN is the only draft territory, automatic new territories disabled, Family Sharing and multi-seat disabled. Period ONE_MONTH, pricing plan UPFRONT, CHN price point 149.0 CNY read back after creation. UPFRONT means paying each one-month period in full; the newer MONTHLY pricing plan denotes a 12-month commitment and is not this product.

ASC rejected price creation with UNSUPPORTED_TERRITORY until draft subscription availability was created. The successful sequence was group → product → localizations → CHN draft availability → CHN price. Product remains MISSING_METADATA, no review submission or production purchase switch was enabled. A real purchase-screen review screenshot, accurate review notes, a new app version with the subscription attached, and isolated sandbox purchase/renew/refund tests remain required. Apple's documentation requires the first auto-renewable subscription and group to be submitted with a new app version.

Existing production and sandbox notifications both point to `https://www.aiworkdeck.com/api/appstore/notifications` (V2). Subscription sandbox validation must use an isolated matching-environment endpoint; do not turn the production site's receipt verifier into sandbox mode. The existing consumable notification configuration was not changed.

Official references: [subscription setup](https://developer.apple.com/help/app-store-connect/manage-subscriptions/offer-auto-renewable-subscriptions/), [subscription create API](https://developer.apple.com/documentation/appstoreconnectapi/post-v1-subscriptions), [pricing plan types](https://developer.apple.com/documentation/appstoreconnectapi/subscriptionplantype).

### Isolated App Review / TestFlight subscription lane (#1672)

`APPSTORE_SANDBOX_ACCOUNT_IDS` is a deployment-owned allowlist of verified existing website account IDs, not emails, device claims or App Store usernames. The authenticated Java bridge may include its existing `accountId` in the capability action; no identity means only the normal production sales switch applies. A configured CNY verifier and an allowed account enable the review capability without changing APPSTORE_ENV or opening ordinary production sales.

Allowed accounts prepare tokens and persist Sandbox transactions only in `data/appstore-sandbox.sqlite` (0600). Production verification runs first; Sandbox is retried only for Apple's explicit INVALID_ENVIRONMENT result, never invalid signatures/chains/bundle IDs. Tokens, original transaction IDs, ownership and signed renewal metadata remain bound to the isolated identity. Notifications verify outer and inner signatures/environment before mapping the token into the isolated ledger. Removing an account from the allowlist rejects further Sandbox application; a known Sandbox binding never falls back to real funding.

Account display responses preserve the actual production balance/allowance and expose `sandbox: true`, a nested `sandboxSubscription` lifecycle (zero sandbox funding), and its Apple auto-renewal metadata; actual service authorization, wallet, production subscription periods and existing review grants are unchanged. The existing review grant does not prevent an isolated Sandbox purchase and is not revoked. This is a test subscription projection, not paid production entitlement. Ordinary accounts cannot redeem these receipts. Real App Store production sales remain closed until approval and controlled rollout; normal valid paid receipts continue to settle regardless of the new-sales flag.

Verify with `verify-appstore-sandbox.mts` (isolated ledger) and `verify-appstore.mts` (real generated JWS trust chain plus HTTP route wiring). These are synthetic verification, not a real Apple Sandbox purchase. TestFlight purchase/restore, signed Apple notifications and App Review product approval remain separate release evidence.
