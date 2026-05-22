# Release checklist

## Before first public release

### 1. Domain + hosting

- [ ] Register `blockbuilder.studio` (or `.app`, `.dev`) at a registrar. Cost ~€20/year.
- [ ] Create a Cloudflare Pages project. Connect it to a Git repo containing the
      `website/` folder; let it deploy on every push to `main`.
- [ ] Add the custom domain to the Pages project, point the registrar's DNS at
      Cloudflare nameservers.

### 2. Code signing — Windows

Pick one of three paths in order of recommendation:

**Path A: Azure Trusted Signing (recommended start)**
- Sign up at <https://aka.ms/trustedsigning> (~€10-30/month).
- No hardware token. Integrates with `electron-builder` via `signtool` and an
  Azure service principal.
- Reputation builds over a few weeks; SmartScreen warning is mild during that
  window and disappears entirely after ~1000-2000 downloads.
- Set the following secrets in CI: `AZURE_TENANT_ID`, `AZURE_CLIENT_ID`,
  `AZURE_CLIENT_SECRET`, `AZURE_ENDPOINT`, `AZURE_CODE_SIGNING_ACCOUNT_NAME`,
  `AZURE_CERT_PROFILE_NAME`.

**Path B: OV cert (Sectigo / DigiCert) — €100-200/year**
- Hardware token required (USB delivery, slows CI).
- Same reputation curve as Trusted Signing.

**Path C: EV cert — €300-500/year**
- Zero SmartScreen warnings from day one.
- Hardware token + verified business identity required.
- Recommended once revenue justifies it.

In all cases, `electron-builder` picks up the cert via env vars
`WIN_CSC_LINK` (path to `.pfx` or signing endpoint) + `WIN_CSC_KEY_PASSWORD`.

### 3. Code signing — macOS

- [ ] Enrol in the Apple Developer Program ($99/year USD).
- [ ] Create a Developer ID Application certificate in the Apple developer
      portal. Export to `developer_id.p12`.
- [ ] Notarisation: create an app-specific password under your Apple ID and
      set the following env vars during build:
      `APPLE_ID`, `APPLE_APP_SPECIFIC_PASSWORD`, `APPLE_TEAM_ID`.
- [ ] `electron-builder` notarises automatically when these are present.

### 4. Linux

- No signing required.
- AppImage is the most portable target. Already configured.
- Optional: also build `.deb` (Debian/Ubuntu) and `.rpm` (Fedora) by adding
  them to `build.linux.target`.

### 5. GitHub Releases as the download host

- [ ] Create a public repo `marjers/blockbuilder-studio` (or private with
      signed-URL release downloads).
- [ ] On each release, tag a commit (e.g. `v0.5.0`) and push.
- [ ] CI builds + uploads installers as release assets.
- [ ] Landing page download buttons point at
      `https://github.com/marjers/blockbuilder-studio/releases/latest/download/<filename>`.

### 6. Auto-update (optional but recommended)

- [ ] Install `electron-updater` (`npm i electron-updater`).
- [ ] In `electron/main.cjs`, on `ready`, call `autoUpdater.checkForUpdatesAndNotify()`.
- [ ] electron-updater reads the GitHub Releases feed via the
      `publish: { provider: github }` block already in `package.json`.
- [ ] Add a "Check for updates" button in the Settings panel that calls the
      same function manually.

### 7. Payments + licence keys

Architecture:

```
Buyer pays on Lemon Squeezy → LS posts order_created webhook to Cloudflare Worker
   → Worker verifies HMAC, signs a BBS2-... key with private ECDSA key
   → Worker emails the key via Resend
   → Buyer pastes key in app's Settings → "I have a key"
   → app/license_crypto.js verifies signature offline using embedded public key
```

The private key NEVER ships with the app. The public key is hardcoded in
`app/license_crypto.js`. Compromising one buyer's key doesn't compromise others.

#### One-time setup

```bash
# Generate the ECDSA keypair (do this ONCE — keep private-key.pem safe forever)
node keygen/generate-keypair.js

# Paste the printed Base64 into app/license_crypto.js, replacing
# PUBLIC_KEY_PLACEHOLDER_REPLACE_BEFORE_SHIP

# Deploy the issuance worker
cd cloudflare-worker
wrangler secret put BBS_PRIVATE_KEY           # PEM contents
wrangler secret put LEMONSQUEEZY_SIGNING_SECRET
wrangler secret put RESEND_API_KEY
wrangler deploy

# Configure Lemon Squeezy:
#   Product: "BlockBuilder Studio Commercial Licence" — €12 one-time
#   Webhook URL: https://blockbuilder-license-issuer.<sub>.workers.dev/
#   Event: order_created
#   Signing secret: same string you stored above
```

#### Issuing a key manually (refunds, replacements, support cases)

```bash
node keygen/sign-license.js --email "buyer@example.com" --name "Jane Maker"
# prints BBS2-... — copy/paste into the support email
```

#### Donations / one-off payments

Independent of the licence system:

- Buy Me a Coffee, Ko-fi, GitHub Sponsors, or a Stripe payment link.
- Consolidate on `https://marjers.com/support`. The in-app nag dialog
  links here directly.

### 8. Anti-tamper notes

This is a €12 commercial licence; we don't try to defeat determined crackers.
What's in place:

- **ECDSA P-256 signatures** on every key — forging requires the private key,
  not just JS edits.
- **Offline verification** via Web Crypto API — no server calls in normal use,
  but no easy bypass either.
- **Multi-point verification** — boot, every 10 min during the session, and
  before each STL/OBJ/STEP export. Tampering with localStorage mid-session
  reverts within 10 min and the very next export catches it.
- **Export header diff** — licensed exports stamp the licensee's name in STL
  binary header / OBJ comment / JSON metadata; free exports stamp "Free".
  Small but visible nudge.
- **Code signing** the binary — modifying the bundled JS breaks the
  publisher signature, which SmartScreen flags.

What we deliberately DON'T do:

- **Hardware binding / per-device activation** — annoys legit users who run on
  both desktop + laptop or reinstall OS.
- **Periodic online check** — breaks the "offline, no internet needed" promise.
- **Heavy obfuscation** — increases bundle size and dev pain for marginal anti-
  crack value.

If piracy becomes a real revenue problem (>5% of estimated install base, with
verified leaked keys), the response is:
  1. Bump the schema version (`v: 1` → `v: 2`) and reject `v: 1` keys.
  2. Re-issue all legitimate buyers a fresh v2 key (one-line script, can be
     scripted from your Stripe/LS customer dump).
  3. Public leaked keys now invalid; legitimate buyers unaffected.

## Per-release flow

```bash
# 1. Bump version
npm version 0.5.0 --no-git-tag-version
# (or edit package.json manually)

# 2. Update RELEASE NOTES (CHANGELOG.md)

# 3. Smoke-test locally
npm run dev

# 4. Build all platforms (locally or via CI)
npm run dist:all         # Windows installer + portable
npm run dist:linux       # AppImage
npm run dist:mac         # DMG (only on macOS host)

# 5. Verify the binary is signed
#    Windows:  signtool verify /pa /v dist/*.exe
#    macOS:    codesign --verify --verbose dist/*.app
#              spctl --assess --verbose dist/*.app

# 6. Commit + tag + push
git commit -am "v0.5.0"
git tag v0.5.0
git push && git push --tags

# 7. CI uploads to GitHub Releases. Done.
```

## Marketing checklist (first launch)

- [ ] Reddit posts: r/3Dprinting, r/functionalprint, r/Tinkercad
- [ ] Hacker News "Show HN: BlockBuilder Studio, an offline Tinkercad-style 3D editor"
- [ ] Lobsters
- [ ] Printables.com + Thingiverse: a couple of well-photographed models
      labelled "Made with BlockBuilder Studio" with a link
- [ ] Product Hunt (only after the website is solid, ~3 weeks after first soft launch)
- [ ] One YouTube walkthrough video (5-10 min)

## False-positive AV checklist

If Windows Defender / a third-party AV flags the binary post-signing:

- [ ] Submit at <https://www.microsoft.com/en-us/wdsi/filesubmission> with a
      build of the latest `.exe`. Reply usually in 1-3 working days.
- [ ] VirusTotal scan (<https://www.virustotal.com>) — if more than 1-2 vendors
      flag, contact each vendor's false-positive form individually.
- [ ] Bitdefender, Kaspersky, ESET, Avast each have public FP submission forms.
- [ ] Code signing dramatically reduces baseline FP rate (often from ~5 vendors
      to 0).
