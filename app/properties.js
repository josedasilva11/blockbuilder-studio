// Properties panel: renders editable fields for the currently selected shape.
// Mirrors Tinkercad's per-shape popup (name, dimensions, segments, colour, hole).

import { PALETTE } from './utils/palette.js';
import { SHAPE_BY_KIND } from './shapes/registry.js';
import { state } from './state.js';
import { onSelectionChange } from './selection.js';

const PARAM_LABELS = {
  width: 'Width (mm)',
  depth: 'Depth (mm)',
  height: 'Height (mm)',
  radius: 'Radius (mm)',
  radius_top: 'Top Radius (mm)',
  inner_radius: 'Inner Radius (mm)',
  minor_radius: 'Tube Radius (mm)',
  segments: 'Segments',
  minor_segments: 'Tube Segments',
  sides: 'Sides',
};

const PARAM_STEP = {
  segments: 1,
  minor_segments: 1,
  sides: 1,
};

let _body = null;

export function initProperties() {
  _body = document.getElementById('props-body');
  onSelectionChange(render);
  render(null);
}

function render(shape) {
  if (!shape) {
    _body.innerHTML = `<p class="hint">Drag a shape from the left, or click one in the viewport to edit it.</p>`;
    return;
  }
  const def = SHAPE_BY_KIND[shape.kind];
  if (!def) return;
  _body.innerHTML = '';

  const title = document.createElement('div');
  title.style.fontWeight = '600';
  title.textContent = `${def.label}  ·  ${shape.id}`;
  _body.appendChild(title);

  // Solid / Hole toggle
  const holeRow = document.createElement('div');
  holeRow.className = 'toggle-row';
  holeRow.innerHTML = `
    <button data-flag="solid" class="${shape.isHole ? '' : 'active'}">Solid</button>
    <button data-flag="hole" class="hole ${shape.isHole ? 'active' : ''}">Hole</button>
  `;
  for (const btn of holeRow.querySelectorAll('button')) {
    btn.addEventListener('click', () => {
      shape.setHole(btn.dataset.flag === 'hole');
      render(shape);
    });
  }
  _body.appendChild(holeRow);

  // Parameter sliders/inputs
  for (const key of def.params) {
    const row = document.createElement('div');
    row.className = 'prop-row';
    const id = `prop-${shape.id}-${key}`;
    const step = PARAM_STEP[key] ?? 0.1;
    row.innerHTML = `
      <label for="${id}">${PARAM_LABELS[key] || key}</label>
      <input id="${id}" type="number" step="${step}" min="${step}" value="${shape.params[key]}" />
    `;
    const input = row.querySelector('input');
    input.addEventListener('input', () => {
      const v = parseFloat(input.value);
      if (Number.isFinite(v) && v > 0) shape.setParam(key, v);
    });
    _body.appendChild(row);
  }

  // Position
  const posRow = document.createElement('div');
  posRow.className = 'prop-row';
  posRow.innerHTML = `<label>Position (mm)</label><div style="display:flex;gap:4px;">
    <input type="number" step="0.1" data-axis="x" />
    <input type="number" step="0.1" data-axis="y" />
    <input type="number" step="0.1" data-axis="z" />
  </div>`;
  const xs = posRow.querySelectorAll('input');
  ['x', 'y', 'z'].forEach((ax, i) => {
    xs[i].value = shape.mesh.position[ax].toFixed(2);
    xs[i].addEventListener('input', () => {
      const v = parseFloat(xs[i].value);
      if (Number.isFinite(v)) shape.mesh.position[ax] = v;
    });
  });
  _body.appendChild(posRow);

  // Colour swatches (solid only)
  if (!shape.isHole) {
    const cRow = document.createElement('div');
    cRow.className = 'prop-row';
    cRow.innerHTML = `<label>Colour</label><div class="color-grid"></div>`;
    const grid = cRow.querySelector('.color-grid');
    for (const c of PALETTE) {
      const sw = document.createElement('div');
      sw.className = `color-swatch${c === shape.color ? ' active' : ''}`;
      sw.style.background = '#' + c.toString(16).padStart(6, '0');
      sw.addEventListener('click', () => {
        shape.setColor(c);
        for (const s of grid.children) s.classList.remove('active');
        sw.classList.add('active');
      });
      grid.appendChild(sw);
    }
    _body.appendChild(cRow);
  }

  // Delete
  const del = document.createElement('button');
  del.textContent = 'Delete';
  del.style.cssText = 'background:#fff5f5;border:1px solid #f0c5c5;border-radius:6px;padding:6px;cursor:pointer;color:#a02020;margin-top:8px;';
  del.addEventListener('click', () => {
    shape.dispose();
    state.shapes.delete(shape.id);
    if (state.transformControls) state.transformControls.detach();
    render(null);
  });
  _body.appendChild(del);
}
