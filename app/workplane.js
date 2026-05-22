// Custom workplane — Tinkercad-style. Activate the tool, click any face of
// any shape, and new primitives spawned from the sidebar will sit on that
// face (oriented with the face normal as Z-up) instead of on the world Z=0
// plane. Click "Reset" or the toolbar button again to go back to default.
//
// state.workplaneOverride = { point: Vector3, normal: Vector3, quat: Quaternion } | null

import * as THREE from 'three';
import { state } from './state.js';
import { requestRender } from './scene.js';

let _active = false;
let _canvas = null;
let _previewMesh = null;
let _hudHint = null;

const _raycaster = new THREE.Raycaster();
const _ndc = new THREE.Vector2();

export function initWorkplane(canvas) {
  _canvas = canvas;
  state.workplaneOverride = null;
  _hudHint = document.createElement('div');
  _hudHint.className = 'workplane-hint';
  _hudHint.hidden = true;
  document.body.appendChild(_hudHint);

  window.addEventListener('keydown', (ev) => {
    if (!_active) return;
    if (ev.key === 'Escape') { stopPick(); }
  });
}

export function isWorkplanePickActive() { return _active; }
export function hasWorkplaneOverride() { return !!state.workplaneOverride; }

export function toggleWorkplane() {
  if (_active) { stopPick(); return; }
  if (state.workplaneOverride) {
    // Already have an override — pressing the button clears it.
    clearOverride();
    return;
  }
  startPick();
}

function startPick() {
  _active = true;
  _canvas.style.cursor = 'copy';
  _canvas.addEventListener('pointerdown', onDown, true);
  _hudHint.textContent = 'Click any face to set workplane · Esc cancels';
  _hudHint.hidden = false;
}

function stopPick() {
  _active = false;
  _canvas.style.cursor = '';
  _canvas.removeEventListener('pointerdown', onDown, true);
  _hudHint.hidden = true;
  syncToolbarButton();
}

function onDown(ev) {
  if (ev.button !== 0) return;
  // stopImmediatePropagation so any other pointerdown listeners on the canvas
  // (selection.js body-drag, marquee, etc.) don't also fire and steal the click.
  ev.stopImmediatePropagation();
  ev.preventDefault();
  const rect = _canvas.getBoundingClientRect();
  _ndc.x = ((ev.clientX - rect.left) / rect.width) * 2 - 1;
  _ndc.y = -((ev.clientY - rect.top) / rect.height) * 2 + 1;
  _raycaster.setFromCamera(_ndc, state.camera);
  const meshes = [];
  for (const s of state.shapes.values()) {
    if (s.mesh.parent && s.mesh.visible) meshes.push(s.mesh);
  }
  const hits = _raycaster.intersectObjects(meshes, false);
  if (!hits[0]) {
    _hudHint.textContent = 'Missed — click on an actual face';
    return;
  }
  const hit = hits[0];
  // World-space normal of the picked face.
  const normalLocal = hit.face?.normal?.clone() ?? new THREE.Vector3(0, 0, 1);
  const normal = normalLocal.transformDirection(hit.object.matrixWorld).normalize();
  setOverride(hit.point.clone(), normal);
  stopPick();
}

export function setOverride(point, normal) {
  const quat = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), normal);
  state.workplaneOverride = { point: point.clone(), normal: normal.clone(), quat };
  refreshPreview();
  syncToolbarButton();
  requestRender();
}

export function clearOverride() {
  state.workplaneOverride = null;
  if (_previewMesh) {
    state.scene.remove(_previewMesh);
    _previewMesh.geometry.dispose();
    _previewMesh.material.dispose();
    _previewMesh = null;
  }
  syncToolbarButton();
  requestRender();
}

function refreshPreview() {
  if (_previewMesh) {
    state.scene.remove(_previewMesh);
    _previewMesh.geometry.dispose();
    _previewMesh.material.dispose();
    _previewMesh = null;
  }
  const w = 40;
  const geo = new THREE.PlaneGeometry(w, w);
  const mat = new THREE.MeshBasicMaterial({
    color: 0xc4f04f,
    transparent: true,
    opacity: 0.18,
    side: THREE.DoubleSide,
    depthWrite: false,
  });
  _previewMesh = new THREE.Mesh(geo, mat);
  // Orient the plane to face along the workplane normal
  _previewMesh.position.copy(state.workplaneOverride.point);
  _previewMesh.quaternion.copy(state.workplaneOverride.quat);
  // Nudge slightly forward so we don't z-fight with the face we picked.
  const nudge = state.workplaneOverride.normal.clone().multiplyScalar(0.05);
  _previewMesh.position.add(nudge);
  _previewMesh.renderOrder = 50;
  state.scene.add(_previewMesh);
}

function syncToolbarButton() {
  const btn = document.querySelector('[data-action="workplane"]');
  if (!btn) return;
  btn.classList.toggle('active', _active || hasWorkplaneOverride());
  if (hasWorkplaneOverride() && !_active) {
    btn.dataset.tip = 'Click to clear the custom workplane and go back to Z=0';
  } else if (_active) {
    btn.dataset.tip = 'Picking face — click any face, or click this button again to cancel';
  } else {
    btn.dataset.tip = 'Click a face to make it the active workplane for new shapes';
  }
}

// Helper used by sidebar.spawnAt to know how to place a new shape when an
// override is active. Returns { position: Vector3, quaternion: Quaternion }.
export function projectSpawn(canvas, ev) {
  if (!state.workplaneOverride) return null;
  const rect = canvas.getBoundingClientRect();
  _ndc.x = ((ev.clientX - rect.left) / rect.width) * 2 - 1;
  _ndc.y = -((ev.clientY - rect.top) / rect.height) * 2 + 1;
  _raycaster.setFromCamera(_ndc, state.camera);
  // Build a plane from the override and intersect.
  const plane = new THREE.Plane().setFromNormalAndCoplanarPoint(
    state.workplaneOverride.normal, state.workplaneOverride.point
  );
  const out = new THREE.Vector3();
  if (!_raycaster.ray.intersectPlane(plane, out)) return null;
  return { position: out, quaternion: state.workplaneOverride.quat.clone() };
}
