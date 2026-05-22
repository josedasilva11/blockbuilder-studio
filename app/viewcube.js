// 3D viewcube widget. Small labelled cube in the viewport corner that mirrors
// the main camera orientation. Click a face → snap main camera to that view.
// Click-and-drag the cube → orbit the main camera (Z-up, polite limits).

import * as THREE from 'three';
import { state } from './state.js';
import { setView } from './scene.js';

const SIZE = 120;

const FACE_VIEWS = {
  '+Z': 'top', '-Z': 'bottom',
  '+Y': 'back', '-Y': 'front',
  '+X': 'right', '-X': 'left',
};

let _scene = null;
let _camera = null;
let _renderer = null;
let _cube = null;
let _canvas = null;
let _drag = null;
let _hovered = null;
let _faceMats = null;
const DEFAULT_BG = '#e9edf3';
const HOVER_BG = '#cdff45';

export function initViewcube(parentEl) {
  const wrap = document.createElement('div');
  wrap.className = 'viewcube-3d';
  wrap.style.width = `${SIZE}px`;
  wrap.style.height = `${SIZE}px`;
  parentEl.appendChild(wrap);

  _canvas = document.createElement('canvas');
  const dpr = window.devicePixelRatio;
  _canvas.width = SIZE * dpr;
  _canvas.height = SIZE * dpr;
  _canvas.style.width = `${SIZE}px`;
  _canvas.style.height = `${SIZE}px`;
  wrap.appendChild(_canvas);

  _scene = new THREE.Scene();
  _camera = new THREE.OrthographicCamera(-1.5, 1.5, 1.5, -1.5, 0.1, 50);
  _camera.up.set(0, 0, 1);

  _renderer = new THREE.WebGLRenderer({ canvas: _canvas, antialias: true, alpha: true });
  _renderer.setPixelRatio(dpr);
  _renderer.setClearColor(0x000000, 0);

  _faceMats = {
    '+X': makeFaceMat('RIGHT'),
    '-X': makeFaceMat('LEFT'),
    '+Y': makeFaceMat('BACK'),
    '-Y': makeFaceMat('FRONT'),
    '+Z': makeFaceMat('TOP'),
    '-Z': makeFaceMat('BOTTOM'),
  };
  // BoxGeometry face material order: +X, -X, +Y, -Y, +Z, -Z
  const matArray = [_faceMats['+X'], _faceMats['-X'], _faceMats['+Y'], _faceMats['-Y'], _faceMats['+Z'], _faceMats['-Z']];
  _cube = new THREE.Mesh(new THREE.BoxGeometry(1.6, 1.6, 1.6), matArray);
  _scene.add(_cube);

  // Crisp dark edges to suggest a sharp bezel
  const edges = new THREE.LineSegments(
    new THREE.EdgesGeometry(_cube.geometry, 12),
    new THREE.LineBasicMaterial({ color: 0x252a35, transparent: true, opacity: 0.75 }),
  );
  _cube.add(edges);

  // Ambient + key light to subtle shade the cube edges
  _scene.add(new THREE.AmbientLight(0xffffff, 0.85));
  const key = new THREE.DirectionalLight(0xffffff, 0.45);
  key.position.set(2, -2, 3);
  _scene.add(key);

  // Pointer interactions
  _canvas.addEventListener('pointerdown', onPointerDown);
  _canvas.addEventListener('pointermove', onPointerMove);
  _canvas.addEventListener('pointerup', onPointerUp);
  _canvas.addEventListener('pointerleave', onPointerLeave);

  // Render-on-demand. The cube only changes when the main camera changes or
  // the user hovers a face. Both fire events that flip _dirty.
  let _dirty = true;
  state.controls?.addEventListener('change', () => { _dirty = true; });
  _canvas.addEventListener('pointermove', () => { _dirty = true; });
  _canvas.addEventListener('pointerleave', () => { _dirty = true; });
  const tick = () => {
    if (_dirty) {
      syncToMainCamera();
      _renderer.render(_scene, _camera);
      _dirty = false;
    }
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}

function syncToMainCamera() {
  if (!state.controls) return;
  // Same direction as main camera, from origin so the cube shows the same faces.
  const dir = state.camera.position.clone().sub(state.controls.target).normalize();
  _camera.position.copy(dir.multiplyScalar(4));
  _camera.up.copy(state.camera.up);
  _camera.lookAt(0, 0, 0);
}

// ---- pointer ----

const _ndc = new THREE.Vector2();
const _raycaster = new THREE.Raycaster();

function pickFace(ev) {
  const rect = _canvas.getBoundingClientRect();
  _ndc.set(
    ((ev.clientX - rect.left) / rect.width) * 2 - 1,
    -((ev.clientY - rect.top) / rect.height) * 2 + 1,
  );
  _raycaster.setFromCamera(_ndc, _camera);
  const hits = _raycaster.intersectObject(_cube, false);
  if (!hits.length) return null;
  const n = hits[0].face.normal;
  if (n.z > 0.5) return '+Z'; if (n.z < -0.5) return '-Z';
  if (n.y > 0.5) return '+Y'; if (n.y < -0.5) return '-Y';
  if (n.x > 0.5) return '+X'; return '-X';
}

function onPointerDown(ev) {
  _drag = { x: ev.clientX, y: ev.clientY, startX: ev.clientX, startY: ev.clientY };
  _canvas.setPointerCapture(ev.pointerId);
  _canvas.style.cursor = 'grabbing';
}

function onPointerMove(ev) {
  if (_drag) {
    const dx = ev.clientX - _drag.x;
    const dy = ev.clientY - _drag.y;
    _drag.x = ev.clientX;
    _drag.y = ev.clientY;
    rotateMainCamera(dx, dy);
    return;
  }
  // Hover highlight
  const face = pickFace(ev);
  if (face !== _hovered) {
    if (_hovered) setFaceBg(_hovered, DEFAULT_BG);
    if (face) setFaceBg(face, HOVER_BG);
    _hovered = face;
    _canvas.style.cursor = face ? 'pointer' : 'grab';
  }
}

function onPointerUp(ev) {
  if (!_drag) return;
  const moved = Math.hypot(ev.clientX - _drag.startX, ev.clientY - _drag.startY);
  _canvas.releasePointerCapture(ev.pointerId);
  _canvas.style.cursor = 'grab';
  _drag = null;
  // Treat as click if pointer barely moved
  if (moved < 5) {
    const face = pickFace(ev);
    if (face && FACE_VIEWS[face]) setView(FACE_VIEWS[face]);
  }
}

function onPointerLeave() {
  if (_hovered) {
    setFaceBg(_hovered, DEFAULT_BG);
    _hovered = null;
  }
}

function rotateMainCamera(dxPx, dyPx) {
  const cam = state.camera;
  const target = state.controls.target;
  const offset = cam.position.clone().sub(target);
  const r = offset.length();
  let theta = Math.atan2(offset.y, offset.x);
  let phi = Math.asin(THREE.MathUtils.clamp(offset.z / r, -1, 1));
  const speed = 0.012;
  theta -= dxPx * speed;
  phi += dyPx * speed;
  phi = THREE.MathUtils.clamp(phi, -Math.PI / 2 + 0.05, Math.PI / 2 - 0.05);
  offset.x = r * Math.cos(phi) * Math.cos(theta);
  offset.y = r * Math.cos(phi) * Math.sin(theta);
  offset.z = r * Math.sin(phi);
  cam.position.copy(target).add(offset);
  cam.up.set(0, 0, 1);
  cam.lookAt(target);
  state.controls.update();
}

// ---- face material with hover support ----

function makeFaceMat(label) {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const ctx = c.getContext('2d');
  drawFace(ctx, label, DEFAULT_BG);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  const mat = new THREE.MeshLambertMaterial({ map: tex });
  mat.userData = { label, canvas: c, ctx, tex };
  return mat;
}

function setFaceBg(faceKey, bg) {
  const mat = _faceMats[faceKey];
  if (!mat) return;
  drawFace(mat.userData.ctx, mat.userData.label, bg);
  mat.userData.tex.needsUpdate = true;
}

function drawFace(ctx, label, bg) {
  // Subtle gradient + label
  const w = ctx.canvas.width, h = ctx.canvas.height;
  ctx.clearRect(0, 0, w, h);
  const g = ctx.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, bg);
  g.addColorStop(1, shade(bg, -10));
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
  ctx.strokeStyle = shade(bg, -28);
  ctx.lineWidth = 6;
  ctx.strokeRect(3, 3, w - 6, h - 6);
  ctx.fillStyle = '#1d212d';
  ctx.font = '700 56px Inter, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(label, w / 2, h / 2 + 4);
}

function shade(hex, amount) {
  // Lighten / darken a #rrggbb color by `amount` (positive = lighter).
  const c = hex.replace('#', '');
  const r = Math.max(0, Math.min(255, parseInt(c.slice(0, 2), 16) + amount));
  const gx = Math.max(0, Math.min(255, parseInt(c.slice(2, 4), 16) + amount));
  const b = Math.max(0, Math.min(255, parseInt(c.slice(4, 6), 16) + amount));
  return '#' + [r, gx, b].map(v => v.toString(16).padStart(2, '0')).join('');
}
