// Entry point: wires together every module + handles toolbar, keyboard, viewcube,
// empty state, autosave restore.

import { initScene, setView } from './scene.js';
import { initSidebar } from './sidebar.js';
import { initProperties } from './properties.js';
import { initGizmos, applySnap } from './gizmos.js';
import { installPickHandler, selectShape, getMultiSelection } from './selection.js';
import { state } from './state.js';
import { groupShapes, ungroupShapes, bakeGroup } from './csg.js';
import { exportSTL, saveProject, loadProject } from './io.js';
import { TinkerShape } from './shape.js';
import { initTooltip } from './tooltip.js';
import { installAutoSaveLoop, loadFromStorage } from './autosave.js';

function main() {
  const canvas = document.getElementById('viewport');
  initScene(canvas);
  initGizmos();
  installPickHandler(canvas);
  initSidebar({ viewport: canvas });
  initProperties();
  initTooltip();
  bindToolbar();
  bindKeyboard();
  bindViewcube();
  bindEmptyStateAndHud();

  const restored = loadFromStorage();
  if (restored > 0) console.info(`Restored ${restored} shape(s) from autosave.`);
  installAutoSaveLoop();
}

function bindToolbar() {
  document.getElementById('toolbar').addEventListener('click', (ev) => {
    const btn = ev.target.closest('[data-action]');
    if (!btn) return;
    const action = btn.dataset.action;
    switch (action) {
      case 'group': {
        const selection = getMultiSelection();
        const ids = selection.length > 0
          ? selection
          : [...state.shapes.values()].filter(s => s.mesh.visible).map(s => s.id);
        if (ids.length < 2) return;
        groupShapes(ids);
        break;
      }
      case 'ungroup': {
        const host = state.shapes.get(state.selectedId);
        if (host && host.isGroup) ungroupShapes(host);
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
    const k = ev.key;
    if (ev.ctrlKey && (k === 'd' || k === 'D')) { ev.preventDefault(); duplicateSelected(); }
    else if (ev.ctrlKey && (k === 'g' || k === 'G')) { ev.preventDefault(); document.querySelector('[data-action="group"]').click(); }
    else if (k === 'Delete' || k === 'Backspace') { deleteSelected(); }
    else if (k === 'Escape') { selectShape(null); }
    else if (k === '1') { setView('front'); }
    else if (k === '3') { setView('right'); }
    else if (k === '7') { setView('top'); }
    else if (k === '0') { setView('iso'); }
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
  const arr = [...state.shapes.values()].filter(s => s.mesh.visible);
  if (arr.length < 2) return;
  const cx = arr.reduce((s, x) => s + x.mesh.position.x, 0) / arr.length;
  const cy = arr.reduce((s, y) => s + y.mesh.position.y, 0) / arr.length;
  for (const s of arr) {
    s.mesh.position.x = cx;
    s.mesh.position.y = cy;
  }
}

function bindEmptyStateAndHud() {
  const empty = document.getElementById('empty-state');
  const hud = document.getElementById('hud');
  setInterval(() => {
    const n = state.shapes.size;
    empty.classList.toggle('hide', n > 0);

    const selected = state.shapes.get(state.selectedId);
    const sel = selected ? `${selected.kind.toLowerCase()}` : '—';
    const snap = state.snapStep > 0 ? `${state.snapStep} mm` : 'off';
    hud.innerHTML = `
      <span class="hud-key">shapes</span><span class="hud-val">${n}</span>
      <span class="hud-key">selected</span><span class="hud-val accent">${sel}</span>
      <span class="hud-key">snap</span><span class="hud-val">${snap}</span>
    `;
  }, 200);
}

main();
