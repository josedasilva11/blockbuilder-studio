// Hollow / Shell — turn the selected shape into a hollow shell with a fixed
// wall thickness. Implementation: clone the geometry, shrink it per-axis so
// each dimension loses 2× thickness, then CSG-subtract the inner copy from
// the outer. Walls end up >= thickness everywhere; perfect on box-ish shapes,
// approximate on radially curved shapes (a hollow sphere becomes a sphere
// minus an ellipsoid if its bbox isn't cubic).

import * as THREE from 'three';
import { Evaluator, Brush, SUBTRACTION } from 'three-bvh-csg';
import { MeshBVH } from 'three-mesh-bvh';
import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import { state } from './state.js';
import { showStatus, hideStatus } from './status.js';
import { pushHistory } from './history.js';
import { requestRender } from './scene.js';
import { toast } from './toast.js';

const evaluator = new Evaluator();
evaluator.useGroups = false;
evaluator.attributes = ['position', 'normal'];

let _panel = null;
let _shape = null;
let _bbox = null;
let _thickness = 2;

export function showHollowWidget() {
  const s = state.shapes.get(state.selectedId);
  if (!s) { toast.warn('Select a shape first', { detail: 'Click a shape in the viewport, then open Hollow again.' }); return; }
  _shape = s;
  s.mesh.updateMatrixWorld(true);
  _bbox = new THREE.Box3().setFromObject(s.mesh);
  if (_bbox.isEmpty()) { toast.error('Cannot read shape bounds'); return; }

  const size = _bbox.getSize(new THREE.Vector3());
  const minDim = Math.min(size.x, size.y, size.z);
  // Sensible default: 10% of smallest dimension, capped at 4 mm.
  _thickness = Math.max(0.5, Math.min(4, minDim * 0.1));

  buildPanel(minDim);
}

function buildPanel(minDim) {
  if (_panel) _panel.remove();
  _panel = document.createElement('div');
  _panel.className = 'hollow-panel';
  _panel.innerHTML = `
    <div class="hollow-header">
      <span>Hollow shell</span>
      <button class="hollow-close" title="Cancel">×</button>
    </div>
    <p class="hollow-hint">Carves the inside, leaving a wall. Walls are at least
       the chosen thickness on every axis; on long thin shapes the long-axis
       walls may end up thicker.</p>
    <div class="hollow-slider-row">
      <label class="tip" data-tip="WALL THICKNESS — how thick the remaining shell will be. For 3D printing, 1-3 mm is typical (depends on nozzle / material). Bigger = stronger but more material.">Wall thickness</label>
      <input type="range" class="hollow-slider tip" min="0.1" step="0.1" data-tip="Drag to preview different thicknesses. Confirm with Hollow." />
      <input type="number" class="hollow-value tip" step="0.1" data-tip="Exact wall thickness in current units." />
      <span class="hollow-unit">${state.unit}</span>
    </div>
    <div class="hollow-actions">
      <button class="hollow-cancel tip" data-tip="Close without hollowing.">Cancel</button>
      <button class="hollow-confirm primary tip" data-tip="Carve the inside. Original geometry is replaced with the shell — undoable with Ctrl+Z.">Hollow</button>
    </div>
  `;
  document.body.appendChild(_panel);

  const slider = _panel.querySelector('.hollow-slider');
  const num = _panel.querySelector('.hollow-value');
  const maxT = Math.max(0.5, minDim / 2 - 0.1);  // never enough to invert
  slider.max = maxT.toFixed(2);
  slider.value = _thickness;
  num.max = maxT.toFixed(2);
  num.min = '0.1';
  num.value = _thickness.toFixed(2);

  slider.addEventListener('input', () => {
    _thickness = parseFloat(slider.value);
    num.value = _thickness.toFixed(2);
  });
  num.addEventListener('change', () => {
    const v = parseFloat(num.value);
    if (Number.isFinite(v) && v > 0 && v < minDim / 2) {
      _thickness = v;
      slider.value = v;
    } else {
      num.value = _thickness.toFixed(2);
    }
  });
  _panel.querySelector('.hollow-close').addEventListener('click', close);
  _panel.querySelector('.hollow-cancel').addEventListener('click', close);
  _panel.querySelector('.hollow-confirm').addEventListener('click', performHollow);
}

function close() {
  if (_panel) { _panel.remove(); _panel = null; }
  _shape = null;
  _bbox = null;
}

async function performHollow() {
  if (!_shape || !_bbox) return;
  const mesh = _shape.mesh;
  const t = _thickness;
  const size = _bbox.getSize(new THREE.Vector3());

  showStatus('Computing shell…');
  await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));

  // Per-axis shrink: keep at least `t` of wall on each side of every axis.
  const sx = Math.max(size.x - 2 * t, 0.05) / size.x;
  const sy = Math.max(size.y - 2 * t, 0.05) / size.y;
  const sz = Math.max(size.z - 2 * t, 0.05) / size.z;
  const centre = _bbox.getCenter(new THREE.Vector3());

  let outerBrush, innerBrush;
  try {
    outerBrush = makeBrush(mesh);
    innerBrush = makeInnerBrush(mesh, centre, sx, sy, sz);
  } catch (err) {
    hideStatus();
    toast.error('Hollow preparation failed', { detail: err.message });
    return;
  }

  let resultBrush;
  try {
    resultBrush = evaluator.evaluate(outerBrush, innerBrush, SUBTRACTION);
  } catch (err) {
    hideStatus();
    console.error('Hollow failed:', err);
    toast.error('Hollow failed', { detail: `${err.message}. Try Repair in Properties first.` });
    return;
  }

  pushHistory();

  const newGeo = resultBrush.geometry.clone();
  newGeo.computeVertexNormals();
  newGeo.applyMatrix4(mesh.matrixWorld.clone().invert());
  try { newGeo.boundsTree = new MeshBVH(newGeo); } catch {}
  mesh.geometry.dispose();
  mesh.geometry = newGeo;

  hideStatus();
  requestRender();
  close();
}

function makeBrush(mesh) {
  mesh.updateMatrixWorld(true);
  let geom = mesh.geometry.clone();
  geom.applyMatrix4(mesh.matrixWorld);
  for (const attr of Object.keys(geom.attributes)) {
    if (attr !== 'position' && attr !== 'normal') geom.deleteAttribute(attr);
  }
  try { geom = mergeVertices(geom, geom.index ? 1e-5 : 1e-4); } catch {}
  geom.computeVertexNormals();
  const b = new Brush(geom);
  b.updateMatrixWorld();
  return b;
}

function makeInnerBrush(mesh, centre, sx, sy, sz) {
  let geom = mesh.geometry.clone();
  geom.applyMatrix4(mesh.matrixWorld);
  for (const attr of Object.keys(geom.attributes)) {
    if (attr !== 'position' && attr !== 'normal') geom.deleteAttribute(attr);
  }
  try { geom = mergeVertices(geom, geom.index ? 1e-5 : 1e-4); } catch {}
  // Scale per-axis around the world bbox centre.
  geom.translate(-centre.x, -centre.y, -centre.z);
  geom.scale(sx, sy, sz);
  geom.translate(centre.x, centre.y, centre.z);
  geom.computeVertexNormals();
  const b = new Brush(geom);
  b.updateMatrixWorld();
  return b;
}
