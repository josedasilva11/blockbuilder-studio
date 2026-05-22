// Cut-by-plane. Bambu-style: pick an axis (X/Y/Z), slide the cutting plane
// through the selected shape's bbox, hit "Cut" to slice it into two pieces.
//
// Math: build a giant axis-aligned slab brush whose flat face sits exactly on
// the cutting plane. Intersect with target → the "above" piece. Subtract the
// same slab from target → the "below" piece. Each piece becomes its own
// IMPORT TinkerShape, placed back at its world centroid.

import * as THREE from 'three';
import { Evaluator, Brush, INTERSECTION, SUBTRACTION } from 'three-bvh-csg';
import { MeshBVH } from 'three-mesh-bvh';
import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import { state } from './state.js';
import { TinkerShape } from './shape.js';
import { selectShape } from './selection.js';
import { showStatus, hideStatus } from './status.js';
import { pushHistory } from './history.js';
import { toast } from './toast.js';

const evaluator = new Evaluator();
evaluator.useGroups = false;
evaluator.attributes = ['position', 'normal'];

let _panel = null;
let _previewMesh = null;
let _targetShape = null;
let _axis = 'Z';
let _offset = 0;       // world coord along axis
let _bbox = null;      // world bbox of target

export function showCutWidget() {
  const s = state.shapes.get(state.selectedId);
  if (!s) { toast.warn('Select a shape first', { detail: 'Click a shape in the viewport, then open Cut again.' }); return; }
  _targetShape = s;

  s.mesh.updateMatrixWorld(true);
  _bbox = new THREE.Box3().setFromObject(s.mesh);
  if (_bbox.isEmpty()) { toast.error('Cannot determine shape bounds', { detail: 'The selected shape has empty or invalid geometry.' }); return; }

  _axis = 'Z';
  _offset = (_bbox.min.z + _bbox.max.z) / 2;

  buildPanel();
  buildPreview();
}

function closeWidget() {
  if (_panel) { _panel.remove(); _panel = null; }
  if (_previewMesh) {
    state.scene.remove(_previewMesh);
    _previewMesh.geometry.dispose();
    _previewMesh.material.dispose();
    _previewMesh = null;
  }
  _targetShape = null;
  _bbox = null;
}

function buildPanel() {
  if (_panel) _panel.remove();
  _panel = document.createElement('div');
  _panel.className = 'cut-panel';
  _panel.innerHTML = `
    <div class="cut-header">
      <span>Cut along plane</span>
      <button class="cut-close" title="Cancel">×</button>
    </div>
    <div class="cut-axes">
      <button data-axis="X" class="tip ${_axis === 'X' ? 'active' : ''}" data-tip="Cut plane perpendicular to the X axis — vertical slice left/right.">X</button>
      <button data-axis="Y" class="tip ${_axis === 'Y' ? 'active' : ''}" data-tip="Cut plane perpendicular to the Y axis — vertical slice back/front.">Y</button>
      <button data-axis="Z" class="tip ${_axis === 'Z' ? 'active' : ''}" data-tip="Cut plane perpendicular to the Z axis — horizontal slice top/bottom.">Z</button>
    </div>
    <div class="cut-slider-row">
      <input type="range" class="cut-slider tip" step="0.1" data-tip="Slide the cutting plane along the chosen axis. Lime preview in the viewport shows where the cut will happen." />
      <input type="number" class="cut-value tip" step="0.1" data-tip="Exact position of the cut plane along the chosen axis, in current units." />
      <span class="cut-unit">${state.unit}</span>
    </div>
    <div class="cut-actions">
      <button class="cut-cancel tip" data-tip="Close without cutting anything.">Cancel</button>
      <button class="cut-confirm primary tip" data-tip="Perform the cut: the original shape becomes two — one above and one below the plane. Undoable with Ctrl+Z.">Cut</button>
    </div>
  `;
  document.body.appendChild(_panel);

  _panel.querySelector('.cut-close').addEventListener('click', closeWidget);
  _panel.querySelector('.cut-cancel').addEventListener('click', closeWidget);
  _panel.querySelector('.cut-confirm').addEventListener('click', performCut);

  for (const btn of _panel.querySelectorAll('.cut-axes button')) {
    btn.addEventListener('click', () => {
      _axis = btn.dataset.axis;
      for (const b of _panel.querySelectorAll('.cut-axes button')) {
        b.classList.toggle('active', b === btn);
      }
      // Reset offset to mid-bbox along the new axis
      const ax = _axis.toLowerCase();
      _offset = (_bbox.min[ax] + _bbox.max[ax]) / 2;
      updateSliderRange();
      updatePreview();
    });
  }

  const slider = _panel.querySelector('.cut-slider');
  const numInput = _panel.querySelector('.cut-value');
  slider.addEventListener('input', () => {
    _offset = parseFloat(slider.value);
    numInput.value = _offset.toFixed(2);
    updatePreview();
  });
  numInput.addEventListener('change', () => {
    const v = parseFloat(numInput.value);
    if (Number.isFinite(v)) {
      _offset = v;
      slider.value = _offset;
      updatePreview();
    }
  });

  updateSliderRange();
}

function updateSliderRange() {
  if (!_panel || !_bbox) return;
  const ax = _axis.toLowerCase();
  const slider = _panel.querySelector('.cut-slider');
  const numInput = _panel.querySelector('.cut-value');
  // Step inside the bbox a hair so the cut actually intersects geometry.
  const pad = 0.01;
  slider.min = (_bbox.min[ax] + pad).toFixed(3);
  slider.max = (_bbox.max[ax] - pad).toFixed(3);
  slider.step = ((_bbox.max[ax] - _bbox.min[ax]) / 200).toFixed(3);
  slider.value = _offset;
  numInput.value = _offset.toFixed(2);
}

function buildPreview() {
  updatePreview();
}

function updatePreview() {
  if (!_bbox) return;
  if (_previewMesh) {
    state.scene.remove(_previewMesh);
    _previewMesh.geometry.dispose();
    _previewMesh.material.dispose();
    _previewMesh = null;
  }

  // Sized to slightly bigger than the bbox so the user sees where it goes.
  const size = _bbox.getSize(new THREE.Vector3());
  const centre = _bbox.getCenter(new THREE.Vector3());
  const w = Math.max(size.x, size.y, size.z) * 1.4;

  // Rectangle in the cutting plane.
  const geo = new THREE.PlaneGeometry(w, w);
  if (_axis === 'X') geo.rotateY(Math.PI / 2);
  else if (_axis === 'Y') geo.rotateX(Math.PI / 2);
  // Z is already XY plane facing +Z.

  const mat = new THREE.MeshBasicMaterial({
    color: 0xb4dc3c,
    transparent: true,
    opacity: 0.22,
    side: THREE.DoubleSide,
    depthWrite: false,
  });
  _previewMesh = new THREE.Mesh(geo, mat);
  _previewMesh.renderOrder = 998;

  const pos = new THREE.Vector3(centre.x, centre.y, centre.z);
  pos[_axis.toLowerCase()] = _offset;
  _previewMesh.position.copy(pos);
  state.scene.add(_previewMesh);
}

async function performCut() {
  if (!_targetShape || !_bbox) return;
  const shape = _targetShape;
  const axis = _axis;
  const offset = _offset;

  showStatus('Cutting…');
  // Double rAF so the busy pill paints before the synchronous CSG hits.
  await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));

  let target, slab;
  try {
    target = makeBrushFromMesh(shape.mesh);
    slab = makeSlabBrush(_bbox, axis, offset, +1); // "above" half
  } catch (err) {
    hideStatus();
    toast.error('Cut preparation failed', { detail: err.message });
    return;
  }

  let topBrush, bottomBrush;
  try {
    topBrush = evaluator.evaluate(target, slab, INTERSECTION);
    bottomBrush = evaluator.evaluate(target, slab, SUBTRACTION);
  } catch (err) {
    hideStatus();
    console.error('Cut failed:', err);
    toast.error('Cut failed', { detail: `${err.message}. Mesh may be non-manifold — try Repair in Properties first.` });
    return;
  }

  const topGeo = topBrush.geometry.clone();
  const bottomGeo = bottomBrush.geometry.clone();
  topGeo.computeVertexNormals();
  bottomGeo.computeVertexNormals();

  if (topGeo.attributes.position.count === 0 || bottomGeo.attributes.position.count === 0) {
    hideStatus();
    toast.warn('Plane does not intersect', { detail: 'Move the cut plane inside the shape bounds and try again.' });
    return;
  }

  // Snapshot for undo BEFORE we mutate the scene.
  pushHistory();

  // Promote each half to its own IMPORT shape. Re-centre the geometry on its
  // own bbox so the new shape has a sensible local origin.
  const newShapes = [];
  for (const [geo, label] of [[topGeo, 'top'], [bottomGeo, 'bottom']]) {
    geo.computeBoundingBox();
    const c = geo.boundingBox.getCenter(new THREE.Vector3());
    geo.translate(-c.x, -c.y, -c.z);
    try { geo.boundsTree = new MeshBVH(geo); } catch {}

    const part = new TinkerShape('IMPORT', {
      geometry: geo,
      importedName: `${shape.displayName()} ${label}`,
      color: shape.color,
      isHole: shape.isHole,
    });
    part.mesh.position.copy(c);  // world position is the world centroid
    state.scene.add(part.mesh);
    newShapes.push(part);
  }

  // Drop the original.
  shape.dispose();
  state.shapes.delete(shape.id);

  // Select both halves.
  selectShape(newShapes[0].id);
  for (let i = 1; i < newShapes.length; i++) selectShape(newShapes[i].id, { additive: true });

  hideStatus();
  closeWidget();
}

function makeBrushFromMesh(mesh) {
  mesh.updateMatrixWorld(true);
  let geom = mesh.geometry.clone();
  geom.applyMatrix4(mesh.matrixWorld);
  for (const attr of Object.keys(geom.attributes)) {
    if (attr !== 'position' && attr !== 'normal') geom.deleteAttribute(attr);
  }
  try { geom = mergeVertices(geom, geom.index ? 1e-5 : 1e-4); } catch {}
  geom.computeVertexNormals();
  const brush = new Brush(geom);
  brush.updateMatrixWorld();
  return brush;
}

// Build a slab brush sized way bigger than the target's bbox, with one face
// sitting exactly on the cutting plane. `sideSign` chooses which half of
// space it covers (+1 = above the plane along `axis`).
function makeSlabBrush(bbox, axis, offset, sideSign) {
  const size = bbox.getSize(new THREE.Vector3());
  const big = Math.max(size.x, size.y, size.z) * 4;
  const geom = new THREE.BoxGeometry(big, big, big);
  const centre = bbox.getCenter(new THREE.Vector3());

  // Position the slab so one face is on the plane, body extends to +sideSign.
  const pos = centre.clone();
  pos[axis.toLowerCase()] = offset + sideSign * (big / 2);
  geom.translate(pos.x, pos.y, pos.z);

  const brush = new Brush(geom);
  brush.updateMatrixWorld();
  return brush;
}
