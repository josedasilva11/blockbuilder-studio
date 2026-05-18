// Entry point: wires together scene, sidebar, properties, gizmos, toolbar, IO.

import { initScene, setView } from './scene.js';
import { initSidebar } from './sidebar.js';
import { initProperties } from './properties.js';
import { initGizmos, applySnap, setMode } from './gizmos.js';
import { installPickHandler, selectShape } from './selection.js';
import { state } from './state.js';
import { groupShapes, ungroupShapes, bakeGroup } from './csg.js';
import { exportSTL, saveProject, loadProject } from './io.js';
import { TinkerShape } from './shape.js';

function main() {
  const canvas = document.getElementById('viewport');
  initScene(canvas);
  initGizmos();
  installPickHandler(canvas);
  initSidebar({ viewport: canvas });
  initProperties();
  bindToolbar();
  bindKeyboard();
  bindViewcube();
  showHud();
}

function bindToolbar() {
  document.getElementById('toolbar').addEventListener('click', (ev) => {
    const action = ev.target.dataset?.action;
    if (!action) return;
    switch (action) {
      case 'group': {
        const sel = state.selectedId ? [state.selectedId] : [];
        const all = [...state.shapes.values()].filter(s => s.mesh.visible);
        // Group: if multiple shapes are present and one is selected, group all visible + the selected hole(s)
        if (all.length < 2) return;
        groupShapes(all.map(s => s.id));
        break;
      }
      case 'ungroup': {
        const host = state.shapes.get(state.selectedId);
        if (host && host.isGroup) ungroupShapes(host);
        break;
      }
      case 'enter-group': {
        const host = state.shapes.get(state.selectedId);
        if (host && host.isGroup) {
          for (const cid of host.csgChildren) {
            const c = state.shapes.get(cid);
            if (c) c.mesh.visible = true;
          }
          state.groupHostId = host.id;
        }
        break;
      }
      case 'exit-group': {
        const host = state.shapes.get(state.groupHostId);
        if (host) {
          for (const cid of host.csgChildren) {
            const c = state.shapes.get(cid);
            if (c) c.mesh.visible = false;
          }
        }
        state.groupHostId = null;
        break;
      }
      case 'bake': {
        const host = state.shapes.get(state.selectedId);
        if (host && host.isGroup) bakeGroup(host);
        break;
      }
      case 'duplicate': duplicateSelected(); break;
      case 'delete': deleteSelected(); break;
      case 'align': alignSelectedCenters(); break;
      case 'set-workplane': alert('Click any face after pressing Set Workplane (todo)'); break;
      case 'reset-workplane':
        state.workplane = { active: false, origin: [0, 0, 0], normal: [0, 0, 1] };
        break;
      case 'save': saveProject(); break;
      case 'load': document.getElementById('load-file').click(); break;
      case 'export-stl': exportSTL(); break;
    }
  });

  document.getElementById('snap-step').addEventListener('change', (ev) => {
    state.snapStep = parseFloat(ev.target.value);
    applySnap();
  });

  document.getElementById('load-file').addEventListener('change', (ev) => {
    const f = ev.target.files[0];
    if (f) loadProject(f);
    ev.target.value = '';
  });
}

function bindKeyboard() {
  window.addEventListener('keydown', (ev) => {
    if (ev.target && ['INPUT', 'TEXTAREA', 'SELECT'].includes(ev.target.tagName)) return;
    if (ev.ctrlKey && (ev.key === 'd' || ev.key === 'D')) { ev.preventDefault(); duplicateSelected(); }
    else if (ev.ctrlKey && (ev.key === 'g' || ev.key === 'G')) { ev.preventDefault(); document.querySelector('[data-action="group"]').click(); }
    else if (ev.key === 'Delete' || ev.key === 'Backspace') { deleteSelected(); }
    else if (ev.key === 'Escape') { selectShape(null); }
  });
}

function bindViewcube() {
  for (const btn of document.querySelectorAll('#viewcube button')) {
    btn.addEventListener('click', () => setView(btn.dataset.view));
  }
}

function duplicateSelected() {
  const src = state.shapes.get(state.selectedId);
  if (!src) return;
  const data = src.serialize();
  delete data.id;
  data.position = [data.position[0] + 5, data.position[1] + 5, data.position[2]];
  const shape = TinkerShape.deserialize(data);
  state.scene.add(shape.mesh);
  selectShape(shape.id);
}

function deleteSelected() {
  const src = state.shapes.get(state.selectedId);
  if (!src) return;
  src.dispose();
  state.shapes.delete(src.id);
  if (state.transformControls) state.transformControls.detach();
  selectShape(null);
}

function alignSelectedCenters() {
  // Naive: align all currently-visible shapes' XY centers to the average.
  const arr = [...state.shapes.values()].filter(s => s.mesh.visible);
  if (arr.length < 2) return;
  const cx = arr.reduce((s, x) => s + x.mesh.position.x, 0) / arr.length;
  const cy = arr.reduce((s, y) => s + y.mesh.position.y, 0) / arr.length;
  for (const s of arr) {
    s.mesh.position.x = cx;
    s.mesh.position.y = cy;
  }
}

function showHud() {
  const hud = document.getElementById('hud');
  setInterval(() => {
    const n = state.shapes.size;
    const selected = state.shapes.get(state.selectedId);
    const sel = selected ? `${selected.kind} ${selected.id}` : 'none';
    const snap = state.snapStep > 0 ? `${state.snapStep} mm` : 'off';
    hud.textContent = `Shapes: ${n}  ·  Selected: ${sel}  ·  Snap: ${snap}`;
  }, 200);
}

main();
