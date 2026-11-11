# China Android download publication (#1672 / #1673)

The China `/start` page now offers a native Android APK, without requiring website login. `/api/download?target=android-cn` uses the existing `dl.aiworkdeck.com` type-A URL signing route; international deployments reject this China-only target. This is a new entry, not an upgrade of a previously published APK URL. No new CDN, bucket or credential is introduced.

Release: 1.4.0 (code 7), package `com.aiworkdeck.mobile.cn`, minimum Android 10 (API 29), 42,215,169 bytes. SHA256: `b4180656fe51e260afc5a994fad22bd0b1ee76fe49b2f004c5c39fb2bc6de8f8`. Signing certificate SHA256: `6f1c370709491cc7ecbfa2d20b7968817bbdebb6d395d0dcf143fc39a5f013df`.

Immutable object: `oss://awd-downloads/update/mobile/android/AI-WorkDeck-1.4.0-cn.apk`. Source mobile commit starts `9d3dab5`; the Android app subtree is unchanged at final mobile source `56636bd`. Existing scoped OSS credentials stay in Beijing `/etc/aiworkdeck/mirror-sync.env`; CDN signing credentials stay in website `.env.local`. Never store credentials here.

Update 2026-11-10: 1.6.1 (code 10), 42,460,925 bytes, SHA256 `ddfe4f7289c35f3e5214fa75b16603e9bdda67273cc1eed385af7b812248cd9f`, same signing certificate; object `oss://awd-downloads/update/mobile/android/AI-WorkDeck-1.6.1-cn.apk` from mobile release build `561531b` (android-release run 42837162311). 1.6.0 object kept.

Update 2026-11-09: 1.6.0 (code 9), 42,428,161 bytes, SHA256 `ca09e31c98b2281a9defec0f41bcf6c76472af35dc4aeabcd82cb566a04383f9`, same signing certificate; object `oss://awd-downloads/update/mobile/android/AI-WorkDeck-1.6.0-cn.apk` from mobile release build `a17bd1e` (android-release run 42622245977). 1.4.0 object kept.

Publication order: validate signature/version/source and full file hash; confirm the versioned object is absent; upload and verify origin readback; only then activate the website source exposing the link. Verify the live China redirect and full CDN bytes; verify the international target remains unavailable. Keep previous versioned artifacts. Test with `NEXT_PUBLIC_AWD_SITE=cn` and `intl`, `NODE_OPTIONS=--conditions=react-server`, running `scripts/verify-mobile-download.mts` from a fresh temporary directory. This contract test does not download a real APK or simulate installation.
