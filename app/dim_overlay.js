// Dimension overlay for the selected shape(s). Draws three HTML labels at
// the X / Y / Z edges of the combined bounding box, showing the size in the
// active unit (mm / cm / inch).
//
// Why HTML over WebGL: labels need to track the camera every frame, stay
// crisp at any zoom, and respect the viewport DPI without ad-hoc text
// rendering. HTML positioned via world-to-screen projection gives us all
// three for ~30 lines of code.
//
// Hook: main.js calls updateDimOverlay() after every render. The overlay
// reads from state.selectedId + getMultiSelection() and renders or hides
// itself accordingly. Toggle via state.showDims (settings panel).

import * as THREE from 'three';
import { state } from './state.js';
import { getMultiSelection } from './selection.js';

let _container = null;
let _labels = null;

function ensureMounted() {
  if (_container) return;
  _container = document.createElement('div');
  _container.id = 'dim-overlay';
  _container.style.cssText = [
    'position:fixed',
    'inset:0',
    'pointer-events:none',
    'z-index:25',
  ].join(';');
  document.body.appendChild(_container);

  _labels = {
    x: makeLabel('X'),
    y: makeLabel('Y'),
    z: makeLabel('Z'),
  };
  for (const l of Object.values(_labels)) _container.appendChild(l);
}

function makeLabel(axis) {
  const el = document.createElement('div');
  el.className = 'dim-label dim-' + axis.toLowerCase();
  el.style.cssText = [
    'position:absolute',
    'background:rgba(20,23,29,0.92)',
    'color:#c4f04f',
    'padding:3px 8px',
    'border-radius:6px',
    'font:600 11px ui-monospace,"JetBrains Mono",monospace',
    'letter-spacing:0.04em',
    'transform:translate(-50%,-50%)',
    'border:1px solid rgba(196,240,79,0.35)',
    'pointer-events:none',
    'display:none',
    'white-space:nowrap',
    'user-select:none',
    'backdrop-filter:blur(4px)',
    '-webkit-backdrop-filter:blur(4px)',
  ].join(';');
  return el;
}

function fmt(n) {
  return n.toFixed(1) + ' ' + (state.unit || 'mm');
}

function hideAll() {
  if (!_labels) return;
  for (const l of Object.values(_labels)) {
    if (l._lastDisplay !== 'none') { l.style.display = 'none'; l._lastDisplay = 'none'; }
  }
}

// Project a world position to screen pixel coords, returning {x, y, behind}.
function project(worldPos, camera, canvas) {
  _tmpProj.copy(worldPos).project(camera);
  const rect = canvas.getBoundingClientRect();
  return {
    x: (_tmpProj.x * 0.5 + 0.5) * rect.width + rect.left,
    y: (-_tmpProj.y * 0.5 + 0.5) * rect.height + rect.top,
    behind: _tmpProj.z >= 1,
  };
}

// Module-level scratches reused per frame. project() is called 3x per frame
// (one per axis label) and updateDimOverlay itself runs after every render
// while a shape is selected. Allocating fresh Box3 + 5 Vector3s here was
// pure GC pressure during damping settle.
const _box = new THREE.Box3();
const _size = new THREE.Vector3();
const _xMid = new THREE.Vector3();
const _yMid = new THREE.Vector3();
const _zMid = new THREE.Vector3();
const _tmpProj = new THREE.Vector3();
// Precompute border colour strings; appending '60' per label per frame was
// 3 string allocs per render.
const COLORS = {
  x: { fg: '#ff7a7a', border: '#ff7a7a60' },
  y: { fg: '#7aff9a', border: '#7aff9a60' },
  z: { fg: '#7aaeff', border: '#7aaeff60' },
};

function writeLabel(el, text, x, y, color) {
  // Diff-guard: only touch the DOM if a value actually changed. During orbit
  // damping the label positions move every frame but colour/text/display
  // are typically stable.
  if (el._lastDisplay !== 'block') { el.style.display = 'block'; el._lastDisplay = 'block'; }
  if (el._lastText !== text) { el.textContent = text; el._lastText = text; }
  if (el._lastX !== x) { el.style.left = x + 'px'; el._lastX = x; }
  if (el._lastY !== y) { el.style.top = y + 'px'; el._lastY = y; }
  if (el._lastFg !== color.fg) { el.style.color = color.fg; el._lastFg = color.fg; }
  if (el._lastBorder !== color.border) { el.style.borderColor = color.border; el._lastBorder = color.border; }
}

function hideLabel(el) {
  if (el._lastDisplay !== 'none') { el.style.display = 'none'; el._lastDisplay = 'none'; }
}

export function updateDimOverlay() {
  ensureMounted();

  if (state.showDims === false) { hideAll(); return; }
  if (!state.camera || !state.renderer) { hideAll(); return; }

  // Collect every selected shape (selectedId + multi). Skip hidden ones.
  const ids = new Set();
  if (state.selectedId) ids.add(state.selectedId);
  for (const id of getMultiSelection()) ids.add(id);
  const shapes = [...ids]
    .map(id => state.shapes.get(id))
    .filter(s => s && s.mesh && s.mesh.visible !== false);

  if (shapes.length === 0) { hideAll(); return; }

  // Combined world-space AABB, reusing _box.
  _box.makeEmpty();
  for (const s of shapes) {
    // Ensure world matrix is up to date for the bounding box calc.
    s.mesh.updateWorldMatrix(true, true);
    _box.expandByObject(s.mesh);
  }
  if (_box.isEmpty()) { hideAll(); return; }

  _box.getSize(_size);

  // Pick one edge per axis. The "front-bottom" edges read best in our default
  // iso view (camera roughly +X, -Y, +Z).
  _xMid.set((_box.min.x + _box.max.x) / 2, _box.min.y, _box.min.z);
  _yMid.set(_box.max.x, (_box.min.y + _box.max.y) / 2, _box.min.z);
  _zMid.set(_box.max.x, _box.min.y, (_box.min.z + _box.max.z) / 2);

  const canvas = state.renderer.domElement;
  const camera = state.camera;

  const px = project(_xMid, camera, canvas);
  if (px.behind) hideLabel(_labels.x); else writeLabel(_labels.x, fmt(_size.x), px.x, px.y, COLORS.x);
  const py = project(_yMid, camera, canvas);
  if (py.behind) hideLabel(_labels.y); else writeLabel(_labels.y, fmt(_size.y), py.x, py.y, COLORS.y);
  const pz = project(_zMid, camera, canvas);
  if (pz.behind) hideLabel(_labels.z); else writeLabel(_labels.z, fmt(_size.z), pz.x, pz.y, COLORS.z);
}

export function setDimOverlayEnabled(on) {
  state.showDims = !!on;
  if (!on) hideAll();
  try { localStorage.setItem('bb.showDims', on ? '1' : '0'); } catch {}
}

// Read persisted preference (default: ON).
try {
  const stored = localStorage.getItem('bb.showDims');
  state.showDims = stored === null ? true : stored === '1';
} catch {
  state.showDims = true;
}
