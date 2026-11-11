<!-- SPDX-FileCopyrightText: 2026 北京京微资易科技有限公司 and AI WorkDeck contributors -->
<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
# Circle and Baoqingtian release boundaries (#1665 / #1672)

Circle grants are restricted to DeepSeek models through the existing regional gateway and its live catalog (Bailian in CN; OpenRouter internationally). Other models require paid balance or subscription funding. The unverified dedicated DeepSeek direct connection is unavailable: configuring its key fails closed until current model IDs, prices, peak/holiday rules and actual usage have a reviewed implementation. No retired V3/R1 model prices are published. This release does not purchase or provision a new supplier.

Baoqingtian scan login is disabled by default. Enable only after rotating the compromised historical shared signer upstream and independently verifying the full-parameter HMAC callback with synthetic authorized users. Set AWD_BQT_SCAN_ENABLED=true and a matching AWD_BQT_SCAN_AK/AWD_BQT_SCAN_SK only in the deployment's existing environment. Never reuse the literals previously present in PR337. Upstream source modification requires separate authorization under the external-services handbook.

The full-parameter HMAC protocol authenticates all identity fields; callbacks older than five minutes are rejected. The timestamp-only MD5 compatibility path is rejected because it does not bind the identity/body. A QR carries qrid/timestamp/source only. Creation additionally returns pollToken; only its hash is stored. Polling requires X-Bqt-Poll-Token (or Bearer on this route only). Tokens never belong in URLs. Redemption is atomic and single use. If the confirmed response is lost, refresh the QR; it does not issue duplicate account keys.

Provider IDs bind to stable accounts. Missing phones produce a phone-less external account, never a fabricated phone number. Existing bindings cannot silently move to another provider identity, and deleted identities do not revive. Mainland-only routes fail closed on the international site. New bindings and all financial test data must remain synthetic during verification.

Apple subscriptions remain governed by doc/appstore-subscriptions.md; deploying their verifier does not enable sales or prove sandbox/App Store approval.

The public captcha-config response adds bqtScanEnabled (no credentials), so desktop and website hide the entry when disabled. The source name aiworkdeck-prd must be explicitly present in upstream bqt.jindu.httpScanLoginList: the inspected upstream UAT implementation falls back to jingdu for unknown names, so a successful default-channel response is insufficient. Verify the dedicated callback URL and reject an old-key signature before enabling. Latest upstream source inspected read-only: UAT 19988144c (2026-10-30); no production deployment identity or effective signing secret has been verified.
