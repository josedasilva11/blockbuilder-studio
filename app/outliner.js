// Outliner — tree view of every shape, with CSG groups rendered as collapsible
// parents. Children of a group sit indented beneath their host so it's obvious
// what belongs where and the user can ungroup / bake without leaving the panel.

import { state } from './state.js';
import { selectShape, getMultiSelection } from './selection.js';
import { ungroupShapes, bakeGroup } from './csg.js';
import { requestRender } from './scene.js';

const KIND_GLYPH = {
  CUBE: '⬛', CYLINDER: '⬭', SPHERE: '◯', CONE: '▲', PYRAMID: '◆',
  WEDGE: '◢', ROOF: '⛺', TUBE: '◌', TORUS: '◯', HALF_SPHERE: '◐',
  POLYGON: '⬢', STAR: '★', HEART: '♥', IMPORT: '⬇',
};

let _body = null;
let _lastSig = '';
const _expanded = new Map();   // hostId → bool (default true)

export function initOutliner() {
  _body = document.getElementById('outliner-body');
  if (!_body) return;
  _body.addEventListener('click', onClick);
  _body.addEventListener('dblclick', onDblClick);
  setInterval(refresh, 400);
}

function refresh() {
  if (!_body) return;
  if (_body.querySelector('.ol-name.editing')) return;
  const selectedSet = new Set(getMultiSelection());
  const items = [...state.shapes.values()];

  // Build tree relationships
  const childToParent = new Map();
  for (const s of items) {
    if (Array.isArray(s.csgChildren)) {
      for (const cid of s.csgChildren) childToParent.set(cid, s.id);
    }
  }
  const topLevel = items.filter(s => !childToParent.has(s.id));

  const refs = [...(state.refGeoms?.values?.() ?? [])];

  // Stable signature so we only repaint on real changes
  const sig = items.map(s =>
    `${s.id}|${s.mesh.visible}|${s.isHole ? 1 : 0}|${selectedSet.has(s.id) ? 1 : 0}|${s.displayName?.() ?? s.kind}|${s.csgChildren?.length ?? 0}|${_expanded.get(s.id) !== false ? 1 : 0}`
  ).join(',') + '#' + refs.map(r => `${r.id}|${r.kind}|${r.visible ? 1 : 0}|${r.name}`).join(',');
  if (sig === _lastSig) return;
  _lastSig = sig;

  if (items.length === 0 && refs.length === 0) {
    _body.innerHTML = `<p class="hint">No shapes yet.<br>Drag one from the left to begin.</p>`;
    return;
  }

  let html = topLevel.map(s => renderRow(s, 0, selectedSet)).join('');
  if (refs.length > 0) {
    html += `<div class="ol-section-head">Reference geometry</div>`;
    html += refs.map(renderRefRow).join('');
  }
  _body.innerHTML = html;
}

const REF_GLYPH = { PLANE_3P: '▱', AXIS_EDGE: '⤢', MIDPOINT: '•' };

function renderRefRow(rg) {
  const hid = !rg.visible;
  const glyph = REF_GLYPH[rg.kind] || '◇';
  const name = escapeHtml(rg.name || rg.kind);
  return `<div class="outliner-row outliner-row-ref${hid ? ' is-hidden' : ''}" data-ref-id="${rg.id}" style="padding-left:8px;">
    <span class="ol-spacer"></span>
    <span class="ol-glyph ol-glyph-ref">${glyph}</span>
    <span class="ol-name" data-tip="${rg.kind.replace('_', ' ').toLowerCase()} reference — construction geometry, not printable, not exported">${name}</span>
    <button class="ol-mini tip" data-ref-eye="${rg.id}"
      data-tip="${hid ? 'Show this reference.' : 'Hide this reference (stays in the scene but invisible).'}">${hid ? eyeOff() : eyeOn()}</button>
    <button class="ol-mini tip" data-ref-del="${rg.id}"
      data-tip="Delete this reference. There is no undo for refs yet.">×</button>
  </div>`;
}

function renderRow(shape, depth, selectedSet) {
  const hid = !shape.mesh.visible;
  const sel = selectedSet.has(shape.id);
  const isGroup = Array.isArray(shape.csgChildren) && shape.csgChildren.length > 0;
  const expanded = _expanded.get(shape.id) !== false;  // default true
  const glyph = isGroup ? '⛓' : (KIND_GLYPH[shape.kind] || '◇');
  const name = shape.displayName?.() ?? shape.kind.toLowerCase();
  const padding = depth * 14;

  let html = `<div class="outliner-row${sel ? ' selected' : ''}${hid ? ' is-hidden' : ''}${isGroup ? ' is-group' : ''}${depth ? ' is-child' : ''}" data-id="${shape.id}" style="padding-left:${8 + padding}px;">
    ${isGroup
      ? `<button class="ol-chevron tip" data-toggle="${shape.id}"
           data-tip="${expanded ? 'Collapse: hide the group children in the outliner (they stay visible in the scene).' : 'Expand: show the parts that make up this group.'}"
           aria-label="${expanded ? 'Collapse' : 'Expand'}">${expanded ? '▾' : '▸'}</button>`
      : (depth ? `<span class="ol-thread">·</span>` : `<span class="ol-spacer"></span>`)
    }
    <span class="ol-glyph">${glyph}</span>
    <span class="ol-name tip" data-name="${shape.id}"
      data-tip="${isGroup ? 'GROUP — a CSG group made of multiple shapes. Number = members. Double-click to rename.' : 'Click to select · Double-click to rename · Drag in viewport to move'}">${escapeHtml(name)}${
      isGroup ? ` <span class="ol-count">${shape.csgChildren.length + 1}</span>` : ''
    }${shape.isHole ? ' <span class="ol-tag hole">hole</span>' : ''}</span>
    ${isGroup
      ? `<button class="ol-mini tip" data-bake="${shape.id}"
           data-tip="BAKE — make the CSG result permanent. Deletes the source parts, keeps only the combined mesh. Saves memory, but you can no longer ungroup.">⚙</button>
         <button class="ol-mini tip" data-ungroup="${shape.id}"
           data-tip="UNGROUP — restore the original parts of this group. Only works while the group is unbaked.">⛓̸</button>`
      : ''
    }
    <button class="ol-eye tip" data-eye="${shape.id}"
      data-tip="${hid ? 'Show this shape — it is currently hidden from the viewport but still in the scene.' : 'Hide this shape — keeps it in the scene but invisible. Useful for working on hidden parts.'}">${hid ? eyeOff() : eyeOn()}</button>
  </div>`;

  if (isGroup && expanded) {
    for (const childId of shape.csgChildren) {
      const child = state.shapes.get(childId);
      if (child) html += renderRow(child, depth + 1, selectedSet);
    }
  }
  return html;
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
}

function onClick(ev) {
  const toggle = ev.target.closest('[data-toggle]');
  if (toggle) {
    ev.stopPropagation();
    const id = toggle.dataset.toggle;
    _expanded.set(id, _expanded.get(id) === false);
    _lastSig = '';
    return;
  }
  const bake = ev.target.closest('[data-bake]');
  if (bake) {
    ev.stopPropagation();
    const host = state.shapes.get(bake.dataset.bake);
    if (host) bakeGroup(host);
    _lastSig = '';
    return;
  }
  const ung = ev.target.closest('[data-ungroup]');
  if (ung) {
    ev.stopPropagation();
    const host = state.shapes.get(ung.dataset.ungroup);
    if (host) ungroupShapes(host);
    _lastSig = '';
    return;
  }
  const eye = ev.target.closest('[data-eye]');
  if (eye) {
    ev.stopPropagation();
    const s = state.shapes.get(eye.dataset.eye);
    if (s) {
      s.mesh.visible = !s.mesh.visible;
      requestRender();
    }
    _lastSig = '';
    return;
  }
  // Reference geometry row buttons.
  const refEye = ev.target.closest('[data-ref-eye]');
  if (refEye) {
    ev.stopPropagation();
    const rg = state.refGeoms.get(refEye.dataset.refEye);
    if (rg) rg.setVisible(!rg.visible);
    _lastSig = '';
    return;
  }
  const refDel = ev.target.closest('[data-ref-del]');
  if (refDel) {
    ev.stopPropagation();
    const rg = state.refGeoms.get(refDel.dataset.refDel);
    if (rg) rg.dispose();
    _lastSig = '';
    return;
  }
  const row = ev.target.closest('[data-id]');
  if (row) {
    selectShape(row.dataset.id, {
      additive: ev.shiftKey,
      toggle: ev.ctrlKey || ev.metaKey,
    });
  }
}

function onDblClick(ev) {
  const name = ev.target.closest('.ol-name[data-name]');
  if (!name) return;
  const shape = state.shapes.get(name.dataset.name);
  if (!shape) return;
  ev.stopPropagation();
  startRename(name, shape);
}

function startRename(nameEl, shape) {
  const current = shape.displayName();
  nameEl.classList.add('editing');
  nameEl.innerHTML = `<input class="ol-name-input" value="${escapeHtml(current)}" />`;
  const inp = nameEl.querySelector('input');
  inp.select();
  const commit = () => {
    const v = inp.value.trim();
    shape.setName(v || null);
    nameEl.classList.remove('editing');
    _lastSig = '';
  };
  inp.addEventListener('blur', commit);
  inp.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { commit(); inp.blur(); }
    if (e.key === 'Escape') { inp.value = current; commit(); inp.blur(); }
  });
}

function eyeOn() {
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M2 12 S6 5 12 5 S22 12 22 12 S18 19 12 19 S2 12 2 12 Z"/><circle cx="12" cy="12" r="3"/></svg>`;
}
function eyeOff() {
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 3 L21 21 M10.5 6.4 A12 12 0 0 1 22 12 S20 15 16.5 17.4 M6 8 A12 12 0 0 0 2 12 S6 19 12 19 A11 11 0 0 0 17 18"/></svg>`;
}
