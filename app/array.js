// Array — linear (N copies along an axis with spacing) or circular (N copies
// around an axis with total angle). Each copy is a real TinkerShape so it can
// be edited independently after the operation. Cheaper than running CSG and
// the result is whatever the user expects from a duplicate-and-offset.

import * as THREE from 'three';
import { state } from './state.js';
import { TinkerShape } from './shape.js';
import { selectShape } from './selection.js';
import { pushHistory } from './history.js';
import { requestRender } from './scene.js';
import { toast } from './toast.js';

let _panel = null;
let _source = null;
let _mode = 'linear';
let _axis = 'X';
let _count = 4;
let _spacing = 20;
let _totalAngle = 360;
let _radius = 20;
let _skipText = '';

// Parse a comma / space-separated list of 1-based indices into a Set. Anything
// non-numeric or out of range is silently dropped; an empty string returns an
// empty Set. Examples:
//   ''           -> Set()
//   '3'          -> Set([3])
//   '3,7,9'      -> Set([3, 7, 9])
//   '3 5  9'     -> Set([3, 5, 9])
//   '3,5,foo,9'  -> Set([3, 5, 9])
function parseSkipList(text) {
  const out = new Set();
  if (!text) return out;
  for (const tok of String(text).split(/[\s,]+/)) {
    const n = parseInt(tok, 10);
    if (Number.isFinite(n) && n >= 1) out.add(n);
  }
  return out;
}

export function showArrayWidget() {
  const s = state.shapes.get(state.selectedId);
  if (!s) { toast.warn('Select a shape first', { detail: 'Click any shape in the viewport, then open Array again.' }); return; }
  _source = s;
  // Seed the radius input from the source's distance from world origin (on the
  // plane perpendicular to the default Z axis). Saves a manual edit in the
  // common case where the user already moved the source away from centre.
  const d = Math.hypot(s.mesh.position.x, s.mesh.position.y);
  _radius = d > 0.5 ? d : 20;
  buildPanel();
}

function buildPanel() {
  if (_panel) _panel.remove();
  _panel = document.createElement('div');
  _panel.className = 'array-panel';
  _panel.innerHTML = `
    <div class="array-header">
      <span>Array</span>
      <button class="array-close" title="Cancel">×</button>
    </div>
    <div class="array-mode">
      <button data-mode="linear"   class="active" data-tip="Place N copies along an axis with a fixed spacing">Linear</button>
      <button data-mode="circular" data-tip="Place N copies around an axis, spread across a total angle">Circular</button>
    </div>
    <div class="array-axes">
      <label>Axis</label>
      <div class="array-axes-row">
        <button data-axis="X" data-tip="Replicate along the X axis">X</button>
        <button data-axis="Y" data-tip="Replicate along the Y axis">Y</button>
        <button data-axis="Z" class="active" data-tip="Replicate along the Z axis">Z</button>
      </div>
    </div>
    <div class="array-row">
      <label>Count</label>
      <input type="number" class="array-count" min="2" max="200" step="1" value="${_count}" />
    </div>
    <div class="array-row array-linear-row">
      <label>Spacing (${state.unit})</label>
      <input type="number" class="array-spacing" step="0.5" value="${_spacing}" />
    </div>
    <div class="array-row array-circular-row" hidden>
      <label>Total angle (°)</label>
      <input type="number" class="array-angle" step="5" value="${_totalAngle}" />
    </div>
    <div class="array-row array-circular-row" hidden>
      <label data-tip="Distance from the rotation axis. Defaults to the source shape's current distance from the world origin — move the source away from (0,0,0) before clicking Array, or override the radius here." class="tip">Radius (${state.unit})</label>
      <input type="number" class="array-radius" step="0.5" value="20" />
    </div>
    <div class="array-row">
      <label data-tip="Comma-separated 1-based indices to omit from the pattern. Index 0 is the source shape (always kept). Useful for hex grids missing the centre, masonry patterns, etc. Examples: '3' skips instance 3; '3, 7, 9' skips three; leave empty for no skip." class="tip">Skip instances</label>
      <input type="text" class="array-skip" placeholder="e.g. 3, 7, 9" value="${_skipText}" autocomplete="off" />
    </div>
    <div class="array-actions">
      <button class="array-cancel">Cancel</button>
      <button class="array-confirm primary">Create</button>
    </div>
  `;
  document.body.appendChild(_panel);

  _axis = 'Z'; _mode = 'linear';

  for (const b of _panel.querySelectorAll('.array-mode button')) {
    b.addEventListener('click', () => {
      _mode = b.dataset.mode;
      for (const bb of _panel.querySelectorAll('.array-mode button')) bb.classList.toggle('active', bb === b);
      _panel.querySelector('.array-linear-row').hidden = _mode !== 'linear';
      _panel.querySelector('.array-circular-row').hidden = _mode !== 'circular';
    });
  }
  for (const b of _panel.querySelectorAll('.array-axes button')) {
    b.addEventListener('click', () => {
      _axis = b.dataset.axis;
      for (const bb of _panel.querySelectorAll('.array-axes button')) bb.classList.toggle('active', bb === b);
    });
  }
  _panel.querySelector('.array-count').addEventListener('change', (e) => {
    const v = parseInt(e.target.value, 10);
    if (Number.isFinite(v) && v >= 2 && v <= 200) _count = v; else e.target.value = _count;
  });
  _panel.querySelector('.array-spacing').addEventListener('change', (e) => {
    const v = parseFloat(e.target.value);
    if (Number.isFinite(v)) _spacing = v;
  });
  _panel.querySelector('.array-angle').addEventListener('change', (e) => {
    const v = parseFloat(e.target.value);
    if (Number.isFinite(v)) _totalAngle = v;
  });
  const radiusInput = _panel.querySelector('.array-radius');
  radiusInput.value = _radius.toFixed(2);
  radiusInput.addEventListener('change', (e) => {
    const v = parseFloat(e.target.value);
    if (Number.isFinite(v) && v >= 0) _radius = v;
    else e.target.value = _radius.toFixed(2);
  });
  _panel.querySelector('.array-skip').addEventListener('change', (e) => {
    _skipText = e.target.value;
  });
  _panel.querySelector('.array-close').addEventListener('click', close);
  _panel.querySelector('.array-cancel').addEventListener('click', close);
  _panel.querySelector('.array-confirm').addEventListener('click', performArray);
}

function close() {
  if (_panel) { _panel.remove(); _panel = null; }
  _source = null;
}

function performArray() {
  if (!_source) return;
  pushHistory();

  const src = _source;
  const srcData = src.serialize();
  // Hoist the JSON.stringify out of the per-instance loop. With N instances
  // we used to re-stringify the same source object N times; now we stringify
  // once and JSON.parse per copy.
  const srcJson = JSON.stringify(srcData);

  const axisVec = new THREE.Vector3(
    _axis === 'X' ? 1 : 0,
    _axis === 'Y' ? 1 : 0,
    _axis === 'Z' ? 1 : 0,
  );

  // For circular mode: the rotation centre is the world origin, projected
  // onto the plane perpendicular to the chosen axis. If the source sits on
  // that axis (radius ≈ 0), shapes would all stack — so we push it outward
  // by the chosen radius along the source's natural radial direction (or +X
  // if it's exactly centred).
  let sourceRadial = null;
  if (_mode === 'circular') {
    const projAxis = axisVec.clone();
    const srcPos = src.mesh.position.clone();
    // Component of source position parallel to the rotation axis.
    const along = projAxis.clone().multiplyScalar(srcPos.dot(projAxis));
    // Radial = source position minus its along-axis component.
    sourceRadial = srcPos.clone().sub(along);
    const sourceR = sourceRadial.length();
    if (sourceR < 0.01) {
      // Source effectively on the axis — pick a default radial direction.
      // X if axis is Z or Y; Y if axis is X.
      sourceRadial = _axis === 'X' ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(1, 0, 0);
    } else {
      sourceRadial.normalize();
    }
    // Force the source itself to sit at the requested radius so all N copies
    // (including #0 = source) sit on a clean circle. Update history was
    // already pushed before this call.
    const newSrc = along.add(sourceRadial.clone().multiplyScalar(_radius));
    src.mesh.position.copy(newSrc);
    // Reflect this in the serialised snapshot we copy from.
    srcData.position = src.mesh.position.toArray();
  }

  const skip = parseSkipList(_skipText);
  const newShapes = [];
  let skippedCount = 0;
  for (let i = 1; i < _count; i++) {
    // Skip this instance if its 1-based index is in the skip list. We start
    // i=1 because i=0 is the source itself (never duplicated, never skipped).
    if (skip.has(i)) { skippedCount++; continue; }
    const data = JSON.parse(srcJson);
    delete data.id;
    const copy = TinkerShape.deserialize(data);
    state.scene.add(copy.mesh);

    if (_mode === 'linear') {
      copy.mesh.position.add(axisVec.clone().multiplyScalar(_spacing * i));
    } else {
      // Circular: rotate the source's already-radial position around the
      // axis at world origin. Each step covers totalAngle / (N or N-1).
      const totalRad = THREE.MathUtils.degToRad(_totalAngle);
      const step = totalRad / (_totalAngle >= 359 ? _count : _count - 1);
      const angle = step * i;
      const srcPos = src.mesh.position.clone();
      srcPos.applyAxisAngle(axisVec, angle);
      copy.mesh.position.copy(srcPos);
      copy.mesh.quaternion.premultiply(
        new THREE.Quaternion().setFromAxisAngle(axisVec, angle)
      );
    }
    newShapes.push(copy);
  }

  selectShape(src.id);
  for (const c of newShapes) selectShape(c.id, { additive: true });
  requestRender();
  if (skippedCount > 0) {
    toast.ok(`Array created (${newShapes.length} copies, ${skippedCount} skipped)`);
  }
  close();
}
