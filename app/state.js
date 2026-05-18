// Global app state. Kept simple — a single object that modules import and mutate.
// Selection, scene references, and the workplane all live here.

export const state = {
  scene: null,
  camera: null,
  renderer: null,
  controls: null,         // OrbitControls
  transformControls: null,
  workplane: { active: false, origin: [0, 0, 0], normal: [0, 0, 1] },
  snapStep: 1,             // mm; 0 means off
  shapes: new Map(),       // id → TinkerShape (see Shape class)
  selectedId: null,
  groupHostId: null,       // when inside an Edit Group, the host id
  nextId: 1,
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
