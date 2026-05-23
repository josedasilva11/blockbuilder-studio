// Startup modal, "New / Continue last / Open file / Recents". Replaces the
// auto-restore behaviour so the user explicitly picks what to load on launch.

import { state } from './state.js';
import { TinkerShape } from './shape.js';
import { selectShape } from './selection.js';
import { getAutosave, migrateLegacyAutosave } from './storage.js';
import { BETA_MODE, BETA_MAILTO } from './support_nag.js';

const RECENTS_KEY = 'blockbuilder.recents.v1';
const MAX_RECENTS = 6;
const SKIP_WELCOME_KEY = 'bb.skipWelcome';

export async function showWelcome({ onClose }) {
  // Honour the "don't show on startup" preference. Continue last is the
  // implicit behaviour when the user opted out, preserves their session.
  if (localStorage.getItem(SKIP_WELCOME_KEY) === '1') {
    await migrateLegacyAutosave();
    await loadAutosave();
    onClose?.('skip');
    return;
  }

  await migrateLegacyAutosave();
  const autosave = await readAutosaveSummary();
  const recents = readRecents();

  const overlay = document.createElement('div');
  overlay.className = 'welcome-modal';
  overlay.innerHTML = `
    <div class="welcome-card">
      <div class="welcome-brand">
        <svg class="welcome-mark" viewBox="0 0 40 40" aria-hidden="true">
          <defs>
            <linearGradient id="wlg" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stop-color="#cdff45"/>
              <stop offset="100%" stop-color="#7cbe1e"/>
            </linearGradient>
          </defs>
          <path d="M10 14 L20 9 L30 14 L30 26 L20 31 L10 26 Z" fill="url(#wlg)" opacity="0.16"/>
          <path d="M10 14 L20 9 L30 14 L30 26 L20 31 L10 26 Z M10 14 L20 19 L30 14 M20 19 L20 31"
                stroke="url(#wlg)" stroke-width="2" fill="none" stroke-linejoin="round" stroke-linecap="round"/>
        </svg>
        <h1><strong>Block</strong>Builder <span class="studio">Studio</span></h1>
        <p class="tagline">Build, snap, print. No accounts, no limits.</p>
      </div>

      <div class="welcome-cards">
        <button class="welcome-action primary" data-action="new">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 4 V20 M4 12 H20"/></svg>
          <div class="text">
            <div class="title">New project</div>
            <div class="sub">Start on an empty workplane</div>
          </div>
        </button>

        ${autosave ? `
        <button class="welcome-action" data-action="continue">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 12 A9 9 0 1 0 6 5.3 M3 4 V10 H9"/></svg>
          <div class="text">
            <div class="title">Continue where you left off</div>
            <div class="sub">${autosave.shapeCount} shape${autosave.shapeCount === 1 ? '' : 's'} • ${ago(autosave.ts)}</div>
          </div>
        </button>` : ''}

        <button class="welcome-action" data-action="open">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6 H9 L11 9 H21 V19 H3 Z"/></svg>
          <div class="text">
            <div class="title">Open file…</div>
            <div class="sub">Load a .json project from disk</div>
          </div>
        </button>
      </div>

      ${recents.length > 0 ? `
      <div class="welcome-recents">
        <h3>Recent</h3>
        <div class="welcome-recents-list">
          ${recents.map((r, i) => `
            <button class="welcome-recent" data-recent="${i}">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 6 L12 2 L20 6 L20 18 L12 22 L4 18 Z"/></svg>
              <span class="name">${escapeHtml(r.name)}</span>
              <span class="meta">${r.shapeCount} sh. • ${ago(r.ts)}</span>
            </button>
          `).join('')}
        </div>
      </div>` : ''}

      <div class="welcome-foot">
        <span>Tip: drag a shape from the left to begin.</span>
        <label class="welcome-skip">
          <input type="checkbox" id="welcome-skip-cb" />
          <span>Don't show this on startup, just continue last project</span>
        </label>
        <span class="welcome-author">
          Built by <a href="https://marjers.com" target="_blank" rel="noopener">Marjers</a>
          · need custom 3D / web work? <a href="https://marjers.com" target="_blank" rel="noopener">marjers.com</a>
        </span>
        <span class="welcome-support-row">${BETA_MODE
          ? `<strong style="color:#f7c948">BETA build</strong>, thanks for testing. Bug reports? <a href="${BETA_MAILTO}" target="_blank" rel="noopener">email Marjers</a>.`
          : `BlockBuilder is free and stays free. If it earns its place,
          <a href="https://buymeacoffee.com/marjers" target="_blank" rel="noopener">buy me a coffee ☕</a>
          or
          <a href="https://marjers.lemonsqueezy.com/buy/720c0f69-f860-427a-bddb-0c01481c1643" target="_blank" rel="noopener">grab a commercial licence (€12)</a>.`}
        </span>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);

  overlay.addEventListener('click', (ev) => {
    const btn = ev.target.closest('button[data-action], button[data-recent]');
    if (!btn) return;
    // Honour the "don't show on startup" tick before navigating away.
    const skipCb = overlay.querySelector('#welcome-skip-cb');
    if (skipCb && skipCb.checked) localStorage.setItem(SKIP_WELCOME_KEY, '1');
    else                          localStorage.removeItem(SKIP_WELCOME_KEY);
    const action = btn.dataset.action;
    if (action === 'new')        { dismiss(overlay); clearScene();          onClose?.('new'); }
    else if (action === 'continue') { dismiss(overlay); loadAutosave();      onClose?.('continue'); }
    else if (action === 'open')     { dismiss(overlay); triggerOpenDialog(); onClose?.('open'); }
    else if (btn.dataset.recent !== undefined) {
      const idx = parseInt(btn.dataset.recent, 10);
      const entry = recents[idx];
      if (entry) { dismiss(overlay); loadFromRecent(entry); onClose?.('recent'); }
    }
  });
}

function dismiss(el) {
  el.style.opacity = '0';
  setTimeout(() => el.remove(), 180);
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c =>
    ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
}

function ago(ts) {
  const dt = Date.now() - ts;
  if (dt < 60_000) return 'just now';
  if (dt < 3_600_000) return `${Math.floor(dt / 60_000)}m ago`;
  if (dt < 86_400_000) return `${Math.floor(dt / 3_600_000)}h ago`;
  const days = Math.floor(dt / 86_400_000);
  return days < 30 ? `${days}d ago` : `${Math.floor(days / 30)}mo ago`;
}

// ----- data ops -----

export async function readAutosaveSummary() {
  try {
    const data = await getAutosave();
    if (!data || !Array.isArray(data.shapes) || data.shapes.length === 0) return null;
    return { shapeCount: data.shapes.length, ts: data.ts || 0 };
  } catch { return null; }
}

function readRecents() {
  try {
    const raw = localStorage.getItem(RECENTS_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

export function addRecent(name, data) {
  const all = readRecents();
  const entry = {
    name, ts: Date.now(),
    payload: data,
    shapeCount: (data.shapes || []).length,
  };
  const filtered = all.filter(x => x.name !== name);
  filtered.unshift(entry);
  filtered.length = Math.min(filtered.length, MAX_RECENTS);
  try { localStorage.setItem(RECENTS_KEY, JSON.stringify(filtered)); } catch {}
}

function clearScene() {
  // Dispose every tracked shape first.
  for (const s of [...state.shapes.values()]) s.dispose();
  state.shapes.clear();

  // Belt + braces: if a previous session somehow left a mesh in the scene
  // without a matching entry in state.shapes (corrupted autosave, partial
  // applySnapshot, etc.), the loop above wouldn't touch it. Sweep the scene
  // for any TinkerShape-tagged mesh that escaped and remove it manually so
  // "New project" really does start from an empty workplane.
  const orphans = [];
  if (state.scene?.traverse) {
    state.scene.traverse(obj => {
      if (obj.isMesh && obj.userData?.tinkerShape) orphans.push(obj);
    });
  }
  for (const m of orphans) {
    if (m.parent) m.parent.remove(m);
    try { m.geometry?.dispose?.(); } catch {}
    try { m.material?.dispose?.(); } catch {}
  }

  selectShape(null);
}

async function loadAutosave() {
  try {
    const data = await getAutosave();
    if (!data) return;
    restoreFromData(data);
  } catch (e) {
    console.warn('Autosave restore failed:', e);
  }
}

function loadFromRecent(entry) {
  if (entry?.payload) restoreFromData(entry.payload);
}

function restoreFromData(data) {
  clearScene();
  for (const sd of data.shapes || []) {
    const shape = TinkerShape.deserialize(sd);
    state.scene.add(shape.mesh);
  }
}

function triggerOpenDialog() {
  const input = document.getElementById('load-file');
  if (input) input.click();
}
