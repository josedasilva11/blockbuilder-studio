// Selection: tracks the active TinkerShape, drives the transform gizmo, fires
// 'tb:selectionchange' events so other modules (properties panel, toolbar) can react.

import * as THREE from 'three';
import { state, setSelected } from './state.js';

const _selectionListeners = new Set();

export function onSelectionChange(fn) {
  _selectionListeners.add(fn);
  return () => _selectionListeners.delete(fn);
}

export function selectShape(id) {
  setSelected(id);
  const shape = id ? state.shapes.get(id) : null;
  if (state.transformControls) {
    if (shape) state.transformControls.attach(shape.mesh);
    else state.transformControls.detach();
  }
  for (const fn of _selectionListeners) fn(shape);
}

export function installPickHandler(canvas) {
  const raycaster = new THREE.Raycaster();
  const ndc = new THREE.Vector2();

  canvas.addEventListener('pointerdown', (ev) => {
    if (ev.button !== 0) return;
    // Skip when interacting with the transform gizmo
    if (state.transformControls && state.transformControls.dragging) return;
    const rect = canvas.getBoundingClientRect();
    ndc.set(
      ((ev.clientX - rect.left) / rect.width) * 2 - 1,
      -((ev.clientY - rect.top) / rect.height) * 2 + 1
    );
    raycaster.setFromCamera(ndc, state.camera);
    const meshes = [...state.shapes.values()].map(s => s.mesh).filter(m => m.parent);
    const hits = raycaster.intersectObjects(meshes, false);
    if (hits.length > 0) {
      selectShape(hits[0].object.userData.tinkerShape.id);
    } else {
      selectShape(null);
    }
  });
}
