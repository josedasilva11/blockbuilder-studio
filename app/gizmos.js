// TransformControls — kept around as a fallback gizmo (press R / S to summon).
// By default it stays DETACHED so the big translucent sphere never appears.
// Body-drag (selection.js) and the white handles (handles.js) cover normal
// translate / rotate / scale interactions.

import * as THREE from 'three';
import { TransformControls } from 'three/addons/controls/TransformControls.js';
import { state } from './state.js';
import { requestRender } from './scene.js';

let _attached = null;

function setHelperVisible(t, v) {
  t.visible = v;
  const h = (typeof t.getHelper === 'function') ? t.getHelper() : null;
  if (h) h.visible = v;
}

export function initGizmos() {
  const t = new TransformControls(state.camera, state.renderer.domElement);
  t.setMode('rotate');
  t.setSpace('world');
  t.setSize(0.85);
  setHelperVisible(t, false);

  t.addEventListener('dragging-changed', (ev) => {
    state.controls.enabled = !ev.value;
  });
  // Any TransformControls visual / value change → paint next frame.
  t.addEventListener('change', requestRender);
  t.addEventListener('objectChange', requestRender);

  state.scene.add(typeof t.getHelper === 'function' ? t.getHelper() : t);
  state.transformControls = t;
  applySnap();

  window.addEventListener('keydown', (ev) => {
    if (ev.target && ['INPUT', 'TEXTAREA', 'SELECT'].includes(ev.target.tagName)) return;
    if (ev.key === 'r' || ev.key === 'R') { showFor('rotate'); }
    else if (ev.key === 's' || ev.key === 'S') { showFor('scale'); }
    else if (ev.key === 'g' || ev.key === 'G' || ev.key === 'Escape') { hide(); }
  });
}

/** Remember which shape is current, but DO NOT attach the TC gizmo (avoids the
 *  giant translucent sphere/arc cocoon appearing on every selection). */
export function attachToShape(shape) {
  _attached = shape;
  const t = state.transformControls;
  if (!t) return;
  t.detach();
  setHelperVisible(t, false);
}

export function showFor(mode) {
  const t = state.transformControls;
  if (!t || !_attached) return;
  t.setMode(mode);
  t.attach(_attached.mesh);
  setHelperVisible(t, true);
}

export function hide() {
  const t = state.transformControls;
  if (!t) return;
  t.detach();
  setHelperVisible(t, false);
}

export function applySnap() {
  const t = state.transformControls;
  if (!t) return;
  const s = state.snapStep;
  if (s > 0) {
    t.setTranslationSnap(s);
    // 0.1° rotation snap matches the rotation arcs in handles.js — fine grain
    // by default, hold Ctrl during the drag for fully free rotation.
    t.setRotationSnap(THREE.MathUtils.degToRad(0.1));
    t.setScaleSnap(0.05);
  } else {
    t.setTranslationSnap(null);
    t.setRotationSnap(null);
    t.setScaleSnap(null);
  }
}
