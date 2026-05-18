// Three.js viewport bootstrap: scene, camera, lights, renderer, workplane grid,
// orbit controls. Exports the references on the shared state object.

import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { state } from './state.js';

const WORLD_UNIT_MM = 1; // 1 Three unit = 1 mm
const GRID_HALF = 200;   // 200 mm half-extent

export function initScene(canvas) {
  const scene = new THREE.Scene();
  scene.background = null; // transparent so the CSS gradient shows through

  const camera = new THREE.PerspectiveCamera(
    45,
    canvas.clientWidth / canvas.clientHeight,
    1,
    5000
  );
  camera.up.set(0, 0, 1);
  camera.position.set(120, -180, 130);
  camera.lookAt(0, 0, 20);

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(canvas.clientWidth, canvas.clientHeight, false);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  // Lights — cooler ambient + warm key so coloured shapes pop against dark bg.
  const amb = new THREE.AmbientLight(0xb0b8c8, 0.55);
  scene.add(amb);
  const key = new THREE.DirectionalLight(0xfff3d6, 1.05);
  key.position.set(80, -100, 200);
  key.castShadow = true;
  key.shadow.mapSize.width = 2048;
  key.shadow.mapSize.height = 2048;
  key.shadow.camera.left = -200;
  key.shadow.camera.right = 200;
  key.shadow.camera.top = 200;
  key.shadow.camera.bottom = -200;
  key.shadow.camera.near = 1;
  key.shadow.camera.far = 600;
  scene.add(key);
  const fill = new THREE.DirectionalLight(0x6fa9c4, 0.32);
  fill.position.set(-100, 100, 50);
  scene.add(fill);

  // Workplane grid: matches Tinkercad's blue grid plane.
  const grid = makeWorkplaneGrid();
  scene.add(grid);

  // Ground for shadow catching (invisible)
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(800, 800),
    new THREE.ShadowMaterial({ opacity: 0.18 })
  );
  ground.receiveShadow = true;
  scene.add(ground);

  // Origin marker (small cross) — lime matches brand accent.
  const originMat = new THREE.LineBasicMaterial({ color: 0xc4f04f });
  const originGeo = new THREE.BufferGeometry().setFromPoints([
    new THREE.Vector3(-5, 0, 0.1), new THREE.Vector3(5, 0, 0.1),
    new THREE.Vector3(0, -5, 0.1), new THREE.Vector3(0, 5, 0.1),
  ]);
  scene.add(new THREE.LineSegments(originGeo, originMat));

  // OrbitControls
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.target.set(0, 0, 10);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.screenSpacePanning = false;
  controls.update();

  state.scene = scene;
  state.camera = camera;
  state.renderer = renderer;
  state.controls = controls;
  state.gridGroup = grid;
  state.ambientLight = amb;
  state.keyLight = key;

  // Resize handling
  const resize = () => {
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    if (canvas.width !== w * window.devicePixelRatio || canvas.height !== h * window.devicePixelRatio) {
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    }
  };
  window.addEventListener('resize', resize);
  new ResizeObserver(resize).observe(canvas);
  resize();

  // Render loop
  function tick() {
    controls.update();
    renderer.render(scene, camera);
    requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);

  return { scene, camera, renderer, controls };
}

function makeWorkplaneGrid() {
  // Dark-theme grid: faint cool grey minor cells, slightly brighter major lines.
  const group = new THREE.Group();
  group.name = 'WorkplaneGrid';
  const minor = new THREE.GridHelper(GRID_HALF * 2, GRID_HALF * 2 / 5, 0x3a4252, 0x2c323e);
  minor.material.opacity = 0.55;
  minor.material.transparent = true;
  minor.rotation.x = Math.PI / 2;
  group.add(minor);
  const major = new THREE.GridHelper(GRID_HALF * 2, GRID_HALF * 2 / 25, 0x55617a, 0x55617a);
  major.material.opacity = 0.85;
  major.material.transparent = true;
  major.rotation.x = Math.PI / 2;
  group.add(major);
  return group;
}

export function setView(view) {
  const cam = state.camera;
  const ctrl = state.controls;
  if (!cam || !ctrl) return;
  const target = ctrl.target.clone();
  const dist = cam.position.distanceTo(target);
  switch (view) {
    case 'top':
      cam.position.set(target.x, target.y, target.z + dist);
      break;
    case 'front':
      cam.position.set(target.x, target.y - dist, target.z);
      break;
    case 'right':
      cam.position.set(target.x + dist, target.y, target.z);
      break;
    case 'iso':
    default:
      cam.position.set(target.x + dist * 0.6, target.y - dist * 0.6, target.z + dist * 0.6);
  }
  cam.lookAt(target);
  ctrl.update();
}
