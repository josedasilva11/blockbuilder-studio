// Tiny XYZ axis widget in the bottom-left of the viewport. Mirrors the main
// camera's orientation so the user can tell which way is X / Y / Z at a glance
// (red = X, green = Y, blue = Z). Pure visual — no interactions.

import * as THREE from 'three';
import { state } from './state.js';

const SIZE = 70;
const AXIS_LEN = 1.05;

let _scene = null;
let _camera = null;
let _renderer = null;
let _root = null;
let _labels = {};

export function initAxisWidget() {
  _root = document.createElement('div');
  _root.className = 'axis-widget';
  _root.style.width = `${SIZE}px`;
  _root.style.height = `${SIZE}px`;
  document.body.appendChild(_root);
  positionInViewport();

  const canvas = document.createElement('canvas');
  const dpr = window.devicePixelRatio;
  canvas.width = SIZE * dpr;
  canvas.height = SIZE * dpr;
  canvas.style.width = `${SIZE}px`;
  canvas.style.height = `${SIZE}px`;
  _root.appendChild(canvas);

  _scene = new THREE.Scene();
  // Frustum kept tight (±1.45) so the arrows occupy most of the widget. The
  // X/Y/Z labels sit just past the tips at length 1.20 — close enough to read
  // as "this letter belongs to this arrow" without overlapping the tip dot.
  _camera = new THREE.OrthographicCamera(-1.45, 1.45, 1.45, -1.45, 0.01, 50);
  _camera.up.set(0, 0, 1);

  _renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  _renderer.setPixelRatio(dpr);
  _renderer.setClearColor(0x000000, 0);

  // Three colored line axes
  addAxisLine('X', new THREE.Vector3(AXIS_LEN, 0, 0), 0xff6e6e);
  addAxisLine('Y', new THREE.Vector3(0, AXIS_LEN, 0), 0x7cd859);
  addAxisLine('Z', new THREE.Vector3(0, 0, AXIS_LEN), 0x5ca3ff);
  // Tip dots
  addTip(new THREE.Vector3(AXIS_LEN, 0, 0), 0xff6e6e, 'X');
  addTip(new THREE.Vector3(0, AXIS_LEN, 0), 0x7cd859, 'Y');
  addTip(new THREE.Vector3(0, 0, AXIS_LEN), 0x5ca3ff, 'Z');

  window.addEventListener('resize', positionInViewport);
  new ResizeObserver(positionInViewport).observe(state.renderer.domElement);

  // Render-on-demand: only redraw the widget when the main camera moves.
  // OrbitControls fires 'change' on every nudge, so this stays in lockstep
  // without burning a 60fps loop for a static graphic.
  let _dirty = true;
  state.controls?.addEventListener('change', () => { _dirty = true; });
  // Module-scope scratches reused per damping frame. Previous .clone() chain
  // allocated 4 Vector3s per painted frame: one for the camera direction and
  // one per X/Y/Z label projection.
  const _tmpDir = new THREE.Vector3();
  const _tmpProj = new THREE.Vector3();
  const tick = () => {
    if (_dirty) {
      if (state.controls) {
        _tmpDir.copy(state.camera.position).sub(state.controls.target).normalize();
        _camera.position.copy(_tmpDir).multiplyScalar(4);
        _camera.up.copy(state.camera.up);
        _camera.lookAt(0, 0, 0);
        // project() reads matrixWorldInverse — lookAt only refreshed the
        // rotation, so we have to force the world matrix to recompute before
        // the label loop runs, otherwise the X/Y/Z text lags one frame behind
        // the arrows and drifts off-axis during continuous orbits.
        _camera.updateMatrixWorld(true);
        _camera.matrixWorldInverse.copy(_camera.matrixWorld).invert();
      }
      for (const k of ['X', 'Y', 'Z']) {
        const el = _labels[k]?.el;
        const pos = _labels[k]?.pos;
        if (!el || !pos) continue;
        _tmpProj.copy(pos).project(_camera);
        el.style.left = `${(_tmpProj.x * 0.5 + 0.5) * SIZE}px`;
        el.style.top = `${(-_tmpProj.y * 0.5 + 0.5) * SIZE}px`;
      }
      _renderer.render(_scene, _camera);
      _dirty = false;
    }
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}

function positionInViewport() {
  const canvas = state.renderer.domElement;
  const rect = canvas.getBoundingClientRect();
  _root.style.left = `${rect.left + 14}px`;
  _root.style.top = `${rect.bottom - SIZE - 50}px`;
}

function addAxisLine(name, end, color) {
  const geo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, 0, 0), end]);
  const mat = new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.95 });
  const line = new THREE.Line(geo, mat);
  _scene.add(line);
}

function addTip(pos, color, label) {
  // Smaller tip dot — the letter is the real visual anchor, the sphere just
  // marks the end of the line without competing with the label.
  const sphere = new THREE.Mesh(
    new THREE.SphereGeometry(0.09, 10, 10),
    new THREE.MeshBasicMaterial({ color }),
  );
  sphere.position.copy(pos);
  _scene.add(sphere);

  // Label slightly past the tip (length × 1.20). Close enough that the eye
  // groups it with the arrow, far enough that it doesn't sit on the dot.
  const labelPos = pos.clone().multiplyScalar(1.20);
  const el = document.createElement('span');
  el.className = `axis-label axis-label-${label.toLowerCase()}`;
  el.textContent = label;
  el.style.color = '#' + color.toString(16).padStart(6, '0');
  _root.appendChild(el);
  _labels[label] = { el, pos: labelPos };
}
