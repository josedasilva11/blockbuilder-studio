// User preferences: theme + visibility toggles for non-essential UI bits.
// Persisted to localStorage so they carry across sessions. Each setting fires
// its own listener so the visual layers (grid, axis widget, viewcube, etc.)
// can react without reload.

import { state } from './state.js';
import { requestRender } from './scene.js';

const STORAGE_KEY = 'bb.settings.v1';

const DEFAULTS = Object.freeze({
  theme: 'dark',         // 'dark' | 'light'
  showGrid: true,
  showOrigin: true,
  showAxisWidget: true,
  showViewcube: true,
  showHud: true,
  shadows: true,
  bgColour: null,        // null = use theme default, else hex string "#rrggbb"
  quality: 'medium',     // 'low' | 'medium' | 'high'  — controls pixel ratio
  showTooltips: true,    // floating hint bubbles on hover
});

const _values = { ...DEFAULTS };
const _listeners = new Set();

export function initSettings() {
  load();
  // Apply once on boot so any element that reads these on first render
  // already gets the user's preferences.
  applyAll();
}

function load() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw);
    for (const k of Object.keys(DEFAULTS)) {
      if (k in parsed) _values[k] = parsed[k];
    }
  } catch {}
}
function save() {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(_values)); } catch {}
}

export function getSetting(key) { return _values[key]; }
export function getAllSettings() { return { ..._values }; }

export function setSetting(key, value) {
  if (!(key in DEFAULTS)) return;
  if (_values[key] === value) return;
  _values[key] = value;
  save();
  apply(key, value);
  for (const fn of _listeners) fn(key, value);
}

export function onSettingChange(fn) {
  _listeners.add(fn);
  return () => _listeners.delete(fn);
}

function applyAll() {
  for (const k of Object.keys(_values)) apply(k, _values[k]);
}

function apply(key, value) {
  switch (key) {
    case 'theme':
      document.documentElement.setAttribute('data-theme', value);
      // Tell the 3D world to repaint with new grid colours / lighting tweaks.
      updateGridForTheme(value);
      requestRender();
      break;
    case 'showGrid':
      if (state.gridGroup) state.gridGroup.visible = !!value;
      requestRender();
      break;
    case 'showOrigin':
      if (state.originGroup) state.originGroup.visible = !!value;
      requestRender();
      break;
    case 'showAxisWidget':
      toggleEl('.axis-widget', value);
      break;
    case 'showViewcube':
      toggleEl('#viewcube-wrap', value);
      break;
    case 'showHud':
      toggleEl('#hud', value);
      break;
    case 'bgColour': {
      const vp = document.querySelector('.viewport-wrap');
      if (!vp) break;
      if (!value) {
        // Theme default — clear inline style so CSS takes over.
        vp.style.background = '';
      } else {
        // Subtle radial gradient around the picked colour so depth still reads.
        vp.style.background = `radial-gradient(ellipse at 50% 0%, ${lighten(value, 10)} 0%, ${value} 100%)`;
      }
      requestRender();
      break;
    }
    case 'quality': {
      // Defer to scene.js so the renderer pixel ratio + resize happen
      // through a single coordinated path.
      import('./scene.js').then(m => m.setQuality?.(value)).catch(() => {});
      break;
    }
    case 'showTooltips':
      // Drives both the CSS hide and the JS bail-out inside tooltip.js — a
      // class on <html> is the cheapest way to broadcast the flag to both.
      document.documentElement.classList.toggle('no-tooltips', !value);
      break;
    case 'shadows':
      if (state.renderer) {
        state.renderer.shadowMap.enabled = !!value;
        // Lights need a re-sync to clear/re-bake the shadow map.
        if (state.keyLight) state.keyLight.castShadow = !!value;
        for (const s of state.shapes?.values?.() ?? []) {
          s.mesh.castShadow = !!value;
          s.mesh.receiveShadow = !!value;
        }
      }
      requestRender();
      break;
  }
}

function toggleEl(selector, on) {
  const el = document.querySelector(selector);
  if (!el) return;
  el.style.display = on ? '' : 'none';
}

function updateGridForTheme(theme) {
  // The grid helpers store their colour as vertex attributes, so a hot swap
  // means rebuilding the workplane. scene.js exposes rebuildGrid for that.
  import('./scene.js').then(m => m.rebuildGrid?.(theme)).catch(() => {});
}

// Tiny hex-lightening helper for the bg gradient. Adds `pct`% to each RGB
// component (clamped to 255). Good enough for a subtle radial highlight.
function lighten(hex, pct) {
  const m = hex.replace('#', '');
  const r = Math.min(255, parseInt(m.slice(0, 2), 16) + Math.round(255 * pct / 100));
  const g = Math.min(255, parseInt(m.slice(2, 4), 16) + Math.round(255 * pct / 100));
  const b = Math.min(255, parseInt(m.slice(4, 6), 16) + Math.round(255 * pct / 100));
  return `rgb(${r}, ${g}, ${b})`;
}
