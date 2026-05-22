#!/usr/bin/env node
/**
 * One-time setup: generate the ECDSA P-256 keypair used to sign and verify
 * BlockBuilder Studio commercial-licence keys. Run this ONCE, store the
 * private key somewhere secure (password manager, Cloudflare Worker secret,
 * encrypted file). Embed the printed PUBLIC_KEY_SPKI_B64 in
 * app/license_crypto.js before shipping.
 *
 *   node keygen/generate-keypair.js
 *
 * Outputs:
 *   keygen/private-key.pem  (KEEP SECRET — do NOT commit, do NOT ship with the app)
 *   keygen/public-key.b64   (the SPKI base64 string to paste into the app source)
 */

const { generateKeyPairSync } = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const { privateKey, publicKey } = generateKeyPairSync('ec', { namedCurve: 'P-256' });

const privPem = privateKey.export({ type: 'pkcs8', format: 'pem' });
const pubDer  = publicKey.export({ type: 'spki', format: 'der' });
const pubB64  = pubDer.toString('base64');

const dir = path.dirname(__filename);
fs.writeFileSync(path.join(dir, 'private-key.pem'), privPem);
fs.writeFileSync(path.join(dir, 'public-key.b64'), pubB64);

console.log('Keypair generated.');
console.log('');
console.log('Private key  →  keygen/private-key.pem');
console.log('    KEEP THIS SECRET. Add to .gitignore. Used to sign licence keys.');
console.log('');
console.log('Public key  →  keygen/public-key.b64');
console.log('    Paste this into app/license_crypto.js, replacing the');
console.log('    PUBLIC_KEY_PLACEHOLDER_REPLACE_BEFORE_SHIP constant.');
console.log('');
console.log('Public key (Base64 SPKI):');
console.log(pubB64);
