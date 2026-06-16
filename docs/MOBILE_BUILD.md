# Mobile build + ship guide (iOS + Android via Capacitor)

What's in this repo:

- `capacitor.config.ts` — points at `pwa-stage/` as webDir.
- `android/` and `ios/` — native projects, committed so Codemagic can clone + build.
- `assets/icon.png` — 1024x1024 source for `@capacitor/assets generate`.
- `codemagic.yaml` — two workflows: `android-release` (AAB → Play internal) and `ios-release` (IPA → TestFlight).
- `android/app/blockbuilder-upload.keystore` — GITIGNORED. Generate locally OR Codemagic uploads it once and references it.
- `app/iap.js` — RevenueCat shim, no-op on web/desktop, fires on Capacitor native.

## One-time setup (Marjers only)

### App Store Connect

1. Login to https://appstoreconnect.apple.com.
2. My Apps → New App → iOS, English, name "BlockBuilder Studio", bundle ID `pt.marjers.blockbuilder` (create the bundle in https://developer.apple.com/account/resources/identifiers first), SKU `bbstudio01`, full access.
3. App Information → Category: Graphics & Design (primary), Productivity (secondary).
4. App Privacy → start questionnaire, answer NO to all "Do you collect data" questions, NO to tracking. (Matches the no-analytics reality.)
5. Pricing and Availability → Free.
6. In-App Purchases → New → Non-consumable.
   - Reference name: `BlockBuilder Commercial Lifetime`
   - Product ID: `pt.marjers.blockbuilder.commercial.lifetime`
   - Price: Tier 15 (EUR 14.99)
   - Display name (PT): `Licença comercial vitalícia`
   - Description (PT): `Direitos comerciais, sem lembrete, todas as actualizações para esta conta.`
   - Same in EN.
7. Generate App Store Connect API key (App Store Connect → Users and Access → Keys → App Manager role). Download the `.p8`, note Issuer ID and Key ID. These go into Codemagic as integration `BlockBuilderASC`.

### Google Play Console

1. Login to https://play.google.com/console.
2. All apps → Create app → name "BlockBuilder Studio", default language Portuguese (Portugal), app, free.
3. App content → fill Privacy Policy URL (https://blockbuilder.studio/privacy), Data safety (no data collected), App access (no login), Ads (no ads), Target audience (13+), News app (no), COVID-19 (no), Financial features (no).
4. Pricing & distribution → free, select countries.
5. Set up your store listing → paste copy from `docs/STORE_LISTING.md`, upload icon 512x512, feature graphic 1024x500, screenshots (see "Generate screenshots" below).
6. Monetisation → Products → In-app products → Create product.
   - Product ID: `pt.marjers.blockbuilder.commercial.lifetime` (MUST match Apple)
   - Name: `BlockBuilder Commercial Lifetime`
   - Description: same as Apple
   - Price: EUR 14.99
   - Activate.
7. Create a Service Account for the Play Developer API (see https://docs.codemagic.io/yaml-publishing/google-play/), download the JSON, save as `gcloud-service-account.json`. Goes into Codemagic group `google_play` as `GCLOUD_SERVICE_ACCOUNT_CREDENTIALS`.

### RevenueCat

1. Sign up at https://app.revenuecat.com.
2. Create project "BlockBuilder Studio".
3. Add iOS app, bundle `pt.marjers.blockbuilder`, paste ASC public key.
4. Add Android app, package `pt.marjers.blockbuilder`, upload Play service account JSON.
5. Create product `pt.marjers.blockbuilder.commercial.lifetime` on both apps.
6. Create entitlement `commercial`, attach the product to it on both stores.
7. Create offering `default`, package `lifetime` referencing the product on both apps.
8. Settings → API Keys → copy the iOS and Android public SDK keys.
9. In `app/iap.js`, replace the placeholders OR inject via bundler:
   ```js
   globalThis.__RC_IOS_API_KEY__     = 'appl_xxxxxxxxxxxxxxxxxxx';
   globalThis.__RC_ANDROID_API_KEY__ = 'goog_xxxxxxxxxxxxxxxxxxx';
   ```
   Easiest: add to `pwa-stage/iap-keys.js` and reference it from `index.html` before `app/main.js`.

### Codemagic

1. Sign up at https://codemagic.io (free 500 build minutes / month).
2. Connect the GitHub repo josedasilva11/blockbuilder-studio (private OK).
3. Teams → Integrations → App Store Connect → connect with the API key + Issuer ID + Key ID. Name it `BlockBuilderASC`.
4. Code signing identities → Android keystores → upload `android/app/blockbuilder-upload.keystore` with passwords + alias `blockbuilder`. Name it `BlockBuilderKeystore`.
5. Environment groups → New group `google_play` → variable `GCLOUD_SERVICE_ACCOUNT_CREDENTIALS` with the service account JSON content. Mark as secret.
6. Open the app on Codemagic, choose codemagic.yaml workflow, hit Start build.

## Local development

To run on a connected Android device:

```sh
npm run pwa:stage     # rebuild pwa-stage/ from app/*, vendor/*, etc.
npx cap sync android  # copy pwa-stage/ into android/app/src/main/assets/public
npx cap open android  # opens Android Studio. Run from there.
```

iOS requires a Mac + Xcode. Without one, the only path is Codemagic. Use the `ios-release` workflow with `submit_to_testflight: true` and the build appears in TestFlight after ~15 minutes.

## Local Android keystore (already generated)

File: `android/app/blockbuilder-upload.keystore`
- Alias: `blockbuilder`
- Passwords: `bbs253251732ze` (BOTH store and key)
- SHA1: `EF:76:53:C7:E9:F2:64:EE:35:07:FD:4C:B8:63:68:0E:8E:AB:E8:51`
- Valid until: 2053-11-01

To use locally instead of Codemagic, create `keystore.properties` at repo root with the values from `keystore.properties.example`. NEVER commit the keystore or the properties file (both gitignored).

If the keystore is ever lost: cannot recover, must roll a new app on Play with a new package name. Apple is more forgiving (Distribution cert is re-issuable).

## Versioning

- `versionName` in `android/app/build.gradle` and Xcode `MARKETING_VERSION` should track the marketing version (`0.6.0`, `0.6.1`, etc.).
- `versionCode` in `android/app/build.gradle` and Xcode `CFBundleVersion` must MONOTONICALLY INCREASE per upload, even for re-uploads of the same marketing version. Codemagic's `agvtool new-version` step handles this for iOS by querying ASC. For Android, bump `versionCode` by hand before each push.

## Generate store screenshots

Use Playwright pointing at the live PWA:

```sh
node scripts/gen-store-screenshots.mjs
```

(Not implemented yet. Easy to add: open https://blockbuilder-app.pages.dev at iPhone 14 Pro (1290x2796) and 13" iPad (2048x2732), spawn shapes via the JS API, screenshot.)

## Privacy policy

Apple and Google both require a hosted Privacy Policy URL. Create `website/privacy.html` based on the Pincela template, change "Pincela" → "BlockBuilder Studio", "pt.marjers.pincela" → "pt.marjers.blockbuilder", remove camera-specific clauses, mention RevenueCat as the IAP processor.

## Costs

- Apple Developer Program: USD 99 / year
- Google Play Console: USD 25 one-time
- Codemagic: free for 500 build minutes / month (plenty for one app on one workflow)
- RevenueCat: free under USD 2,500 MTR
- Lemon Squeezy (web only, not for stores): 5% + transaction fee on each sale
