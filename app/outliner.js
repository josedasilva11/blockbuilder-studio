// Outliner — tree view of every shape, with CSG groups rendered as collapsible
// parents. Children of a group sit indented beneath their host so it's obvious
// what belongs where and the user can ungroup / bake without leaving the panel.

import { state } from './state.js';
import { selectShape, getMultiSelection } from './selection.js';
import { ungroupShapes, bakeGroup } from './csg.js';
import { requestRender } from './scene.js';
import {
  addLayer,
  deleteLayer,
  renameLayer,
  setActiveLayer,
  setLayerVisibility,
  moveShapeToLayer,
} from './layers.js';

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
  _body.addEventListener('contextmenu', onContextMenu);
  setInterval(refresh, 400);
}

function refresh() {
  if (!_body) return;
  // Skip when the outliner panel isn't visible in the layout tree (collapsed
  // into the mobile More menu, hidden tab, etc). offsetParent === null is a
  // cheap proxy for "this element renders zero pixels". Saves the signature
  // build + DOM diff at 2.5Hz on tablet/phone whenever the panel is off-screen.
  if (_body.offsetParent === null) return;
  if (_body.querySelector('.ol-name.editing')) return;
  if (_body.querySelector('.ol-layer-name.editing')) return;
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

  // Group top-level shapes by layerId. Any shape with a stale layerId gets
  // reassigned to the first layer so nothing falls off the outliner.
  const byLayer = new Map();
  for (const l of state.layers) byLayer.set(l.id, []);
  for (const s of topLevel) {
    if (!byLayer.has(s.layerId)) {
      s.layerId = state.layers[0]?.id || 'default';
    }
    byLayer.get(s.layerId).push(s);
  }

  const refs = [...(state.refGeoms?.values?.() ?? [])];

  // Stable signature so we only repaint on real changes
  const layerSig = state.layers
    .map(l => `${l.id}|${l.name}|${l.visible ? 1 : 0}|${l.locked ? 1 : 0}|${l.id === state.activeLayerId ? 1 : 0}`)
    .join(',');
  const shapeSig = items.map(s =>
    `${s.id}|${s.layerId}|${s.mesh.visible}|${s.isHole ? 1 : 0}|${selectedSet.has(s.id) ? 1 : 0}|${s.displayName?.() ?? s.kind}|${s.csgChildren?.length ?? 0}|${_expanded.get(s.id) !== false ? 1 : 0}`
  ).join(',');
  const refSig = refs.map(r => `${r.id}|${r.kind}|${r.visible ? 1 : 0}|${r.name}`).join(',');
  const sig = `${layerSig}#${shapeSig}#${refSig}`;
  if (sig === _lastSig) return;
  _lastSig = sig;

  // Always render the Layers section, even on a fresh scene, so users can
  // see and add layers before dropping any shape.
  let html = `<div class="ol-section-head ol-section-layers">Layers</div>`;
  for (const layer of state.layers) {
    const shapesInLayer = byLayer.get(layer.id) || [];
    html += renderLayerHeader(layer, shapesInLayer.length);
    if (layer.visible !== false) {
      // Render children only when the layer is unfolded (always for now).
      for (const s of shapesInLayer) {
        html += renderRow(s, 0, selectedSet);
      }
    } else {
      // Collapsed-by-visibility: still show the children but greyed out, so
      // user can find them and toggle their own eye.
      for (const s of shapesInLayer) {
        html += renderRow(s, 0, selectedSet);
      }
    }
  }
  html += `<button class="ol-new-layer" data-add-layer>+ New layer</button>`;

  if (items.length === 0 && refs.length === 0) {
    // Append the hint so it doesn't kill the layers UI on first launch.
    html += `<p class="hint" style="margin-top: 12px;">No shapes yet.<br>Drag one from the left to begin.</p>`;
  }

  if (refs.length > 0) {
    html += `<div class="ol-section-head">Reference geometry</div>`;
    html += refs.map(renderRefRow).join('');
  }
  _body.innerHTML = html;
}

function renderLayerHeader(layer, shapeCount) {
  const active = layer.id === state.activeLayerId;
  const hidden = layer.visible === false;
  const safeName = escapeHtml(layer.name || 'Layer');
  return `<div class="ol-layer${active ? ' is-active' : ''}${hidden ? ' is-hidden' : ''}" data-layer-id="${layer.id}">
    <span class="ol-layer-dot" data-tip="${active ? 'Active layer — new shapes spawn here.' : 'Click the name to make this the active layer.'}"></span>
    <span class="ol-layer-name tip" data-layer-name="${layer.id}"
      data-tip="${active ? 'Active layer. Click again to rename.' : 'Click to make this layer active. Double-click to rename.'}">${safeName}</span>
    <span class="ol-layer-count">${shapeCount}</span>
    <button class="ol-mini tip" data-layer-eye="${layer.id}"
      data-tip="${hidden ? 'Show this layer (all shapes inside become visible again).' : 'Hide this layer. Every shape inside is hidden from the viewport.'}">${hidden ? eyeOff() : eyeOn()}</button>
    <button class="ol-mini tip" data-layer-del="${layer.id}"
      data-tip="Delete this layer. Shapes inside move to the first surviving layer.">×</button>
  </div>`;
}

const REF_GLYPH = { PLANE_3P: '▱', AXIS_EDGE: '⤢', MIDPOINT: '•' };

function renderRefRow(rg) {
  const hid = !rg.visible;
  const glyph = REF_GLYPH[rg.kind] || '◇';
  const name = escapeHtml(rg.name || rg.kind);
  const useAsWp = rg.kind === 'PLANE_3P'
    ? `<button class="ol-mini tip" data-ref-workplane="${rg.id}"
         data-tip="Use this plane as the active workplane. New shapes spawn aligned to it.">⌂</button>`
    : '';
  return `<div class="outliner-row outliner-row-ref${hid ? ' is-hidden' : ''}" data-ref-id="${rg.id}" style="padding-left:8px;">
    <span class="ol-spacer"></span>
    <span class="ol-glyph ol-glyph-ref">${glyph}</span>
    <span class="ol-name" data-tip="${rg.kind.replace('_', ' ').toLowerCase()} reference, construction geometry, not printable, not exported">${name}</span>
    ${useAsWp}
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
  // Layer buttons: handled before shape rows so the row's data-id click
  // doesn't steal the event when clicking a layer header.
  const addLyr = ev.target.closest('[data-add-layer]');
  if (addLyr) {
    ev.stopPropagation();
    addLayer();
    _lastSig = '';
    return;
  }
  const layerEye = ev.target.closest('[data-layer-eye]');
  if (layerEye) {
    ev.stopPropagation();
    const id = layerEye.dataset.layerEye;
    const layer = state.layers.find(l => l.id === id);
    if (layer) setLayerVisibility(id, !layer.visible);
    _lastSig = '';
    return;
  }
  const layerDel = ev.target.closest('[data-layer-del]');
  if (layerDel) {
    ev.stopPropagation();
    const id = layerDel.dataset.layerDel;
    const layer = state.layers.find(l => l.id === id);
    if (!layer) return;
    const shapesInLayer = [...state.shapes.values()].filter(s => s.layerId === id);
    if (shapesInLayer.length > 0) {
      const ok = window.confirm(`Delete "${layer.name}"? ${shapesInLayer.length} shape${shapesInLayer.length === 1 ? '' : 's'} move into the first surviving layer.`);
      if (!ok) return;
    }
    deleteLayer(id);
    _lastSig = '';
    return;
  }
  const layerName = ev.target.closest('[data-layer-name]');
  if (layerName) {
    ev.stopPropagation();
    const id = layerName.dataset.layerName;
    setActiveLayer(id);
    _lastSig = '';
    return;
  }
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
      // Track user intent so when the parent layer's visibility toggles,
      // shapes the user explicitly hid stay hidden after re-show.
      s._userVisible = s.mesh.visible;
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
  const refWp = ev.target.closest('[data-ref-workplane]');
  if (refWp) {
    ev.stopPropagation();
    const rg = state.refGeoms.get(refWp.dataset.refWorkplane);
    if (rg && rg.kind === 'PLANE_3P') {
      const [a, b, c] = rg.data.points;
      const normal = b.clone().sub(a).cross(c.clone().sub(a)).normalize();
      const centroid = a.clone().add(b).add(c).multiplyScalar(1 / 3);
      // Dynamic import to keep outliner.js free of a workplane.js static dep
      // (workplane.js imports state.js, outliner.js imports state.js, no cycle
      // either way today, but static import keeps the surface tighter).
      import('./workplane.js').then((wp) => wp.setOverride(centroid, normal));
    }
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
  const layerName = ev.target.closest('.ol-layer-name[data-layer-name]');
  if (layerName) {
    ev.stopPropagation();
    const id = layerName.dataset.layerName;
    const layer = state.layers.find(l => l.id === id);
    if (layer) startLayerRename(layerName, layer);
    return;
  }
  const name = ev.target.closest('.ol-name[data-name]');
  if (!name) return;
  const shape = state.shapes.get(name.dataset.name);
  if (!shape) return;
  ev.stopPropagation();
  startRename(name, shape);
}

// Right-click on a shape row → small popover with "Move to layer →" entries
// for every layer the shape is not already in. Click outside / Esc closes.
let _ctxMenu = null;
function onContextMenu(ev) {
  const row = ev.target.closest('[data-id]');
  if (!row) return;
  ev.preventDefault();
  const shapeId = row.dataset.id;
  const shape = state.shapes.get(shapeId);
  if (!shape) return;
  closeContextMenu();
  _ctxMenu = document.createElement('div');
  _ctxMenu.className = 'ol-ctx-menu';
  const items = [];
  items.push(`<div class="ol-ctx-head">Move to layer</div>`);
  for (const layer of state.layers) {
    const current = layer.id === shape.layerId;
    items.push(
      `<button class="ol-ctx-item${current ? ' is-current' : ''}" data-move-layer="${layer.id}"${current ? ' disabled' : ''}>
        <span class="ol-ctx-dot${current ? ' is-current' : ''}"></span>
        <span class="ol-ctx-name">${escapeHtml(layer.name || 'Layer')}</span>
        ${current ? '<span class="ol-ctx-tag">here</span>' : ''}
      </button>`
    );
  }
  _ctxMenu.innerHTML = items.join('');
  document.body.appendChild(_ctxMenu);
  // Position near the cursor but clamped to viewport.
  const w = _ctxMenu.offsetWidth || 200;
  const h = _ctxMenu.offsetHeight || 200;
  const x = Math.min(ev.clientX, window.innerWidth - w - 8);
  const y = Math.min(ev.clientY, window.innerHeight - h - 8);
  _ctxMenu.style.left = x + 'px';
  _ctxMenu.style.top  = y + 'px';
  _ctxMenu.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-move-layer]');
    if (!btn) return;
    moveShapeToLayer(shapeId, btn.dataset.moveLayer);
    closeContextMenu();
    _lastSig = '';
  });
  setTimeout(() => {
    document.addEventListener('click', closeContextMenu, { once: true });
    document.addEventListener('keydown', escClose);
  }, 0);
}
function escClose(ev) { if (ev.key === 'Escape') closeContextMenu(); }
function closeContextMenu() {
  if (_ctxMenu && _ctxMenu.parentNode) _ctxMenu.parentNode.removeChild(_ctxMenu);
  _ctxMenu = null;
  document.removeEventListener('keydown', escClose);
}

function startLayerRename(nameEl, layer) {
  const current = layer.name;
  nameEl.classList.add('editing');
  nameEl.innerHTML = `<input class="ol-name-input" value="${escapeHtml(current)}" />`;
  const inp = nameEl.querySelector('input');
  inp.select();
  const commit = () => {
    const v = inp.value.trim() || current;
    renameLayer(layer.id, v);
    nameEl.classList.remove('editing');
    _lastSig = '';
  };
  inp.addEventListener('blur', commit);
  inp.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { commit(); inp.blur(); }
    if (e.key === 'Escape') { inp.value = current; commit(); inp.blur(); }
  });
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
