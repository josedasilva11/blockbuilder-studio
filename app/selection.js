// Selection + hover highlight in the viewport. Tracks the active shape (drives
// gizmos + properties panel) plus an optional hover state that brightens the
// shape under the cursor. Shift+click adds to a multi-selection set.

import * as THREE from 'three';
import { state, setSelected } from './state.js';

const _selectionListeners = new Set();
const _multiSelected = new Set();
let _hoveredId = null;

export function onSelectionChange(fn) {
  _selectionListeners.add(fn);
  return () => _selectionListeners.delete(fn);
}

export function selectShape(id, { additive = false } = {}) {
  if (!additive) {
    for (const sid of _multiSelected) clearEmissive(state.shapes.get(sid));
    _multiSelected.clear();
  }
  setSelected(id);
  if (id) _multiSelected.add(id);
  const shape = id ? state.shapes.get(id) : null;
  if (state.transformControls) {
    if (shape) state.transformControls.attach(shape.mesh);
    else state.transformControls.detach();
  }
  applyEmissives();
  for (const fn of _selectionListeners) fn(shape);
}

export function getMultiSelection() {
  return [..._multiSelected];
}

function applyEmissives() {
  for (const s of state.shapes.values()) clearEmissive(s);
  for (const id of _multiSelected) {
    const s = state.shapes.get(id);
    if (s) setEmissive(s, 0x6da81f, 0.18);
  }
  if (_hoveredId && !_multiSelected.has(_hoveredId)) {
    const h = state.shapes.get(_hoveredId);
    if (h) setEmissive(h, 0x6da81f, 0.06);
  }
}

function setEmissive(shape, hex, intensity) {
  const mat = shape.mesh.material;
  if (!mat || !('emissive' in mat)) return;
  mat.emissive.setHex(hex);
  mat.emissiveIntensity = intensity;
}

function clearEmissive(shape) {
  if (!shape) return;
  const mat = shape.mesh.material;
  if (!mat || !('emissive' in mat)) return;
  mat.emissive.setHex(0x000000);
  mat.emissiveIntensity = 0;
}

export function installPickHandler(canvas) {
  const raycaster = new THREE.Raycaster();
  const ndc = new THREE.Vector2();

  canvas.addEventListener('pointerdown', (ev) => {
    if (ev.button !== 0) return;
    if (state.transformControls && state.transformControls.dragging) return;
    const rect = canvas.getBoundingClientRect();
    ndc.set(
      ((ev.clientX - rect.left) / rect.width) * 2 - 1,
      -((ev.clientY - rect.top) / rect.height) * 2 + 1
    );
    raycaster.setFromCamera(ndc, state.camera);
    const meshes = [...state.shapes.values()].map(s => s.mesh).filter(m => m.parent && m.visible);
    const hits = raycaster.intersectObjects(meshes, false);
    if (hits.length > 0) {
      const id = hits[0].object.userData.tinkerShape.id;
      selectShape(id, { additive: ev.shiftKey });
    } else if (!ev.shiftKey) {
      selectShape(null);
    }
  });

  canvas.addEventListener('pointermove', (ev) => {
    if (state.transformControls && state.transformControls.dragging) return;
    const rect = canvas.getBoundingClientRect();
    ndc.set(
      ((ev.clientX - rect.left) / rect.width) * 2 - 1,
      -((ev.clientY - rect.top) / rect.height) * 2 + 1
    );
    raycaster.setFromCamera(ndc, state.camera);
    const meshes = [...state.shapes.values()].map(s => s.mesh).filter(m => m.parent && m.visible);
    const hits = raycaster.intersectObjects(meshes, false);
    const newHovered = hits.length > 0 ? hits[0].object.userData.tinkerShape.id : null;
    if (newHovered !== _hoveredId) {
      _hoveredId = newHovered;
      canvas.style.cursor = _hoveredId ? 'pointer' : '';
      applyEmissives();
    }
  });

  canvas.addEventListener('pointerleave', () => {
    if (_hoveredId !== null) {
      _hoveredId = null;
      canvas.style.cursor = '';
      applyEmissives();
    }
  });
}
