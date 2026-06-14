// Push/Pull tool. Click any face on any shape, drag to extrude a fresh prism
// outward along that face's normal. The result is a regular Box-kind shape so
// it's parametric (resize its cross-section in Properties afterwards).
//
// Why this exists: the white XYZ resize handles can only push faces along the
// world axes. If a shape has a slanted face (Wedge slope, Pyramid lateral,
// a baked CSG result with arbitrary angles, an imported mesh) and you want to
// stick a tab / boss / stud on that face perpendicular to it, there was no
// good way before. Workplane + drag a primitive is two steps and the depth
// has to be guessed. This is one continuous gesture, depth is set by mouse.
//
// Scope: spawns a NEW shape; does not modify the picked shape's geometry.
// True push/pull semantics (translate a face polygon along its normal,
// reshaping the original mesh) would need a half-edge representation and
// proper coplanar-region flood-fill, deferred to a future release.

import * as THREE from 'three';
import { state } from './state.js';
import { TinkerShape } from './shape.js';
import { selectShape } from './selection.js';
import { pushHistory } from './history.js';
import { requestRender } from './scene.js';
import { toast } from './toast.js';

const PROFILE_W = 10;        // default cross-section size (user resizes later)
const PROFILE_D = 10;
const MIN_DEPTH = 0.5;
const MAX_DEPTH = 5000;      // sanity cap

let _active = false;
let _canvas = null;
let _hudHint = null;
let _previewMesh = null;
let _dragging = false;

let _facePoint = null;       // Vector3, world-space hit point
let _faceNormal = null;      // Vector3, world-space face normal
let _faceQuat = null;        // Quaternion mapping local +Z to face normal
let _startScreen = null;     // { x, y }, pointerdown screen position
let _depth = MIN_DEPTH;

const _raycaster = new THREE.Raycaster();
const _ndc = new THREE.Vector2();

export function initPushPull(canvas) {
  _canvas = canvas;
  _hudHint = document.createElement('div');
  _hudHint.className = 'pushpull-hint';
  _hudHint.style.cssText = [
    'position:fixed', 'top:64px', 'left:50%',
    'transform:translateX(-50%)',
    'background:rgba(20,23,29,0.96)',
    'color:#c4f04f',
    'padding:8px 14px',
    'border-radius:8px',
    "font:600 13px/1.4 system-ui,-apple-system,Segoe UI,sans-serif",
    'border:1px solid rgba(196,240,79,0.4)',
    'pointer-events:none',
    'z-index:30',
    'display:none',
    'white-space:nowrap',
  ].join(';');
  document.body.appendChild(_hudHint);

  window.addEventListener('keydown', (ev) => {
    if (!_active) return;
    if (ev.target && ['INPUT', 'TEXTAREA', 'SELECT'].includes(ev.target.tagName)) return;
    if (ev.key === 'Escape') stop();
  });
}

export function isPushPullActive() { return _active; }

export function togglePushPull() {
  if (_active) stop(); else start();
}

function start() {
  _active = true;
  _canvas.style.cursor = 'crosshair';
  _canvas.addEventListener('pointerdown', onDown, true);
  setHint('Click a face to push / pull. Esc cancels.');
  syncToolbarButton();
}

function stop() {
  if (_dragging) cancelDrag();
  _active = false;
  _canvas.style.cursor = '';
  _canvas.removeEventListener('pointerdown', onDown, true);
  _canvas.removeEventListener('pointermove', onMoveCapture, true);
  _canvas.removeEventListener('pointerup', onUp, true);
  setHint(null);
  syncToolbarButton();
}

function setHint(text) {
  if (!_hudHint) return;
  if (text == null) { _hudHint.style.display = 'none'; return; }
  _hudHint.textContent = text;
  _hudHint.style.display = 'block';
}

function projectToScreen(worldPos) {
  const v = worldPos.clone().project(state.camera);
  const rect = _canvas.getBoundingClientRect();
  return {
    x: (v.x * 0.5 + 0.5) * rect.width + rect.left,
    y: (-v.y * 0.5 + 0.5) * rect.height + rect.top,
  };
}

function onDown(ev) {
  if (ev.button !== 0 || _dragging) return;
  // First click of the gesture: pick a face. Stop other canvas handlers so
  // selection / workplane don't also fire.
  ev.stopImmediatePropagation();
  ev.preventDefault();

  const rect = _canvas.getBoundingClientRect();
  _ndc.x = ((ev.clientX - rect.left) / rect.width) * 2 - 1;
  _ndc.y = -((ev.clientY - rect.top) / rect.height) * 2 + 1;
  _raycaster.setFromCamera(_ndc, state.camera);

  const meshes = [];
  for (const s of state.shapes.values()) {
    if (s.mesh && s.mesh.parent && s.mesh.visible) meshes.push(s.mesh);
  }
  const hits = _raycaster.intersectObjects(meshes, false);
  if (!hits[0]) { setHint('Missed. Click directly on a face.'); return; }

  const hit = hits[0];
  const normalLocal = hit.face?.normal?.clone() ?? new THREE.Vector3(0, 0, 1);
  const normal = normalLocal.transformDirection(hit.object.matrixWorld).normalize();

  _facePoint = hit.point.clone();
  _faceNormal = normal;
  _faceQuat = new THREE.Quaternion().setFromUnitVectors(
    new THREE.Vector3(0, 0, 1), normal
  );

  // Sanity check: face nearly edge-on to the camera at the moment of click
  // means the normal projects to ~0 pixels. Drag would be useless until the
  // view rotates. Bail before kicking off drag mode.
  const baseScreen = projectToScreen(_facePoint);
  const tipScreen = projectToScreen(_facePoint.clone().add(_faceNormal));
  if (Math.hypot(tipScreen.x - baseScreen.x, tipScreen.y - baseScreen.y) < 0.5) {
    setHint('Face is edge-on. Rotate the view, then try again.');
    return;
  }

  _startScreen = { x: ev.clientX, y: ev.clientY };
  _depth = MIN_DEPTH;
  _dragging = true;
  createPreview();

  _canvas.addEventListener('pointermove', onMoveCapture, true);
  _canvas.addEventListener('pointerup', onUp, true);
  setHint(`Depth: ${_depth.toFixed(2)} ${unit()}. Release to commit. Esc cancels.`);
}

function createPreview() {
  const geo = new THREE.BoxGeometry(PROFILE_W, PROFILE_D, _depth);
  const mat = new THREE.MeshStandardMaterial({
    color: 0xc4f04f,
    transparent: true,
    opacity: 0.55,
    metalness: 0,
    roughness: 0.75,
    depthWrite: false,
  });
  _previewMesh = new THREE.Mesh(geo, mat);
  _previewMesh.renderOrder = 40;
  positionPreview();
  state.scene.add(_previewMesh);
  requestRender();
}

function positionPreview() {
  if (!_previewMesh) return;
  // Default Box origin is its centre. Shift by depth/2 along the normal so
  // the base sits on the picked face.
  const offset = _faceNormal.clone().multiplyScalar(_depth / 2);
  _previewMesh.position.copy(_facePoint).add(offset);
  _previewMesh.quaternion.copy(_faceQuat);
  // Rebuild the box geometry whenever depth changes. Simpler than scaling
  // because the base offset has to track _depth/2 anyway.
  _previewMesh.geometry.dispose();
  _previewMesh.geometry = new THREE.BoxGeometry(PROFILE_W, PROFILE_D, _depth);
}

function onMove(ev) {
  if (!_dragging) return;
  // Re-project the face normal onto screen-space EVERY frame. Caching it at
  // pointerdown breaks if the user rotates the view mid-drag (OrbitControls
  // stays enabled during the gesture so this is plausible). The cost is one
  // matrix multiply per frame, negligible.
  const baseScreen = projectToScreen(_facePoint);
  const tipScreen = projectToScreen(_facePoint.clone().add(_faceNormal));
  const sx = tipScreen.x - baseScreen.x;
  const sy = tipScreen.y - baseScreen.y;
  const slen = Math.hypot(sx, sy);
  if (slen < 0.5) {
    // Face turned edge-on to the camera. Hold the current depth; resume when
    // the user rotates back to a usable angle.
    setHint('Face nearly edge-on, rotate the view to keep adjusting depth.');
    return;
  }
  const ux = sx / slen, uy = sy / slen;
  const dx = ev.clientX - _startScreen.x;
  const dy = ev.clientY - _startScreen.y;
  const projPixels = dx * ux + dy * uy;
  let depth = projPixels / slen;
  if (depth < MIN_DEPTH) depth = MIN_DEPTH;
  if (depth > MAX_DEPTH) depth = MAX_DEPTH;
  if (state.snapStep > 0 && !ev.ctrlKey) {
    depth = Math.round(depth / state.snapStep) * state.snapStep;
    if (depth < MIN_DEPTH) depth = MIN_DEPTH;
  }
  _depth = depth;
  positionPreview();
  setHint(`Depth: ${_depth.toFixed(2)} ${unit()}. Release to commit. Esc cancels.`);
  requestRender();
}

function onUp(ev) {
  if (!_dragging) return;
  if (ev.button !== 0) return;
  // Block other canvas pointerup handlers (selection.js end-drag, etc.) so
  // they don't fire on our commit click.
  ev.stopImmediatePropagation();
  ev.preventDefault();
  commit();
}

function onMoveCapture(ev) {
  // Block marquee / hover handlers while we're dragging.
  if (_dragging) {
    ev.stopImmediatePropagation();
  }
  onMove(ev);
}

function cancelDrag() {
  disposePreview();
  _dragging = false;
  _canvas.removeEventListener('pointermove', onMoveCapture, true);
  _canvas.removeEventListener('pointerup', onUp, true);
}

function disposePreview() {
  if (!_previewMesh) return;
  state.scene.remove(_previewMesh);
  _previewMesh.geometry.dispose();
  _previewMesh.material.dispose();
  _previewMesh = null;
}

function commit() {
  pushHistory();
  // Build a CUBE shape and place it base-on-face.
  const shape = new TinkerShape('CUBE', {
    params: { width: PROFILE_W, depth: PROFILE_D, height: _depth },
  });
  const offset = _faceNormal.clone().multiplyScalar(_depth / 2);
  shape.mesh.position.copy(_facePoint).add(offset);
  shape.mesh.quaternion.copy(_faceQuat);
  state.scene.add(shape.mesh);

  disposePreview();
  _dragging = false;
  _canvas.removeEventListener('pointermove', onMoveCapture, true);
  _canvas.removeEventListener('pointerup', onUp, true);

  selectShape(shape.id);
  requestRender();
  toast.ok(`Pushed prism ${_depth.toFixed(2)} ${unit()}`, {
    detail: 'Edit Width / Depth in Properties to resize the cross-section.',
  });
  stop();
}

function unit() { return state.unit || 'mm'; }

function syncToolbarButton() {
  const btn = document.querySelector('[data-action="pushpull"]');
  if (!btn) return;
  btn.classList.toggle('active', _active);
}
