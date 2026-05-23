# Launch checklist (BETA → LIVE)

The repo is currently in **BETA mode**. Payments are paused. License keys are
issued manually via `keygen/sign-license.js` to invited testers. To flip back
to live, follow this checklist in order.

## State snapshot

The last known launch-ready state is tagged `v0.5.0-launch-ready`. To see the
exact pre-beta state at any time:

```bash
git show v0.5.0-launch-ready
git diff v0.5.0-launch-ready HEAD -- website/index.html app/
```

## What BETA mode changes

Everything below is gated by a single toggle in two places. Removing the toggle
on each restores the live behaviour.

### 1. Website (`website/index.html`)

- `<body data-mode="beta">` ← the attribute switches all gates
- Sticky amber `BETA` banner at the top of every page
- All Lemonsqueezy checkout buttons are visually dimmed and rewired to
  `mailto:geral@marjers.com?subject=BlockBuilder beta access`
- The Commercial pricing tile gets a `PAUSED DURING BETA` overlay
- The Coffee tier (BMC) stays enabled — donations are fine in beta
- The Free download stays enabled — testers need the binary

### 2. App (`app/support_nag.js`, `app/main.js`, `app/welcome.js`)

- `export const BETA_MODE = true;` in `support_nag.js`
- `shouldShowNag()` always returns `false` while in beta (testers have keys)
- Settings panel's License section: "Buy licence (€12)" becomes
  "Request beta access" with the same mailto
- Welcome screen footer line becomes "BETA build, thanks for testing.
  Bug reports? email Marjers."

### 3. Lemonsqueezy (manual, no code)

- Product can stay Published or be set back to Draft — the site doesn't link to
  it during beta, so either is fine.
- **Recommended**: set the product status to **Draft** so any leaked
  checkout URLs return 404 instead of letting accidental purchases happen.

## Flipping to LIVE — exact edits

When ready to go live, three minimal edits restore everything. The diff is
deliberately small to make this trivial.

### A. `website/index.html`

```diff
-<body data-mode="beta">
+<body>

-<!-- ════════════════════════════════════════════════════════════════════════
-     BETA banner. Visible only when <body data-mode="beta">. ...
-     ════════════════════════════════════════════════════════════════════════ -->
-<div class="beta-banner" role="status">
-  <strong>BETA</strong>
-  <span>BlockBuilder Studio is in private beta. Payments are paused while we shake out bugs.</span>
-  <a href="mailto:geral@marjers.com?subject=BlockBuilder%20beta%20access">Request access →</a>
-</div>
```

You can leave the `.beta-banner` CSS rules and the `[data-mode="beta"]` gates
in place — without the attribute they do nothing. Or strip them for cleanliness
(search for `BETA MODE` in the `<style>` block).

Also remove the BETA swap script near `</body>`:

```diff
-<!-- BETA MODE swap. Replace LS checkout buttons with a mailto ... -->
-<script>
-if (document.body.dataset.mode === 'beta') { ... }
-</script>
```

### B. `app/support_nag.js`

```diff
-export const BETA_MODE = true;
+export const BETA_MODE = false;
```

That's it for the app. The `BETA_MODE` constant is the single switch — every
gate (`shouldShowNag()`, Settings License section, Welcome footer) checks it.

### C. Lemonsqueezy

1. Settings → Store → **Test mode** toggle OFF (once LS approves the merchant
   application; the "Your application has been received" banner must clear)
2. Products → BlockBuilder Studio → Status: **Published**
3. Settings → Webhooks → confirm the `api.blockbuilder.studio` endpoint is
   listed and listening for `order_created` in live mode (some LS UIs require
   you to re-create the webhook when leaving test mode — check the banner)

## Going-live verification

Once flipped:

1. Hard-refresh `https://blockbuilder.studio` — no banner, no amber bar
2. Click "Buy licence" — opens LS checkout, **no** "Test mode" red banner
3. Run `BlockBuilder Studio.exe` — Settings → License shows "Buy licence (€12)"
   not "Request beta access"
4. Optional: do one real €12 purchase with your own card to confirm the live
   webhook fires, email lands, key activates. Refund yourself after via LS.

## Issuing manual beta keys

While in beta, mint keys via:

```bash
cd keygen
node sign-license.js --email tester@example.com --name "Tester Name"
```

The script prints a `BBS2....` key. Email it manually to the tester. They paste
it into the app's Settings → License → "I have a key".

## Tag at launch time

After flipping live and verifying:

```bash
git commit -m "release: flip from beta to live"
git tag v0.5.0-live
git push origin master v0.5.0-live
```
