// License key verification with ECDSA P-256 + SHA-256 over Web Crypto.
//
// Threat model + non-goals
// ------------------------
// This is a €12 one-time commercial licence. Goals:
//
//   * Make casual key generation impossible (need the private key, which lives
//     on the Cloudflare Worker / dev machine, never ships with the app).
//   * Make tampering with localStorage do nothing — a hand-crafted "key"
//     fails signature verification.
//   * Make the in-process bypass require modifying the bundled JS, which a
//     signed installer makes loud (modified `.exe` loses its signature →
//     SmartScreen flags it).
//
// Non-goals:
//
//   * Stop a determined cracker. Anyone willing to patch the JS can disable
//     licence checks; we don't try to defeat that. The point is to make the
//     effort cost more than €12.
//   * Online activation / hardware binding. Both annoy legitimate users who
//     reinstall their OS, dual-boot, or use the app on a desktop AND a
//     laptop. Skipped.
//
// Key format
// ----------
//   BBS2-<base64url(payload-json)>-<base64url(signature-DER)>
//
// payload-json:
//   { email, name, kind: "commercial", issued: ISO8601, v: 1 }
//
// signature: ECDSA P-256 over UTF-8 of the payload-json bytes, SHA-256 hash.

// ---------------------------------------------------------------------------
// Embedded public key (Base64 SPKI DER). Generated alongside the matching
// private key by `keygen/generate-keypair.js`. This is a placeholder — replace
// it with your real public key string before shipping. The private key MUST
// never ship with the app; keep it in the licence-issuing worker only.
// ---------------------------------------------------------------------------
const PUBLIC_KEY_SPKI_B64 = 'MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEAy/0emogD7RXeKCYGZcS5D1jX82TEB0ffxkxy8kSuX8I4aVSrI4pG6x/WtuqwmzlwY5dTjoZvkTIjYwINfZ/Rg==';

let _pubKey = null;
async function loadPublicKey() {
  if (_pubKey) return _pubKey;
  if (PUBLIC_KEY_SPKI_B64.startsWith('PUBLIC_KEY_PLACEHOLDER')) {
    // Dev mode — no real key yet, every signature fails.
    return null;
  }
  const raw = b64ToBytes(PUBLIC_KEY_SPKI_B64);
  _pubKey = await crypto.subtle.importKey(
    'spki', raw,
    { name: 'ECDSA', namedCurve: 'P-256' },
    false, ['verify']
  );
  return _pubKey;
}

/**
 * Verify a licence key string. Returns the parsed payload on success, null
 * on any kind of failure (malformed, bad signature, expired, etc.).
 */
export async function verifyLicenseKey(keyStr) {
  if (typeof keyStr !== 'string' || !keyStr.startsWith('BBS2-')) return null;
  const parts = keyStr.split('-');
  if (parts.length !== 3) return null;
  const [, payloadB64, sigB64] = parts;
  let payloadBytes, sigBytes;
  try {
    payloadBytes = b64UrlToBytes(payloadB64);
    sigBytes = b64UrlToBytes(sigB64);
  } catch { return null; }

  const pub = await loadPublicKey();
  if (!pub) return null;

  // ECDSA signatures in Web Crypto come in raw (r||s) format, but our signer
  // emits DER (SEQUENCE { INTEGER r, INTEGER s }) for broader tooling
  // compatibility. Convert before verifying.
  let raw;
  try { raw = derToRawECDSA(sigBytes); } catch { return null; }

  const ok = await crypto.subtle.verify(
    { name: 'ECDSA', hash: 'SHA-256' },
    pub, raw, payloadBytes
  );
  if (!ok) return null;

  let payload;
  try { payload = JSON.parse(new TextDecoder().decode(payloadBytes)); } catch { return null; }
  if (!payload.email || !payload.name || payload.kind !== 'commercial') return null;
  if (payload.v !== 1) return null;
  return payload;
}

// ---------------------------------------------------------------------------
// Encoding helpers
// ---------------------------------------------------------------------------
function b64ToBytes(b64) {
  const bin = atob(b64.replace(/-/g, '+').replace(/_/g, '/'));
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
function b64UrlToBytes(b64) {
  const pad = '='.repeat((4 - (b64.length % 4)) % 4);
  return b64ToBytes((b64 + pad).replace(/-/g, '+').replace(/_/g, '/'));
}

// DER ECDSA signature is `SEQUENCE { INTEGER r, INTEGER s }`. Web Crypto wants
// `r || s` as fixed-width 32-byte big-endian (for P-256). Translate.
function derToRawECDSA(der) {
  if (der[0] !== 0x30) throw new Error('bad DER');
  // 0x30 <total-len> 0x02 <rLen> <r> 0x02 <sLen> <s>
  let off = 2;
  // Handle long-form length encoding for total len (rare for ECDSA).
  if (der[1] & 0x80) off += der[1] & 0x7f;
  if (der[off++] !== 0x02) throw new Error('bad DER');
  let rLen = der[off++];
  let r = der.slice(off, off + rLen);
  off += rLen;
  if (der[off++] !== 0x02) throw new Error('bad DER');
  let sLen = der[off++];
  let s = der.slice(off, off + sLen);
  // Strip a possible leading 0x00 added by the INTEGER encoding to keep the
  // value positive, and left-pad to 32 bytes.
  if (r.length > 32) r = r.slice(r.length - 32);
  if (s.length > 32) s = s.slice(s.length - 32);
  const out = new Uint8Array(64);
  out.set(r, 32 - r.length);
  out.set(s, 64 - s.length);
  return out;
}
