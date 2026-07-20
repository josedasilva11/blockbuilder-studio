// Long-press context menu for touch / coarse-pointer devices. Hold a finger
// down on a shape for =500 ms without moving it, and a small popover with
// four quick actions (Duplicate, Hide, Group, Delete) appears at the press
// position. Lets a phone user reach the most common edits without going
// through the bottom dock + More menu (which costs 3 taps instead of one
// hold).
//
// Design notes:
// - Only fires on (pointer: coarse) devices. Desktop mouse users get the
//   sidebar / properties chrome and don't need this.
// - Cancelled by pointermove beyond a small slop (8 px), which usually means
//   the user is drag-translating the shape, not pressing for menu.
// - Cancelled by pointerup before the timer (a quick tap = selection).
// - Shows the same action shortcuts the desktop toolbar already wires
//   (data-action attributes), so the existing bindToolbar click delegator
//   handles execution.

import * as THREE from 'three';
import { state } from './state.js';
import { selectShape } from './selection.js';

const _raycaster = new THREE.Raycaster();
const _ndc = new THREE.Vector2();

const PRESS_MS = 500;
const SLOP_PX = 8;

let _canvas = null;
let _timer = null;
let _startX = 0;
let _startY = 0;
let _startedOnShapeId = null;
let _menu = null;

function isCoarse() {
  try { return window.matchMedia && window.matchMedia('(pointer: coarse)').matches; }
  catch { return false; }
}

export function installLongPressMenu(canvas) {
  _canvas = canvas;
  if (!isCoarse()) return;        // desktop: no-op
  canvas.addEventListener('pointerdown', onDown);
  canvas.addEventListener('pointermove', onMove, true);
  canvas.addEventListener('pointerup', cancel, true);
  canvas.addEventListener('pointercancel', cancel, true);
  document.addEventListener('click', maybeCloseMenu);
}

function onDown(ev) {
  if (ev.button !== 0 && ev.pointerType !== 'touch') return;
  cancelTimer();
  closeMenu();
  _startX = ev.clientX;
  _startY = ev.clientY;
  // Identify which shape (if any) is under the press. Re-uses the same
  // raycast logic as the selection picker by checking userData.tinkerShape
  // on whatever the OrbitControls / selection ray would hit.
  const hitId = pickShapeId(ev);
  _startedOnShapeId = hitId;
  if (!hitId) return;
  _timer = setTimeout(() => {
    _timer = null;
    fire(ev);
  }, PRESS_MS);
}

function onMove(ev) {
  if (!_timer) return;
  if (Math.hypot(ev.clientX - _startX, ev.clientY - _startY) > SLOP_PX) cancelTimer();
}

function cancel() { cancelTimer(); _startedOnShapeId = null; }
function cancelTimer() {
  if (_timer) { clearTimeout(_timer); _timer = null; }
}

function pickShapeId(ev) {
  if (!state.camera) return null;
  const rect = _canvas.getBoundingClientRect();
  _ndc.x = ((ev.clientX - rect.left) / rect.width) * 2 - 1;
  _ndc.y = -((ev.clientY - rect.top) / rect.height) * 2 + 1;
  _raycaster.setFromCamera(_ndc, state.camera);
  const meshes = [];
  for (const s of state.shapes.values()) {
    if (s.mesh && s.mesh.parent && s.mesh.visible) meshes.push(s.mesh);
  }
  const hits = _raycaster.intersectObjects(meshes, false);
  return hits[0]?.object?.userData?.tinkerShape?.id ?? null;
}

function fire(ev) {
  // Guard against a shape that was deleted (via Outliner, undo, etc.) during
  // the 500ms long-press window. Without this we'd selectShape on an id
  // that's no longer in state.shapes and the long-press menu would open with
  // no actual selection.
  if (!_startedOnShapeId || !state.shapes.has(_startedOnShapeId)) {
    _startedOnShapeId = null;
    return;
  }
  selectShape(_startedOnShapeId);
  showMenu(_startX, _startY);
  // Haptic tick. Prefer Capacitor Haptics on native (iOS Safari ignores
  // navigator.vibrate entirely, so the whole point of Capacitor here is
  // just to reach the iOS TapticEngine).
  try {
    if (window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform()) {
      import('@capacitor/haptics').then((m) => {
        m.Haptics.impact({ style: m.ImpactStyle.Medium }).catch(() => {});
      }).catch(() => {});
    } else {
      navigator.vibrate?.(20);
    }
  } catch {}
}

function showMenu(x, y) {
  closeMenu();
  _menu = document.createElement('div');
  _menu.className = 'long-press-menu';
  _menu.innerHTML = `
    <button data-action="duplicate" class="lpm-btn" aria-label="Duplicate">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="14" height="14" rx="1.5"/><rect x="7" y="7" width="14" height="14" rx="1.5"/></svg>
      <span>Duplicate</span>
    </button>
    <button data-action="hide" class="lpm-btn" aria-label="Hide">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M2 12 S6 5 12 5 S22 12 22 12 S18 19 12 19 S2 12 2 12 Z M3 3 L21 21"/></svg>
      <span>Hide</span>
    </button>
    <button data-action="group" class="lpm-btn" aria-label="Group">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="8" height="8" rx="1"/><rect x="13" y="13" width="8" height="8" rx="1"/><path d="M11 11 L13 13"/></svg>
      <span>Group</span>
    </button>
    <button data-action="delete" class="lpm-btn lpm-danger" aria-label="Delete">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M5 7 L19 7 M9 7 V4 H15 V7 M7 7 V20 H17 V7 M10 11 V17 M14 11 V17"/></svg>
      <span>Delete</span>
    </button>
  `;
  document.body.appendChild(_menu);
  // Position: prefer above the press, fallback below if there isn't room.
  const w = _menu.offsetWidth;
  const h = _menu.offsetHeight;
  let left = x - w / 2;
  let top = y - h - 12;
  if (top < 8) top = y + 12;
  left = Math.max(8, Math.min(left, window.innerWidth - w - 8));
  _menu.style.left = left + 'px';
  _menu.style.top = top + 'px';
}

function closeMenu() {
  if (!_menu) return;
  _menu.remove();
  _menu = null;
}

function maybeCloseMenu(ev) {
  if (!_menu) return;
  // The action buttons inside the menu have data-action attributes that the
  // global bindToolbar click handler picks up. We just close on any click
  // because the action either fired (and we want the menu gone) or the user
  // tapped outside (also wanted gone).
  if (_menu.contains(ev.target)) {
    // Tiny delay so the action click finishes before removeing the menu.
    setTimeout(closeMenu, 0);
    return;
  }
  closeMenu();
}
