// Service worker for BlockBuilder Studio's PWA build. Cache-first: on install
// it precaches the app shell so the page loads offline; at runtime it answers
// any same-origin GET from the cache and falls back to network only for
// misses. Bump CACHE_VERSION when the shell changes to invalidate old caches
// on the next page load.
//
// Scope: this file sits at site root so its default scope is "/", covering
// every app file. Electron does NOT register the SW (it's served from
// file://), so this is a no-op in the desktop build.

const CACHE_VERSION = 'bb-v0.6.3';
// Relative URLs (not /-prefixed) so the SW works whether the app is hosted at
// site root or a sub-path (blockbuilder.studio/app/). The SW's scope already
// constrains "/" anchoring; here we resolve everything against the SW's own
// location to stay path-portable.
const APP_SHELL = [
  './',
  './index.html',
  './styles.css',
  './manifest.webmanifest',
  // Core entry + every module we actually import. Listed by hand because
  // the import map and dynamic discovery aren't available inside the SW.
  './app/main.js',
  './app/scene.js',
  './app/state.js',
  './app/properties.js',
  './app/selection.js',
  './app/handles.js',
  './app/sidebar.js',
  './app/welcome.js',
  './app/shape.js',
  './app/csg.js',
  './app/expr.js',
  './app/array.js',
  './app/cut.js',
  './app/hollow.js',
  './app/ruler.js',
  './app/workplane.js',
  './app/push_pull.js',
  './app/edge_hover.js',
  './app/ref_geom.js',
  './app/dim_overlay.js',
  './app/shortcuts_palette.js',
  './app/io.js',
  './app/repair.js',
  './app/history.js',
  './app/settings.js',
  './app/toast.js',
  './app/metrics.js',
  './app/support_nag.js',
  './app/version.js',
  // Vendored three.js stack (importmap entries). Without these, the offline
  // boot races: index.html loads from cache, then `import * as THREE from
  // 'three'` resolves to ./vendor/three/three.module.js which isn't cached
  // and fails when the network is gone. Include them all.
  './vendor/three/three.module.js',
  './vendor/three/addons/controls/OrbitControls.js',
  './vendor/three/addons/controls/TransformControls.js',
  './vendor/three/addons/exporters/STLExporter.js',
  './vendor/three/addons/exporters/OBJExporter.js',
  './vendor/three/addons/loaders/STLLoader.js',
  './vendor/three/addons/loaders/OBJLoader.js',
  './vendor/three/addons/utils/BufferGeometryUtils.js',
  './vendor/three-mesh-bvh/index.module.js',
  './vendor/three-bvh-csg/index.module.js',
  // PWA app icons.
  './build/icon-128.png',
  './build/icon-256.png',
  './build/icon-1024.png',
];

self.addEventListener('install', (ev) => {
  // Precache the app shell. Network may be flaky on first visit; failed
  // adds don't block install because cache.add() rejects on partial fetches
  // but we wrap in Promise.allSettled to keep going.
  ev.waitUntil((async () => {
    const cache = await caches.open(CACHE_VERSION);
    await Promise.allSettled(APP_SHELL.map((url) => cache.add(url)));
    self.skipWaiting();
  })());
});

self.addEventListener('activate', (ev) => {
  // Drop any old cache versions when a new SW takes control.
  ev.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(k => k !== CACHE_VERSION).map(k => caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (ev) => {
  const req = ev.request;
  // Only handle same-origin GET. POST and external CDN font requests (Google
  // Fonts uses Cache-Control headers we trust to do their own caching) skip.
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  ev.respondWith((async () => {
    const cache = await caches.open(CACHE_VERSION);
    const cached = await cache.match(req);
    if (cached) {
      // Background-refresh the asset so the next visit has the latest copy
      // without ever serving an unverified one to the current one.
      ev.waitUntil((async () => {
        try {
          const fresh = await fetch(req);
          if (fresh && fresh.ok) await cache.put(req, fresh.clone());
        } catch {}
      })());
      return cached;
    }
    try {
      const fresh = await fetch(req);
      if (fresh && fresh.ok) {
        await cache.put(req, fresh.clone());
      }
      return fresh;
    } catch (err) {
      // Last-resort offline fallback for navigations: return the cached
      // index.html so the SPA can boot from whatever state it has.
      if (req.mode === 'navigate') {
        const fallback = await cache.match('/index.html');
        if (fallback) return fallback;
      }
      throw err;
    }
  })());
});
