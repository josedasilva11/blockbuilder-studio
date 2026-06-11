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
  for (const l of Object.values(_labels)) l.style.display = 'none';
}

// Project a world position to screen pixel coords, returning {x, y, behind}.
function project(worldPos, camera, canvas) {
  const v = worldPos.clone().project(camera);
  const rect = canvas.getBoundingClientRect();
  return {
    x: (v.x * 0.5 + 0.5) * rect.width + rect.left,
    y: (-v.y * 0.5 + 0.5) * rect.height + rect.top,
    behind: v.z >= 1,
  };
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

  // Combined world-space AABB.
  const box = new THREE.Box3();
  for (const s of shapes) {
    // Ensure world matrix is up to date for the bounding box calc.
    s.mesh.updateWorldMatrix(true, true);
    box.expandByObject(s.mesh);
  }
  if (box.isEmpty()) { hideAll(); return; }

  const size = new THREE.Vector3();
  box.getSize(size);

  // Pick one edge per axis. The "front-bottom" edges read best in our default
  // iso view (camera roughly +X, -Y, +Z).
  const xMid = new THREE.Vector3((box.min.x + box.max.x) / 2, box.min.y, box.min.z);
  const yMid = new THREE.Vector3(box.max.x, (box.min.y + box.max.y) / 2, box.min.z);
  const zMid = new THREE.Vector3(box.max.x, box.min.y, (box.min.z + box.max.z) / 2);

  const canvas = state.renderer.domElement;
  const camera = state.camera;

  const labelData = [
    { el: _labels.x, pos: xMid, text: fmt(size.x), color: '#ff7a7a' },
    { el: _labels.y, pos: yMid, text: fmt(size.y), color: '#7aff9a' },
    { el: _labels.z, pos: zMid, text: fmt(size.z), color: '#7aaeff' },
  ];

  for (const { el, pos, text, color } of labelData) {
    const p = project(pos, camera, canvas);
    if (p.behind) { el.style.display = 'none'; continue; }
    el.textContent = text;
    el.style.left = p.x + 'px';
    el.style.top = p.y + 'px';
    el.style.color = color;
    el.style.borderColor = color + '60';
    el.style.display = 'block';
  }
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
