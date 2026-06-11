// Three.js viewport bootstrap: scene, camera, lights, renderer, workplane grid,
// orbit controls. Exports the references on the shared state object.

import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { state } from './state.js';

// World unit = base unit (mm / cm / inch — chosen at startup). Three.js scene
// stays in abstract units; the unit choice only affects display labels and the
// grid spacing convention. Workplane span = 100 base units (50 each side).
const WORLD_UNIT_MM = 1;
const GRID_HALF = 50;    // 100-unit total workplane

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

  // preserveDrawingBuffer lets us read the canvas (toDataURL / toBlob) after
  // a render without losing the framebuffer. Small perf cost; matters for the
  // screenshot feature which would otherwise capture a blank canvas.
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, preserveDrawingBuffer: true });
  // Default to 1.5 — invisible quality loss vs 2.0 on most displays, but only
  // ~56 % of the fragment shader work. The Quality setting in the UI bumps
  // this up or down at runtime via setRendererPixelRatio().
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
  renderer.setSize(canvas.clientWidth, canvas.clientHeight, false);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  // Lights — cooler ambient + warm key so coloured shapes pop against dark bg.
  const amb = new THREE.AmbientLight(0xb0b8c8, 0.55);
  scene.add(amb);
  const key = new THREE.DirectionalLight(0xfff3d6, 1.05);
  key.position.set(80, -100, 200);
  key.castShadow = true;
  // 1024² is a sweet spot for the desk-scale viewport: visibly soft shadows
  // without the extra shadow pass dominating frame time on big STL imports
  // (a 2048² map quadruples the texels the GPU has to fill).
  key.shadow.mapSize.width = 1024;
  key.shadow.mapSize.height = 1024;
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

  // (Origin axes are intentionally absent — the corner XYZ widget is enough.
  // A small invisible group is registered so settings code can still query it
  // without null-checking.)
  state.originGroup = new THREE.Group();
  state.originGroup.visible = false;

  // OrbitControls — Tinkercad-style mouse bindings:
  //   • LEFT  : reserved for shape selection / body drag (handled in selection.js)
  //   • RIGHT : orbit camera
  //   • Shift+RIGHT or MIDDLE : pan
  //   • Scroll : zoom
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.target.set(0, 0, 10);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.screenSpacePanning = true;
  controls.mouseButtons = {
    LEFT: null,
    MIDDLE: THREE.MOUSE.PAN,
    RIGHT: THREE.MOUSE.ROTATE,
  };
  // Dynamic shift-modifier swap before OrbitControls reads the press
  canvas.addEventListener('pointerdown', (ev) => {
    if (ev.button === 2) {
      controls.mouseButtons.RIGHT = ev.shiftKey ? THREE.MOUSE.PAN : THREE.MOUSE.ROTATE;
    }
  }, true);
  // Don't show the OS context menu on right click — we use it for orbit
  canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  controls.update();

  state.scene = scene;
  state.camera = camera;
  state.renderer = renderer;
  state.controls = controls;
  state.gridGroup = grid;
  state.ambientLight = amb;
  state.keyLight = key;

  // Render-on-demand: don't burn frames when nothing changed. Track three
  // signals — explicit requestRender() calls, OrbitControls activity (orbit /
  // pan), and damping still settling after the user lets go. Any one of them
  // means we render this frame.
  let _dirty = true;
  let _interacting = false;
  controls.addEventListener('start', () => { _interacting = true; _dirty = true; });
  controls.addEventListener('end',   () => { _interacting = false; _dirty = true; });
  controls.addEventListener('change', () => { _dirty = true; });
  state.requestRender = () => { _dirty = true; };
  state.renderDirty = () => _dirty;
  state._beginContinuous = () => { _interacting = true; };
  state._endContinuous = () => { _interacting = false; _dirty = true; };

  // Resize handling — works for both perspective and orthographic cameras
  const resize = () => {
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    if (canvas.width !== w * window.devicePixelRatio || canvas.height !== h * window.devicePixelRatio) {
      renderer.setSize(w, h, false);
      const cam = state.camera;
      if (cam.isPerspectiveCamera) {
        cam.aspect = w / h;
      } else if (cam.isOrthographicCamera) {
        const halfH = (cam.top - cam.bottom) / 2;
        const halfW = halfH * (w / h);
        cam.left = -halfW; cam.right = halfW;
      }
      cam.updateProjectionMatrix();
    }
  };
  window.addEventListener('resize', resize);
  new ResizeObserver(resize).observe(canvas);
  resize();

  // Render loop — only paints when something actually changed. Orbit damping
  // also keeps us going for a few frames after a release. Idle scenes cost
  // nothing beyond the rAF + controls.update() check.
  let _settleFrames = 0;
  function tick() {
    const damped = controls.update();
    if (_dirty || _interacting || damped || _settleFrames > 0) {
      renderer.render(scene, state.camera);
      if (damped || _interacting) _settleFrames = 4;
      else _settleFrames = Math.max(0, _settleFrames - 1);
      _dirty = false;
      // Update screen-space overlays AFTER the WebGL render so projection
      // sees the final camera. Lazy import keeps scene.js standalone.
      if (state._updateDimOverlay) state._updateDimOverlay();
    }
    requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);

  return { scene, camera, renderer, controls };
}

// Build a small XYZ axis triad at the world origin with arrowheads + labels.
// Colours match the bottom-left axis widget so the convention stays consistent.
function makeOriginAxes() {
  const group = new THREE.Group();
  group.name = 'OriginAxes';
  const len = 8;       // shaft length in world units
  const headLen = 1.8;
  const headRad = 0.55;
  const axes = [
    { dir: new THREE.Vector3(1, 0, 0), col: 0xff6e6e, label: 'X' },
    { dir: new THREE.Vector3(0, 1, 0), col: 0x7cd859, label: 'Y' },
    { dir: new THREE.Vector3(0, 0, 1), col: 0x5ca3ff, label: 'Z' },
  ];
  for (const ax of axes) {
    // Shaft
    const shaftGeo = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(0, 0, 0.05),
      ax.dir.clone().multiplyScalar(len).add(new THREE.Vector3(0, 0, 0.05)),
    ]);
    const shaftMat = new THREE.LineBasicMaterial({ color: ax.col, transparent: true, opacity: 0.95, depthTest: true });
    group.add(new THREE.Line(shaftGeo, shaftMat));
    // Arrowhead cone
    const cone = new THREE.Mesh(
      new THREE.ConeGeometry(headRad, headLen, 16),
      new THREE.MeshBasicMaterial({ color: ax.col }),
    );
    const tip = ax.dir.clone().multiplyScalar(len + headLen / 2).add(new THREE.Vector3(0, 0, 0.05));
    cone.position.copy(tip);
    // Cone's default up is +Y; orient toward axis dir.
    cone.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), ax.dir);
    group.add(cone);
    // Sprite label
    const sprite = makeAxisLabel(ax.label, ax.col);
    sprite.position.copy(ax.dir.clone().multiplyScalar(len + headLen + 1.4).add(new THREE.Vector3(0, 0, 0.5)));
    group.add(sprite);
  }
  return group;
}

function makeAxisLabel(text, colour) {
  const size = 64;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d');
  ctx.font = 'bold 42px Inter, system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#' + colour.toString(16).padStart(6, '0');
  ctx.fillText(text, size / 2, size / 2 + 2);
  const tex = new THREE.CanvasTexture(canvas);
  tex.anisotropy = 4;
  const mat = new THREE.SpriteMaterial({ map: tex, depthTest: false, transparent: true });
  const sprite = new THREE.Sprite(mat);
  sprite.scale.set(2.4, 2.4, 1);
  sprite.renderOrder = 1000;
  return sprite;
}

function makeWorkplaneGrid(theme = 'dark') {
  // 100×100 base-unit workplane:
  //   minor cells = 1 unit (100 divisions across)
  //   major cells = 10 units (10 divisions across)
  const total = GRID_HALF * 2;     // 100 units total
  const group = new THREE.Group();
  group.name = 'WorkplaneGrid';
  const palettes = {
    dark:  { minor: 0x2c323e, major: 0x55617a, mOpa: 0.55, MOpa: 0.85 },
    light: { minor: 0xc0c6d0, major: 0x9098a6, mOpa: 0.65, MOpa: 0.85 },
  };
  const p = palettes[theme] || palettes.dark;
  const minor = new THREE.GridHelper(total, 100, p.minor, p.minor);
  minor.material.opacity = p.mOpa;
  minor.material.transparent = true;
  minor.rotation.x = Math.PI / 2;
  group.add(minor);
  const major = new THREE.GridHelper(total, 10, p.major, p.major);
  major.material.opacity = p.MOpa;
  major.material.transparent = true;
  major.rotation.x = Math.PI / 2;
  group.add(major);
  return group;
}

// Rebuild the workplane grid in-place for the given theme. GridHelper bakes
// its colours into vertex attributes, so swapping the look means rebuilding.
export function rebuildGrid(theme) {
  if (!state.scene || !state.gridGroup) return;
  const wasVisible = state.gridGroup.visible;
  state.scene.remove(state.gridGroup);
  for (const c of state.gridGroup.children) {
    c.geometry?.dispose?.();
    c.material?.dispose?.();
  }
  const fresh = makeWorkplaneGrid(theme);
  fresh.visible = wasVisible;
  state.scene.add(fresh);
  state.gridGroup = fresh;
  requestRender();
}

export function setView(view) {
  const cam = state.camera;
  const ctrl = state.controls;
  if (!cam || !ctrl) return;
  const target = ctrl.target.clone();
  const dist = Math.max(80, cam.position.distanceTo(target));
  let pos;
  switch (view) {
    case 'top':    pos = new THREE.Vector3(target.x, target.y, target.z + dist); break;
    case 'bottom': pos = new THREE.Vector3(target.x, target.y, target.z - dist); break;
    case 'front':  pos = new THREE.Vector3(target.x, target.y - dist, target.z); break;
    case 'back':   pos = new THREE.Vector3(target.x, target.y + dist, target.z); break;
    case 'right':  pos = new THREE.Vector3(target.x + dist, target.y, target.z); break;
    case 'left':   pos = new THREE.Vector3(target.x - dist, target.y, target.z); break;
    case 'iso':
    default:       pos = new THREE.Vector3(target.x + dist * 0.6, target.y - dist * 0.6, target.z + dist * 0.6);
  }
  cam.position.copy(pos);
  cam.up.set(0, 0, 1);
  cam.lookAt(target);
  ctrl.update();
  requestRender();
}

/**
 * Swap between perspective and orthographic cameras while preserving target
 * and distance. Rebinds OrbitControls + TransformControls + handle modules.
 */
export function toggleProjection() {
  const oldCam = state.camera;
  const canvas = state.renderer.domElement;
  const w = canvas.clientWidth, h = canvas.clientHeight;
  const aspect = w / h;
  const target = state.controls.target.clone();
  const distVec = oldCam.position.clone().sub(target);
  const dist = distVec.length();

  let newCam;
  if (oldCam.isOrthographicCamera) {
    newCam = new THREE.PerspectiveCamera(45, aspect, 1, 5000);
  } else {
    // Match the perspective's field of view at the current distance so the
    // ortho frustum shows roughly the same area at first.
    const halfH = dist * Math.tan(THREE.MathUtils.degToRad(22.5));
    const halfW = halfH * aspect;
    newCam = new THREE.OrthographicCamera(-halfW, halfW, halfH, -halfH, 1, 5000);
  }
  newCam.up.set(0, 0, 1);
  newCam.position.copy(oldCam.position);
  newCam.lookAt(target);

  state.camera = newCam;
  state.controls.object = newCam;
  state.controls.update();
  if (state.transformControls) state.transformControls.camera = newCam;

  // Update projection label
  const label = document.getElementById('proj-label');
  if (label) label.textContent = newCam.isOrthographicCamera ? 'O' : 'P';
  requestRender();
}

// Public helper: mark the scene as dirty so the render loop paints next frame.
// Call after any mutation that should be visible (mesh move, colour swap,
// add/remove, etc.). Cheap — just sets a flag.
export function requestRender() {
  if (state.requestRender) state.requestRender();
}
export function beginContinuousRender() {
  if (state._beginContinuous) state._beginContinuous();
}
export function endContinuousRender() {
  if (state._endContinuous) state._endContinuous();
}

// Switch the renderer's pixel ratio at runtime. Called by the Quality setting.
//   'low'    → 1.0    (max perf, slightly pixelated)
//   'medium' → 1.5    (default — balanced)
//   'high'   → up to 2 (sharp on retina, heaviest)
export function setQuality(level) {
  if (!state.renderer) return;
  const dpr = window.devicePixelRatio || 1;
  const map = { low: 1.0, medium: 1.5, high: Math.min(dpr, 2) };
  const next = map[level] ?? 1.5;
  state.renderer.setPixelRatio(next);
  // Force a resize so the canvas backing store reflects the new ratio.
  const canvas = state.renderer.domElement;
  state.renderer.setSize(canvas.clientWidth, canvas.clientHeight, false);
  requestRender();
}

export function fitView() {
  // Frame all TB shapes; fall back to default iso position if scene is empty.
  const bbox = new THREE.Box3();
  let any = false;
  for (const s of state.shapes.values()) {
    if (!s.mesh.visible) continue;
    bbox.expandByObject(s.mesh); any = true;
  }
  if (!any) {
    setView('iso');
    return;
  }
  const c = bbox.getCenter(new THREE.Vector3());
  const size = bbox.getSize(new THREE.Vector3());
  const radius = Math.max(size.x, size.y, size.z) * 1.2 + 30;
  state.controls.target.copy(c);
  state.camera.position.set(c.x + radius * 0.6, c.y - radius * 0.6, c.z + radius * 0.6);
  state.camera.lookAt(c);
  state.controls.update();
  requestRender();
}
