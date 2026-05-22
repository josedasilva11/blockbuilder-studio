# BlockBuilder licence-issuer worker

Cloudflare Worker that receives a purchase webhook (Lemon Squeezy by default), signs a `BBS2-` licence key with the embedded ECDSA private key, and emails it to the buyer.

## One-time setup

```bash
# 1. Install wrangler if you don't have it
npm i -g wrangler

# 2. Log in
wrangler login

# 3. Generate the keypair locally (only once, ever)
cd ..
node keygen/generate-keypair.js

# 4. Store secrets in the worker
cd cloudflare-worker
wrangler secret put BBS_PRIVATE_KEY
#   paste contents of keygen/private-key.pem when prompted

wrangler secret put LEMONSQUEEZY_SIGNING_SECRET
#   paste the signing secret from Lemon Squeezy webhook config

wrangler secret put RESEND_API_KEY
#   from resend.com (or swap the email provider in license-issuer.js)

# 5. Deploy
wrangler deploy
```

## Paste the public key into the app

`keygen/generate-keypair.js` also writes `keygen/public-key.b64`. Open `app/license_crypto.js` and replace:

```js
const PUBLIC_KEY_SPKI_B64 = 'PUBLIC_KEY_PLACEHOLDER_REPLACE_BEFORE_SHIP';
```

with the contents of that file (single line, Base64). Rebuild the app — it now trusts keys signed by your worker.

## Configure Lemon Squeezy

1. Create a product "BlockBuilder Studio Commercial Licence" at €12 one-time.
2. Settings → Webhooks → "Add new":
   - URL: `https://blockbuilder-license-issuer.<your-subdomain>.workers.dev/`
   - Events: `order_created`
   - Signing secret: same string you stored in `LEMONSQUEEZY_SIGNING_SECRET`
3. Test with a 100% discount coupon to make sure the email lands.

## Switching from Lemon Squeezy to Gumroad

Replace the `meta.event_name === 'order_created'` check with the Gumroad ping format and read `email` + `full_name` from the form body. Signature verification differs — Gumroad uses a per-product secret in the form data.

## Local testing

The worker's `dev` mode replays POSTs from a local file. To test signing only without LS:

```bash
node ../keygen/sign-license.js --email "test@example.com" --name "Test User"
```

The resulting `BBS2-...` string can be pasted directly into the app's activation dialog to verify the full crypto loop end-to-end.
