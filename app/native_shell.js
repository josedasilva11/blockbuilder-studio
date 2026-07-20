// Native shell adapter for iOS + Android (Capacitor). Everything that only
// makes sense inside the wrapped app lives here, so the desktop / PWA build
// pays nothing for it (Capacitor plugins no-op on web platform).
//
// What it does:
//   1. Android hardware back button: closes modals / menus / drawers first,
//      deselects if a shape is selected, and only exits the app when there
//      is literally nothing left to close.
//   2. iOS status bar: forces dark style + a matching background colour so
//      the status bar text stays legible against the app's dark background.
//   3. App lifecycle: on resume, re-request a render so the canvas doesn't
//      sit on a stale frame from when the app was backgrounded.
//
// All effects are wrapped in isNativePlatform() checks so this module is
// safe to import unconditionally from main.js.

import { state } from './state.js';
import { selectShape } from './selection.js';

function isNativePlatform() {
  try {
    return !!(window.Capacitor
      && typeof window.Capacitor.isNativePlatform === 'function'
      && window.Capacitor.isNativePlatform());
  } catch { return false; }
}

// Priority-ordered list of things to close on back press. First match wins.
// Uses generic DOM selectors so tools that use the .cut-panel / .hollow-panel /
// .array-panel / .amr-panel pattern (see edge_hover.shouldSkipFrame) are
// picked up automatically, and every modal-style host we ship today has one
// of these classes.
function tryCloseTopUiLayer() {
  const closers = [
    // Support-nag + license entry overlays (both use .support-nag as backdrop)
    ['.support-nag', el => el.remove()],
    // Any menu bar dropdown that's currently open
    ['.menubar .menu.is-open', el => el.classList.remove('is-open')],
    // Right-click context menu in the outliner
    ['.ol-ctx-menu', el => el.remove()],
    // Long-press radial menu
    ['.long-press-menu', el => el.remove()],
    // Cut / Hollow / Array / Align+Mirror floating widgets
    ['.cut-panel', el => el.remove()],
    ['.hollow-panel', el => el.remove()],
    ['.array-panel', el => el.remove()],
    ['.amr-panel', el => el.remove()],
    // Mobile bottom-sheets (Insert, Edit, More on phone)
    ['.phone-sheet.is-open', el => el.classList.remove('is-open')],
    ['.more-menu.is-open', el => el.classList.remove('is-open')],
    // Settings panel
    ['#settings-panel:not([hidden])', el => { el.hidden = true; }],
    // Shortcuts palette
    ['.shortcuts-palette', el => el.remove()],
  ];
  for (const [selector, close] of closers) {
    const el = document.querySelector(selector);
    if (el) { close(el); return true; }
  }
  return false;
}

// Deselect returns true only if something was actually selected, so the back
// press falls through to exit on empty scenes.
function tryDeselect() {
  if (state.selectedId) {
    selectShape(null);
    return true;
  }
  return false;
}

// The Capacitor App plugin fires backButton on Android's hardware back key
// (and on iOS's swipe-from-edge if enabled). We want native app-like
// behaviour: close anything on top first, then deselect, then exit.
async function bindBackButton() {
  const { App } = await import('@capacitor/app');
  App.addListener('backButton', ({ canGoBack }) => {
    // Order matters: transient UI layers first (menus, modals, sheets),
    // then selection, and finally exit as a last resort.
    if (tryCloseTopUiLayer()) return;
    if (tryDeselect()) return;
    // Nothing else to swallow, honour the OS default.
    if (canGoBack) {
      window.history.back();
    } else {
      App.exitApp();
    }
  });
}

// Fire requestRender when the app returns from background. Without this the
// canvas can sit on the last frame that was rendered before we lost focus,
// which on iOS in particular can look frozen for a beat until the user
// touches something.
async function bindAppState() {
  const { App } = await import('@capacitor/app');
  App.addListener('appStateChange', ({ isActive }) => {
    if (isActive && state.requestRender) state.requestRender();
  });
}

// Set a dark status bar with a matching background so text stays visible
// over the app's #0e1117 chrome. Only iOS respects backgroundColor at this
// API level, but setStyle applies to both platforms.
async function initStatusBar() {
  try {
    const mod = await import('@capacitor/status-bar');
    const { StatusBar, Style } = mod;
    await StatusBar.setStyle({ style: Style.Dark });
    if (window.Capacitor.getPlatform && window.Capacitor.getPlatform() === 'android') {
      await StatusBar.setBackgroundColor({ color: '#0e1117' });
    }
    // iOS 15+ hides the status bar in landscape by default; keep it visible
    // so the user has an always-on system time / battery peek.
    await StatusBar.show();
  } catch (err) {
    // Plugin absent (older cap-sync?) or platform not supported. Silent.
  }
}

export async function initNativeShell() {
  if (!isNativePlatform()) return;
  await Promise.all([
    bindBackButton().catch(() => {}),
    bindAppState().catch(() => {}),
    initStatusBar(),
  ]);
}
