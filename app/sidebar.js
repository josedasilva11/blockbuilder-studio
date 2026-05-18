// Sidebar shape catalog with search filter, draggable thumbnails, and click-to-spawn.
// On drop, the shape lands at the cursor's projected point on the workplane.

import * as THREE from 'three';
import { SHAPES } from './shapes/registry.js';
import { TinkerShape } from './shape.js';
import { state } from './state.js';
import { selectShape } from './selection.js';

const tiles = new Map(); // kind+isHole → element, used by search filter
let _dragKind = null;
let _dragIsHole = false;
let _viewport = null;

export function initSidebar({ viewport }) {
  _viewport = viewport;
  const solidGrid = document.getElementById('shape-grid');
  const holeGrid = document.getElementById('hole-grid');
  for (const def of SHAPES) {
    const solid = makeTile(def, false);
    const hole = makeTile(def, true);
    solidGrid.appendChild(solid);
    holeGrid.appendChild(hole);
    tiles.set(`${def.kind}|0`, solid);
    tiles.set(`${def.kind}|1`, hole);
  }

  const search = document.getElementById('shape-search');
  if (search) {
    search.addEventListener('input', () => filterTiles(search.value));
  }

  viewport.addEventListener('dragover', (e) => {
    e.preventDefault();
    document.getElementById('dropzone-overlay').hidden = false;
  });
  viewport.addEventListener('dragleave', () => {
    document.getElementById('dropzone-overlay').hidden = true;
  });
  viewport.addEventListener('drop', onDrop);
}

function makeTile(def, isHole) {
  const el = document.createElement('div');
  el.className = `shape-tile${isHole ? ' hole' : ''}`;
  el.draggable = true;
  el.dataset.kind = def.kind;
  el.dataset.label = def.label.toLowerCase();
  el.innerHTML = `${def.icon}<span>${def.label}</span>`;
  el.addEventListener('dragstart', (e) => {
    _dragKind = def.kind;
    _dragIsHole = isHole;
    el.classList.add('dragging');
    e.dataTransfer.setData('text/plain', def.kind);
    e.dataTransfer.effectAllowed = 'copy';
  });
  el.addEventListener('dragend', () => {
    el.classList.remove('dragging');
    document.getElementById('dropzone-overlay').hidden = true;
  });
  el.addEventListener('click', () => {
    // Click-to-add: drop at workplane origin so the user sees the shape immediately.
    const base = def.defaults.height ? def.defaults.height / 2 : (def.defaults.radius || 5);
    spawnAt({ x: 0, y: 0, z: 0 }, def.kind, isHole, base);
  });
  return el;
}

function filterTiles(query) {
  const q = (query || '').trim().toLowerCase();
  for (const el of tiles.values()) {
    const match = !q || el.dataset.label.includes(q) || el.dataset.kind.toLowerCase().includes(q);
    el.hidden = !match;
  }
}

function onDrop(ev) {
  ev.preventDefault();
  document.getElementById('dropzone-overlay').hidden = true;
  if (!_dragKind) return;
  const p = projectToWorkplane(ev);
  const def = SHAPES.find(s => s.kind === _dragKind);
  const base = def?.defaults.height ? def.defaults.height / 2 : (def?.defaults.radius || 5);
  spawnAt(p, _dragKind, _dragIsHole, base);
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
  const plane = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0);
  const hit = new THREE.Vector3();
  raycaster.ray.intersectPlane(plane, hit);
  return hit ? { x: hit.x, y: hit.y, z: 0 } : { x: 0, y: 0, z: 0 };
}

function spawnAt(pos, kind, isHole, baseHalfHeight) {
  const shape = new TinkerShape(kind, { isHole });
  const half = baseHalfHeight ?? halfHeightFor(shape);
  const snap = state.snapStep || 0;
  const sx = snap ? Math.round(pos.x / snap) * snap : pos.x;
  const sy = snap ? Math.round(pos.y / snap) * snap : pos.y;
  shape.mesh.position.set(sx, sy, pos.z + half);
  state.scene.add(shape.mesh);
  selectShape(shape.id);
  return shape;
}

function halfHeightFor(shape) {
  const p = shape.params;
  if ('height' in p) return p.height / 2;
  if (shape.kind === 'SPHERE') return p.radius;
  if (shape.kind === 'HALF_SPHERE') return 0;
  if (shape.kind === 'TORUS') return p.minor_radius;
  return 5;
}
