// Tinkercad-style manipulators. While a shape is selected:
//
//   - 4 white squares at the top corners       → XY resize (one axis per axis)
//   - 4 white squares at top mid-edges         → single-axis resize (X or Y)
//   - 1 white square at top centre             → Z (height) resize
//   - 1 white cone above the top centre        → free Z movement (lift / drop)
//
// All squares respect the current snap step (Shift bypasses snap during the drag).
// Default behaviour is ASYMMETRIC: the face being dragged moves outward while the
// opposite face stays in world space. Hold Alt for SYMMETRIC (grow both sides at
// once around the centre).
//
// Resize works by writing to `mesh.scale`, not by rebuilding the geometry. This
// keeps radial shapes (cylinder, sphere, cone, …) able to stretch on a single
// axis (they become elliptical) instead of growing uniformly.

import * as THREE from 'three';
import { state } from './state.js';
import { beginTxn, endTxn } from './history.js';
import { requestRender, beginContinuousRender, endContinuousRender } from './scene.js';
import { showSnapMarker3D, hideSnapMarker } from './selection.js';

const SQUARE_COLOR = '#ffffff';
const SQUARE_BORDER = '#2a2f3e';

// Touch / pen / etc: coarse pointer means fingertip-sized hit targets. The
// sprites are NDC-sized (sizeAttenuation off) so this multiplier directly
// inflates the visible square. The CSS file mirrors this scale via a
// --handle-touch-scale custom property; that one only matters for any
// non-WebGL handle overlays.
const TOUCH_SCALE = (() => {
  try {
    if (window.matchMedia && window.matchMedia('(pointer: coarse)').matches) return 1.6;
  } catch {}
  return 1;
})();

let _group = null;
let _shapes = [];        // currently attached selection (1 or more)
let _dragSession = null;
let _dimPill = null;
let _canvas = null;

const TEX_CACHE = {};

export function initHandles(canvas) {
  _canvas = canvas;
  _group = new THREE.Group();
  _group.name = 'BBHandles';
  _group.renderOrder = 999;
  state.scene.add(_group);

  _dimPill = document.createElement('div');
  _dimPill.className = 'dim-pill';
  _dimPill.hidden = true;
  // type=text not type=number: corner-handle drags show a "WIDTH x HEIGHT"
  // string (two numbers + the multiplication symbol) which a number input
  // can't parse, the warning storm broke the console.
  _dimPill.innerHTML = `<input type="text" inputmode="decimal" autocomplete="off" /><span class="suffix">mm</span>`;
  document.body.appendChild(_dimPill);
  const input = _dimPill.querySelector('input');
  input.addEventListener('change', commitPillValue);
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { commitPillValue(); input.blur(); }
    if (e.key === 'Escape') { hidePill(); input.blur(); }
  });

  installPointerHandlers();
}

export function attachHandles(shapeOrShapes) {
  _shapes = Array.isArray(shapeOrShapes)
    ? shapeOrShapes.filter(Boolean)
    : (shapeOrShapes ? [shapeOrShapes] : []);
  rebuild();
}
export function detachHandles() { _shapes = []; clearGroup(); hidePill(); }
let _refreshSig = '';
export function refreshHandles() {
  if (!_shapes.length || _dragSession) return;
  // Only rebuild handles when the underlying selection actually moved /
  // scaled / rotated / changed visibility. Avoids the constant 20fps jitter
  // from rebuilding 20+ sprites every tick.
  const sig = _shapes.map(s => {
    const p = s.mesh.position, sc = s.mesh.scale, q = s.mesh.quaternion;
    return `${s.id}|${p.x.toFixed(4)},${p.y.toFixed(4)},${p.z.toFixed(4)}|${sc.x.toFixed(4)},${sc.y.toFixed(4)},${sc.z.toFixed(4)}|${q.x.toFixed(4)},${q.y.toFixed(4)},${q.z.toFixed(4)},${q.w.toFixed(4)}|${s.mesh.visible ? 1 : 0}`;
  }).join(';');
  if (sig === _refreshSig) return;
  _refreshSig = sig;
  rebuild();
}
export function invalidateHandlesSig() { _refreshSig = ''; }

function clearGroup() {
  for (const c of [..._group.children]) {
    if (c.material) c.material.dispose();
    _group.remove(c);
  }
}

function rebuild() {
  clearGroup();
  if (!_shapes.length) return;
  const bbox = computeCombinedBBox(_shapes);
  if (!bbox) return;
  const c = bbox.getCenter(new THREE.Vector3());
  const s = bbox.getSize(new THREE.Vector3());
  const half = s.clone().multiplyScalar(0.5);

  // Dashed selection wireframe around the bounding box (Tinkercad-style).
  addSelectionFrame(bbox);

  // Top corners — XY simultaneous resize
  for (const [sx, sy] of [[1, 1], [-1, 1], [-1, -1], [1, -1]]) {
    const pos = new THREE.Vector3(c.x + sx * half.x, c.y + sy * half.y, c.z + half.z);
    addSquare(pos, { kind: 'corner', sign: { X: sx, Y: sy, Z: 1 } });
  }
  // Bottom corners — also XY resize, anchored opposite
  for (const [sx, sy] of [[1, 1], [-1, 1], [-1, -1], [1, -1]]) {
    const pos = new THREE.Vector3(c.x + sx * half.x, c.y + sy * half.y, c.z - half.z);
    addSquare(pos, { kind: 'corner', sign: { X: sx, Y: sy, Z: -1 } });
  }
  // Top mid-edges — single axis resize
  addSquare(new THREE.Vector3(c.x + half.x, c.y, c.z + half.z), { kind: 'face', axis: 'X', sign: { X: 1, Y: 0, Z: 1 } });
  addSquare(new THREE.Vector3(c.x - half.x, c.y, c.z + half.z), { kind: 'face', axis: 'X', sign: { X: -1, Y: 0, Z: 1 } });
  addSquare(new THREE.Vector3(c.x, c.y + half.y, c.z + half.z), { kind: 'face', axis: 'Y', sign: { X: 0, Y: 1, Z: 1 } });
  addSquare(new THREE.Vector3(c.x, c.y - half.y, c.z + half.z), { kind: 'face', axis: 'Y', sign: { X: 0, Y: -1, Z: 1 } });
  // Top centre — Z resize
  addSquare(new THREE.Vector3(c.x, c.y, c.z + half.z), { kind: 'face', axis: 'Z', sign: { X: 0, Y: 0, Z: 1 } });

  // Z-move arrow floating above top centre
  const arrowPos = new THREE.Vector3(c.x, c.y, c.z + half.z);
  addArrow(arrowPos);

  // Rotation arcs — tiny partial-torus rings in the plane perpendicular to
  // each axis, sitting OUTSIDE the bbox so they never cover the geometry.
  const maxHalf = Math.max(half.x, half.y, half.z);
  const torusR = Math.min(4 + maxHalf * 0.12, 7);  // small, capped
  const off = 6; // gap from the bbox face
  addRotationArc('X', new THREE.Vector3(c.x + half.x + off + torusR, c.y, c.z), torusR);
  addRotationArc('Y', new THREE.Vector3(c.x, c.y + half.y + off + torusR, c.z), torusR);
  addRotationArc('Z', new THREE.Vector3(c.x, c.y, c.z + half.z + off + torusR), torusR);
}

function addRotationArc(axis, position, radius) {
  const tube = Math.max(0.25, radius * 0.10);
  const geom = new THREE.TorusGeometry(radius, tube, 6, 20, Math.PI / 2);
  const colour = axis === 'X' ? 0xff6e6e : axis === 'Y' ? 0x7cd859 : 0x5ca3ff;
  const mat = new THREE.MeshBasicMaterial({ color: colour, transparent: true, opacity: 0.85, depthTest: false });
  const mesh = new THREE.Mesh(geom, mat);
  mesh.renderOrder = 998;
  mesh.userData = { kind: 'rotate', axis };

  // TorusGeometry sits in the XY plane (rotation axis = Z). Rotate so the disk
  // lies in the plane perpendicular to `axis` (i.e. axis runs through the disk
  // normal, so dragging the arc visibly rotates around that axis).
  if (axis === 'X') mesh.rotation.set(0, Math.PI / 2, 0);
  else if (axis === 'Y') mesh.rotation.set(Math.PI / 2, 0, 0);
  // Z stays at default (XY plane, axis along Z)
  mesh.position.copy(position);

  // Add a thin guide line from the bbox face to the arc to clarify which
  // direction it spins around.
  _group.add(mesh);
}

function addSelectionFrame(bbox) {
  const min = bbox.min, max = bbox.max;
  const corners = [
    new THREE.Vector3(min.x, min.y, min.z), new THREE.Vector3(max.x, min.y, min.z),
    new THREE.Vector3(max.x, max.y, min.z), new THREE.Vector3(min.x, max.y, min.z),
    new THREE.Vector3(min.x, min.y, max.z), new THREE.Vector3(max.x, min.y, max.z),
    new THREE.Vector3(max.x, max.y, max.z), new THREE.Vector3(min.x, max.y, max.z),
  ];
  const edges = [
    [0, 1], [1, 2], [2, 3], [3, 0], // bottom
    [4, 5], [5, 6], [6, 7], [7, 4], // top
    [0, 4], [1, 5], [2, 6], [3, 7], // verticals
  ];
  const points = [];
  for (const [a, b] of edges) {
    points.push(corners[a].clone(), corners[b].clone());
  }
  const geom = new THREE.BufferGeometry().setFromPoints(points);
  const mat = new THREE.LineDashedMaterial({
    color: 0xc4f04f,
    transparent: true,
    opacity: 0.7,
    dashSize: 1.4,
    gapSize: 0.9,
    depthTest: false,
  });
  const lines = new THREE.LineSegments(geom, mat);
  lines.computeLineDistances();
  lines.renderOrder = 990;
  lines.userData = { decorative: true };
  // Disable raycasting on the wireframe so it never blocks handle picks.
  lines.raycast = () => {};
  _group.add(lines);
}

function addRotationIcon(pos, axis, color) {
  const sprite = makeSpriteFrom(rotationArrowTexture(color), 0.030);
  sprite.position.copy(pos);
  sprite.userData = { kind: 'rotate', axis };
  _group.add(sprite);
}

function rotationArrowTexture(color) {
  const key = `rot_${color}`;
  if (TEX_CACHE[key]) return TEX_CACHE[key];
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const ctx = c.getContext('2d');
  ctx.clearRect(0, 0, 64, 64);
  ctx.shadowColor = 'rgba(0,0,0,0.55)';
  ctx.shadowBlur = 4;
  ctx.strokeStyle = color;
  ctx.lineWidth = 5;
  ctx.lineCap = 'round';
  // 3/4 circle arc
  ctx.beginPath();
  ctx.arc(32, 32, 20, Math.PI * 0.15, Math.PI * 1.5);
  ctx.stroke();
  ctx.shadowBlur = 0;
  // Arrow tip
  ctx.fillStyle = color;
  ctx.beginPath();
  const tipX = 32 + Math.cos(Math.PI * 1.5) * 20;
  const tipY = 32 + Math.sin(Math.PI * 1.5) * 20;
  ctx.translate(tipX, tipY);
  ctx.rotate(Math.PI * 1.5 + Math.PI / 2);
  ctx.moveTo(0, -8);
  ctx.lineTo(7, 7);
  ctx.lineTo(-7, 7);
  ctx.closePath();
  ctx.fill();
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  TEX_CACHE[key] = tex;
  return tex;
}

function addSquare(pos, userData) {
  // Tinkercad convention: vertex corners are white, face mid-edges are dark.
  const tex = userData.kind === 'corner' ? squareTexture() : darkSquareTexture();
  const sprite = makeSpriteFrom(tex, 0.020);
  sprite.position.copy(pos);
  sprite.userData = userData;
  _group.add(sprite);
}

function addArrow(pos) {
  const sprite = makeSpriteFrom(arrowTexture(), 0.042);
  sprite.position.copy(pos);
  sprite.center = new THREE.Vector2(0.5, -0.4);
  sprite.userData = { kind: 'move-z' };
  _group.add(sprite);
}

function makeSpriteFrom(tex, size) {
  const mat = new THREE.SpriteMaterial({ map: tex, sizeAttenuation: false, depthTest: false, transparent: true });
  const sprite = new THREE.Sprite(mat);
  const s = size * TOUCH_SCALE;
  sprite.scale.set(s, s, 1);
  return sprite;
}

function squareTexture() {
  if (TEX_CACHE.square) return TEX_CACHE.square;
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const ctx = c.getContext('2d');
  ctx.clearRect(0, 0, 64, 64);
  ctx.shadowColor = 'rgba(0,0,0,0.55)';
  ctx.shadowBlur = 6;
  ctx.fillStyle = SQUARE_BORDER;
  roundedRect(ctx, 6, 6, 52, 52, 6); ctx.fill();
  ctx.shadowBlur = 0;
  ctx.fillStyle = SQUARE_COLOR;
  roundedRect(ctx, 10, 10, 44, 44, 4); ctx.fill();
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  TEX_CACHE.square = tex;
  return tex;
}

function darkSquareTexture() {
  if (TEX_CACHE.darkSquare) return TEX_CACHE.darkSquare;
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const ctx = c.getContext('2d');
  ctx.clearRect(0, 0, 64, 64);
  ctx.shadowColor = 'rgba(0,0,0,0.55)';
  ctx.shadowBlur = 6;
  ctx.fillStyle = '#ffffff';
  roundedRect(ctx, 6, 6, 52, 52, 6); ctx.fill();
  ctx.shadowBlur = 0;
  ctx.fillStyle = '#1a1f2b';
  roundedRect(ctx, 10, 10, 44, 44, 4); ctx.fill();
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  TEX_CACHE.darkSquare = tex;
  return tex;
}

function arrowTexture() {
  if (TEX_CACHE.arrow) return TEX_CACHE.arrow;
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const ctx = c.getContext('2d');
  ctx.clearRect(0, 0, 64, 64);
  ctx.shadowColor = 'rgba(0,0,0,0.55)';
  ctx.shadowBlur = 6;
  // Plump up-arrow
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.moveTo(32, 6); ctx.lineTo(56, 32);
  ctx.lineTo(42, 32); ctx.lineTo(42, 58);
  ctx.lineTo(22, 58); ctx.lineTo(22, 32);
  ctx.lineTo(8, 32); ctx.closePath();
  ctx.fill();
  ctx.shadowBlur = 0;
  ctx.lineWidth = 2;
  ctx.strokeStyle = SQUARE_BORDER;
  ctx.stroke();
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  TEX_CACHE.arrow = tex;
  return tex;
}

function roundedRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function computeWorldBBox(mesh) {
  mesh.updateMatrixWorld(true);
  const bb = new THREE.Box3().setFromObject(mesh);
  return bb.isEmpty() ? null : bb;
}

function computeCombinedBBox(shapes) {
  const bb = new THREE.Box3();
  for (const s of shapes) {
    s.mesh.updateMatrixWorld(true);
    bb.expandByObject(s.mesh);
  }
  return bb.isEmpty() ? null : bb;
}

// ---- pointer ----

const _ndc = new THREE.Vector2();
const _raycaster = new THREE.Raycaster();

function installPointerHandlers() {
  _canvas.addEventListener('pointerdown', onPointerDown, true);
  _canvas.addEventListener('pointermove', onPointerMove, true);
  _canvas.addEventListener('pointerup', onPointerUp, true);
}

function setNdc(ev) {
  const rect = _canvas.getBoundingClientRect();
  _ndc.set(
    ((ev.clientX - rect.left) / rect.width) * 2 - 1,
    -((ev.clientY - rect.top) / rect.height) * 2 + 1,
  );
}

function pickHandle(ev) {
  setNdc(ev);
  _raycaster.setFromCamera(_ndc, state.camera);
  // Only consider real handles — the dashed selection frame has no userData.kind
  // and must never swallow the click.
  const pickable = _group.children.filter(c => c.userData && c.userData.kind);
  const hits = _raycaster.intersectObjects(pickable, false);
  return hits[0]?.object || null;
}

function onPointerDown(ev) {
  if (ev.button !== 0 || !_shapes.length) return;
  const handle = pickHandle(ev);
  if (!handle) return;
  ev.stopPropagation();
  ev.preventDefault();

  const data = handle.userData;
  const bbox = computeCombinedBBox(_shapes);
  const centre = bbox.getCenter(new THREE.Vector3());
  const size = bbox.getSize(new THREE.Vector3());

  beginTxn();
  beginContinuousRender();
  if (data.kind === 'rotate') {
    startRotationDrag(ev, handle, data, centre);
  } else {
    _dragSession = {
      handle,
      kind: data.kind,
      axis: data.axis,
      sign: data.sign || { X: 0, Y: 0, Z: 1 },
      startScreen: new THREE.Vector2(ev.clientX, ev.clientY),
      startSize: { X: size.x, Y: size.y, Z: size.z },
      startCentre: centre.clone(),
      // Per-shape initial state so transforms can be reapplied incrementally.
      initShapes: _shapes.map(s => ({
        shape: s,
        pos: s.mesh.position.clone(),
        scale: s.mesh.scale.clone(),
      })),
      // Cache neighbour AABBs once for feature-snap. setFromObject inside
      // each pointermove was 3-5 ms on a 50-shape scene; computing here means
      // a one-time hit at drag start (shapes don't transform mid-drag except
      // for the selection itself, which is excluded by id).
      neighbourBoxes: (() => {
        const selSet = new Set(_shapes.map(s => s.id));
        const out = [];
        const tmp = new THREE.Box3();
        for (const s of state.shapes.values()) {
          if (selSet.has(s.id) || !s.mesh || !s.mesh.visible || !s.mesh.parent) continue;
          tmp.setFromObject(s.mesh);
          if (!Number.isFinite(tmp.min.x)) continue;
          out.push({ min: tmp.min.clone(), max: tmp.max.clone() });
        }
        return out;
      })(),
    };
    showPillAt(handle, currentDimForHandle(_dragSession));
  }

  state.controls.enabled = false;
  document.body.style.cursor = cursorFor(data);
  _canvas.setPointerCapture(ev.pointerId);
}

function startRotationDrag(ev, handle, data, centre) {
  const axisVec = axisVector(data.axis);
  const plane = new THREE.Plane(axisVec, -axisVec.dot(centre));
  const hitPoint = pointerOnPlane(ev, plane);
  if (!hitPoint) return;
  const startVec = hitPoint.sub(centre);
  startVec.projectOnPlane(axisVec).normalize();
  _dragSession = {
    handle,
    kind: 'rotate',
    axis: data.axis,
    axisVec,
    plane,
    centre,
    startVec,
    initShapes: _shapes.map(s => ({
      shape: s,
      pos: s.mesh.position.clone(),
      quat: s.mesh.quaternion.clone(),
    })),
  };
  showPillAt(handle, '0.0', '°');
}

function axisVector(axis) {
  if (axis === 'X') return new THREE.Vector3(1, 0, 0);
  if (axis === 'Y') return new THREE.Vector3(0, 1, 0);
  return new THREE.Vector3(0, 0, 1);
}

function pointerOnPlane(ev, plane) {
  setNdc(ev);
  _raycaster.setFromCamera(_ndc, state.camera);
  const out = new THREE.Vector3();
  return _raycaster.ray.intersectPlane(plane, out) ? out : null;
}

function onPointerMove(ev) {
  if (!_dragSession) return;
  ev.stopPropagation();
  ev.preventDefault();

  if (_dragSession.kind === 'rotate') {
    handleRotationDrag(ev);
    return;
  }

  const dxPx = ev.clientX - _dragSession.startScreen.x;
  const dyPx = ev.clientY - _dragSession.startScreen.y;
  const uniform = ev.shiftKey;         // Shift = uniform / proportional whole-shape resize
  const symmetric = ev.altKey;         // Alt = grow from centre (both sides)
  const snapping = state.snapStep > 0 && !ev.ctrlKey; // Ctrl bypasses snap
  const { kind, axis, sign } = _dragSession;

  if (kind === 'move-z') {
    let dz = worldDeltaForScreen(dxPx, dyPx, new THREE.Vector3(0, 0, 1), _dragSession.handle.position);
    if (snapping && state.snapStep > 0) dz = Math.round(dz / state.snapStep) * state.snapStep;
    for (const init of _dragSession.initShapes) {
      init.shape.mesh.position.z = init.pos.z + dz;
    }
    rebuild();
    setPillValue(dz.toFixed(2) + ' Δ');
    updatePillPosition();
    return;
  }

  if (kind === 'face') {
    const dirWorld = new THREE.Vector3(
      axis === 'X' ? sign.X : 0,
      axis === 'Y' ? sign.Y : 0,
      axis === 'Z' ? sign.Z : 0,
    );
    let dWorld = worldDeltaForScreen(dxPx, dyPx, dirWorld, _dragSession.handle.position);
    if (uniform) {
      const start = _dragSession.startSize[axis];
      const ratio = Math.max(0.01, (start + dWorld) / start);
      applyGroupResize('X', _dragSession.startSize.X * (ratio - 1), snapping, symmetric);
      applyGroupResize('Y', _dragSession.startSize.Y * (ratio - 1), snapping, symmetric);
      applyGroupResize('Z', _dragSession.startSize.Z * (ratio - 1), snapping, symmetric);
    } else {
      // Feature snap: if the moving face is about to land within tolerance
      // of a neighbour shape's bounding-box face / centre / world origin,
      // pull it onto that target exactly. Only fires when global snap is on
      // (state.snapStep > 0) and Ctrl isn't held. Symmetric drags skip it
      // because both faces move and the snap target is ambiguous.
      if (snapping && !symmetric) {
        dWorld = snapFaceMoveToFeature(axis, dWorld, _dragSession);
      }
      applyGroupResize(axis, dWorld, snapping, symmetric);
    }
  } else if (kind === 'corner') {
    const dirX = new THREE.Vector3(sign.X, 0, 0);
    const dirY = new THREE.Vector3(0, sign.Y, 0);
    const dX = worldDeltaForScreen(dxPx, dyPx, dirX, _dragSession.handle.position);
    const dY = worldDeltaForScreen(dxPx, dyPx, dirY, _dragSession.handle.position);
    if (uniform) {
      const rX = (_dragSession.startSize.X + dX) / _dragSession.startSize.X;
      const rY = (_dragSession.startSize.Y + dY) / _dragSession.startSize.Y;
      const ratio = Math.max(0.01, Math.abs(rX - 1) > Math.abs(rY - 1) ? rX : rY);
      applyGroupResize('X', _dragSession.startSize.X * (ratio - 1), snapping, symmetric);
      applyGroupResize('Y', _dragSession.startSize.Y * (ratio - 1), snapping, symmetric);
      applyGroupResize('Z', _dragSession.startSize.Z * (ratio - 1), snapping, symmetric);
    } else {
      applyGroupResize('X', dX, snapping, symmetric);
      applyGroupResize('Y', dY, snapping, symmetric);
    }
  }

  rebuild();
  setPillValue(currentDimForHandle(_dragSession));
  updatePillPosition();
}

/**
 * Pull the moving face onto a neighbour feature plane (AABB min / mid / max
 * of any non-selected visible shape, or the world origin) if the predicted
 * new face position is within tolerance. Returns the adjusted dWorld.
 *
 * Why: lets the user resize a shape until its edge lines up with another
 * shape's edge without needing to enter a number. Same body-drag-snap idea,
 * extended to the resize handles. Tolerance scales with current size so it
 * works at any zoom level.
 */
function snapFaceMoveToFeature(axis, dWorld, sess) {
  const ax = axis.toLowerCase();
  const startSize = sess.startSize[axis];
  const newSize = startSize + dWorld;
  if (newSize <= 0.1) return dWorld;
  const sgn = sess.sign[axis] ?? 0;
  if (sgn === 0) return dWorld;

  const startCentreAx = sess.startCentre[ax] ?? 0;
  const movingFacePos = startCentreAx + sgn * newSize / 2;

  const boxes = sess.neighbourBoxes || [];
  const targets = [];
  for (const b of boxes) {
    targets.push(b.min[ax]);
    targets.push((b.min[ax] + b.max[ax]) / 2);
    targets.push(b.max[ax]);
  }
  // Reference geometry contributes coordinates on the dragged axis too.
  // A MIDPOINT contributes one coord; an AXIS_EDGE contributes its endpoints
  // and midpoint coord; a PLANE_3P contributes the coords of its 3 defining
  // points (so dragging a face onto a plane snaps to whichever defining
  // point's axial coord is closest, which is usually the one on the plane
  // when the plane is axis-aligned).
  for (const rg of (state.refGeoms?.values?.() ?? [])) {
    if (!rg.visible) continue;
    if (rg.kind === 'MIDPOINT') {
      targets.push(rg.data.point[ax]);
    } else if (rg.kind === 'AXIS_EDGE') {
      targets.push(rg.data.from[ax]);
      targets.push(rg.data.to[ax]);
      targets.push((rg.data.from[ax] + rg.data.to[ax]) / 2);
    } else if (rg.kind === 'PLANE_3P') {
      for (const p of rg.data.points) targets.push(p[ax]);
    }
  }
  targets.push(0); // world origin on this axis

  const tol = Math.max(0.5, startSize * 0.02);
  let best = null;
  let bestDist = Infinity;
  for (const t of targets) {
    const d = Math.abs(t - movingFacePos);
    if (d < tol && d < bestDist) { best = t; bestDist = d; }
  }
  if (best === null) { hideSnapMarker(); return dWorld; }

  const snappedNewSize = 2 * sgn * (best - startCentreAx);
  if (snappedNewSize <= 0.1) { hideSnapMarker(); return dWorld; }
  // Lime ring marker at the snap point so the user sees what aligned. Project
  // the moving face's centre onto the snap plane (axis = best, other axes
  // come from startCentre to keep the marker near the selection).
  const marker = sess.startCentre.clone();
  marker[ax] = best;
  showSnapMarker3D(marker);
  return snappedNewSize - startSize;
}

/**
 * Scale the WHOLE selection along one axis. Each shape's position relative to
 * the combined centre scales proportionally; each shape's mesh.scale on that
 * axis also scales. Asymmetric default: opposite face stays in world space.
 */
function applyGroupResize(axis, dWorld, snapping, symmetric) {
  let d = dWorld;
  const step = snapping && state.snapStep > 0 ? state.snapStep : 0;
  if (step > 0) d = Math.round(d / step) * step;

  const sess = _dragSession;
  const ax = axis.toLowerCase();
  const oldSize = sess.startSize[axis];
  const newSize = Math.max(0.1, oldSize + d);
  const ratio = newSize / oldSize;
  const sgn = sess.sign[axis] ?? 0;
  const centreShift = symmetric ? 0 : sgn * (newSize - oldSize) / 2;
  const c0 = sess.startCentre[ax];

  for (const init of sess.initShapes) {
    const rel = init.pos[ax] - c0;
    init.shape.mesh.position[ax] = c0 + rel * ratio + centreShift;
    init.shape.mesh.scale[ax] = init.scale[ax] * ratio;
  }
}

function onPointerUp(ev) {
  if (!_dragSession) return;
  ev.stopPropagation();
  state.controls.enabled = true;
  document.body.style.cursor = '';
  try { _canvas.releasePointerCapture(ev.pointerId); } catch {}
  _dragSession = null;
  hidePill();
  hideSnapMarker();
  rebuild(); // re-position handles after rotation/transform
  endTxn();
  endContinuousRender();
}

function handleRotationDrag(ev) {
  const { axisVec, plane, centre, startVec, initShapes } = _dragSession;
  const hit = pointerOnPlane(ev, plane);
  if (!hit) return;
  const currentVec = hit.sub(centre).projectOnPlane(axisVec).normalize();
  const cross = new THREE.Vector3().crossVectors(startVec, currentVec);
  const sign = Math.sign(cross.dot(axisVec)) || 1;
  let angle = Math.acos(THREE.MathUtils.clamp(startVec.dot(currentVec), -1, 1)) * sign;

  // Rotation snap = 0.1° by default (fine-grained). Hold Ctrl to bypass
  // even that and rotate at full pointer precision; hold Shift for the
  // classic 15° coarse increments when you want clean right angles.
  if (!ev.ctrlKey) {
    const stepDeg = ev.shiftKey ? 15 : 0.1;
    const step = THREE.MathUtils.degToRad(stepDeg);
    angle = Math.round(angle / step) * step;
  }

  const q = new THREE.Quaternion().setFromAxisAngle(axisVec, angle);
  for (const it of initShapes) {
    const relPos = it.pos.clone().sub(centre);
    relPos.applyQuaternion(q);
    it.shape.mesh.position.copy(centre).add(relPos);
    it.shape.mesh.quaternion.copy(it.quat).premultiply(q);
  }

  const deg = THREE.MathUtils.radToDeg(angle);
  setPillValue(deg.toFixed(1));
  const suffixEl = _dimPill.querySelector('.suffix');
  if (suffixEl) suffixEl.textContent = '°';
  updatePillPosition();
}

/** Screen-pixel delta → world delta along `worldDir` at `origin`. */
function worldDeltaForScreen(dxPx, dyPx, worldDir, origin) {
  const screenDir = screenDirAt(worldDir, origin);
  const ppmm = screenDir.length();
  if (ppmm < 0.001) return 0;
  const norm = screenDir.clone().multiplyScalar(1 / ppmm);
  return (dxPx * norm.x + dyPx * norm.y) / ppmm;
}

/** Pixel-space displacement (y points DOWN) for a unit step of `worldDir` at `origin`. */
function screenDirAt(worldDir, origin) {
  const rect = _canvas.getBoundingClientRect();
  const a = origin.clone().project(state.camera);
  const b = origin.clone().add(worldDir).project(state.camera);
  return new THREE.Vector2(
    (b.x - a.x) * rect.width / 2,
    -(b.y - a.y) * rect.height / 2,
  );
}

// ---- pill ----

function cursorFor({ kind, axis }) {
  if (kind === 'rotate') return 'grab';
  if (kind === 'move-z') return 'ns-resize';
  if (kind === 'corner') return 'nwse-resize';
  if (axis === 'X' || axis === 'Y') return 'ew-resize';
  if (axis === 'Z') return 'ns-resize';
  return 'grab';
}

function showPillAt(handle, value, unit) {
  _dimPill.hidden = false;
  // Pick the unit suffix: ° for rotation, the project's base unit otherwise.
  const suffixEl = _dimPill.querySelector('.suffix');
  if (suffixEl) {
    const session = _dragSession;
    if (unit !== undefined) suffixEl.textContent = unit;
    else if (session?.kind === 'rotate') suffixEl.textContent = '°';
    else if (session?.kind === 'move-z') suffixEl.textContent = `Δ ${state.unit}`;
    else suffixEl.textContent = state.unit;
  }
  setPillValue(value);
  updatePillPosition();
}

function setPillValue(v) {
  const inp = _dimPill.querySelector('input');
  if (document.activeElement !== inp) inp.value = (typeof v === 'number') ? v.toFixed(2) : v;
}

function updatePillPosition() {
  if (!_dragSession) return;
  const v = _dragSession.handle.position.clone().project(state.camera);
  const rect = _canvas.getBoundingClientRect();
  const sx = (v.x + 1) / 2 * rect.width + rect.left;
  const sy = -(v.y - 1) / 2 * rect.height + rect.top;
  _dimPill.style.left = `${sx + 18}px`;
  _dimPill.style.top = `${sy - 16}px`;
}

function hidePill() { _dimPill.hidden = true; }

function currentDimForHandle(session) {
  if (session.kind === 'rotate') return '0.0°';
  if (session.kind === 'move-z') return '0.00 Δ';
  if (!session.startSize) return '';
  if (session.kind === 'corner') return `${session.startSize.X.toFixed(2)} × ${session.startSize.Y.toFixed(2)}`;
  return session.startSize[session.axis].toFixed(2);
}

function commitPillValue() {
  if (!_dragSession) return;
  const v = parseFloat(_dimPill.querySelector('input').value);
  if (!Number.isFinite(v) || v <= 0) return;
  const { kind, axis } = _dragSession;
  if (kind === 'rotate' || kind === 'corner' || kind === 'move-z') return;
  const start = _dragSession.startSize[axis];
  const d = v - start;
  applyGroupResize(axis, d, true, false);
  rebuild();
}
