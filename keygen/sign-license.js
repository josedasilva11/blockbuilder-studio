#!/usr/bin/env node
/**
 * Sign a BlockBuilder Studio commercial licence key.
 *
 *   node keygen/sign-license.js --email "buyer@example.com" --name "Jane Maker"
 *
 * The output is a `BBS2-...` string. Email it to the buyer; their app's
 * Settings → "I have a key" dialog verifies it offline via the embedded
 * public key.
 *
 * Reads the private key from:
 *   1. env var BBS_PRIVATE_KEY  (PEM string, preferred for CI / Cloudflare)
 *   2. file keygen/private-key.pem
 */

const { createSign } = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

function loadPrivateKey() {
  if (process.env.BBS_PRIVATE_KEY) return process.env.BBS_PRIVATE_KEY;
  const p = path.join(__dirname, 'private-key.pem');
  if (!fs.existsSync(p)) {
    console.error('No private key found. Run keygen/generate-keypair.js first.');
    process.exit(1);
  }
  return fs.readFileSync(p, 'utf8');
}

function parseArgs() {
  const out = {};
  for (let i = 2; i < process.argv.length; i += 2) {
    const k = process.argv[i].replace(/^--/, '');
    out[k] = process.argv[i + 1];
  }
  if (!out.email || !out.name) {
    console.error('Usage: node keygen/sign-license.js --email "buyer@example.com" --name "Jane Maker"');
    process.exit(1);
  }
  return out;
}

function b64url(buf) {
  return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

const args = parseArgs();
const priv = loadPrivateKey();

const payload = {
  email: args.email.trim().toLowerCase(),
  name:  args.name.trim(),
  kind:  'commercial',
  issued: new Date().toISOString(),
  v: 1,
};
const payloadBytes = Buffer.from(JSON.stringify(payload), 'utf8');

const signer = createSign('SHA256');
signer.update(payloadBytes);
const sig = signer.sign({ key: priv, dsaEncoding: 'der' });

const key = `BBS2-${b64url(payloadBytes)}-${b64url(sig)}`;
console.log(key);
