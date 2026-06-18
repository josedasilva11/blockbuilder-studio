// Global app state. Kept simple — a single object that modules import and mutate.
// Selection, scene references, and the workplane all live here.

export const state = {
  scene: null,
  camera: null,
  renderer: null,
  controls: null,         // OrbitControls
  transformControls: null,
  workplane: { active: false, origin: [0, 0, 0], normal: [0, 0, 1] },
  snapStep: 1,             // base units; 0 means off
  unit: 'mm',              // base unit label — chosen on first launch
  shapes: new Map(),       // id → TinkerShape (see Shape class)
  refGeoms: new Map(),     // id → RefGeom (planes, axes, midpoints — construction geometry)
  selectedId: null,
  groupHostId: null,       // when inside an Edit Group, the host id
  nextId: 1,
  // Layers: lightweight grouping of shapes by purpose ("base", "decoration",
  // "internals"). Always has at least one layer; default 'default' / "Layer 1"
  // is created on first render and is what every shape lands in unless the
  // user has explicitly chosen another active layer. Backward-compat: projects
  // saved before layers existed inherit `layerId = 'default'` on load.
  layers: [
    { id: 'default', name: 'Layer 1', visible: true, locked: false, color: null },
  ],
  activeLayerId: 'default',
};

export function setSelected(id) {
  state.selectedId = id;
}

export function getSelected() {
  return state.selectedId ? state.shapes.get(state.selectedId) : null;
}

export function registerShape(shape) {
  state.shapes.set(shape.id, shape);
}

export function unregisterShape(id) {
  state.shapes.delete(id);
  if (state.selectedId === id) state.selectedId = null;
}

export function freshId(prefix = 'tb') {
  const id = `${prefix}_${state.nextId.toString().padStart(4, '0')}`;
  state.nextId += 1;
  return id;
}
