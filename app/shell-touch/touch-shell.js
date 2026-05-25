// Touch shell spike entry point. Boots a minimal three.js scene with a
// couple of primitives and wires the TouchInputController. The HUD prints
// gesture / pointer info so we can validate input behaviour on real
// hardware (iPad, Surface, Android tablet).
//
// This is intentionally NOT the full BlockBuilder app yet. The spike's
// job is to answer: "does multi-touch + Pencil give us workable 3D
// editing on iPad?" Real shell-touch implementation lands after the
// answer is yes.

import * as THREE from 'three';
import { TouchInputController } from './touch-input.js';

const canvas = document.getElementById('touch-canvas');
const hud    = document.getElementById('touch-hud');

// ----- Scene -----
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0a0c10);

const camera = new THREE.PerspectiveCamera(45, canvas.clientWidth / canvas.clientHeight, 1, 5000);
camera.up.set(0, 0, 1);
camera.position.set(120, -180, 130);
camera.lookAt(0, 0, 20);

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(canvas.clientWidth, canvas.clientHeight, false);
renderer.shadowMap.enabled = true;

// Lights
scene.add(new THREE.AmbientLight(0xb0b8c8, 0.6));
const key = new THREE.DirectionalLight(0xfff3d6, 1.0);
key.position.set(80, -100, 200);
key.castShadow = true;
scene.add(key);

// Workplane grid for orientation
const grid = new THREE.GridHelper(200, 20, 0x2a3040, 0x1a1f2a);
grid.rotation.x = Math.PI / 2;
scene.add(grid);

// Sample shapes (so we have something to tap on)
const shapes = [];
function addBox(x, y, color) {
  const g = new THREE.BoxGeometry(30, 30, 30);
  const m = new THREE.MeshStandardMaterial({ color, roughness: 0.6, metalness: 0.05 });
  const mesh = new THREE.Mesh(g, m);
  mesh.position.set(x, y, 15);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  scene.add(mesh);
  shapes.push(mesh);
  return mesh;
}
addBox(-40, 0, 0xc4f04f);
addBox( 40, 0, 0xff7a59);
addBox(  0, 50, 0x6fa8ff);

// Ground for shadow
const ground = new THREE.Mesh(
  new THREE.PlaneGeometry(400, 400),
  new THREE.ShadowMaterial({ opacity: 0.15 })
);
ground.position.z = 0;
ground.receiveShadow = true;
scene.add(ground);

// ----- Render loop (on-demand) -----
let _dirty = true;
function requestRender() { _dirty = true; }
function tick() {
  if (_dirty) {
    renderer.render(scene, camera);
    _dirty = false;
  }
  requestAnimationFrame(tick);
}
tick();

// ----- Input controller -----
const controls = new TouchInputController(camera, canvas, new THREE.Vector3(0, 0, 10));
controls.addEventListener('change', requestRender);

// ----- HUD diagnostics -----
const stats = {
  pointers: 0,
  pointerTypes: new Set(),
  lastEvent: '-',
  lastTapPos: '-',
};
function paintHud() {
  hud.innerHTML = `
    <div><span class="hud-k">pointers</span><span class="hud-v">${stats.pointers}</span></div>
    <div><span class="hud-k">types</span><span class="hud-v">${[...stats.pointerTypes].join(',') || '-'}</span></div>
    <div><span class="hud-k">last</span><span class="hud-v">${stats.lastEvent}</span></div>
    <div><span class="hud-k">tap</span><span class="hud-v">${stats.lastTapPos}</span></div>
    <div class="hud-help">
      1 finger orbit · 2 fingers pinch+pan · tap select · long-press menu
    </div>
  `;
}

// Track pointers for HUD purposes (independent of the controller's map)
canvas.addEventListener('pointerdown', (ev) => {
  stats.pointers++;
  stats.pointerTypes.add(ev.pointerType);
  stats.lastEvent = `down ${ev.pointerType}`;
  paintHud();
});
canvas.addEventListener('pointerup', (ev) => {
  stats.pointers = Math.max(0, stats.pointers - 1);
  stats.lastEvent = `up ${ev.pointerType}`;
  paintHud();
});
canvas.addEventListener('pointercancel', () => { stats.pointers = 0; paintHud(); });

controls.addEventListener('tap', (ev) => {
  stats.lastEvent = `tap ${ev.detail.pointerType}`;
  stats.lastTapPos = `${Math.round(ev.detail.x)},${Math.round(ev.detail.y)}`;
  paintHud();

  // Raycast to see which shape was tapped
  const rect = canvas.getBoundingClientRect();
  const ndc = new THREE.Vector2(
    ((ev.detail.x - rect.left) / rect.width) * 2 - 1,
    -((ev.detail.y - rect.top) / rect.height) * 2 + 1,
  );
  const raycaster = new THREE.Raycaster();
  raycaster.setFromCamera(ndc, camera);
  const hits = raycaster.intersectObjects(shapes, false);
  shapes.forEach(s => s.material.emissive = new THREE.Color(0x000000));
  if (hits.length > 0) {
    hits[0].object.material.emissive = new THREE.Color(0x404040);
    requestRender();
  }
});

controls.addEventListener('longpress', (ev) => {
  stats.lastEvent = `longpress ${ev.detail.pointerType}`;
  paintHud();
});

controls.addEventListener('hover', (ev) => {
  stats.lastEvent = `hover ${ev.detail.pointerType}`;
  paintHud();
});

paintHud();

// ----- Resize handling -----
const resize = () => {
  const w = canvas.clientWidth;
  const h = canvas.clientHeight;
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  renderer.setSize(w, h, false);
  requestRender();
};
window.addEventListener('resize', resize);
window.addEventListener('orientationchange', resize);
resize();
