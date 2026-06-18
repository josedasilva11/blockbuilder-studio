// Layers: lightweight grouping of shapes by purpose. Each shape has a layerId.
// A layer controls per-layer visibility (cascades to every shape inside) and
// has a name + optional colour tint for the outliner row.
//
// State invariants:
//   - state.layers is never empty; if the user deletes the last layer we
//     recreate a "Layer 1" default.
//   - state.activeLayerId always references an existing layer.
//   - Every shape has a non-null layerId; migration on load assigns
//     'default' to any shape that came from a pre-layers .json.
//
// We deliberately keep this file thin — no DOM, no scene mutation beyond
// shape.mesh.visible. UI lives in outliner.js. Persistence lives in io.js.

import { state } from './state.js';
import { requestRender } from './scene.js';

function newLayerId() {
  return 'lyr_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 6);
}

export function ensureLayerExists(id) {
  if (!state.layers.find(l => l.id === id)) {
    state.layers.push({ id, name: id, visible: true, locked: false, color: null });
  }
}

export function getLayer(id) {
  return state.layers.find(l => l.id === id) || null;
}

export function getActiveLayer() {
  return getLayer(state.activeLayerId) || state.layers[0] || null;
}

export function addLayer(name) {
  const id = newLayerId();
  const layer = {
    id,
    name: name || `Layer ${state.layers.length + 1}`,
    visible: true,
    locked: false,
    color: null,
  };
  state.layers.push(layer);
  state.activeLayerId = id;
  return layer;
}

export function renameLayer(id, name) {
  const l = getLayer(id);
  if (!l) return;
  l.name = (name || '').trim() || l.name;
}

export function deleteLayer(id) {
  // Move every shape in this layer to the first surviving layer. If we're
  // about to delete the only layer, recreate a default first so shapes still
  // belong somewhere.
  if (state.layers.length === 1) {
    // Re-add a fresh default and move shapes into it.
    const def = { id: 'default', name: 'Layer 1', visible: true, locked: false, color: null };
    state.layers.unshift(def);
  }
  const survivors = state.layers.filter(l => l.id !== id);
  if (survivors.length === 0) return; // safety, shouldn't happen
  const fallback = survivors[0];
  for (const s of state.shapes.values()) {
    if (s.layerId === id) s.layerId = fallback.id;
  }
  state.layers = survivors;
  if (state.activeLayerId === id) state.activeLayerId = fallback.id;
}

export function setActiveLayer(id) {
  if (!getLayer(id)) return;
  state.activeLayerId = id;
}

export function moveShapeToLayer(shapeId, layerId) {
  const s = state.shapes.get(shapeId);
  if (!s || !getLayer(layerId)) return;
  s.layerId = layerId;
}

// Hide / show every shape in a layer. The shape's own per-shape visibility
// (its eye icon in the outliner) is preserved: when the layer flips back to
// visible, only shapes whose own _userVisible flag is true become visible.
export function setLayerVisibility(id, visible) {
  const layer = getLayer(id);
  if (!layer) return;
  layer.visible = visible;
  for (const s of state.shapes.values()) {
    if (s.layerId !== id) continue;
    // Combine layer-level + shape-level visibility. Shapes that the user has
    // explicitly hidden via the eye stay hidden when the layer goes visible.
    const userWants = s._userVisible !== false;
    s.mesh.visible = visible && userWants;
  }
  requestRender();
}

export function setLayerLocked(id, locked) {
  const layer = getLayer(id);
  if (!layer) return;
  layer.locked = locked;
}

// Convenience: is a shape currently selectable? (Layer not locked.)
export function isShapeInteractive(shape) {
  if (!shape) return false;
  const layer = getLayer(shape.layerId);
  if (!layer) return true;
  return !layer.locked && layer.visible;
}

// Migration: called by io.loadProject after deserializing layers + shapes,
// or on any state load that pre-dates the layers feature.
export function migrateLayersFromLoad(savedLayers, savedActiveLayerId) {
  if (Array.isArray(savedLayers) && savedLayers.length > 0) {
    state.layers = savedLayers.map(l => ({
      id: l.id,
      name: l.name || 'Layer',
      visible: l.visible !== false,
      locked: !!l.locked,
      color: l.color || null,
    }));
    state.activeLayerId = (savedActiveLayerId && state.layers.find(l => l.id === savedActiveLayerId))
      ? savedActiveLayerId
      : state.layers[0].id;
  } else {
    // Pre-layers project. One default layer, every shape lives in it.
    state.layers = [{ id: 'default', name: 'Layer 1', visible: true, locked: false, color: null }];
    state.activeLayerId = 'default';
  }
  // Ensure every shape has a known layerId pointing at an existing layer.
  for (const s of state.shapes.values()) {
    if (!s.layerId || !getLayer(s.layerId)) {
      s.layerId = state.activeLayerId;
    }
  }
}
