// Sidebar shape catalog: renders solid and hole grids of draggable thumbnails.
// Drag-and-drop into the viewport spawns the shape at the cursor's projected
// point on the workplane.

import * as THREE from 'three';
import { SHAPES } from './shapes/registry.js';
import { TinkerShape } from './shape.js';
import { state } from './state.js';
import { selectShape } from './selection.js';

let _solidGrid = null;
let _holeGrid = null;
let _dragKind = null;
let _dragIsHole = false;
let _dragGhost = null;
let _viewport = null;

export function initSidebar({ viewport }) {
  _viewport = viewport;
  _solidGrid = document.getElementById('shape-grid');
  _holeGrid = document.getElementById('hole-grid');
  for (const def of SHAPES) {
    _solidGrid.appendChild(makeTile(def, false));
    _holeGrid.appendChild(makeTile(def, true));
  }

  // Drop zone on the viewport
  viewport.addEventListener('dragover', (e) => { e.preventDefault(); });
  viewport.addEventListener('drop', onDrop);
}

function makeTile(def, isHole) {
  const el = document.createElement('div');
  el.className = `shape-tile${isHole ? ' hole' : ''}`;
  el.draggable = true;
  el.innerHTML = `${def.icon}<span>${def.label}</span>`;
  el.addEventListener('dragstart', (e) => {
    _dragKind = def.kind;
    _dragIsHole = isHole;
    e.dataTransfer.setData('text/plain', def.kind);
    e.dataTransfer.effectAllowed = 'copy';
  });
  // Click to drop at cursor / world origin (mobile-friendly)
  el.addEventListener('click', () => spawnAt({ x: 0, y: 0, z: def.defaults.height ? def.defaults.height / 2 : 5 }, def.kind, isHole));
  return el;
}

function onDrop(ev) {
  ev.preventDefault();
  if (!_dragKind) return;
  const p = projectToWorkplane(ev);
  spawnAt(p, _dragKind, _dragIsHole);
  _dragKind = null;
}

function projectToWorkplane(ev) {
  const rect = _viewport.getBoundingClientRect();
  const ndc = new THREE.Vector2(
    ((ev.clientX - rect.left) / rect.width) * 2 - 1,
    -((ev.clientY - rect.top) / rect.height) * 2 + 1
  );
  const raycaster = new THREE.Raycaster();
  raycaster.setFromCamera(ndc, state.camera);
  const plane = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0); // XY plane (Z up)
  const hit = new THREE.Vector3();
  raycaster.ray.intersectPlane(plane, hit);
  if (!hit) return { x: 0, y: 0, z: 5 };
  return { x: hit.x, y: hit.y, z: 0 };
}

function spawnAt(pos, kind, isHole) {
  const shape = new TinkerShape(kind, { isHole });
  // Position so the base sits on the workplane.
  const half = halfHeightFor(shape);
  const snap = state.snapStep || 0;
  const sx = snap ? Math.round(pos.x / snap) * snap : pos.x;
  const sy = snap ? Math.round(pos.y / snap) * snap : pos.y;
  shape.mesh.position.set(sx, sy, pos.z + half);
  state.scene.add(shape.mesh);
  selectShape(shape.id);
  return shape;
}

function halfHeightFor(shape) {
  // For shapes with height parameter, use half. For sphere, radius. For half-sphere/torus differ.
  const p = shape.params;
  if ('height' in p) return p.height / 2;
  if (shape.kind === 'SPHERE') return p.radius;
  if (shape.kind === 'HALF_SPHERE') return 0; // base already on workplane
  if (shape.kind === 'TORUS') return p.minor_radius;
  return 5;
}
