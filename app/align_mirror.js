// Align and Mirror widgets. Tinkercad-style:
//   • Align — 9 dots positioned along the combined bbox edges (3 axes × 3
//             positions: min / centre / max). Click → align selected shapes
//             to that anchor on that axis.
//   • Mirror — 3 arrow buttons (X / Y / Z). Click → mirror selected shapes
//             across the combined bbox centre.
//
// Both widgets are HTML overlays positioned via projection of the bbox.

import * as THREE from 'three';
import { state } from './state.js';
import { getMultiSelection } from './selection.js';
import { pushHistory } from './history.js';

let _alignPanel = null;
let _mirrorPanel = null;

export function showAlignWidget() {
  const sel = currentSelection();
  if (sel.length < 1) return;
  closeAll();
  _alignPanel = buildPanel('align', sel);
}

export function showMirrorWidget() {
  const sel = currentSelection();
  if (sel.length < 1) return;
  closeAll();
  _mirrorPanel = buildPanel('mirror', sel);
}

export function closeAll() {
  if (_alignPanel) { _alignPanel.remove(); _alignPanel = null; }
  if (_mirrorPanel) { _mirrorPanel.remove(); _mirrorPanel = null; }
}

function currentSelection() {
  const ids = getMultiSelection();
  const arr = ids.map(id => state.shapes.get(id)).filter(Boolean);
  if (arr.length === 0 && state.selectedId) {
    const s = state.shapes.get(state.selectedId);
    if (s) arr.push(s);
  }
  return arr;
}

function combinedBBox(shapes) {
  const bb = new THREE.Box3();
  for (const s of shapes) {
    s.mesh.updateMatrixWorld(true);
    bb.expandByObject(s.mesh);
  }
  return bb;
}

function buildPanel(kind, shapes) {
  const panel = document.createElement('div');
  panel.className = 'amr-panel';
  panel.innerHTML = kind === 'align' ? alignHtml() : mirrorHtml();
  document.body.appendChild(panel);
  positionNearSelection(panel, shapes);
  panel.querySelector('.amr-close').addEventListener('click', closeAll);
  installDrag(panel);
  panel.addEventListener('click', (ev) => {
    const btn = ev.target.closest('[data-axis][data-spot]');
    if (!btn) return;
    const axis = btn.dataset.axis;
    const spot = btn.dataset.spot;
    if (kind === 'align') applyAlign(shapes, axis, spot);
    else applyMirror(shapes, axis);
  });
  return panel;
}

function installDrag(panel) {
  const head = panel.querySelector('.amr-title');
  if (!head) return;
  head.style.cursor = 'move';
  head.addEventListener('pointerdown', (ev) => {
    if (ev.target.closest('button')) return;
    ev.preventDefault();
    const rect = panel.getBoundingClientRect();
    const offsetX = ev.clientX - rect.left;
    const offsetY = ev.clientY - rect.top;
    const onMove = (e) => {
      panel.style.left = `${Math.max(8, Math.min(window.innerWidth - rect.width - 8, e.clientX - offsetX))}px`;
      panel.style.top  = `${Math.max(8, Math.min(window.innerHeight - rect.height - 8, e.clientY - offsetY))}px`;
    };
    const onUp = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  });
}

function alignHtml() {
  return `
    <div class="amr-title">
      Align <button class="amr-close" aria-label="Close">×</button>
    </div>
    <div class="amr-row"><span class="amr-axis x">X</span>
      <button data-axis="X" data-spot="min" data-tip="Align low X">⟨</button>
      <button data-axis="X" data-spot="center" data-tip="Center X">⊙</button>
      <button data-axis="X" data-spot="max" data-tip="Align high X">⟩</button>
    </div>
    <div class="amr-row"><span class="amr-axis y">Y</span>
      <button data-axis="Y" data-spot="min" data-tip="Align low Y">⟨</button>
      <button data-axis="Y" data-spot="center" data-tip="Center Y">⊙</button>
      <button data-axis="Y" data-spot="max" data-tip="Align high Y">⟩</button>
    </div>
    <div class="amr-row"><span class="amr-axis z">Z</span>
      <button data-axis="Z" data-spot="min" data-tip="Align low Z">⟨</button>
      <button data-axis="Z" data-spot="center" data-tip="Center Z">⊙</button>
      <button data-axis="Z" data-spot="max" data-tip="Align high Z">⟩</button>
    </div>
  `;
}

function mirrorHtml() {
  return `
    <div class="amr-title">
      Mirror <button class="amr-close" aria-label="Close">×</button>
    </div>
    <div class="amr-mirror">
      <button data-axis="X" data-spot="m" class="x">Mirror X ↔</button>
      <button data-axis="Y" data-spot="m" class="y">Mirror Y ↕</button>
      <button data-axis="Z" data-spot="m" class="z">Mirror Z ⇅</button>
    </div>
  `;
}

function positionNearSelection(panel, shapes) {
  const bb = combinedBBox(shapes);
  if (bb.isEmpty()) return;
  const c = bb.getCenter(new THREE.Vector3());
  const rect = state.renderer.domElement.getBoundingClientRect();
  const v = c.clone().project(state.camera);
  const sx = (v.x + 1) / 2 * rect.width + rect.left;
  const sy = -(v.y - 1) / 2 * rect.height + rect.top;
  panel.style.left = `${Math.min(sx + 40, window.innerWidth - 200)}px`;
  panel.style.top = `${Math.max(80, Math.min(sy - 60, window.innerHeight - 200))}px`;
}

function applyAlign(shapes, axis, spot) {
  if (shapes.length < 2) return;
  pushHistory();
  const bb = combinedBBox(shapes);
  const ax = axis.toLowerCase();
  let target;
  if (spot === 'min') target = bb.min[ax];
  else if (spot === 'max') target = bb.max[ax];
  else target = (bb.min[ax] + bb.max[ax]) / 2;

  for (const s of shapes) {
    s.mesh.updateMatrixWorld(true);
    const sb = new THREE.Box3().setFromObject(s.mesh);
    let cur;
    if (spot === 'min') cur = sb.min[ax];
    else if (spot === 'max') cur = sb.max[ax];
    else cur = (sb.min[ax] + sb.max[ax]) / 2;
    s.mesh.position[ax] += (target - cur);
  }
}

function applyMirror(shapes, axis) {
  if (shapes.length < 1) return;
  pushHistory();
  const bb = combinedBBox(shapes);
  const ax = axis.toLowerCase();
  const centre = (bb.min[ax] + bb.max[ax]) / 2;
  for (const s of shapes) {
    s.mesh.position[ax] = 2 * centre - s.mesh.position[ax];
    s.mesh.scale[ax] *= -1;
  }
}
