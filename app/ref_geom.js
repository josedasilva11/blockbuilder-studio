// Reference geometry. Construction entities that are not printable but help
// the user position things precisely: a plane defined by 3 points, an axis
// along an existing edge, a midpoint marker on an edge.
//
// v1 scope (this file):
//   - Three picker tools (Plane 3-points, Axis-on-edge, Midpoint-on-edge)
//   - Visible non-printable proxies in the scene (translucent plane, dashed
//     line, small sphere) with a distinct grey/cyan colour so they're
//     obviously not solids
//   - In-memory only, lost on page reload
//   - Outliner entries with a "ref" badge + hide / delete actions
//
// v2 work, NOT in this file (deferred):
//   - Snap targets (body-drag and resize handles should snap to ref planes,
//     ref axes, ref midpoints)
//   - Project save / load roundtrip (serialize into project .json)
//   - Edit a reference after creation (drag its defining points, retype its
//     positions in Properties)
//   - Workplane integration (a ref plane can be set as the active workplane
//     with one click)

import * as THREE from 'three';
import { state, freshId } from './state.js';
import { requestRender } from './scene.js';
import { toast } from './toast.js';
import { markDirty as markAutosaveDirty } from './autosave.js';

const REF_COLOR = 0x6cd5ff;        // distinct cyan so it doesn't blend with solids
const REF_COLOR_DIM = 0x3a89a8;
const PLANE_HALF_SIZE = 30;        // edge length is 2 * this in active units
const SPHERE_RADIUS = 0.8;
const AXIS_OVERSHOOT = 20;         // mm of dashed line past each edge endpoint

const REF_KINDS = ['PLANE_3P', 'AXIS_EDGE', 'MIDPOINT'];

const _raycaster = new THREE.Raycaster();
const _ndc = new THREE.Vector2();

let _canvas = null;
let _hudHint = null;
let _activeTool = null;            // 'plane' | 'axis' | 'midpoint' | null
let _pickedPoints = [];            // accumulates 3 Vector3 for PLANE_3P
let _previewGroup = null;          // visual feedback during pick

export class RefGeom {
  constructor(kind, data, opts = {}) {
    if (!REF_KINDS.includes(kind)) throw new Error(`Unknown RefGeom kind: ${kind}`);
    this.id = opts.id ?? freshId('ref');
    this.kind = kind;
    this.data = data;              // shape depends on kind, see below
    this.visible = true;
    this.name = opts.name || defaultName(kind);
    this.mesh = this._build();
    this.mesh.userData.refGeom = this;
    state.refGeoms.set(this.id, this);
    markAutosaveDirty();
  }

  _build() {
    if (this.kind === 'PLANE_3P') return buildPlaneMesh(this.data.points);
    if (this.kind === 'AXIS_EDGE') return buildAxisMesh(this.data.from, this.data.to);
    if (this.kind === 'MIDPOINT') return buildMidpointMesh(this.data.point);
    throw new Error('unreachable');
  }

  setVisible(v) {
    this.visible = !!v;
    if (this.mesh) this.mesh.visible = this.visible;
    requestRender();
  }

  dispose() {
    if (this.mesh) {
      state.scene.remove(this.mesh);
      this.mesh.traverse((o) => {
        if (o.geometry) o.geometry.dispose();
        if (o.material) {
          if (Array.isArray(o.material)) o.material.forEach((m) => m.dispose());
          else o.material.dispose();
        }
      });
    }
    state.refGeoms.delete(this.id);
    markAutosaveDirty();
    requestRender();
  }
}

function defaultName(kind) {
  if (kind === 'PLANE_3P') return 'Reference plane';
  if (kind === 'AXIS_EDGE') return 'Reference axis';
  if (kind === 'MIDPOINT') return 'Midpoint';
  return 'Ref';
}

// Build a finite plane patch oriented to the normal of the 3 input points.
// Uses MeshBasicMaterial + transparent so it doesn't interact with lighting
// (refs are construction entities, lighting them would imply they're solids).
function buildPlaneMesh(points) {
  const [a, b, c] = points;
  const ab = new THREE.Vector3().subVectors(b, a);
  const ac = new THREE.Vector3().subVectors(c, a);
  const normal = new THREE.Vector3().crossVectors(ab, ac).normalize();
  if (normal.lengthSq() < 1e-6) {
    // 3 collinear points: fall back to world-Z plane through point a.
    normal.set(0, 0, 1);
  }
  const centroid = new THREE.Vector3().add(a).add(b).add(c).multiplyScalar(1 / 3);
  const quat = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), normal);

  const grp = new THREE.Group();
  const planeGeo = new THREE.PlaneGeometry(PLANE_HALF_SIZE * 2, PLANE_HALF_SIZE * 2);
  const planeMat = new THREE.MeshBasicMaterial({
    color: REF_COLOR,
    transparent: true,
    opacity: 0.18,
    side: THREE.DoubleSide,
    depthWrite: false,
  });
  const plane = new THREE.Mesh(planeGeo, planeMat);
  plane.renderOrder = 20;
  grp.add(plane);

  // Add a perimeter outline so the plane reads as a discrete object, not just
  // a tint of the underlying ground.
  const edgeGeo = new THREE.EdgesGeometry(planeGeo);
  const edgeMat = new THREE.LineBasicMaterial({ color: REF_COLOR, transparent: true, opacity: 0.65 });
  const outline = new THREE.LineSegments(edgeGeo, edgeMat);
  outline.renderOrder = 21;
  grp.add(outline);

  // Tiny dots at each defining point so the user remembers what defined the
  // plane (handy when 3 picks are far apart).
  const dotGeo = new THREE.SphereGeometry(SPHERE_RADIUS, 12, 8);
  const dotMat = new THREE.MeshBasicMaterial({ color: REF_COLOR });
  for (const p of points) {
    const dot = new THREE.Mesh(dotGeo, dotMat);
    dot.position.copy(p);
    dot.renderOrder = 22;
    grp.add(dot);
  }

  grp.position.copy(centroid);
  grp.quaternion.copy(quat);
  state.scene.add(grp);
  return grp;
}

function buildAxisMesh(from, to) {
  const dir = new THREE.Vector3().subVectors(to, from).normalize();
  const a = from.clone().add(dir.clone().multiplyScalar(-AXIS_OVERSHOOT));
  const b = to.clone().add(dir.clone().multiplyScalar(AXIS_OVERSHOOT));

  const grp = new THREE.Group();
  const lineGeo = new THREE.BufferGeometry().setFromPoints([a, b]);
  // LineDashedMaterial requires computing line distances; we do it after add.
  const lineMat = new THREE.LineDashedMaterial({
    color: REF_COLOR,
    dashSize: 2,
    gapSize: 1.2,
    transparent: true,
    opacity: 0.85,
  });
  const line = new THREE.Line(lineGeo, lineMat);
  line.computeLineDistances();
  line.renderOrder = 20;
  grp.add(line);

  // End caps so the axis direction is unambiguous.
  const dotGeo = new THREE.SphereGeometry(SPHERE_RADIUS, 12, 8);
  const dotMat = new THREE.MeshBasicMaterial({ color: REF_COLOR });
  for (const p of [from, to]) {
    const dot = new THREE.Mesh(dotGeo, dotMat);
    dot.position.copy(p);
    grp.add(dot);
  }
  state.scene.add(grp);
  return grp;
}

function buildMidpointMesh(point) {
  const grp = new THREE.Group();
  const dotGeo = new THREE.SphereGeometry(SPHERE_RADIUS * 1.4, 16, 10);
  const dotMat = new THREE.MeshBasicMaterial({ color: REF_COLOR });
  const dot = new THREE.Mesh(dotGeo, dotMat);
  dot.position.copy(point);
  grp.add(dot);

  // A tiny cross-hair so the midpoint reads at any zoom level.
  const xs = SPHERE_RADIUS * 2.5;
  const lineMat = new THREE.LineBasicMaterial({ color: REF_COLOR, transparent: true, opacity: 0.55 });
  const lineGeo = new THREE.BufferGeometry().setFromPoints([
    new THREE.Vector3(-xs, 0, 0), new THREE.Vector3(xs, 0, 0),
    new THREE.Vector3(0, -xs, 0), new THREE.Vector3(0, xs, 0),
    new THREE.Vector3(0, 0, -xs), new THREE.Vector3(0, 0, xs),
  ]);
  const cross = new THREE.LineSegments(lineGeo, lineMat);
  cross.position.copy(point);
  grp.add(cross);

  state.scene.add(grp);
  return grp;
}

// =============================================================================
// Picker tools
// =============================================================================

export function initRefGeom(canvas) {
  _canvas = canvas;
  _hudHint = document.createElement('div');
  _hudHint.className = 'refgeom-hint';
  _hudHint.style.cssText = [
    'position:fixed', 'top:64px', 'left:50%',
    'transform:translateX(-50%)',
    'background:rgba(20,23,29,0.96)',
    'color:#6cd5ff',
    'padding:8px 14px',
    'border-radius:8px',
    "font:600 13px/1.4 system-ui,-apple-system,Segoe UI,sans-serif",
    'border:1px solid rgba(108,213,255,0.45)',
    'pointer-events:none',
    'z-index:30',
    'display:none',
    'white-space:nowrap',
  ].join(';');
  document.body.appendChild(_hudHint);

  window.addEventListener('keydown', (ev) => {
    if (!_activeTool) return;
    if (ev.target && ['INPUT', 'TEXTAREA', 'SELECT'].includes(ev.target.tagName)) return;
    if (ev.key === 'Escape') stop();
  });
}

export function isRefGeomActive() { return !!_activeTool; }

export function startPickPlane3P() { startTool('plane'); }
export function startPickAxisEdge() { startTool('axis'); }
export function startPickMidpoint() { startTool('midpoint'); }

function startTool(which) {
  if (_activeTool === which) { stop(); return; }
  if (_activeTool) stop();
  _activeTool = which;
  _pickedPoints = [];
  _canvas.style.cursor = 'crosshair';
  _canvas.addEventListener('pointerdown', onDown, true);
  setHintForTool();
  syncToolbar();
}

function stop() {
  _activeTool = null;
  _pickedPoints = [];
  disposePreview();
  _canvas.style.cursor = '';
  _canvas.removeEventListener('pointerdown', onDown, true);
  setHint(null);
  syncToolbar();
}

function setHintForTool() {
  if (_activeTool === 'plane') setHint(`Plane 3-points: click point ${_pickedPoints.length + 1} of 3 on any shape. Esc cancels.`);
  else if (_activeTool === 'axis') setHint('Axis on edge: click any edge of a shape to spawn a dashed axis along it. Esc cancels.');
  else if (_activeTool === 'midpoint') setHint('Midpoint: click any edge of a shape to drop a marker at its midpoint. Esc cancels.');
}

function setHint(text) {
  if (!_hudHint) return;
  if (text == null) { _hudHint.style.display = 'none'; return; }
  _hudHint.textContent = text;
  _hudHint.style.display = 'block';
}

function onDown(ev) {
  if (ev.button !== 0) return;
  ev.stopImmediatePropagation();
  ev.preventDefault();

  const rect = _canvas.getBoundingClientRect();
  _ndc.x = ((ev.clientX - rect.left) / rect.width) * 2 - 1;
  _ndc.y = -((ev.clientY - rect.top) / rect.height) * 2 + 1;
  _raycaster.setFromCamera(_ndc, state.camera);

  const meshes = [];
  for (const s of state.shapes.values()) {
    if (s.mesh && s.mesh.parent && s.mesh.visible) meshes.push(s.mesh);
  }
  const hits = _raycaster.intersectObjects(meshes, false);
  if (!hits[0]) { setHint('Missed. Click directly on a shape.'); return; }
  const hit = hits[0];

  if (_activeTool === 'plane') return onPlanePick(hit);
  if (_activeTool === 'axis') return onAxisPick(hit);
  if (_activeTool === 'midpoint') return onMidpointPick(hit);
}

function onPlanePick(hit) {
  _pickedPoints.push(hit.point.clone());
  addPreviewDot(hit.point);
  setHintForTool();
  if (_pickedPoints.length === 3) {
    new RefGeom('PLANE_3P', { points: _pickedPoints.map((p) => p.clone()) });
    toast.ok('Reference plane added', { detail: 'See it in the Outliner under Reference geometry.' });
    stop();
    requestRender();
  }
}

function onAxisPick(hit) {
  const edge = pickedEdge(hit);
  if (!edge) { setHint('No nearby edge. Click closer to a shape edge. Esc cancels.'); return; }
  new RefGeom('AXIS_EDGE', { from: edge.a.clone(), to: edge.b.clone() });
  toast.ok('Reference axis added');
  stop();
  requestRender();
}

function onMidpointPick(hit) {
  const edge = pickedEdge(hit);
  if (!edge) { setHint('No nearby edge. Click closer to a shape edge. Esc cancels.'); return; }
  const mid = edge.a.clone().add(edge.b).multiplyScalar(0.5);
  new RefGeom('MIDPOINT', { point: mid });
  toast.ok('Midpoint marker added');
  stop();
  requestRender();
}

// Find the feature edge of the hit triangle that's closest in world space to
// the actual hit point. Uses the same EdgesGeometry filtering as
// edge_hover.js (angle threshold 1 deg) so the result is a real silhouette
// edge, not a hidden triangulation diagonal.
function pickedEdge(hit) {
  const mesh = hit.object;
  const geom = mesh.geometry;
  if (!geom) return null;
  const eg = new THREE.EdgesGeometry(geom, 1);
  const pos = eg.attributes.position.array;
  const count = pos.length / 6;
  const wm = mesh.matrixWorld;
  const hp = hit.point;
  let bestIdx = -1;
  let bestDist = Infinity;
  const tmpA = new THREE.Vector3();
  const tmpB = new THREE.Vector3();
  for (let i = 0; i < count; i++) {
    tmpA.fromArray(pos, i * 6).applyMatrix4(wm);
    tmpB.fromArray(pos, i * 6 + 3).applyMatrix4(wm);
    // Distance from hit point to this line segment.
    const d = distancePointToSegment(hp, tmpA, tmpB);
    if (d < bestDist) { bestDist = d; bestIdx = i; }
  }
  eg.dispose();
  if (bestIdx < 0) return null;
  tmpA.fromArray(pos, bestIdx * 6).applyMatrix4(wm);
  tmpB.fromArray(pos, bestIdx * 6 + 3).applyMatrix4(wm);
  return { a: tmpA.clone(), b: tmpB.clone(), distance: bestDist };
}

// Standard point-to-segment distance.
function distancePointToSegment(p, a, b) {
  const ab = b.clone().sub(a);
  const ap = p.clone().sub(a);
  const lenSq = ab.lengthSq();
  if (lenSq < 1e-9) return ap.length();
  let t = ap.dot(ab) / lenSq;
  t = Math.max(0, Math.min(1, t));
  return ap.sub(ab.multiplyScalar(t)).length();
}

// =============================================================================
// Pick preview (intermediate dots while choosing 3 plane points)
// =============================================================================

function addPreviewDot(worldPos) {
  if (!_previewGroup) {
    _previewGroup = new THREE.Group();
    state.scene.add(_previewGroup);
  }
  const dot = new THREE.Mesh(
    new THREE.SphereGeometry(SPHERE_RADIUS, 12, 8),
    new THREE.MeshBasicMaterial({ color: REF_COLOR }),
  );
  dot.position.copy(worldPos);
  _previewGroup.add(dot);
  requestRender();
}

function disposePreview() {
  if (!_previewGroup) return;
  _previewGroup.traverse((o) => {
    if (o.geometry) o.geometry.dispose();
    if (o.material) o.material.dispose();
  });
  state.scene.remove(_previewGroup);
  _previewGroup = null;
}

function syncToolbar() {
  for (const action of ['ref-plane', 'ref-axis', 'ref-midpoint']) {
    const btn = document.querySelector(`[data-action="${action}"]`);
    if (!btn) continue;
    const myTool = action === 'ref-plane' ? 'plane' : action === 'ref-axis' ? 'axis' : 'midpoint';
    btn.classList.toggle('active', _activeTool === myTool);
  }
}
