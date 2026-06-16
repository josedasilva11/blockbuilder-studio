// Stages the web bundle into pwa-stage/ for Capacitor + Cloudflare Pages
// deploy. Idempotent: wipes the target each run so stale files never sneak
// into the next build. Same source pattern used by both `cap sync` and the
// `wrangler pages deploy pwa-stage --project-name=blockbuilder-app` step.

import { rm, mkdir, cp } from 'node:fs/promises';
import { existsSync } from 'node:fs';

const root = process.cwd();
const stage = `${root}/pwa-stage`;

const FILES = ['index.html', 'sw.js', 'manifest.webmanifest', 'styles.css'];
const DIRS = ['app', 'vendor', 'build'];

console.log('[stage-pwa] cleaning', stage);
await rm(stage, { recursive: true, force: true });
await mkdir(stage, { recursive: true });

for (const f of FILES) {
  if (!existsSync(`${root}/${f}`)) {
    console.warn('[stage-pwa] missing', f);
    continue;
  }
  await cp(`${root}/${f}`, `${stage}/${f}`);
}
for (const d of DIRS) {
  if (!existsSync(`${root}/${d}`)) {
    console.warn('[stage-pwa] missing dir', d);
    continue;
  }
  await cp(`${root}/${d}`, `${stage}/${d}`, { recursive: true });
}

console.log('[stage-pwa] done');
