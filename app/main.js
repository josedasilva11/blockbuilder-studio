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
// Eager BVH raycast patch: needed for autosave-restored IMPORT shapes to keep
// fast picking even before io_import.js (lazy) loads.
import './bvh_raycast_patch.js';
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
import { installLongPressMenu } from './long_press_menu.js';
import { initSketch, startExtrude, startRevolve, startScribble } from './sketch.js';
import { pushHistory, undo, redo, clearHistory } from './history.js';
import { initSettings, getSetting, setSetting, onSettingChange } from './settings.js';
import { bumpLaunchCount, shouldShowNag, showNag, isLicensed, getLicenseName, openLicenseDialog, revalidateLicense, BETA_MODE, BETA_MAILTO } from './support_nag.js';
import { toast } from './toast.js';
import { APP_VERSION } from './version.js';
import { initNativeShell } from './native_shell.js';
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
  bindMenuBar();
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
  installLongPressMenu(canvas);
  initSketch(canvas);

  // Wire up iOS + Android native behaviour (back button, status bar, resume
  // render). No-op on desktop Electron / web PWA.
  initNativeShell();

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
  installPropsBodyHost();
  installTabletPropsCardSync();
}

// Scrim shared by the tablet insert popover, tablet props card, phone sheets,
// and the More menu. Tap-to-close clears every panel that might be open.
function closeMobileDrawer() {
  delete document.body.dataset.phoneSheet;
  delete document.body.dataset.tabletInsert;
  delete document.body.dataset.moreMenu;
  document.querySelector('.sidebar')?.classList.remove('phone-sheet-anchored');
  document.querySelector('.sidebar')?.classList.remove('tablet-insert-anchored');
}

// Tablet (769-1024 px): the sidebar acts as a fly-out popover anchored next
// to the tool-rail. Toggle by adding/removing the anchor class + body flag.
function toggleTabletInsertPopover() {
  const sidebar = document.querySelector('.sidebar');
  if (!sidebar) return;
  const open = sidebar.classList.toggle('tablet-insert-anchored');
  if (open) document.body.dataset.tabletInsert = 'open';
  else delete document.body.dataset.tabletInsert;
}

// More menu: secondary tools popover. Toggles via body[data-more-menu].
// Tapping any tool inside auto-closes the menu (the click bubbles up and the
// switch-case in bindToolbar handles the action AND the close, since
// data-more-menu is cleared at the end of every action below).
function toggleMoreMenu() {
  if (document.body.dataset.moreMenu === 'open') { closeMoreMenu(); return; }
  document.body.dataset.moreMenu = 'open';
  // Re-host the outliner-body inside the More menu so the user sees their
  // shape list as a "Layers" section. The element keeps its ID, outliner.js
  // continues polling it. On close we move it back to the sidebar.
  const outliner = document.getElementById('outliner-body');
  const moreHost = document.getElementById('more-outliner-host');
  if (outliner && moreHost && outliner.parentElement !== moreHost) {
    moreHost.dataset.originalParent = outliner.parentElement?.id || '';
    const empty = moreHost.querySelector('.more-outliner-empty');
    if (empty) empty.remove();
    moreHost.appendChild(outliner);
  }
}
function closeMoreMenu() {
  delete document.body.dataset.moreMenu;
  // Restore outliner-body back to the sidebar so the Insert popover still
  // shows it. The sidebar's static Outliner heading sits in DOM regardless;
  // we append the body element back to its original parent.
  const outliner = document.getElementById('outliner-body');
  const moreHost = document.getElementById('more-outliner-host');
  if (outliner && moreHost && outliner.parentElement === moreHost) {
    const originalId = moreHost.dataset.originalParent;
    const original = originalId ? document.getElementById(originalId) : null;
    const fallback = document.querySelector('.sidebar');
    (original || fallback)?.appendChild(outliner);
  }
}

// Phone (=768 px): one of two bottom sheets at a time. 'insert' rehosts the
// sidebar; 'props' shows the props-card. The scrim CSS gates on body
// [data-phone-sheet], tap-on-scrim closes via the existing scrim handler.
function togglePhoneSheet(which) {
  const sidebar = document.querySelector('.sidebar');
  const current = document.body.dataset.phoneSheet;
  // Close all sheets.
  if (sidebar) sidebar.classList.remove('phone-sheet-anchored');
  delete document.body.dataset.phoneSheet;
  if (current === which) return;     // toggle off
  if (which === 'insert' && sidebar) {
    sidebar.classList.add('phone-sheet-anchored');
    // Auto-close the sheet on the first tile spawn so the user can see the
    // shape they just placed without an extra tap. Re-open the sheet via the
    // Insert dock button to add a second shape.
    const closeOnSpawn = (ev) => {
      if (ev.target.closest('.shape-tile')) {
        sidebar.removeEventListener('click', closeOnSpawn, true);
        // Small delay so the spawn click finishes its work first.
        setTimeout(() => {
          sidebar.classList.remove('phone-sheet-anchored');
          if (document.body.dataset.phoneSheet === 'insert') delete document.body.dataset.phoneSheet;
        }, 80);
      }
    };
    sidebar.addEventListener('click', closeOnSpawn, true);
  }
  document.body.dataset.phoneSheet = which;
}

// Tablet-mode props-card sync: keep body[data-shape-selected] up to date so
// the floating card only appears when something is actually selected (matches
// Shapr3D's "no chrome unless you need it" feel).
function installTabletPropsCardSync() {
  const update = () => {
    if (state.selectedId) document.body.dataset.shapeSelected = '1';
    else delete document.body.dataset.shapeSelected;
  };
  // Initial state.
  update();
  // Patch into the existing selection-change pipeline. onSelectionChange is
  // already imported eagerly at the top of this file, no need for a Promise.
  onSelectionChange(update);
  // Close button on the floating card hides it. On tablet that means clearing
  // data-shape-selected (auto-show); on phone it means clearing data-phone-sheet
  // (explicit open). Clear both so it works in either layout.
  const close = document.querySelector('.props-card-close');
  if (close) close.addEventListener('click', () => {
    delete document.body.dataset.shapeSelected;
    if (document.body.dataset.phoneSheet === 'props') delete document.body.dataset.phoneSheet;
  });
}

// Move the existing #props-body element into the props-card-body so the same
// render() pipeline (properties.js) works in both desktop and tablet modes.
// The destination element wrap is decided by the current viewport width and
// re-evaluated on resize.
function installPropsBodyHost() {
  const original = document.getElementById('props-body');
  const desktopHost = document.querySelector('.properties');
  const cardHost = document.getElementById('props-card-body');
  if (!original || !desktopHost || !cardHost) return;
  // Tablet AND phone share the props-card-body host; desktop uses the
  // .properties aside. The card just gets restyled by media query.
  const mqlMobile = window.matchMedia('(max-width: 1024px)');
  const apply = () => {
    const wantCard = mqlMobile.matches;
    const currentParent = original.parentElement;
    if (wantCard && currentParent !== cardHost) cardHost.appendChild(original);
    else if (!wantCard && currentParent !== desktopHost) desktopHost.appendChild(original);
  };
  apply();
  mqlMobile.addEventListener('change', apply);
  window.addEventListener('resize', apply);
}

function bindMobileDrawers() {
  const scrim = document.getElementById('mobile-drawer-scrim');
  if (scrim) scrim.addEventListener('click', closeMobileDrawer);
  // Esc closes whichever drawer is open. Don't swallow if the user is in an
  // input, modal, or any other typing context.
  window.addEventListener('keydown', (ev) => {
    if (ev.key !== 'Escape') return;
    if (ev.target && ['INPUT', 'TEXTAREA', 'SELECT'].includes(ev.target.tagName)) return;
    if (document.body.dataset.phoneSheet || document.body.dataset.tabletInsert || document.body.dataset.moreMenu) {
      closeMobileDrawer();
    }
  });
  // Tapping inside the drawer's content should NOT close it; the scrim
  // sits behind the drawer and only catches taps that miss it, so this is
  // handled by stacking order alone (drawer z-index 50 > scrim z-index 40).
}

function bindToolbar() {
  // Listen on document level so the same data-action attributes work from
  // both the desktop toolbar AND the tablet-mode tool-rail. Each button
  // there has data-action="..." matching the desktop equivalent.
  document.addEventListener('click', (ev) => {
    const btn = ev.target.closest('[data-action]');
    if (!btn) return;
    const action = btn.dataset.action;
    // Auto-close the More menu after any action triggered from inside it,
    // EXCEPT the menu's own close button (which calls closeMoreMenu itself).
    const fromMoreMenu = btn.closest('.more-menu') !== null;
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
      case 'tablet-insert': toggleTabletInsertPopover(); break;
      case 'tablet-more': toggleMoreMenu(); break;
      case 'phone-insert': togglePhoneSheet('insert'); break;
      case 'phone-props': togglePhoneSheet('props'); break;
      case 'phone-shortcuts': openShortcutsPalette(); break;
      case 'phone-more': toggleMoreMenu(); break;
      case 'more-close': closeMoreMenu(); break;
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
      case 'export-step':
        // Lazy: STEP exporter is ~10 KB and only needed when the user clicks.
        import('./step_exporter.js').then((m) => m.downloadSTEP());
        break;
      case 'import-mesh':
        // Lazy: STLLoader + OBJLoader weigh ~31 KB of parse work that's only
        // needed on first import. BVH raycast patch is already eager-loaded.
        import('./io_import.js').then((m) => m.pickAndImport());
        break;
      // Menu-bar additions (existed only as keyboard shortcuts before)
      case 'new': newProject(); break;
      case 'undo': undo(); break;
      case 'redo': redo(); break;
      case 'select-all': selectAll(); break;
      case 'view-front': setView('front'); break;
      case 'view-right': setView('right'); break;
      case 'view-top':   setView('top');   break;
      case 'view-iso':   setView('iso');   break;
      case 'frame':      fitView();        break;
      case 'screenshot': document.getElementById('screenshot-btn')?.click(); break;
      case 'settings-open': document.getElementById('settings-toggle')?.click(); break;
      case 'toggle-theme': {
        const cur = getSetting('theme') || 'dark';
        setSetting('theme', cur === 'dark' ? 'light' : 'dark');
        break;
      }
      case 'shortcuts': openShortcutsPalette(); break;
      case 'open-tutorials': window.open('https://blockbuilder.studio/tutorials', '_blank', 'noopener'); break;
      case 'open-changelog': window.open('https://blockbuilder.studio/changelog.html', '_blank', 'noopener'); break;
      case 'open-about': toast.info('BlockBuilder Studio ' + APP_VERSION, { detail: 'Made by Marjers, offline 3D editor for makers. See https://blockbuilder.studio' }); break;
    }
    if (fromMoreMenu && action !== 'more-close' && action !== 'tablet-more' && action !== 'phone-more') {
      closeMoreMenu();
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
    else if (k === 'p' || k === 'P') { toggleProjection(); }
    else if (ev.ctrlKey && (k === 'k' || k === 'K')) { /* handled by installShortcutsPaletteKeybind */ }
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
  // The viewcube's P button has data-action="toggle-projection" and is
  // dispatched by the document-level bindToolbar listener now. We used to
  // attach an extra click handler here, which fired toggleProjection a
  // second time and cancelled out the first. Removed.
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

// File > New project. Confirm, wipe all shapes + refs + history, autosave the empty scene.
function newProject() {
  const shapeCount = state.shapes.size;
  const refCount = (state.refGeoms || []).length;
  if (shapeCount > 0 || refCount > 0) {
    const ok = window.confirm(`Start a new empty project? Current scene has ${shapeCount} shape${shapeCount === 1 ? '' : 's'}${refCount ? ' + ' + refCount + ' reference' + (refCount === 1 ? '' : 's') : ''}. Save first with Ctrl+S if you want to keep it.`);
    if (!ok) return;
  }
  for (const s of [...state.shapes.values()]) { s.dispose?.(); state.shapes.delete(s.id); }
  if (Array.isArray(state.refGeoms)) {
    for (const r of state.refGeoms) { if (r.object) state.scene.remove(r.object); }
    state.refGeoms.length = 0;
  }
  if (state.transformControls) state.transformControls.detach();
  selectShape(null);
  clearHistory();
  requestRender();
  toast.ok('New project', { detail: 'Empty scene. Drop a primitive from the sidebar to start.' });
}

// Menu bar: click trigger to open dropdown, click outside or Escape to close,
// hover another trigger while open to switch. Items are buttons with
// data-action — bindToolbar()'s document-level listener handles dispatch.
// We just close the open menu after any item click.
function bindMenuBar() {
  const menubar = document.getElementById('menubar');
  if (!menubar) return;
  function closeAll() {
    menubar.querySelectorAll('.menu.is-open').forEach(m => m.classList.remove('is-open'));
  }
  menubar.addEventListener('click', (ev) => {
    const trigger = ev.target.closest('.menu-trigger');
    if (trigger) {
      ev.stopPropagation();
      const menu = trigger.parentElement;
      const wasOpen = menu.classList.contains('is-open');
      closeAll();
      if (!wasOpen) menu.classList.add('is-open');
      return;
    }
    // Menu item: bindToolbar handler fires via the document-level listener;
    // we just close after the click.
    if (ev.target.closest('.menu-item')) closeAll();
  });
  menubar.addEventListener('mouseover', (ev) => {
    const anyOpen = menubar.querySelector('.menu.is-open');
    if (!anyOpen) return;
    const trigger = ev.target.closest('.menu-trigger');
    if (trigger && trigger.parentElement !== anyOpen) {
      closeAll();
      trigger.parentElement.classList.add('is-open');
    }
  });
  document.addEventListener('click', (ev) => {
    if (!ev.target.closest('#menubar')) closeAll();
  });
  document.addEventListener('keydown', (ev) => {
    if (ev.key === 'Escape') closeAll();
  });
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
