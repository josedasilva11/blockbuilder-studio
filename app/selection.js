// Selection + hover + body-drag-to-move. Click on a shape selects it; on the
// same gesture, dragging the shape body slides it along the workplane (Tinkercad
// style). Shift+click adds to a multi-selection set. Snap respects state.snapStep.

import * as THREE from 'three';
import { state, setSelected } from './state.js';
import { beginTxn, endTxn } from './history.js';
import { requestRender, beginContinuousRender, endContinuousRender } from './scene.js';
import { isWorkplanePickActive } from './workplane.js';
import { isRulerActive } from './ruler.js';
import { isSketchActive } from './sketch.js';

// Modal tools (workplane pick, ruler, sketch) take exclusive ownership of
// the canvas while active. Selection / body-drag / marquee bail when any of
// them is in flight so the tool's pointer handler can do its job uncontested.
function modalToolActive() {
  return isWorkplanePickActive() || isRulerActive() || isSketchActive();
}

const _selectionListeners = new Set();
const _multiSelected = new Set();
let _hoveredId = null;

const _ndc = new THREE.Vector2();
const _raycaster = new THREE.Raycaster();
const _workplane = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0);
const _hit = new THREE.Vector3();
// Reusable mesh list for raycast picking. Refilled per pick with .length=0
// + push so we don't allocate a fresh array on every pointermove.
const _pickMeshes = [];

// World-space AABB cache. The vanilla path (Box3.setFromObject) is reasonably
// fast once geometry.boundingBox is computed, but it still walks 8 corners +
// matrixWorld + union per shape per call. With dozens of shapes in the scene
// and per-drag/per-marquee queries, this adds up. We cache by a transform
// signature so each shape only pays the work when something actually changed.
//
// Key: shape.id. Value: { sig, min: Vec3, max: Vec3 }. Stale entries from
// disposed shapes are harmless (id never reused) and tiny; not worth wiring
// an explicit eviction path.
const _worldBboxCache = new Map();
const _tmpBoxOut = new THREE.Box3();

function shapeXformSig(s) {
  const p = s.mesh.position, r = s.mesh.rotation, sc = s.mesh.scale;
  const geomId = s.mesh.geometry && s.mesh.geometry.uuid;
  return `${p.x},${p.y},${p.z}|${r.x},${r.y},${r.z}|${sc.x},${sc.y},${sc.z}|${geomId}`;
}

function getWorldBbox(s, out) {
  out = out || _tmpBoxOut;
  const sig = shapeXformSig(s);
  const cached = _worldBboxCache.get(s.id);
  if (cached && cached.sig === sig) {
    out.min.copy(cached.min);
    out.max.copy(cached.max);
    return out;
  }
  s.mesh.updateMatrixWorld(true);
  const geom = s.mesh.geometry;
  if (geom && geom.boundingBox === null) geom.computeBoundingBox();
  if (geom && geom.boundingBox) {
    out.copy(geom.boundingBox).applyMatrix4(s.mesh.matrixWorld);
  } else {
    out.setFromObject(s.mesh);
  }
  _worldBboxCache.set(s.id, { sig, min: out.min.clone(), max: out.max.clone() });
  return out;
}

// Body-drag state
let _bodyDrag = null; // { shape, offsetXY: Vector2, origZ, dragged: bool }
const DRAG_THRESHOLD = 3; // pixels before we count as a drag (vs click-only)

// Visual marker shown when body-drag is snapped to a corner / edge midpoint
// / centre of another shape. HTML overlay positioned via world-to-screen so
// it floats over the viewport without touching three.js scene state.
let _snapMarkerEl = null;
function getSnapMarker() {
  if (_snapMarkerEl) return _snapMarkerEl;
  _snapMarkerEl = document.createElement('div');
  _snapMarkerEl.id = 'snap-marker';
  _snapMarkerEl.style.cssText = [
    'position:fixed',
    'width:16px', 'height:16px',
    'border:2px solid #c4f04f',
    'border-radius:50%',
    'background:rgba(196,240,79,0.18)',
    'box-shadow:0 0 8px rgba(196,240,79,0.55)',
    'transform:translate(-50%,-50%)',
    'pointer-events:none',
    'z-index:50',
    'display:none',
  ].join(';');
  document.body.appendChild(_snapMarkerEl);
  return _snapMarkerEl;
}
function showSnapMarker(worldPos2D) {
  const el = getSnapMarker();
  if (!worldPos2D || !state.camera || !state.renderer) {
    el.style.display = 'none';
    return;
  }
  // Place at workplane Z=0 (body-drag operates on the workplane).
  const v = new THREE.Vector3(worldPos2D.x, worldPos2D.y, 0).project(state.camera);
  if (v.z >= 1) { el.style.display = 'none'; return; }
  const rect = state.renderer.domElement.getBoundingClientRect();
  el.style.left = ((v.x * 0.5 + 0.5) * rect.width + rect.left) + 'px';
  el.style.top  = ((-v.y * 0.5 + 0.5) * rect.height + rect.top) + 'px';
  el.style.display = 'block';
}
export function hideSnapMarker() {
  if (_snapMarkerEl) _snapMarkerEl.style.display = 'none';
}

// Public variant that takes a full world-space Vector3 (handles.js uses this
// during resize snap, where the snap point is not constrained to Z=0).
export function showSnapMarker3D(worldVec3) {
  const el = getSnapMarker();
  if (!worldVec3 || !state.camera || !state.renderer) { el.style.display = 'none'; return; }
  const v = worldVec3.clone().project(state.camera);
  if (v.z >= 1) { el.style.display = 'none'; return; }
  const rect = state.renderer.domElement.getBoundingClientRect();
  el.style.left = ((v.x * 0.5 + 0.5) * rect.width + rect.left) + 'px';
  el.style.top  = ((-v.y * 0.5 + 0.5) * rect.height + rect.top) + 'px';
  el.style.display = 'block';
}

export function onSelectionChange(fn) {
  _selectionListeners.add(fn);
  return () => _selectionListeners.delete(fn);
}

export function selectShape(id, { additive = false, toggle = false } = {}) {
  if (toggle && id && _multiSelected.has(id)) {
    _multiSelected.delete(id);
    setSelected(_multiSelected.size > 0 ? [..._multiSelected].pop() : null);
  } else {
    if (!additive && !toggle) {
      for (const sid of _multiSelected) clearEmissive(state.shapes.get(sid));
      _multiSelected.clear();
    }
    if (id) {
      _multiSelected.add(id);
      setSelected(id);
    } else {
      setSelected(null);
    }
  }
  applyEmissives();
  notifySelection();
}

function notifySelection() {
  const shapes = [..._multiSelected].map(id => state.shapes.get(id)).filter(Boolean);
  for (const fn of _selectionListeners) fn(shapes.length === 1 ? shapes[0] : null, shapes);
}

export function getMultiSelection() {
  return [..._multiSelected];
}

function applyEmissives() {
  for (const s of state.shapes.values()) clearEmissive(s);
  for (const id of _multiSelected) {
    const s = state.shapes.get(id);
    if (s) setEmissive(s, 0x6da81f, 0.22);
  }
  if (_hoveredId && !_multiSelected.has(_hoveredId)) {
    const h = state.shapes.get(_hoveredId);
    if (h) setEmissive(h, 0x6da81f, 0.07);
  }
  requestRender();
}

function setEmissive(shape, hex, intensity) {
  const mat = shape.mesh.material;
  if (!mat || !('emissive' in mat)) return;
  mat.emissive.setHex(hex);
  mat.emissiveIntensity = intensity;
}

function clearEmissive(shape) {
  if (!shape) return;
  const mat = shape.mesh.material;
  if (!mat || !('emissive' in mat)) return;
  // Early-out: applyEmissives() in the loop clears every shape every time the
  // hover or selection changes. Most shapes are already cleared, no point
  // rewriting the same zero again.
  if (mat.emissiveIntensity === 0 && mat.emissive.getHex() === 0) return;
  mat.emissive.setHex(0x000000);
  mat.emissiveIntensity = 0;
}

function setNdc(canvas, ev) {
  const rect = canvas.getBoundingClientRect();
  _ndc.set(
    ((ev.clientX - rect.left) / rect.width) * 2 - 1,
    -((ev.clientY - rect.top) / rect.height) * 2 + 1,
  );
}

function pickShape(canvas, ev) {
  setNdc(canvas, ev);
  _raycaster.setFromCamera(_ndc, state.camera);
  // Reuse the module-level array to avoid per-pointermove allocation.
  _pickMeshes.length = 0;
  // Locked shapes are skipped so the cursor / marquee never selects them.
  // They stay visible and rendered; lock just makes them non-interactive.
  for (const s of state.shapes.values()) {
    if (s.locked) continue;
    if (s.mesh.parent && s.mesh.visible) _pickMeshes.push(s.mesh);
  }
  return _raycaster.intersectObjects(_pickMeshes, false);
}

function projectToWorkplane(canvas, ev) {
  setNdc(canvas, ev);
  _raycaster.setFromCamera(_ndc, state.camera);
  _raycaster.ray.intersectPlane(_workplane, _hit);
  return _hit;
}

let _marquee = null;

function ensureMarqueeEl() {
  let el = document.getElementById('marquee-rect');
  if (!el) {
    el = document.createElement('div');
    el.id = 'marquee-rect';
    el.className = 'marquee-rect';
    el.hidden = true;
    document.body.appendChild(el);
  }
  return el;
}

export function installPickHandler(canvas) {
  canvas.addEventListener('pointerdown', (ev) => {
    if (ev.button !== 0) return;
    if (state.transformControls?.dragging) return;
    if (modalToolActive()) return;  // workplane / ruler / sketch own the click
    const hits = pickShape(canvas, ev);
    if (hits.length > 0) {
      const shape = hits[0].object.userData.tinkerShape;
      // If the clicked shape is already in the selection and the user is not
      // adding/toggling, KEEP the multi-selection so body-drag moves the group.
      const inMulti = _multiSelected.has(shape.id);
      if (!inMulti || ev.shiftKey || ev.ctrlKey || ev.metaKey) {
        selectShape(shape.id, {
          additive: ev.shiftKey,
          toggle: ev.ctrlKey || ev.metaKey,
        });
      }
      const cursorWorld = projectToWorkplane(canvas, ev).clone();
      const groupShapes = [..._multiSelected].map(id => state.shapes.get(id)).filter(Boolean);
      // Snap targets — XY corners of every visible non-selected shape's bbox.
      // Pre-compute once at drag start so each pointermove is a flat array scan.
      const selectedIds = new Set(groupShapes.map(s => s.id));
      const snapTargets = [];
      const _bbScratch = new THREE.Box3();
      for (const s of state.shapes.values()) {
        if (selectedIds.has(s.id) || !s.mesh.visible) continue;
        // Use the cached world AABB instead of Box3.setFromObject. First call
        // per shape computes + caches local bounding box on the geometry;
        // subsequent calls with the same transform return in O(1).
        const bb = getWorldBbox(s, _bbScratch);
        if (bb.isEmpty()) continue;
        const mx = (bb.min.x + bb.max.x) / 2;
        const my = (bb.min.y + bb.max.y) / 2;
        // 4 top-down corners + 4 edge midpoints + bbox centre = 9 anchors per
        // shape. The midpoints make centring a shape against another's edge
        // (e.g., a screw hole on the midline of a bracket) one drag away.
        snapTargets.push(
          new THREE.Vector2(bb.min.x, bb.min.y),  // corners
          new THREE.Vector2(bb.max.x, bb.min.y),
          new THREE.Vector2(bb.min.x, bb.max.y),
          new THREE.Vector2(bb.max.x, bb.max.y),
          new THREE.Vector2(mx, bb.min.y),        // edge midpoints
          new THREE.Vector2(mx, bb.max.y),
          new THREE.Vector2(bb.min.x, my),
          new THREE.Vector2(bb.max.x, my),
          new THREE.Vector2(mx, my),              // centre
        );
      }
      // Reference geometry contributes snap targets too. We project each ref's
      // anchor points down to the workplane (Z = 0) so body-drag (which is a
      // 2D operation in XY) can hit them. Refs that don't intersect the
      // workplane meaningfully still contribute a projection; the user can
      // see the result and decide if it's what they wanted.
      for (const rg of state.refGeoms.values()) {
        if (!rg.visible) continue;
        if (rg.kind === 'MIDPOINT') {
          const p = rg.data.point;
          snapTargets.push(new THREE.Vector2(p.x, p.y));
        } else if (rg.kind === 'AXIS_EDGE') {
          // Endpoints + midpoint.
          const a = rg.data.from, b = rg.data.to;
          snapTargets.push(new THREE.Vector2(a.x, a.y));
          snapTargets.push(new THREE.Vector2(b.x, b.y));
          snapTargets.push(new THREE.Vector2((a.x + b.x) / 2, (a.y + b.y) / 2));
        } else if (rg.kind === 'PLANE_3P') {
          // Three defining points + centroid.
          const [p1, p2, p3] = rg.data.points;
          snapTargets.push(new THREE.Vector2(p1.x, p1.y));
          snapTargets.push(new THREE.Vector2(p2.x, p2.y));
          snapTargets.push(new THREE.Vector2(p3.x, p3.y));
          snapTargets.push(new THREE.Vector2(
            (p1.x + p2.x + p3.x) / 3,
            (p1.y + p2.y + p3.y) / 3,
          ));
        }
      }
      _bodyDrag = {
        shapes: groupShapes,
        initPositions: groupShapes.map(s => s.mesh.position.clone()),
        cursorStart: cursorWorld.clone(),
        startScreen: new THREE.Vector2(ev.clientX, ev.clientY),
        dragged: false,
        snapTargets,
      };
      canvas.setPointerCapture(ev.pointerId);
    } else {
      // Empty space — start a marquee selection
      if (!ev.shiftKey) selectShape(null);
      _marquee = {
        startX: ev.clientX,
        startY: ev.clientY,
        x: ev.clientX, y: ev.clientY,
        additive: ev.shiftKey,
        active: false,
      };
      canvas.setPointerCapture(ev.pointerId);
    }
  });

  canvas.addEventListener('pointermove', (ev) => {
    if (modalToolActive()) return;  // tool owns hover/move too
    if (_marquee) {
      const moved = Math.hypot(ev.clientX - _marquee.startX, ev.clientY - _marquee.startY);
      if (!_marquee.active && moved < DRAG_THRESHOLD) return;
      if (!_marquee.active) {
        _marquee.active = true;
        state.controls.enabled = false;
      }
      _marquee.x = ev.clientX;
      _marquee.y = ev.clientY;
      updateMarqueeRect();
      return;
    }
    if (_bodyDrag) {
      const movedPx = Math.hypot(ev.clientX - _bodyDrag.startScreen.x, ev.clientY - _bodyDrag.startScreen.y);
      if (!_bodyDrag.dragged && movedPx < DRAG_THRESHOLD) return;
      if (!_bodyDrag.dragged) {
        _bodyDrag.dragged = true;
        state.controls.enabled = false;
        document.body.style.cursor = 'grabbing';
        beginTxn(); // captures pre-drag state for undo
        beginContinuousRender();
      }
      const cw = projectToWorkplane(canvas, ev);
      let dx = cw.x - _bodyDrag.cursorStart.x;
      let dy = cw.y - _bodyDrag.cursorStart.y;
      if (state.snapStep > 0 && !ev.ctrlKey) {
        dx = Math.round(dx / state.snapStep) * state.snapStep;
        dy = Math.round(dy / state.snapStep) * state.snapStep;
      }
      // Snap-to-corner: if the *primary* shape's projected reference point is
      // close to a pre-computed snap target, slide the whole drag delta so it
      // lands exactly on that target. Hold Ctrl to bypass.
      let activeSnap = null;
      if (!ev.ctrlKey && _bodyDrag.snapTargets.length) {
        const primary = _bodyDrag.shapes[0];
        const primInit = _bodyDrag.initPositions[0];
        const projX = primInit.x + dx;
        const projY = primInit.y + dy;
        const SNAP_RADIUS = state.snapStep > 0 ? state.snapStep * 1.2 : 1.5;
        let best = null, bestD = SNAP_RADIUS;
        for (const t of _bodyDrag.snapTargets) {
          const d = Math.hypot(t.x - projX, t.y - projY);
          if (d < bestD) { bestD = d; best = t; }
        }
        if (best) {
          dx = best.x - primInit.x;
          dy = best.y - primInit.y;
          activeSnap = best;
        }
      }
      showSnapMarker(activeSnap);
      for (let i = 0; i < _bodyDrag.shapes.length; i++) {
        const s = _bodyDrag.shapes[i];
        const init = _bodyDrag.initPositions[i];
        s.mesh.position.x = init.x + dx;
        s.mesh.position.y = init.y + dy;
      }
      updateHud(_bodyDrag.shapes[0]);
      return;
    }

    // Hover when not dragging. RAF-throttled so high-Hz mice/trackpads (120Hz+)
    // don't fire raycasts faster than the screen can paint. We stash the
    // latest event and process one per animation frame.
    if (state.transformControls?.dragging) return;
    scheduleHoverPick(ev, canvas);
  });

  let _hoverPendingEv = null;
  let _hoverScheduled = false;
  function scheduleHoverPick(ev, canvas) {
    _hoverPendingEv = ev;
    if (_hoverScheduled) return;
    _hoverScheduled = true;
    requestAnimationFrame(() => {
      _hoverScheduled = false;
      const e = _hoverPendingEv;
      _hoverPendingEv = null;
      if (!e) return;
      // Recheck conditions: state may have flipped between schedule and fire
      // (drag started, marquee began, tool became active, etc.).
      if (modalToolActive()) return;
      if (_marquee || _bodyDrag) return;
      if (state.transformControls && state.transformControls.dragging) return;
      const hits = pickShape(canvas, e);
      const newHovered = hits.length > 0 ? hits[0].object.userData.tinkerShape.id : null;
      if (newHovered !== _hoveredId) {
        _hoveredId = newHovered;
        canvas.style.cursor = _hoveredId ? 'grab' : '';
        applyEmissives();
      }
    });
  }

  function endDrag() {
    if (_bodyDrag) {
      if (_bodyDrag.dragged) {
        state.controls.enabled = true;
        document.body.style.cursor = '';
        clearHud();
        endTxn();
        endContinuousRender();
      }
      _bodyDrag = null;
    }
    hideSnapMarker();
  }
  canvas.addEventListener('pointerup', (ev) => {
    try { canvas.releasePointerCapture(ev.pointerId); } catch {}
    if (_marquee) {
      if (_marquee.active) {
        finishMarquee();
        state.controls.enabled = true;
      }
      _marquee = null;
      const rect = document.getElementById('marquee-rect');
      if (rect) rect.hidden = true;
    }
    endDrag();
  });
  canvas.addEventListener('pointercancel', endDrag);
  canvas.addEventListener('pointerleave', () => {
    if (_bodyDrag && !_bodyDrag.dragged) endDrag(); // cancel pending non-drag
    if (_hoveredId !== null) {
      _hoveredId = null;
      canvas.style.cursor = '';
      applyEmissives();
    }
  });
}

function updateMarqueeRect() {
  if (!_marquee) return;
  const el = ensureMarqueeEl();
  const x = Math.min(_marquee.startX, _marquee.x);
  const y = Math.min(_marquee.startY, _marquee.y);
  const w = Math.abs(_marquee.x - _marquee.startX);
  const h = Math.abs(_marquee.y - _marquee.startY);
  el.style.left = `${x}px`;
  el.style.top = `${y}px`;
  el.style.width = `${w}px`;
  el.style.height = `${h}px`;
  el.hidden = false;
}

function finishMarquee() {
  if (!_marquee) return;
  const x0 = Math.min(_marquee.startX, _marquee.x);
  const y0 = Math.min(_marquee.startY, _marquee.y);
  const x1 = Math.max(_marquee.startX, _marquee.x);
  const y1 = Math.max(_marquee.startY, _marquee.y);
  const cam = state.camera;
  const rect = state.renderer.domElement.getBoundingClientRect();
  const picked = [];
  const _bbScratch = new THREE.Box3();
  const _centreScratch = new THREE.Vector3();
  for (const s of state.shapes.values()) {
    if (!s.mesh.visible) continue;
    const bb = getWorldBbox(s, _bbScratch);
    if (bb.isEmpty()) continue;
    const centre = bb.getCenter(_centreScratch).project(cam);
    const sx = (centre.x + 1) / 2 * rect.width + rect.left;
    const sy = -(centre.y - 1) / 2 * rect.height + rect.top;
    if (sx >= x0 && sx <= x1 && sy >= y0 && sy <= y1) {
      picked.push(s.id);
    }
  }
  if (!_marquee.additive) _multiSelected.clear();
  for (const id of picked) _multiSelected.add(id);
  if (picked.length > 0) setSelected(picked[picked.length - 1]);
  else if (!_marquee.additive) setSelected(null);
  applyEmissives();
  notifySelection();
}

function updateHud(shape) {
  const hud = document.getElementById('hud');
  if (!hud) return;
  hud.dataset.dragHint = '1';
  hud.innerHTML = `
    <span class="hud-key">moving</span>
    <span class="hud-val accent">${shape.kind.toLowerCase()}</span>
    <span class="hud-key">X</span><span class="hud-val">${shape.mesh.position.x.toFixed(2)} mm</span>
    <span class="hud-key">Y</span><span class="hud-val">${shape.mesh.position.y.toFixed(2)} mm</span>
  `;
}

function clearHud() {
  const hud = document.getElementById('hud');
  if (hud) hud.dataset.dragHint = '';
}
