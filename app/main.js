// Entry point: wires together every module + handles toolbar, keyboard, viewcube,
// empty state, autosave restore.

import { initScene, setView, toggleProjection, fitView, requestRender } from './scene.js';
import { initSidebar } from './sidebar.js';
import { initProperties } from './properties.js';
import { initGizmos, applySnap, attachToShape, hide as hideTC } from './gizmos.js';
import { installPickHandler, selectShape, getMultiSelection, onSelectionChange } from './selection.js';
import { state } from './state.js';
import { groupShapes, ungroupShapes, bakeGroup, intersectShapes } from './csg.js';
import { exportSTL, exportOBJ, saveProject, loadProject } from './io.js';
import { downloadSTEP } from './step_exporter.js';
import { pickAndImport } from './io_import.js';
import { TinkerShape } from './shape.js';
import { initTooltip } from './tooltip.js';
import { installAutoSaveLoop } from './autosave.js';
import { initHandles, attachHandles, detachHandles, refreshHandles } from './handles.js';
import { initOutliner } from './outliner.js';
import { initViewcube } from './viewcube.js';
import { initAxisWidget } from './axis_widget.js';
import { initStatus } from './status.js';
import { maybeShowUnitPicker, applyUnitToUi, showUnitPicker } from './unit_picker.js';
import { showWelcome, addRecent } from './welcome.js';
import { showAlignWidget, showMirrorWidget, closeAll as closeAmr } from './align_mirror.js';
import { updateDimOverlay, setDimOverlayEnabled } from './dim_overlay.js';
import { installEdgeHover } from './edge_hover.js';
import { installShortcutsPaletteKeybind, openShortcutsPalette } from './shortcuts_palette.js';
import { showCutWidget } from './cut.js';
import { initModelsSection } from './models.js';
import { showHollowWidget } from './hollow.js';
import { showArrayWidget } from './array.js';
import { initRuler, toggleRuler, isRulerActive } from './ruler.js';
import { initWorkplane, toggleWorkplane } from './workplane.js';
import { initPushPull, togglePushPull, isPushPullActive } from './push_pull.js';
import { initRefGeom, startPickPlane3P, startPickAxisEdge, startPickMidpoint } from './ref_geom.js';
import { initSketch, startExtrude, startRevolve, startScribble } from './sketch.js';
import { pushHistory, undo, redo, clearHistory } from './history.js';
import { initSettings, getSetting, setSetting, onSettingChange } from './settings.js';
import { bumpLaunchCount, shouldShowNag, showNag, isLicensed, getLicenseName, openLicenseDialog, revalidateLicense, BETA_MODE, BETA_MAILTO } from './support_nag.js';
import { toast } from './toast.js';
import { APP_VERSION } from './version.js';
import * as THREE from 'three';

function main() {
  const canvas = document.getElementById('viewport');
  initScene(canvas);
  // The render loop in scene.js calls state._updateDimOverlay() each frame
  // it actually renders. Setting it here keeps scene.js free of UI imports.
  state._updateDimOverlay = updateDimOverlay;
  installEdgeHover(canvas);
  installShortcutsPaletteKeybind();
  initGizmos();
  installPickHandler(canvas);
  initHandles(canvas);
  initSidebar({ viewport: canvas });
  initProperties();
  initOutliner();
  initTooltip();
  bindPanelTabs();
  bindToolbar();
  bindKeyboard();
  bindViewcube();
  bindEmptyStateAndHud();
  // No-op if the right panel doesn't have tabs anymore
  bindPanelTabs();

  initAxisWidget();
  initHelpFab();
  initStatus();
  initSettings();
  bindSettingsPanel();
  bindScreenshot();
  initModelsSection();
  initRuler(canvas);
  initWorkplane(canvas);
  initPushPull(canvas);
  initRefGeom(canvas);
  initSketch(canvas);

  const cubeWrap = document.getElementById('viewcube-wrap');
  if (cubeWrap) {
    // Insert the cube widget BEFORE the actions bar
    const actions = cubeWrap.querySelector('.viewcube-actions');
    const placeholder = document.createElement('div');
    cubeWrap.insertBefore(placeholder, actions);
    initViewcube(placeholder.parentElement);
    placeholder.remove();
  }

  onSelectionChange((shape, shapes) => {
    attachToShape(shape);
    if (shapes && shapes.length > 0) attachHandles(shapes);
    else detachHandles();
    hideTC();
  });

  // Handles poll for shape changes; the inner function has its own
  // sig-equality check so this is a cheap no-op when nothing moved.
  setInterval(refreshHandles, 100);

  // Autosave runs continuously, but startup behaviour is now explicit: ask the
  // user via the welcome modal what to load.
  installAutoSaveLoop();

  // Count every successful launch (used by the support nag's cadence).
  bumpLaunchCount();
  // Surface the version in the About block. Hardcoded constant from version.js,
  // bumped in lockstep with package.json on each release.
  const verEl = document.getElementById('props-about-ver');
  if (verEl) verEl.textContent = `v${APP_VERSION}`;

  // Verify the stored licence key against the embedded public key before we
  // decide whether to show the nag dialog. Async, but we hold the welcome
  // modal until it completes so isLicensed() is correct downstream.
  revalidateLicense().then(() => {
    maybeShowUnitPicker(() => {
      // showWelcome is async now (IndexedDB read); explicit `.then` so any
      // future await calls inside it can't race with the nag timeout below.
      Promise.resolve(showWelcome({ onClose: () => {
        setTimeout(() => { if (shouldShowNag()) showNag(); }, 600);
      }}));
    });
  });
  // Re-verify every 10 min to defeat the "edit localStorage in DevTools to
  // flip the licence on" trick. Cheap (just one ECDSA verify on a ~120-byte
  // payload) and runs in the background.
  setInterval(revalidateLicense, 10 * 60 * 1000);
  bindMobileDrawers();
}

// Mobile: Shapes (sidebar) and Properties slide in from the sides as drawers,
// triggered by the two .mobile-only buttons in the toolbar. The same scrim
// closes either drawer; Esc and clicking the scrim both clear the state.
// Drawer state lives on body[data-mobile-drawer]; CSS handles the transform.
function toggleMobileDrawer(which) {
  const current = document.body.dataset.mobileDrawer;
  if (current === which) {
    delete document.body.dataset.mobileDrawer;
  } else {
    document.body.dataset.mobileDrawer = which;
  }
}

function closeMobileDrawer() {
  delete document.body.dataset.mobileDrawer;
}

function bindMobileDrawers() {
  const scrim = document.getElementById('mobile-drawer-scrim');
  if (scrim) scrim.addEventListener('click', closeMobileDrawer);
  // Esc closes whichever drawer is open. Don't swallow if the user is in an
  // input, modal, or any other typing context.
  window.addEventListener('keydown', (ev) => {
    if (ev.key !== 'Escape') return;
    if (ev.target && ['INPUT', 'TEXTAREA', 'SELECT'].includes(ev.target.tagName)) return;
    if (document.body.dataset.mobileDrawer) closeMobileDrawer();
  });
  // Tapping inside the drawer's content should NOT close it; the scrim
  // sits behind the drawer and only catches taps that miss it, so this is
  // handled by stacking order alone (drawer z-index 50 > scrim z-index 40).
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
        pushHistory();
        groupShapes(ids);
        break;
      }
      case 'intersect': {
        const selection = getMultiSelection();
        const ids = selection.length > 0
          ? selection
          : [...state.shapes.values()].filter(s => s.mesh.visible).map(s => s.id);
        if (ids.length < 2) return;
        pushHistory();
        intersectShapes(ids);
        break;
      }
      case 'ungroup': {
        const host = state.shapes.get(state.selectedId);
        if (host && host.isGroup) { pushHistory(); ungroupShapes(host); }
        break;
      }
      case 'bake': {
        const host = state.shapes.get(state.selectedId);
        if (host && host.isGroup) { pushHistory(); bakeGroup(host); }
        break;
      }
      case 'split': {
        // Disabled in this build. The current welding algorithm produces
        // unstable parts on certain CSG outputs (broken normals, dead BVH).
        // Re-enable here once the rewrite lands.
        toast.info('Split is coming soon', { detail: 'The algorithm is being rewritten. Use Group + Bake for now if you need to merge; nothing currently unsplits a CSG result.' });
        break;
      }
      case 'cut': showCutWidget(); break;
      case 'hollow': showHollowWidget(); break;
      case 'array': showArrayWidget(); break;
      case 'ruler': toggleRuler(); document.querySelector('[data-action="ruler"]').classList.toggle('active', isRulerActive()); break;
      case 'workplane': toggleWorkplane(); break;
      case 'pushpull': togglePushPull(); break;
      case 'ref-plane': startPickPlane3P(); break;
      case 'ref-axis': startPickAxisEdge(); break;
      case 'ref-midpoint': startPickMidpoint(); break;
      case 'mobile-drawer-shapes': toggleMobileDrawer('shapes'); break;
      case 'mobile-drawer-properties': toggleMobileDrawer('properties'); break;
      case 'extrude':   startExtrude();   break;
      case 'revolve':   startRevolve();   break;
      case 'scribble':  startScribble();  break;
      case 'duplicate': pushHistory(); duplicateSelected(); break;
      case 'delete': pushHistory(); deleteSelected(); break;
      case 'align': showAlignWidget(); break;
      case 'mirror': showMirrorWidget(); break;
      case 'drop': pushHistory(); dropToGround(); break;
      case 'hide': toggleHide(); break;
      case 'toggle-projection': toggleProjection(); break;
      case 'save': saveProject(); break;
      case 'load': document.getElementById('load-file').click(); break;
      case 'export-stl': exportSTL(); break;
      case 'export-obj': exportOBJ(); break;
      case 'export-step': downloadSTEP(); break;
      case 'import-mesh': pickAndImport(); break;
    }
  });

  const snapInput = document.getElementById('snap-step');
  const snapPreset = document.getElementById('snap-preset');
  function syncSnap() {
    let v = parseFloat(snapInput.value);
    if (!Number.isFinite(v) || v < 0) v = 0;
    state.snapStep = v;
    applySnap();
  }
  snapInput.addEventListener('input', syncSnap);
  snapInput.addEventListener('change', syncSnap);
  snapPreset.addEventListener('change', (ev) => {
    if (ev.target.value === '') return;
    snapInput.value = ev.target.value;
    ev.target.value = '';
    syncSnap();
  });
  syncSnap();

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
    if (ev.ctrlKey && ev.shiftKey && (k === 'z' || k === 'Z')) { ev.preventDefault(); redo(); }
    else if (ev.ctrlKey && (k === 'z' || k === 'Z')) { ev.preventDefault(); undo(); }
    else if (ev.ctrlKey && (k === 'y' || k === 'Y')) { ev.preventDefault(); redo(); }
    else if (ev.ctrlKey && (k === 's' || k === 'S')) { ev.preventDefault(); saveProject(); }
    else if (ev.ctrlKey && (k === 'a' || k === 'A')) { ev.preventDefault(); selectAll(); }
    else if (ev.ctrlKey && (k === 'd' || k === 'D')) { ev.preventDefault(); pushHistory(); duplicateSelected(); }
    else if (ev.ctrlKey && ev.shiftKey && (k === 'g' || k === 'G')) { ev.preventDefault(); document.querySelector('[data-action="intersect"]')?.click(); }
    else if (ev.ctrlKey && (k === 'g' || k === 'G')) { ev.preventDefault(); document.querySelector('[data-action="group"]').click(); }
    else if (k === 'Delete' || k === 'Backspace') { pushHistory(); deleteSelected(); }
    else if (k === 'Escape') { selectShape(null); }
    else if (k === '1') { setView('front'); }
    else if (k === '3') { setView('right'); }
    else if (k === '7') { setView('top'); }
    else if (k === '0') { setView('iso'); }
    else if (k === 'd' && !ev.ctrlKey) { dropToGround(); }
    else if (k === 'h' || k === 'H') { toggleHide(); }
    else if (k === 'f' || k === 'F') { fitView(); }
  });
}

function bindPanelTabs() {
  const tabs = document.querySelectorAll('.panel-tabs button');
  if (!tabs.length) return;
  const propsBody = document.getElementById('props-body');
  const outlinerBody = document.getElementById('outliner-body');
  tabs.forEach(btn => {
    btn.addEventListener('click', () => {
      tabs.forEach(b => b.classList.toggle('active', b === btn));
      const tab = btn.dataset.tab;
      if (propsBody) propsBody.hidden = tab !== 'props';
      if (outlinerBody) outlinerBody.hidden = tab !== 'outliner';
    });
  });
}

function bindSettingsPanel() {
  const panel = document.getElementById('settings-panel');
  const toggle = document.getElementById('settings-toggle');
  if (!panel || !toggle) return;

  toggle.addEventListener('click', (ev) => {
    ev.stopPropagation();
    panel.hidden = !panel.hidden;
    if (!panel.hidden) syncSettingsUi();
  });
  panel.querySelector('.settings-close').addEventListener('click', () => { panel.hidden = true; });
  document.addEventListener('click', (ev) => {
    if (panel.hidden) return;
    if (panel.contains(ev.target)) return;
    if (ev.target.closest('#settings-toggle')) return;
    panel.hidden = true;
  });

  // Theme buttons
  for (const btn of panel.querySelectorAll('.settings-theme-btn')) {
    btn.addEventListener('click', () => setSetting('theme', btn.dataset.theme));
  }
  // Toggle checkboxes
  for (const inp of panel.querySelectorAll('.settings-toggle input[type="checkbox"]')) {
    inp.addEventListener('change', () => setSetting(inp.dataset.key, inp.checked));
  }
  // Background presets
  for (const btn of panel.querySelectorAll('.settings-bg-preset')) {
    btn.addEventListener('click', () => {
      const v = btn.dataset.bg;
      setSetting('bgColour', v === 'theme' ? null : v);
    });
  }
  // Custom colour picker
  const bgPicker = panel.querySelector('#bg-colour-picker');
  if (bgPicker) {
    bgPicker.addEventListener('input', () => setSetting('bgColour', bgPicker.value));
  }
  // Quality preset buttons
  for (const btn of panel.querySelectorAll('.settings-quality-btn')) {
    btn.addEventListener('click', () => setSetting('quality', btn.dataset.quality));
  }
  // Unit picker, opens the same first-run modal but on demand.
  const unitBtn = panel.querySelector('#settings-unit-change');
  const unitCur = panel.querySelector('#settings-unit-current');
  function refreshUnitLabel() { if (unitCur) unitCur.textContent = state.unit; }
  refreshUnitLabel();
  if (unitBtn) unitBtn.addEventListener('click', () => {
    showUnitPicker(() => { refreshUnitLabel(); toast.ok('Unit changed', { detail: `Now using ${state.unit}` }); });
  });
  // "Show welcome screen on launch" toggle (independent of the welcome
  // modal's own checkbox, both write the same localStorage key).
  const welcomeCb = panel.querySelector('#settings-show-welcome');
  if (welcomeCb) {
    welcomeCb.checked = localStorage.getItem('bb.skipWelcome') !== '1';
    welcomeCb.addEventListener('change', () => {
      if (welcomeCb.checked) localStorage.removeItem('bb.skipWelcome');
      else                   localStorage.setItem('bb.skipWelcome', '1');
    });
  }

  // License & support block, different copy depending on activation state.
  const licBox = panel.querySelector('#settings-license-box');
  function renderLicenseBox() {
    if (!licBox) return;
    if (isLicensed()) {
      licBox.innerHTML = `
        <p class="license-status ok">✓ Licensed to <strong>${escapeAttr(getLicenseName())}</strong></p>
        <p class="license-sub">Commercial use unlocked. Thanks for supporting the project.</p>
      `;
    } else if (BETA_MODE) {
      licBox.innerHTML = `
        <p class="license-sub"><strong style="color:#f7c948">BETA build.</strong> Payments are paused while we shake out bugs. If you've been invited and got a key from Marjers, click below to activate. Otherwise email <a href="mailto:geral@marjers.com">geral@marjers.com</a> to request beta access.</p>
        <div class="license-actions">
          <button class="action-btn" data-act="request">Request beta access</button>
          <button class="action-btn" data-act="activate">I have a key</button>
          <button class="action-btn" data-act="coffee">☕ Coffee</button>
        </div>
      `;
      licBox.querySelector('[data-act="request"]').addEventListener('click',
        () => window.open(BETA_MAILTO, '_blank'));
      licBox.querySelector('[data-act="coffee"]').addEventListener('click',
        () => window.open('https://buymeacoffee.com/marjers', '_blank'));
      licBox.querySelector('[data-act="activate"]').addEventListener('click',
        () => openLicenseDialog());
    } else {
      licBox.innerHTML = `
        <p class="license-sub">Free for personal use. Buy a one-time commercial licence if you use exports in for-profit work, or tip a coffee if it just earned its place on your machine.</p>
        <div class="license-actions">
          <button class="action-btn" data-act="buy">Buy licence (€12)</button>
          <button class="action-btn" data-act="activate">I have a key</button>
          <button class="action-btn" data-act="coffee">☕ Coffee</button>
        </div>
      `;
      licBox.querySelector('[data-act="buy"]').addEventListener('click',
        () => window.open('https://marjers.lemonsqueezy.com/buy/720c0f69-f860-427a-bddb-0c01481c1643', '_blank'));
      licBox.querySelector('[data-act="coffee"]').addEventListener('click',
        () => window.open('https://buymeacoffee.com/marjers', '_blank'));
      licBox.querySelector('[data-act="activate"]').addEventListener('click',
        () => openLicenseDialog());
    }
  }
  // Hook into the periodic sync so toggling licence reflects without a reopen.
  const _origSync = syncSettingsUi;
  function escapeAttr(s) { return String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
  renderLicenseBox();
  // Re-render whenever the panel opens (covers the case where the user just
  // activated a key in a separate dialog).
  toggle.addEventListener('click', () => setTimeout(renderLicenseBox, 50));
  // Keep UI in sync if settings change from elsewhere
  onSettingChange(syncSettingsUi);
  syncSettingsUi();

  function syncSettingsUi() {
    for (const inp of panel.querySelectorAll('.settings-toggle input[type="checkbox"]')) {
      inp.checked = !!getSetting(inp.dataset.key);
    }
    for (const btn of panel.querySelectorAll('.settings-theme-btn')) {
      btn.classList.toggle('active', btn.dataset.theme === getSetting('theme'));
    }
    for (const btn of panel.querySelectorAll('.settings-quality-btn')) {
      btn.classList.toggle('active', btn.dataset.quality === getSetting('quality'));
    }
  }
}

// Save a PNG snapshot of the current viewport. We force one render right
// before reading the canvas so we never grab a stale frame, then pipe the
// data URL into an invisible <a download> click.
function bindScreenshot() {
  const btn = document.getElementById('screenshot-btn');
  if (!btn) return;
  btn.addEventListener('click', () => {
    const renderer = state.renderer;
    const canvas = renderer?.domElement;
    if (!renderer || !canvas) return;
    try {
      renderer.render(state.scene, state.camera);
      const dataUrl = canvas.toDataURL('image/png');
      const a = document.createElement('a');
      const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
      const filename = `blockbuilder-${ts}.png`;
      a.download = filename;
      a.href = dataUrl;
      a.click();
      toast.ok('Screenshot saved', { detail: filename });
    } catch (err) {
      console.error('Screenshot failed:', err);
      toast.error('Screenshot failed', { detail: err.message });
    }
  });
}

function initHelpFab() {
  const toggle = document.getElementById('help-toggle');
  const card = document.getElementById('help-card');
  if (!toggle || !card) return;
  toggle.addEventListener('click', () => { card.hidden = !card.hidden; });
  // Close when clicking outside
  document.addEventListener('click', (ev) => {
    if (card.hidden) return;
    if (ev.target.closest('#help-fab')) return;
    card.hidden = true;
  });
}

function bindViewcube() {
  for (const btn of document.querySelectorAll('#viewcube-wrap button[data-view]')) {
    btn.addEventListener('click', () => setView(btn.dataset.view));
  }
  for (const btn of document.querySelectorAll('#viewcube-wrap button[data-action="toggle-projection"]')) {
    btn.addEventListener('click', toggleProjection);
  }
}

function dropToGround() {
  const s = state.shapes.get(state.selectedId);
  if (!s) return;
  s.mesh.updateMatrixWorld(true);
  const bb = new THREE.Box3().setFromObject(s.mesh);
  if (bb.isEmpty()) return;
  s.mesh.position.z += -bb.min.z;
}

function toggleHide() {
  const s = state.shapes.get(state.selectedId);
  if (!s) return;
  s.mesh.visible = !s.mesh.visible;
  requestRender();
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
  const ids = getMultiSelection();
  if (ids.length === 0) return;
  for (const id of ids) {
    const s = state.shapes.get(id);
    if (s) {
      s.dispose();
      state.shapes.delete(id);
    }
  }
  if (state.transformControls) state.transformControls.detach();
  selectShape(null);
}

function selectAll() {
  const ids = [...state.shapes.values()].filter(s => s.mesh.visible).map(s => s.id);
  if (ids.length === 0) return;
  selectShape(ids[0]);
  for (let i = 1; i < ids.length; i++) selectShape(ids[i], { additive: true });
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
  const memText = document.getElementById('mem-text');
  let _lastHudSig = '';
  setInterval(() => {
    const n = state.shapes.size;
    empty.classList.toggle('hide', n > 0);

    const multi = getMultiSelection();
    const snap = state.snapStep > 0 ? `${state.snapStep} ${state.unit}` : 'off';
    let selLabel;
    if (multi.length === 0) selLabel = '—';
    else if (multi.length === 1) {
      const s = state.shapes.get(multi[0]);
      selLabel = s ? s.kind.toLowerCase() : '1';
    } else {
      const kinds = multi.map(id => state.shapes.get(id)?.kind.toLowerCase()).filter(Boolean);
      selLabel = `${multi.length} (${kinds.slice(0, 3).join(', ')}${kinds.length > 3 ? '…' : ''})`;
    }
    // Skip the innerHTML write (and the layout-trash it causes) when the
    // displayed values are unchanged.
    const hudSig = `${n}|${selLabel}|${snap}`;
    if (hudSig !== _lastHudSig) {
      _lastHudSig = hudSig;
      hud.innerHTML = `
        <span class="hud-key tip" data-tip="SHAPES, total number of TinkerShapes currently in the scene (visible + hidden).">shapes</span><span class="hud-val">${n}</span>
        <span class="hud-key tip" data-tip="SELECTED, what the next operation (delete, group, transform) will act on. Multi-select with Shift+click or marquee.">selected</span><span class="hud-val accent">${selLabel}</span>
        <span class="hud-key tip" data-tip="SNAP, current snap step. Moves / resizes / spawns jump in increments of this value. Toolbar 'Snap' control changes it. Off = no snapping.">snap</span><span class="hud-val">${snap}</span>
      `;
    }

    // JS heap usage (Chromium only). Show MB used plus the % of the currently
    // allocated heap (used / total), which actually moves as the app fills up.
    if (memText && performance.memory) {
      const usedMb = performance.memory.usedJSHeapSize / 1024 / 1024;
      const totalMb = performance.memory.totalJSHeapSize / 1024 / 1024 || usedMb;
      const pct = totalMb > 0 ? (usedMb / totalMb) * 100 : 0;
      memText.textContent = `${usedMb.toFixed(0)} MB · ${pct.toFixed(0)}%`;
    }
  }, 500);
}

main();
