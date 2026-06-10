// Cloudflare Worker that issues BlockBuilder Studio commercial-licence keys
// in response to Lemon Squeezy purchase webhooks.
//
// Why a worker:
//   * Cheap (free tier covers 100k requests/day, way more than we'll ever do).
//   * The signing private key never leaves the worker — stored as a
//     CF Worker Secret, encrypted at rest.
//   * Same code path can also handle Gumroad ping webhooks if you switch.
//
// Setup:
//   1. wrangler login
//   2. wrangler secret put BBS_PRIVATE_KEY   (paste contents of private-key.pem)
//   3. wrangler secret put LEMONSQUEEZY_SIGNING_SECRET  (from the LS webhook page)
//   4. wrangler secret put RESEND_API_KEY  (or any other transactional email provider)
//   5. wrangler deploy
//   6. In Lemon Squeezy → Settings → Webhooks → Add new
//        URL: https://<your-worker>.workers.dev/
//        Events: order_created
//        Signing secret: the one you just set
//
// The worker:
//   1. Verifies the LS HMAC signature (refuses fake calls).
//   2. Parses the order — extracts buyer email + name.
//   3. Signs a payload with the embedded ECDSA private key.
//   4. Emails the key to the buyer (Resend / Postmark / SendGrid all work).

const enc = new TextEncoder();
const dec = new TextDecoder();

export default {
  async fetch(req, env) {
    try {
      return await handle(req, env);
    } catch (err) {
      // Stack only — never log the secret values themselves.
      console.error('worker error: ' + (err?.name || 'Error') + ': ' +
        (err?.message || err) + '\n' + (err?.stack || '(no stack)'));
      return new Response('worker error', { status: 500 });
    }
  },
};

async function handle(req, env) {
    if (req.method !== 'POST') return new Response('OK', { status: 200 });

    const raw = await req.text();
    const sigHeader = req.headers.get('X-Signature') || req.headers.get('x-signature');

    // ----- Verify Lemon Squeezy webhook signature ---------------------------
    const wantedSig = await hmacHex(env.LEMONSQUEEZY_SIGNING_SECRET, raw);
    if (!sigHeader || sigHeader !== wantedSig) {
      return new Response('bad signature', { status: 401 });
    }

    const evt = JSON.parse(raw);
    if (evt?.meta?.event_name !== 'order_created') {
      return new Response('ignored', { status: 200 });
    }

    // ----- Pull buyer info from the LS payload -----------------------------
    const attrs = evt.data?.attributes || {};
    const email = (attrs.user_email || '').trim().toLowerCase();
    const name  = (attrs.user_name || 'Licensed user').trim();
    if (!email) return new Response('no email', { status: 400 });

    // ----- Sign the licence key --------------------------------------------
    const payload = {
      email, name, kind: 'commercial',
      issued: new Date().toISOString(),
      v: 1,
    };
    const payloadBytes = enc.encode(JSON.stringify(payload));

    const priv = await importPrivateKey(env.BBS_PRIVATE_KEY);
    const sigRaw = await crypto.subtle.sign(
      { name: 'ECDSA', hash: 'SHA-256' },
      priv, payloadBytes
    );
    // Web Crypto returns r||s (64B). The desktop app's verifier accepts DER
    // signatures, so re-encode before emitting the key string.
    const sigDer = rawECDSAToDer(new Uint8Array(sigRaw));
    // Use '.' as separator: base64url-safe ('.' is NOT in the alphabet, unlike
    // '-' which was used in v0.4 keys and could appear inside a signature,
    // breaking naive .split('-') parsers. The desktop verifier still accepts
    // legacy 'BBS2-...' for backwards compat.
    const key = `BBS2.${b64url(payloadBytes)}.${b64url(sigDer)}`;

    // ----- Email it via Resend ---------------------------------------------
    if (env.RESEND_API_KEY) {
      const body = renderEmail(name, key);
      const resp = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${env.RESEND_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from: 'BlockBuilder Studio <licences@marjers.com>',
          to: email,
          reply_to: 'geral@marjers.com',
          subject: 'Your BlockBuilder Studio licence key',
          html: body,
        }),
      });
      if (!resp.ok) {
        const raw = (await resp.text()).slice(0, 200);
        // Redact buyer email if Resend echoed it back in the error message.
        const safe = raw.replaceAll(email, '<redacted-buyer-email>');
        console.error('resend rejected: status=' + resp.status + ' body=' + safe);
        return new Response('email failed', { status: 500 });
      }
    }
    return new Response('OK', { status: 200 });
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function hmacHex(secret, body) {
  const k = await crypto.subtle.importKey(
    'raw', enc.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false, ['sign']
  );
  const sig = await crypto.subtle.sign('HMAC', k, enc.encode(body));
  return [...new Uint8Array(sig)].map(b => b.toString(16).padStart(2, '0')).join('');
}

async function importPrivateKey(pem) {
  const b64 = pem
    .replace(/-----BEGIN PRIVATE KEY-----/, '')
    .replace(/-----END PRIVATE KEY-----/, '')
    .replace(/\s+/g, '');
  const der = Uint8Array.from(atob(b64), c => c.charCodeAt(0));
  return crypto.subtle.importKey(
    'pkcs8', der,
    { name: 'ECDSA', namedCurve: 'P-256' },
    false, ['sign']
  );
}

function b64url(bytes) {
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

// Convert Web Crypto raw r||s ECDSA sig (64 bytes for P-256) into DER
// (SEQUENCE { INTEGER r, INTEGER s }), which is what the desktop verifier
// (and most non-browser stacks) expects.
function rawECDSAToDer(raw) {
  const r = trimLeadingZeros(raw.slice(0, 32));
  const s = trimLeadingZeros(raw.slice(32, 64));
  const rEnc = encodeDerInteger(r);
  const sEnc = encodeDerInteger(s);
  const seqLen = rEnc.length + sEnc.length;
  const out = new Uint8Array(2 + seqLen);
  out[0] = 0x30;
  out[1] = seqLen;
  out.set(rEnc, 2);
  out.set(sEnc, 2 + rEnc.length);
  return out;
}
function trimLeadingZeros(bytes) {
  let i = 0;
  while (i < bytes.length - 1 && bytes[i] === 0) i++;
  return bytes.slice(i);
}
function encodeDerInteger(value) {
  // Prepend 0x00 if high bit is set (to keep INTEGER positive).
  const needsPad = (value[0] & 0x80) !== 0;
  const body = needsPad ? new Uint8Array([0, ...value]) : value;
  return new Uint8Array([0x02, body.length, ...body]);
}

function renderEmail(name, key) {
  return `
    <div style="font-family: -apple-system, system-ui, sans-serif; color: #111; max-width: 540px;">
      <p>Hi ${escapeHtml(name)},</p>
      <p>Thank you for buying a commercial licence for <strong>BlockBuilder Studio</strong>.</p>
      <p>Your licence key:</p>
      <pre style="background: #f4f5f8; padding: 14px; border-radius: 8px; font-family: ui-monospace, monospace; font-size: 12px; word-break: break-all;">${key}</pre>
      <p><strong>To activate:</strong></p>
      <ol>
        <li>Open BlockBuilder Studio.</li>
        <li>Click the gear icon (top right) → "I have a key" in the License section.</li>
        <li>Paste the key above. Enter your name as you'd like it to appear.</li>
      </ol>
      <p>The activation is offline. The key works on every machine you own — no per-device limit. Future updates are included.</p>
      <p>Questions? Reply to this email or write to <a href="mailto:geral@marjers.com">geral@marjers.com</a>.</p>
      <p>— Marjers<br>
        <a href="https://blockbuilder.studio">blockbuilder.studio</a></p>
    </div>
  `;
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}
