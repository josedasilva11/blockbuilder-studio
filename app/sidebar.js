// Sidebar shape catalog with search filter, draggable thumbnails, and click-to-spawn.
// On drop, the shape lands at the cursor's projected point on the workplane.

import * as THREE from 'three';
import { SHAPES } from './shapes/registry.js';
import { TinkerShape } from './shape.js';
import { state } from './state.js';
import { selectShape } from './selection.js';
import { pushHistory as pushHistoryFn } from './history.js';
import { projectSpawn as projectSpawnOverride } from './workplane.js';

const tiles = new Map(); // kind+isHole → element, used by search filter
let _dragKind = null;
let _dragIsHole = false;
let _viewport = null;

export function initSidebar({ viewport }) {
  _viewport = viewport;
  const solidGrid = document.getElementById('shape-grid');
  for (const def of SHAPES) {
    if (def.hidden) continue;
    const tile = makeTile(def, false);
    solidGrid.appendChild(tile);
    tiles.set(def.kind, tile);
  }

  const search = document.getElementById('shape-search');
  if (search) {
    search.addEventListener('input', () => filterTiles(search.value));
  }

  // dragover MUST preventDefault on the canvas for drop to fire — but we don't
  // touch the overlay here (handled by dragstart/dragend on the source tile and
  // window-level fallbacks below).
  viewport.addEventListener('dragover', (e) => { e.preventDefault(); });
  viewport.addEventListener('drop', onDrop);

  // Belt-and-braces: if anything cancels the drag (Esc, drop outside), make sure
  // the overlay disappears so the user is never stuck looking at it.
  window.addEventListener('dragend', hideOverlay);
  window.addEventListener('drop', hideOverlay);
  window.addEventListener('mouseup', hideOverlay);
  window.addEventListener('blur', hideOverlay);
}

function hideOverlay() {
  const o = document.getElementById('dropzone-overlay');
  if (o) o.hidden = true;
}

function showOverlay() {
  const o = document.getElementById('dropzone-overlay');
  if (o) o.hidden = false;
}

function makeTile(def, isHole) {
  const el = document.createElement('div');
  el.className = `shape-tile${isHole ? ' hole' : ''}`;
  el.draggable = true;
  el.dataset.kind = def.kind;
  el.dataset.label = def.label.toLowerCase();
  // Each primitive gets a hover-explanation describing what it makes and how
  // it behaves once spawned (drag into the viewport to place).
  el.classList.add('tip');
  el.dataset.tip = def.hint
    ? `${def.label} — ${def.hint} · Drag into the viewport to place.`
    : `${def.label} — drag into the viewport to place.`;
  el.innerHTML = `${def.icon}<span>${def.label}</span>`;
  el.addEventListener('dragstart', (e) => {
    _dragKind = def.kind;
    _dragIsHole = isHole;
    el.classList.add('dragging');
    // Replace the browser's default drag image (the whole tile with its
    // gradient + label) with a small lime ghost — feels cleaner and
    // doesn't drag a chunk of the sidebar around the screen.
    try {
      const ghost = document.createElement('div');
      ghost.className = 'drag-ghost';
      ghost.textContent = def.label;
      document.body.appendChild(ghost);
      e.dataTransfer.setDragImage(ghost, 24, 14);
      // Remove the ghost on the next frame — the browser snapshots it on
      // dragstart so it's safe to drop from the DOM right after.
      setTimeout(() => ghost.remove(), 0);
    } catch {}
    e.dataTransfer.setData('text/plain', def.kind);
    e.dataTransfer.effectAllowed = 'copy';
    showOverlay();
  });
  el.addEventListener('dragend', () => {
    el.classList.remove('dragging');
    hideOverlay();
    _dragKind = null;
  });
  el.addEventListener('click', () => {
    // Click-to-add: drop near where the camera is looking (orbit target) so
    // the shape lands inside the viewport rather than at the world origin.
    // Repeated clicks walk along +X until they hit a free spot, so we never
    // stack identical shapes on top of each other (the "lost cylinder" bug).
    const base = def.defaults.height ? def.defaults.height / 2 : (def.defaults.radius || 5);
    const target = state.controls?.target;
    let x = target?.x ?? 0;
    let y = target?.y ?? 0;
    const step = Math.max(state.snapStep || 0, 5);
    for (let tries = 0; tries < 40; tries++) {
      let occupied = false;
      for (const s of state.shapes.values()) {
        if (!s.mesh.visible) continue;
        if (Math.hypot(s.mesh.position.x - x, s.mesh.position.y - y) < step * 1.2) {
          occupied = true;
          break;
        }
      }
      if (!occupied) break;
      x += step * 2;
    }
    spawnAt({ x, y, z: 0 }, def.kind, isHole, base);
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
  hideOverlay();
  if (!_dragKind) return;
  const def = SHAPES.find(s => s.kind === _dragKind);
  const base = def?.defaults.height ? def.defaults.height / 2 : (def?.defaults.radius || 5);
  // Custom workplane (face-pick) takes precedence: the new shape lands on
  // that face's plane and orients itself with the face normal as Z-up.
  const override = projectSpawnOverride(_viewport, ev);
  if (override) {
    spawnOnOverride(override, _dragKind, _dragIsHole, base);
  } else {
    const p = projectToWorkplane(ev);
    spawnAt(p, _dragKind, _dragIsHole, base);
  }
  _dragKind = null;
}

function spawnOnOverride(override, kind, isHole, baseHalfHeight) {
  pushHistoryFn();
  const shape = new TinkerShape(kind, { isHole });
  shape.mesh.scale.set(1, 1, 1);
  // Place the shape at the picked point and rotate so its local +Z aligns
  // with the workplane normal. Push it outward by half its height so it sits
  // on the workplane rather than centred through it.
  shape.mesh.quaternion.copy(override.quaternion);
  const lift = baseHalfHeight ?? halfHeightFor(shape);
  const offset = new THREE.Vector3(0, 0, lift).applyQuaternion(override.quaternion);
  shape.mesh.position.copy(override.position).add(offset);
  state.scene.add(shape.mesh);
  selectShape(shape.id);
  return shape;
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
  // Capture pre-spawn state so undo can remove this new shape.
  pushHistoryFn();
  const shape = new TinkerShape(kind, { isHole });
  // Always start at world-axis aligned — the active camera angle must never
  // be baked into the new mesh's rotation.
  shape.mesh.rotation.set(0, 0, 0);
  shape.mesh.scale.set(1, 1, 1);
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
