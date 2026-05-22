// Undo / redo. Captures whole-scene snapshots (serialised shape list) before
// each mutation. That's heavier than a per-op command pattern, but trivial to
// hook in everywhere — every shape already has a serialize() that round-trips
// through TinkerShape.deserialize(), including baked-CSG geometry and STL
// imports. Drag operations use beginTxn / endTxn so the whole drag becomes a
// single undo step rather than 60 micro-snapshots per second.

import { state } from './state.js';
import { TinkerShape } from './shape.js';
import { selectShape } from './selection.js';
import { requestRender } from './scene.js';
import { markDirty as markAutosaveDirty } from './autosave.js';

const MAX_HISTORY = 50;
const _undo = [];
const _redo = [];
let _txnDepth = 0;
let _pendingSnap = null;

function snapshot() {
  return [...state.shapes.values()].map(s => s.serialize());
}

function applySnapshot(snap) {
  // Tear everything down first.
  for (const s of [...state.shapes.values()]) s.dispose();
  state.shapes.clear();
  // Sweep the scene for any TinkerShape mesh that wasn't in state.shapes —
  // happens occasionally during error recovery. Removing them here prevents
  // orphan meshes from accumulating across undo/redo cycles.
  const orphans = [];
  state.scene?.traverse?.(obj => {
    if (obj.isMesh && obj.userData?.tinkerShape) orphans.push(obj);
  });
  for (const m of orphans) {
    if (m.parent) m.parent.remove(m);
    try { m.geometry?.dispose?.(); } catch {}
    try { m.material?.dispose?.(); } catch {}
  }
  // Rebuild from the snapshot.
  for (const data of snap) {
    const shape = TinkerShape.deserialize(data);
    state.scene.add(shape.mesh);
  }
  selectShape(null);
  requestRender();
}

// Call BEFORE a one-shot mutation (delete, group, duplicate, paste, …). The
// queued microtask paints after the caller's synchronous mutation lands, so
// any code path that takes a history snapshot also triggers a redraw — no
// need to remember a manual requestRender() at each call site.
export function pushHistory() {
  if (_txnDepth > 0) return;  // captured at txn begin instead
  _undo.push(snapshot());
  if (_undo.length > MAX_HISTORY) _undo.shift();
  _redo.length = 0;
  queueMicrotask(() => { requestRender(); markAutosaveDirty(); });
}

// For continuous edits (drag, resize, rotate). Snapshot taken once at the
// outermost begin; nested begins are no-ops. The matching endTxn pushes that
// captured snapshot onto the undo stack.
export function beginTxn() {
  if (_txnDepth === 0) _pendingSnap = snapshot();
  _txnDepth++;
}
export function endTxn() {
  _txnDepth = Math.max(0, _txnDepth - 1);
  if (_txnDepth === 0 && _pendingSnap) {
    _undo.push(_pendingSnap);
    if (_undo.length > MAX_HISTORY) _undo.shift();
    _redo.length = 0;
    _pendingSnap = null;
    markAutosaveDirty();
  }
}

export function undo() {
  if (_undo.length === 0) return false;
  const cur = snapshot();
  const prev = _undo.pop();
  _redo.push(cur);
  applySnapshot(prev);
  return true;
}

export function redo() {
  if (_redo.length === 0) return false;
  const cur = snapshot();
  const next = _redo.pop();
  _undo.push(cur);
  applySnapshot(next);
  return true;
}

export function clearHistory() {
  _undo.length = 0;
  _redo.length = 0;
  _txnDepth = 0;
  _pendingSnap = null;
}

export function historySizes() {
  return { undo: _undo.length, redo: _redo.length };
}
