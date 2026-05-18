// Transform gizmo: wraps Three.js TransformControls so the user can translate,
// rotate, or scale the selected shape with familiar handles in the viewport.
// Snap settings honour the global snap step (in mm).

import * as THREE from 'three';
import { TransformControls } from 'three/addons/controls/TransformControls.js';
import { state } from './state.js';

const MODES = ['translate', 'rotate', 'scale'];
let _mode = 'translate';

export function initGizmos() {
  const t = new TransformControls(state.camera, state.renderer.domElement);
  t.setMode('translate');
  t.setSpace('world');
  t.setSize(0.85);

  t.addEventListener('dragging-changed', (ev) => {
    state.controls.enabled = !ev.value;
  });

  state.scene.add(t.getHelper ? t.getHelper() : t);
  state.transformControls = t;

  applySnap();

  // Keyboard cycle: G = translate, R = rotate, S = scale (Tinkercad/Blender style)
  window.addEventListener('keydown', (ev) => {
    if (ev.target && ['INPUT', 'TEXTAREA', 'SELECT'].includes(ev.target.tagName)) return;
    if (ev.key === 'g' || ev.key === 'G') { setMode('translate'); }
    else if (ev.key === 'r' || ev.key === 'R') { setMode('rotate'); }
    else if (ev.key === 's' || ev.key === 'S') { setMode('scale'); }
  });

  // When mode changes via gizmo, also keep snap synced.
  t.addEventListener('objectChange', () => {
    const obj = t.object;
    if (!obj || !state.snapStep) return;
    if (t.getMode() === 'translate') {
      const s = state.snapStep;
      obj.position.x = Math.round(obj.position.x / s) * s;
      obj.position.y = Math.round(obj.position.y / s) * s;
      obj.position.z = Math.round(obj.position.z / s) * s;
    }
  });
}

export function setMode(mode) {
  if (!MODES.includes(mode)) return;
  _mode = mode;
  state.transformControls.setMode(mode);
}

export function applySnap() {
  const t = state.transformControls;
  if (!t) return;
  const s = state.snapStep;
  if (s > 0) {
    t.setTranslationSnap(s);
    t.setRotationSnap(THREE.MathUtils.degToRad(15));
    t.setScaleSnap(0.05);
  } else {
    t.setTranslationSnap(null);
    t.setRotationSnap(null);
    t.setScaleSnap(null);
  }
}
