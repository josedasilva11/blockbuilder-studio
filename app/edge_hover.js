// Edge-hover dimensions. Hover the cursor near any feature edge of a shape
// and a small HTML label pops up at the edge midpoint showing the edge's
// world-space length in the active unit (mm / cm / inch).
//
// Why feature edges only: a Box's two-triangle face has a hidden internal
// diagonal edge. Showing that length would mislead the user about the box's
// dimensions. THREE.EdgesGeometry filters out edges where the two adjacent
// triangles' normals match (within an angle threshold), leaving only the
// silhouette / corner edges that a human sees.
//
// Cache strategy: each mesh.geometry gets its EdgesGeometry computed once on
// first hover and stashed in a WeakMap. When the shape rebuilds (param edit)
// the old BufferGeometry is replaced and garbage-collected; the cache entry
// goes with it. No manual invalidation needed.
//
// Threshold for "near": 24 px in screen space. Beyond that, no label,
// avoids noisy labels appearing all over a dense scene.

import * as THREE from 'three';
import { state } from './state.js';
import { isWorkplanePickActive } from './workplane.js';
import { isRulerActive } from './ruler.js';
import { isPushPullActive } from './push_pull.js';

const EDGE_THRESHOLD_DEG = 1;       // angle below which an edge is "internal"
const SCREEN_PIXEL_THRESHOLD = 24;  // max distance from cursor to edge midpoint

const _edgeCache = new WeakMap();   // BufferGeometry -> EdgeData
let _labelEl = null;
const _ndc = new THREE.Vector2();
const _raycaster = new THREE.Raycaster();
const _tmpA = new THREE.Vector3();
const _tmpB = new THREE.Vector3();
const _tmpProj = new THREE.Vector3();

function buildEdges(geometry) {
  const eg = new THREE.EdgesGeometry(geometry, EDGE_THRESHOLD_DEG);
  const pos = eg.attributes.position.array;
  const count = pos.length / 6;
  const midpoints = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    const a = i * 6, b = a + 3;
    midpoints[i * 3 + 0] = (pos[a + 0] + pos[b + 0]) / 2;
    midpoints[i * 3 + 1] = (pos[a + 1] + pos[b + 1]) / 2;
    midpoints[i * 3 + 2] = (pos[a + 2] + pos[b + 2]) / 2;
  }
  eg.dispose();
  return { positions: pos, midpoints, count };
}

function getEdgesFor(mesh) {
  const geom = mesh.geometry;
  if (!geom || !geom.attributes || !geom.attributes.position) return null;
  let cached = _edgeCache.get(geom);
  if (!cached) {
    try { cached = buildEdges(geom); } catch { return null; }
    _edgeCache.set(geom, cached);
  }
  return cached;
}

function ensureLabel() {
  if (_labelEl) return _labelEl;
  _labelEl = document.createElement('div');
  _labelEl.id = 'edge-hover-label';
  _labelEl.style.cssText = [
    'position:fixed',
    'background:rgba(20,23,29,0.94)',
    'border:1px solid rgba(196,240,79,0.45)',
    'color:#c4f04f',
    'padding:3px 9px',
    "font:600 11px 'JetBrains Mono', ui-monospace, monospace",
    'letter-spacing:0.02em',
    'border-radius:6px',
    'pointer-events:none',
    'transform:translate(10px, -50%)',
    'z-index:30',
    'display:none',
    'white-space:nowrap',
    'backdrop-filter:blur(4px)',
    '-webkit-backdrop-filter:blur(4px)',
  ].join(';');
  document.body.appendChild(_labelEl);
  return _labelEl;
}

function hideLabel() {
  if (_labelEl) _labelEl.style.display = 'none';
}

function projectToScreen(worldPos, camera, canvas, out) {
  out.copy(worldPos).project(camera);
  const rect = canvas.getBoundingClientRect();
  return {
    x: (out.x * 0.5 + 0.5) * rect.width + rect.left,
    y: (-out.y * 0.5 + 0.5) * rect.height + rect.top,
    behind: out.z >= 1,
  };
}

function shouldSkipFrame() {
  // Hide during body-drag (OrbitControls disabled by selection.js), during
  // active transform-controls drag, and during any modal pick tool. Cut /
  // Hollow / Array open floating panels but leave OrbitControls enabled and
  // don't have an isActive() probe, so we treat their panel's presence in
  // the DOM as the gate.
  if (!state.controls || !state.controls.enabled) return true;
  if (state.transformControls && state.transformControls.dragging) return true;
  try {
    if (isWorkplanePickActive()) return true;
    if (isRulerActive()) return true;
    if (isPushPullActive()) return true;
  } catch {}
  if (document.querySelector('.cut-panel, .hollow-panel, .array-panel, .amr-panel')) return true;
  return false;
}

export function installEdgeHover(canvas) {
  ensureLabel();
  canvas.addEventListener('pointermove', (ev) => onPointerMove(ev, canvas));
  canvas.addEventListener('pointerleave', hideLabel);
}

function onPointerMove(ev, canvas) {
  if (shouldSkipFrame()) { hideLabel(); return; }
  if (state.showEdgeHover === false) { hideLabel(); return; }
  if (!state.camera) { hideLabel(); return; }

  const rect = canvas.getBoundingClientRect();
  _ndc.x = ((ev.clientX - rect.left) / rect.width) * 2 - 1;
  _ndc.y = -((ev.clientY - rect.top) / rect.height) * 2 + 1;
  _raycaster.setFromCamera(_ndc, state.camera);

  // Pick mesh under cursor. Only visible, parented meshes.
  const meshes = [];
  for (const s of state.shapes.values()) {
    if (s.mesh && s.mesh.visible && s.mesh.parent) meshes.push(s.mesh);
  }
  const hits = _raycaster.intersectObjects(meshes, false);
  if (hits.length === 0) { hideLabel(); return; }

  const hitMesh = hits[0].object;
  const edges = getEdgesFor(hitMesh);
  if (!edges) { hideLabel(); return; }

  // Find the edge whose midpoint is closest to the cursor in screen space.
  const camera = state.camera;
  const worldMatrix = hitMesh.matrixWorld;
  let bestIdx = -1;
  let bestDist = SCREEN_PIXEL_THRESHOLD;
  let bestX = 0, bestY = 0;

  for (let i = 0; i < edges.count; i++) {
    _tmpA.fromArray(edges.midpoints, i * 3).applyMatrix4(worldMatrix);
    const p = projectToScreen(_tmpA, camera, canvas, _tmpProj);
    if (p.behind) continue;
    const dx = p.x - ev.clientX;
    const dy = p.y - ev.clientY;
    const d = Math.hypot(dx, dy);
    if (d < bestDist) {
      bestDist = d;
      bestIdx = i;
      bestX = p.x;
      bestY = p.y;
    }
  }

  if (bestIdx < 0) { hideLabel(); return; }

  // Compute world-space length (respects mesh scale, unlike the cached local
  // value).
  _tmpA.fromArray(edges.positions, bestIdx * 6).applyMatrix4(worldMatrix);
  _tmpB.fromArray(edges.positions, bestIdx * 6 + 3).applyMatrix4(worldMatrix);
  const lengthWorld = _tmpA.distanceTo(_tmpB);

  const label = ensureLabel();
  label.textContent = lengthWorld.toFixed(2) + ' ' + (state.unit || 'mm');
  label.style.left = bestX + 'px';
  label.style.top = bestY + 'px';
  label.style.display = 'block';
}

export function setEdgeHoverEnabled(on) {
  state.showEdgeHover = !!on;
  if (!on) hideLabel();
  try { localStorage.setItem('bb.showEdgeHover', on ? '1' : '0'); } catch {}
}

try {
  const stored = localStorage.getItem('bb.showEdgeHover');
  state.showEdgeHover = stored === null ? true : stored === '1';
} catch { state.showEdgeHover = true; }
