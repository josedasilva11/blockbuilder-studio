// Properties panel, renders editable fields for the currently selected shape.
// Auto-polls the selected shape so values stay live while handles drag the mesh.

import * as THREE from 'three';
import { PALETTE, PALETTE_EXT, hexToInt, intToHex } from './utils/palette.js';
import { SHAPE_BY_KIND } from './shapes/registry.js';
import { state } from './state.js';
import { onSelectionChange } from './selection.js';
import { pushHistory } from './history.js';
import { requestRender } from './scene.js';
import { meshVolume, meshSurfaceArea, triangleCount } from './metrics.js';
import { repairSelected } from './repair.js';

const PARAM_LABELS = {
  width: 'Width',
  depth: 'Depth',
  height: 'Height',
  radius: 'Radius',
  radius_top: 'Top Radius',
  inner_radius: 'Inner Radius',
  minor_radius: 'Tube Radius',
  segments: 'Segments',
  minor_segments: 'Tube Segments',
  sides: 'Sides',
};
// Hover-explanations for every editable parameter. Shown on the label so the
// user knows what each number actually controls.
const PARAM_TIPS = {
  width:        'WIDTH, extent along the X axis (left ↔ right).',
  depth:        'DEPTH, extent along the Y axis (back ↔ front).',
  height:       'HEIGHT, extent along the Z axis (down ↔ up).',
  radius:       'RADIUS, outer radius. For cylinder/cone/sphere this is the size; for star/polygon it is the outer reach.',
  radius_top:   'TOP RADIUS, radius of the top face. Set to 0 for a pointed cone, > 0 for a truncated cone (frustum).',
  inner_radius: 'INNER RADIUS, the hole in the middle. Used by Tube (pipe wall) and Star (valleys between points).',
  minor_radius: 'TUBE RADIUS, thickness of the donut tube around the main ring.',
  segments:     'SEGMENTS, how many slices around the curve. Higher = smoother but heavier. 32 is enough for most things, 64+ for very large or close-up shapes.',
  minor_segments:'TUBE SEGMENTS, slices around the tube cross-section. 16 is the sweet spot.',
  sides:        'SIDES, how many edges the polygon/star has. 3 = triangle, 5 = pentagon, 6 = hexagon, etc.',
};
const PARAM_STEP = { segments: 1, minor_segments: 1, sides: 1 };

const SCALED_PARAMS = new Set(['width', 'depth', 'height', 'radius', 'inner_radius', 'minor_radius', 'radius_top']);
const PARAM_AXIS = {
  width: 'x', depth: 'y', height: 'z',
  radius: 'x', inner_radius: 'x', minor_radius: 'z', radius_top: 'x',
};

let _body = null;
let _currentShape = null;
let _inputs = {};   // map of key → element so we can refresh values
let _posInputs = null;

export function initProperties() {
  _body = document.getElementById('props-body');
  onSelectionChange((shape) => {
    _currentShape = shape;
    render(shape);
  });
  render(null);
  // Poll every 250ms so values stay synced while handles drag the mesh.
  // Inputs that have keyboard focus are skipped inside the function so the
  // user's typing isn't clobbered.
  setInterval(refreshLiveValues, 250);
}

function effectiveDim(shape, paramKey) {
  if (!SCALED_PARAMS.has(paramKey)) return shape.params[paramKey];
  const ax = PARAM_AXIS[paramKey] || 'x';
  return shape.params[paramKey] * (shape.mesh.scale[ax] ?? 1);
}

function refreshLiveValues() {
  const s = _currentShape;
  if (!s || !_inputs) return;
  for (const key in _inputs) {
    const el = _inputs[key];
    if (!el || document.activeElement === el) continue;
    el.value = effectiveDim(s, key).toFixed(2);
  }
  if (_posInputs) {
    ['x', 'y', 'z'].forEach((ax, i) => {
      const el = _posInputs[i];
      if (!el || document.activeElement === el) return;
      el.value = s.mesh.position[ax].toFixed(2);
    });
  }
  const op = document.getElementById('prop-opacity');
  if (op && document.activeElement !== op) {
    op.value = (s.mesh.material?.opacity ?? 1).toFixed(2);
  }
  // Volume / area / triangles depend on scale and live geometry, refresh
  // them in lockstep with the size inputs.
  updateMetrics(s);
}

function applyParam(shape, key, value) {
  if (!Number.isFinite(value) || value <= 0) return;
  if (SCALED_PARAMS.has(key)) {
    // Bake current scale: set the param to the new effective value, reset scale to 1.
    const ax = PARAM_AXIS[key] || 'x';
    shape.params[key] = value;
    shape.mesh.scale[ax] = 1;
    shape._rebuildGeometry();
  } else {
    shape.setParam(key, value);
  }
}

function render(shape) {
  _body.innerHTML = '';
  _inputs = {};
  _posInputs = null;
  if (!shape) {
    _body.innerHTML = `<div class="hint card">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="9"/><path d="M12 8 V12 M12 16 H12.01"/></svg>
      <p>Click a shape in the viewport (or marquee a group) to edit its parameters, colour, or opacity.</p>
    </div>`;
    return;
  }
  const def = SHAPE_BY_KIND[shape.kind];          // null for IMPORT
  const isImport = shape.kind === 'IMPORT';

  const title = document.createElement('div');
  title.style.fontWeight = '600';
  title.textContent = isImport
    ? `Imported  ·  ${shape.importedName || shape.id}`
    : `${def.label}  ·  ${shape.id}`;
  _body.appendChild(title);

  // Solid / Hole toggle
  const holeRow = document.createElement('div');
  holeRow.className = 'toggle-row';
  holeRow.innerHTML = `
    <button data-flag="solid" class="tip ${shape.isHole ? '' : 'active'}"
      data-tip="SOLID: a normal material shape. Combines (union) with other solids when grouped.">Solid</button>
    <button data-flag="hole" class="hole tip ${shape.isHole ? 'active' : ''}"
      data-tip="HOLE: cuts a void into solids when grouped (Group/CSG operation). Useful for drilling holes, carving slots, etc. Rendered translucent so you see through it.">Hole</button>
  `;
  for (const btn of holeRow.querySelectorAll('button')) {
    btn.addEventListener('click', () => {
      pushHistory();
      shape.setHole(btn.dataset.flag === 'hole');
      render(shape);
    });
  }
  _body.appendChild(holeRow);

  // Dimension / segment params (skip for IMPORT, geometry is fixed)
  if (def?.params) {
    for (const key of def.params) {
      const row = document.createElement('div');
      row.className = 'prop-row';
      const id = `prop-${shape.id}-${key}`;
      const step = PARAM_STEP[key] ?? 0.1;
      const suffix = SCALED_PARAMS.has(key) ? ` (${state.unit})` : '';
      const tip = PARAM_TIPS[key] || `Edit ${PARAM_LABELS[key] || key}. Change is undoable with Ctrl+Z.`;
      row.innerHTML = `
        <label for="${id}" class="tip" data-tip="${tip}">${PARAM_LABELS[key] || key}${suffix}</label>
        <input id="${id}" type="number" step="${step}" min="${step}" value="${effectiveDim(shape, key).toFixed(2)}" />
      `;
      const input = row.querySelector('input');
      input.addEventListener('change', () => { pushHistory(); applyParam(shape, key, parseFloat(input.value)); });
      _inputs[key] = input;
      _body.appendChild(row);
    }
  }
  if (isImport) {
    // Show effective bbox for the imported mesh so user has a sense of size.
    shape.mesh.updateMatrixWorld(true);
    const bb = new THREE.Box3().setFromObject(shape.mesh);
    if (!bb.isEmpty()) {
      const sz = bb.getSize(new THREE.Vector3());
      const row = document.createElement('div');
      row.className = 'prop-row';
      row.innerHTML = `<label class="tip" data-tip="SIZE, current bounding-box size of the imported mesh in ${state.unit}. Editing each field scales the mesh on that axis. X / Y / Z = width / depth / height.">Size (${state.unit})</label>
        <div style="display:flex;gap:4px;">
          <input type="number" step="0.1" data-axis="x" value="${sz.x.toFixed(2)}" title="X size (width)" />
          <input type="number" step="0.1" data-axis="y" value="${sz.y.toFixed(2)}" title="Y size (depth)" />
          <input type="number" step="0.1" data-axis="z" value="${sz.z.toFixed(2)}" title="Z size (height)" />
        </div>`;
      const inputs = [...row.querySelectorAll('input')];
      ['x', 'y', 'z'].forEach((ax, i) => {
        inputs[i].addEventListener('change', () => {
          const target = parseFloat(inputs[i].value);
          if (!Number.isFinite(target) || target <= 0) return;
          // Scale relative to the unscaled-bbox size on that axis
          pushHistory();
          const localBb = new THREE.Box3().setFromBufferAttribute(shape.mesh.geometry.attributes.position);
          const baseDim = (localBb.max[ax] - localBb.min[ax]) || 1;
          shape.mesh.scale[ax] = target / baseDim;
        });
      });
      _body.appendChild(row);
    }
  }

  // Position
  const posRow = document.createElement('div');
  posRow.className = 'prop-row';
  posRow.innerHTML = `<label class="tip" data-tip="POSITION, world-space centre of the shape, in ${state.unit}. X = left/right, Y = back/front, Z = up/down (Z = 0 is the workplane).">Position (${state.unit})</label><div style="display:flex;gap:4px;">
    <input type="number" step="0.1" data-axis="x" title="X, left/right position" />
    <input type="number" step="0.1" data-axis="y" title="Y, back/front position" />
    <input type="number" step="0.1" data-axis="z" title="Z, up/down position (0 = workplane)" />
  </div>`;
  _posInputs = [...posRow.querySelectorAll('input')];
  ['x', 'y', 'z'].forEach((ax, i) => {
    _posInputs[i].value = shape.mesh.position[ax].toFixed(2);
    _posInputs[i].addEventListener('change', () => {
      const v = parseFloat(_posInputs[i].value);
      if (Number.isFinite(v)) { pushHistory(); shape.mesh.position[ax] = v; }
    });
  });
  _body.appendChild(posRow);

  // Opacity slider
  const opRow = document.createElement('div');
  opRow.className = 'prop-row';
  opRow.innerHTML = `<label for="prop-opacity" class="tip" data-tip="OPACITY, how see-through this shape is in the viewport (1 = solid, 0.1 = nearly invisible). Only affects display; exported STL/OBJ is unaffected. Useful for peeking at hidden geometry without hiding the shape outright.">Opacity</label>
    <input id="prop-opacity" type="range" min="0.1" max="1" step="0.05" value="${(shape.mesh.material?.opacity ?? 1).toFixed(2)}" />`;
  const opInp = opRow.querySelector('input');
  opInp.addEventListener('input', () => {
    const v = parseFloat(opInp.value);
    if (!Number.isFinite(v)) return;
    const m = shape.mesh.material;
    if (!m) return;
    m.opacity = v;
    m.transparent = v < 0.999 || shape.isHole;
    m.needsUpdate = true;
    requestRender();
  });
  _body.appendChild(opRow);

  // Colour controls (solid only): quick palette + expandable extended bank +
  // native hex picker + free-form hex text input. Active swatch reflects the
  // current colour so the user always knows what they have.
  if (!shape.isHole) {
    const cRow = document.createElement('div');
    cRow.className = 'prop-row colour-row';
    cRow.innerHTML = `
      <label class="tip" data-tip="COLOUR, visual material colour of this shape. 8 quick-picks below; 'More colours' opens an extended palette; the picker / hex field accept any value. Hole shapes don't get a colour (always rendered red-translucent).">Colour</label>
      <div class="color-grid"></div>
      <button class="colour-more" type="button">More colours…</button>
      <div class="color-grid color-grid-ext" hidden></div>
      <div class="colour-custom-row">
        <input type="color" class="colour-native" value="${intToHex(shape.color)}" title="Pick any colour" />
        <input type="text" class="colour-hex" value="${intToHex(shape.color)}" maxlength="7" spellcheck="false" />
      </div>
    `;
    const grid = cRow.querySelector('.color-grid');
    const gridExt = cRow.querySelector('.color-grid-ext');
    const moreBtn = cRow.querySelector('.colour-more');
    const nativePicker = cRow.querySelector('.colour-native');
    const hexInput = cRow.querySelector('.colour-hex');

    function refreshActiveSwatches() {
      for (const el of cRow.querySelectorAll('.color-swatch')) {
        const v = parseInt(el.dataset.colour, 16);
        el.classList.toggle('active', v === shape.color);
      }
    }
    function applyColourFromUser(intColour) {
      if (!Number.isFinite(intColour)) return;
      pushHistory();
      shape.setColor(intColour);
      nativePicker.value = intToHex(intColour);
      hexInput.value = intToHex(intColour);
      refreshActiveSwatches();
    }
    function makeSwatch(c, parent) {
      const sw = document.createElement('div');
      sw.className = `color-swatch${c === shape.color ? ' active' : ''}`;
      sw.dataset.colour = c.toString(16).padStart(6, '0');
      sw.style.background = '#' + sw.dataset.colour;
      sw.addEventListener('click', () => applyColourFromUser(c));
      parent.appendChild(sw);
    }
    for (const c of PALETTE) makeSwatch(c, grid);
    for (const c of PALETTE_EXT) makeSwatch(c, gridExt);

    moreBtn.addEventListener('click', () => {
      const hidden = gridExt.hasAttribute('hidden');
      if (hidden) gridExt.removeAttribute('hidden'); else gridExt.setAttribute('hidden', '');
      moreBtn.textContent = hidden ? 'Fewer colours' : 'More colours…';
    });
    nativePicker.addEventListener('input', () => applyColourFromUser(hexToInt(nativePicker.value)));
    hexInput.addEventListener('change', () => {
      let v = hexInput.value.trim();
      if (v && !v.startsWith('#')) v = '#' + v;
      if (!/^#[0-9a-f]{6}$/i.test(v)) { hexInput.value = intToHex(shape.color); return; }
      applyColourFromUser(hexToInt(v));
    });
    _body.appendChild(cRow);
  }

  // Repair button, only relevant for IMPORTed / baked geometry. Welds
  // duplicate verts, drops degenerate triangles, rebuilds normals + BVH.
  if (isImport) {
    const repairRow = document.createElement('div');
    repairRow.className = 'prop-row';
    repairRow.innerHTML = `<button class="action-btn tip" data-tip="Weld duplicate vertices, drop zero-area triangles, rebuild normals + BVH. Run this when CSG fails on an imported mesh.">🔧 Repair mesh</button>`;
    repairRow.querySelector('button').addEventListener('click', repairSelected);
    _body.appendChild(repairRow);
  }

  // Metrics, volume / surface area / triangle count. Always shown so the
  // user can sanity-check geometry for print costs and complexity.
  const metricsRow = document.createElement('div');
  metricsRow.className = 'prop-row metrics-row';
  metricsRow.dataset.tip = 'Volume + surface area calculated from current geometry in world units. Triangles = mesh complexity.';
  metricsRow.classList.add('tip');
  metricsRow.innerHTML = `
    <label>Metrics</label>
    <div class="metrics-grid">
      <div><span>Volume</span><b id="m-vol">—</b></div>
      <div><span>Surface</span><b id="m-area">—</b></div>
      <div><span>Tris</span><b id="m-tri">—</b></div>
    </div>
  `;
  _body.appendChild(metricsRow);
  updateMetrics(shape);

  // Quick actions, Lock + Reset transform + Delete in one row of compact
  // buttons. Lock keeps the shape visible but skips it from picking; Reset
  // zeros rotation + scale (keeps position so the shape doesn't teleport).
  const actionRow = document.createElement('div');
  actionRow.className = 'prop-row action-row';
  actionRow.innerHTML = `
    <button class="action-btn ${shape.locked ? 'active' : ''}" data-act="lock"
      data-tip="Lock, keep visible but block any selection or edit. Click again to unlock."
      class="tip">${shape.locked ? '🔒 Locked' : '🔓 Lock'}</button>
    <button class="action-btn" data-act="reset"
      data-tip="Reset rotation + scale to identity (keeps position)" class="tip">Reset transform</button>
    <button class="action-btn delete-btn" data-act="delete"
      data-tip="Delete this shape (undoable with Ctrl+Z)" class="tip">Delete</button>
  `;
  actionRow.querySelector('[data-act="lock"]').addEventListener('click', (ev) => {
    pushHistory();
    shape.locked = !shape.locked;
    render(shape);
  });
  actionRow.querySelector('[data-act="reset"]').addEventListener('click', () => {
    pushHistory();
    shape.resetTransform({ keepPosition: true });
    requestRender();
    render(shape);
  });
  actionRow.querySelector('[data-act="delete"]').addEventListener('click', () => {
    pushHistory();
    shape.dispose();
    state.shapes.delete(shape.id);
    if (state.transformControls) state.transformControls.detach();
    render(null);
  });
  _body.appendChild(actionRow);
}

function updateMetrics(shape) {
  if (!shape || !shape.mesh) return;
  const vol = meshVolume(shape.mesh);
  const area = meshSurfaceArea(shape.mesh);
  const tri = triangleCount(shape.mesh);
  const u = state.unit || 'mm';
  const volEl  = document.getElementById('m-vol');
  const areaEl = document.getElementById('m-area');
  const triEl  = document.getElementById('m-tri');
  if (volEl)  volEl.textContent  = `${formatBig(vol)} ${u}³`;
  if (areaEl) areaEl.textContent = `${formatBig(area)} ${u}²`;
  if (triEl)  triEl.textContent  = formatBig(tri, 0);
}

function formatBig(n, digits = 2) {
  if (!Number.isFinite(n)) return '—';
  if (Math.abs(n) >= 1_000_000) return (n / 1_000_000).toFixed(digits) + 'M';
  if (Math.abs(n) >= 1_000) return (n / 1_000).toFixed(digits) + 'k';
  return n.toFixed(digits);
}
