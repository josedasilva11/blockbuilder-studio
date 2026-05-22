// Ruler — pick two points (anywhere on shapes or on the workplane) and the
// HUD shows the distance + per-axis deltas. Toggle on/off from the toolbar;
// ESC also exits.
//
// Vertex snap: when the cursor passes within ~14 pixels of a shape's bbox
// corner, the face vertices of the currently-hovered face, or the midpoint
// of a hovered face's edges, the picked point locks onto that vertex. A
// lime ring marker pops up to show "you're snapped to this exact point".
// Hold Ctrl to bypass the snap and pick the raw raycast point.

import * as THREE from 'three';
import { state } from './state.js';
import { requestRender } from './scene.js';

const SNAP_RADIUS_PX = 14;

let _active = false;
let _canvas = null;
let _firstPoint = null;
let _previewLine = null;
let _committedLine = null;
let _snapMarker = null;
let _hudInfo = null;

const _raycaster = new THREE.Raycaster();
const _ndc = new THREE.Vector2();
const _workplane = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0);

export function initRuler(canvas) {
  _canvas = canvas;
  _hudInfo = document.createElement('div');
  _hudInfo.className = 'ruler-readout';
  _hudInfo.hidden = true;
  document.body.appendChild(_hudInfo);

  window.addEventListener('keydown', (ev) => {
    if (!_active) return;
    if (ev.key === 'Escape') { stopRuler(); }
  });
}

export function isRulerActive() { return _active; }

export function toggleRuler() { _active ? stopRuler() : startRuler(); }

export function startRuler() {
  if (_active) return;
  _active = true;
  _canvas.style.cursor = 'crosshair';
  _canvas.addEventListener('pointerdown', onDown, true);
  _canvas.addEventListener('pointermove', onMove, true);
  _hudInfo.hidden = false;
  _hudInfo.textContent = 'Ruler — click the first point (hover near vertices for exact snap, hold Ctrl to bypass)';
}

export function stopRuler() {
  _active = false;
  _firstPoint = null;
  _canvas.style.cursor = '';
  _canvas.removeEventListener('pointerdown', onDown, true);
  _canvas.removeEventListener('pointermove', onMove, true);
  removeLine('_previewLine');
  removeLine('_committedLine');
  removeSnapMarker();
  if (_hudInfo) _hudInfo.hidden = true;
  requestRender();
}

function removeLine(key) {
  const l = key === '_previewLine' ? _previewLine : _committedLine;
  if (!l) return;
  state.scene.remove(l);
  l.geometry.dispose();
  l.material.dispose();
  if (key === '_previewLine') _previewLine = null; else _committedLine = null;
}

function setNdc(ev) {
  const r = _canvas.getBoundingClientRect();
  _ndc.x = ((ev.clientX - r.left) / r.width) * 2 - 1;
  _ndc.y = -((ev.clientY - r.top) / r.height) * 2 + 1;
}

// Project a world-space point to screen-space pixel coordinates of the canvas.
function worldToScreen(p, rect) {
  const v = p.clone().project(state.camera);
  return new THREE.Vector2(
    (v.x * 0.5 + 0.5) * rect.width + rect.left,
    (-v.y * 0.5 + 0.5) * rect.height + rect.top,
  );
}

// Collect all interesting snap targets for a single pick. We deliberately keep
// the set small per frame: 8 bbox corners per visible shape (cheap, O(n)) plus
// the 3 vertices and 3 edge-midpoints of the hovered face (when the ray hits
// something). Iterating every vertex of a 100K-tri STL would be too slow on
// each pointermove.
function gatherSnapTargets(hit) {
  const out = [];

  // Bbox corners of every visible shape.
  const bb = new THREE.Box3();
  for (const s of state.shapes.values()) {
    if (!s.mesh.parent || !s.mesh.visible) continue;
    s.mesh.updateMatrixWorld(true);
    bb.setFromObject(s.mesh);
    if (bb.isEmpty()) continue;
    const { min, max } = bb;
    out.push(
      new THREE.Vector3(min.x, min.y, min.z), new THREE.Vector3(max.x, min.y, min.z),
      new THREE.Vector3(min.x, max.y, min.z), new THREE.Vector3(max.x, max.y, min.z),
      new THREE.Vector3(min.x, min.y, max.z), new THREE.Vector3(max.x, min.y, max.z),
      new THREE.Vector3(min.x, max.y, max.z), new THREE.Vector3(max.x, max.y, max.z),
    );
  }

  // Face vertices + edge midpoints of the currently hovered face.
  if (hit && hit.face) {
    const geom = hit.object.geometry;
    const pos = geom?.attributes?.position;
    if (pos) {
      const va = new THREE.Vector3().fromBufferAttribute(pos, hit.face.a).applyMatrix4(hit.object.matrixWorld);
      const vb = new THREE.Vector3().fromBufferAttribute(pos, hit.face.b).applyMatrix4(hit.object.matrixWorld);
      const vc = new THREE.Vector3().fromBufferAttribute(pos, hit.face.c).applyMatrix4(hit.object.matrixWorld);
      out.push(va, vb, vc);
      // Edge midpoints — useful for centring on the middle of an edge.
      out.push(va.clone().add(vb).multiplyScalar(0.5));
      out.push(vb.clone().add(vc).multiplyScalar(0.5));
      out.push(vc.clone().add(va).multiplyScalar(0.5));
    }
  }
  return out;
}

// Returns { point, snapped }. Vertex snap kicks in if a candidate is within
// SNAP_RADIUS_PX of the cursor (screen space, so it stays consistent
// regardless of camera distance).
function pickPoint(ev, ctrlBypass) {
  setNdc(ev);
  _raycaster.setFromCamera(_ndc, state.camera);
  const meshes = [];
  for (const s of state.shapes.values()) {
    if (s.mesh.parent && s.mesh.visible) meshes.push(s.mesh);
  }
  const hits = _raycaster.intersectObjects(meshes, false);
  const rawHit = hits[0] ?? null;
  const rawPoint = rawHit ? rawHit.point.clone() : (() => {
    const p = new THREE.Vector3();
    return _raycaster.ray.intersectPlane(_workplane, p) ? p : null;
  })();
  if (!rawPoint) return null;

  if (ctrlBypass) return { point: rawPoint, snapped: false };

  // Find the closest candidate within the screen-space radius.
  const rect = _canvas.getBoundingClientRect();
  const cursor = new THREE.Vector2(ev.clientX, ev.clientY);
  const candidates = gatherSnapTargets(rawHit);
  let best = null;
  let bestDist = SNAP_RADIUS_PX;
  for (const c of candidates) {
    const s = worldToScreen(c, rect);
    const d = cursor.distanceTo(s);
    if (d < bestDist) { bestDist = d; best = c; }
  }
  return best ? { point: best.clone(), snapped: true } : { point: rawPoint, snapped: false };
}

function onDown(ev) {
  if (ev.button !== 0) return;
  ev.stopPropagation();
  ev.preventDefault();
  const result = pickPoint(ev, ev.ctrlKey);
  if (!result) return;
  if (!_firstPoint) {
    _firstPoint = result.point;
    _hudInfo.textContent = 'First point set — click second point (Ctrl bypasses snap · ESC cancels)';
    rebuildPreviewLine(result.point, result.point);
  } else {
    rebuildCommittedLine(_firstPoint, result.point);
    updateReadout(_firstPoint, result.point);
    _firstPoint = null;
  }
}

function onMove(ev) {
  const result = pickPoint(ev, ev.ctrlKey);
  if (!result) { removeSnapMarker(); return; }
  // Show snap marker whenever the cursor is locked to a vertex — even before
  // the first click — so the user gets confidence that the snap is live.
  if (result.snapped) showSnapMarker(result.point);
  else removeSnapMarker();
  if (_firstPoint) {
    rebuildPreviewLine(_firstPoint, result.point);
    updateReadout(_firstPoint, result.point);
  }
}

function rebuildPreviewLine(a, b) {
  removeLine('_previewLine');
  const g = new THREE.BufferGeometry().setFromPoints([a, b]);
  const m = new THREE.LineDashedMaterial({ color: 0xc4f04f, dashSize: 1.5, gapSize: 1, depthTest: false, transparent: true, opacity: 0.9 });
  const line = new THREE.Line(g, m);
  line.computeLineDistances();
  line.renderOrder = 999;
  state.scene.add(line);
  _previewLine = line;
  requestRender();
}

function rebuildCommittedLine(a, b) {
  removeLine('_committedLine');
  const g = new THREE.BufferGeometry().setFromPoints([a, b]);
  const m = new THREE.LineBasicMaterial({ color: 0xc4f04f, depthTest: false, transparent: true, opacity: 0.95 });
  const line = new THREE.Line(g, m);
  line.renderOrder = 999;
  state.scene.add(line);
  _committedLine = line;
  requestRender();
}

// Snap marker = a small lime ring rendered at the snap point. Sized in world
// units so it scales naturally with the scene; renderOrder + depthTest off so
// it's always visible above the geometry.
function showSnapMarker(p) {
  if (!_snapMarker) {
    const geo = new THREE.RingGeometry(0.7, 1.0, 24);
    const mat = new THREE.MeshBasicMaterial({ color: 0xc4f04f, side: THREE.DoubleSide, depthTest: false, transparent: true, opacity: 0.95 });
    _snapMarker = new THREE.Mesh(geo, mat);
    _snapMarker.renderOrder = 1000;
    state.scene.add(_snapMarker);
  }
  _snapMarker.position.copy(p);
  // Face the camera so the ring reads as a flat circle from any angle.
  _snapMarker.lookAt(state.camera.position);
  requestRender();
}

function removeSnapMarker() {
  if (!_snapMarker) return;
  state.scene.remove(_snapMarker);
  _snapMarker.geometry.dispose();
  _snapMarker.material.dispose();
  _snapMarker = null;
  requestRender();
}

function updateReadout(a, b) {
  const dx = b.x - a.x, dy = b.y - a.y, dz = b.z - a.z;
  const dist = Math.hypot(dx, dy, dz);
  const u = state.unit || 'mm';
  _hudInfo.textContent =
    `${dist.toFixed(2)} ${u}   ·   ΔX ${dx.toFixed(2)}   ΔY ${dy.toFixed(2)}   ΔZ ${dz.toFixed(2)}`;
}
