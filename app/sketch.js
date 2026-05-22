// Sketch tools — Tinkercad-style 2D-to-3D. Three modes share the same point
// capture pipeline (click on the workplane → 3D polyline preview), then
// finalise differently:
//
//   Extrude   click polygon corners → double-click → solid prism (height = 10)
//   Scribble  press+drag → freehand outline → release → solid extrusion
//   Revolve   click profile points (X = radius, Y = height) → Enter → lathe
//             around the Z axis (32 segments)
//
// Each finished sketch becomes a TinkerShape of kind IMPORT so it's
// editable with the usual handles + properties just like any STL import.

import * as THREE from 'three';
import { state } from './state.js';
import { TinkerShape } from './shape.js';
import { selectShape } from './selection.js';
import { pushHistory } from './history.js';
import { requestRender } from './scene.js';
import { toast } from './toast.js';

let _mode = null;
let _points = [];
let _line = null;
let _hover = null;     // preview from last point to cursor
let _canvas = null;
let _hud = null;

const _ndc = new THREE.Vector2();
const _ray = new THREE.Raycaster();
const _plane = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0);

export function initSketch(canvas) {
  _canvas = canvas;
  _hud = document.createElement('div');
  _hud.className = 'sketch-hint';
  _hud.hidden = true;
  document.body.appendChild(_hud);

  window.addEventListener('keydown', (ev) => {
    if (!_mode) return;
    if (ev.key === 'Escape') { cancel(); }
    else if (ev.key === 'Enter') { finish(); }
    else if (ev.key === 'Backspace' && _points.length) {
      // Undo last point during sketch
      ev.preventDefault();
      _points.pop();
      rebuildLine();
    }
  });
}

export function isSketchActive() { return !!_mode; }
export function startExtrude()  { start('extrude'); }
export function startRevolve()  { start('revolve'); }
export function startScribble() { start('scribble'); }

function start(mode) {
  if (_mode) cancel();
  _mode = mode;
  _points = [];
  _canvas.style.cursor = 'crosshair';
  _canvas.addEventListener('pointerdown', onDown, true);
  _canvas.addEventListener('pointermove', onMove, true);
  if (mode === 'scribble') _canvas.addEventListener('pointerup', onUp, true);
  _canvas.addEventListener('dblclick', onDblClick, true);
  _hud.textContent = hudHint(mode);
  _hud.hidden = false;
  state.controls.enabled = false;
  syncToolbarToggles();
}

function cancel() {
  removeLine(); removeHover();
  _points = [];
  _canvas.style.cursor = '';
  _canvas.removeEventListener('pointerdown', onDown, true);
  _canvas.removeEventListener('pointermove', onMove, true);
  _canvas.removeEventListener('pointerup', onUp, true);
  _canvas.removeEventListener('dblclick', onDblClick, true);
  _hud.hidden = true;
  state.controls.enabled = true;
  _mode = null;
  syncToolbarToggles();
  requestRender();
}

function hudHint(mode) {
  if (mode === 'extrude')
    return 'EXTRUDE — click on the workplane to add corner points · Double-click or Enter to extrude · Backspace removes last point · Esc cancels';
  if (mode === 'revolve')
    return 'REVOLVE — click points to draw a profile (X = radius, Y = height; profile mirrored to +X) · Enter to lathe around the Z axis · Backspace removes last point · Esc cancels';
  if (mode === 'scribble')
    return 'SCRIBBLE — hold left-click and drag to freehand-draw a closed shape · Release to extrude · Esc cancels';
  return '';
}

function projectMouse(ev) {
  const rect = _canvas.getBoundingClientRect();
  _ndc.x = ((ev.clientX - rect.left) / rect.width) * 2 - 1;
  _ndc.y = -((ev.clientY - rect.top) / rect.height) * 2 + 1;
  _ray.setFromCamera(_ndc, state.camera);
  const out = new THREE.Vector3();
  return _ray.ray.intersectPlane(_plane, out) ? out : null;
}

function onDown(ev) {
  if (ev.button !== 0) return;
  ev.stopPropagation();
  ev.preventDefault();
  const p = projectMouse(ev);
  if (!p) return;
  if (_mode === 'scribble') {
    _points = [p];
    rebuildLine();
  } else {
    // Snap to the current snap step (matches the rest of the editor's snap UX).
    if (state.snapStep > 0 && !ev.ctrlKey) {
      p.x = Math.round(p.x / state.snapStep) * state.snapStep;
      p.y = Math.round(p.y / state.snapStep) * state.snapStep;
    }
    _points.push(p);
    rebuildLine();
  }
}

function onMove(ev) {
  const p = projectMouse(ev);
  if (!p) return;
  if (_mode === 'scribble' && ev.buttons === 1) {
    const last = _points[_points.length - 1];
    // Drop micro-jitter: keep at least 0.3 mm between samples.
    if (!last || p.distanceTo(last) > 0.3) {
      _points.push(p);
      rebuildLine();
    }
    return;
  }
  if (_mode && _points.length > 0) {
    // Live preview segment from last placed point to cursor.
    drawHover(_points[_points.length - 1], p);
  }
}

function onUp(ev) {
  if (_mode === 'scribble' && _points.length > 3) finish();
}

function onDblClick(ev) {
  ev.stopPropagation();
  ev.preventDefault();
  if (_mode !== 'scribble') finish();
}

function removeLine() {
  if (_line) { state.scene.remove(_line); _line.geometry.dispose(); _line.material.dispose(); _line = null; }
}
function removeHover() {
  if (_hover) { state.scene.remove(_hover); _hover.geometry.dispose(); _hover.material.dispose(); _hover = null; }
}

function rebuildLine() {
  removeLine();
  if (_points.length < 2) { requestRender(); return; }
  const pts = _points.slice();
  // Close visually if extrude / scribble — helps the user see what they'll get.
  if ((_mode === 'extrude' || _mode === 'scribble') && _points.length > 2) {
    pts.push(_points[0]);
  }
  const geo = new THREE.BufferGeometry().setFromPoints(pts);
  const mat = new THREE.LineBasicMaterial({ color: 0xc4f04f, depthTest: false, transparent: true, opacity: 0.95 });
  _line = new THREE.Line(geo, mat);
  _line.renderOrder = 999;
  state.scene.add(_line);
  requestRender();
}

function drawHover(from, to) {
  removeHover();
  const geo = new THREE.BufferGeometry().setFromPoints([from, to]);
  const mat = new THREE.LineDashedMaterial({ color: 0xc4f04f, dashSize: 0.8, gapSize: 0.5, depthTest: false, transparent: true, opacity: 0.7 });
  _hover = new THREE.Line(geo, mat);
  _hover.computeLineDistances();
  _hover.renderOrder = 999;
  state.scene.add(_hover);
  requestRender();
}

function finish() {
  if (!_mode || _points.length < 3) { cancel(); return; }
  const mode = _mode;
  const pts = _points.slice();
  pushHistory();

  let geom;
  let displayName;
  try {
    if (mode === 'extrude' || mode === 'scribble') {
      geom = buildExtrudeGeom(pts, 10);
      displayName = mode === 'extrude' ? 'extrude-sketch' : 'scribble';
    } else if (mode === 'revolve') {
      geom = buildLatheGeom(pts, 48);
      displayName = 'revolve-sketch';
    }
  } catch (err) {
    console.error('Sketch finalise failed:', err);
    toast.error('Sketch failed', { detail: `${err.message}. Try a simpler outline.` });
    cancel();
    return;
  }
  if (!geom) { cancel(); return; }

  // Re-centre on local origin so the new shape behaves like every other one.
  geom.computeBoundingBox();
  const centre = geom.boundingBox.getCenter(new THREE.Vector3());

  const shape = new TinkerShape('IMPORT', {
    geometry: geom,
    importedName: displayName,
  });
  // Place the new shape at the centroid of the original sketch so it lands
  // exactly where the user drew it.
  shape.mesh.position.set(centre.x, centre.y, centre.z);
  // The geometry was already translated to origin inside the builders — keep
  // it that way; mesh.position carries the world placement.
  state.scene.add(shape.mesh);
  selectShape(shape.id);
  cancel();
}

function buildExtrudeGeom(pts, height) {
  const shape = new THREE.Shape();
  pts.forEach((p, i) => i === 0 ? shape.moveTo(p.x, p.y) : shape.lineTo(p.x, p.y));
  shape.closePath();
  const g = new THREE.ExtrudeGeometry(shape, { depth: height, bevelEnabled: false });
  g.computeBoundingBox();
  const c = g.boundingBox.getCenter(new THREE.Vector3());
  g.translate(-c.x, -c.y, -c.z);
  return g;
}

function buildLatheGeom(pts, segments) {
  // Treat each sketched point as (radius, height). We rectify the X so even if
  // the user wandered into negative-X, the profile sits on one side of the
  // axis — otherwise LatheGeometry produces an X-shape collision through Z.
  // Then sort by Y so the lathe sweeps cleanly bottom-to-top.
  const profile = pts.map(p => new THREE.Vector2(Math.max(0.01, Math.abs(p.x)), p.y));
  profile.sort((a, b) => a.y - b.y);
  // De-duplicate consecutive points (LatheGeometry chokes on zero-length segs).
  const filtered = [profile[0]];
  for (let i = 1; i < profile.length; i++) {
    if (profile[i].distanceTo(filtered[filtered.length - 1]) > 0.01) filtered.push(profile[i]);
  }
  if (filtered.length < 2) throw new Error('Profile needs at least 2 distinct points.');
  const g = new THREE.LatheGeometry(filtered, segments);
  g.computeBoundingBox();
  const c = g.boundingBox.getCenter(new THREE.Vector3());
  g.translate(-c.x, -c.y, -c.z);
  return g;
}

function syncToolbarToggles() {
  for (const action of ['extrude', 'scribble', 'revolve']) {
    const btn = document.querySelector(`[data-action="${action}"]`);
    if (btn) btn.classList.toggle('active', _mode === action);
  }
}
