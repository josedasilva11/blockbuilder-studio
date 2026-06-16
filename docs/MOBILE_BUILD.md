# Mobile build + ship guide (iOS + Android via Capacitor)

What's in this repo:

- `capacitor.config.ts` — points at `pwa-stage/` as webDir.
- `android/` and `ios/` — native projects, committed so Codemagic can clone + build.
- `assets/icon.png` — 1024x1024 source for `@capacitor/assets generate`.
- `codemagic.yaml` — two workflows: `android-release` (AAB → Play internal) and `ios-release` (IPA → TestFlight).
- `android/app/blockbuilder-upload.keystore` — GITIGNORED. Generate locally OR Codemagic uploads it once and references it.

## Monetisation model

**Mobile + tablet apps are paid up-front, EUR 4.99.** No IAP, no subscription, no RevenueCat. Paying for the download IS the licence. Apple / Google handle all the billing, refunds (14-day window), receipts, and family sharing if the user has it on. Desktop stays free with the soft reminder + EUR 12 commercial licence via Lemon Squeezy on blockbuilder.studio.

The reminder dialog is hard-coded off when the app runs inside Capacitor native, since "you bought the app, here's a nag screen" is hostile.

## One-time setup (Marjers only)

### App Store Connect

1. Login to https://appstoreconnect.apple.com.
2. My Apps → New App → iOS, English, name "BlockBuilder Studio", bundle ID `pt.marjers.blockbuilder` (create the bundle in https://developer.apple.com/account/resources/identifiers first), SKU `bbstudio01`, full access.
3. App Information → Category: Graphics & Design (primary), Productivity (secondary).
4. App Privacy → start questionnaire, answer NO to all "Do you collect data" questions, NO to tracking. (Matches the no-analytics reality.)
5. Pricing and Availability → Price Schedule → Tier 5 (EUR 4.99). Available in all territories.
6. Generate App Store Connect API key (App Store Connect → Users and Access → Keys → App Manager role). Download the `.p8`, note Issuer ID and Key ID. These go into Codemagic as integration `BlockBuilderASC`.

(No In-App Purchases to create. The desktop's commercial licence sits behind Lemon Squeezy on blockbuilder.studio; the mobile / tablet purchase IS the commercial licence on those platforms.)

### Google Play Console

1. Login to https://play.google.com/console.
2. All apps → Create app → name "BlockBuilder Studio", default language Portuguese (Portugal), app, free.
3. App content → fill Privacy Policy URL (https://blockbuilder.studio/privacy), Data safety (no data collected), App access (no login), Ads (no ads), Target audience (13+), News app (no), COVID-19 (no), Financial features (no).
4. Pricing & distribution → set the app PAID, price EUR 4.99, select countries (recommend all). Confirm the paid-app cutoff: Play requires a Merchant account linked, set that up at https://play.google.com/console/payments-settings if not already done.
5. Set up your store listing → paste copy from `docs/STORE_LISTING.md`, upload icon 512x512, feature graphic 1024x500, screenshots (see "Generate screenshots" below).
6. Create a Service Account for the Play Developer API (see https://docs.codemagic.io/yaml-publishing/google-play/), download the JSON, save as `gcloud-service-account.json`. Goes into Codemagic group `google_play` as `GCLOUD_SERVICE_ACCOUNT_CREDENTIALS`.

(No in-app products to configure. The base app price IS the product.)

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
- Lemon Squeezy (web only, not for stores): 5% + transaction fee on each sale
- Apple / Google take 30 % of each app sale (15 % if revenue stays under USD 1 M / year, via the Small Business Program / Play tier).
