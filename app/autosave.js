// Auto-save backed by IndexedDB (multi-GB room) with dirty-flag debouncing.
// The previous localStorage backend silently failed when STL imports pushed
// the payload past ~5 MB. IndexedDB also lets us write asynchronously so the
// main thread doesn't hitch during big saves.

import { state } from './state.js';
import { TinkerShape } from './shape.js';
import { selectShape } from './selection.js';
import { putAutosave, getAutosave, clearAutosave, migrateLegacyAutosave } from './storage.js';

const DEBOUNCE_MS = 800;

let _timer = null;
let _dirty = true;       // start dirty so the first poll captures initial state
let _saveInFlight = null; // dedupes overlapping save promises

export function markDirty() { _dirty = true; }

export function scheduleSave() {
  _dirty = true;
  clearTimeout(_timer);
  _timer = setTimeout(saveNow, DEBOUNCE_MS);
}

export async function saveNow() {
  if (!_dirty) return;
  if (_saveInFlight) { await _saveInFlight; return; }
  const data = {
    version: 1,
    ts: Date.now(),
    shapes: [...state.shapes.values()].map(s => s.serialize()),
  };
  _saveInFlight = putAutosave(data)
    .then(() => { _dirty = false; })
    .catch(e => console.warn('Autosave failed:', e))
    .finally(() => { _saveInFlight = null; });
  await _saveInFlight;
}

export async function loadFromStorage() {
  try {
    // Carry over any pre-IndexedDB save from a previous version.
    await migrateLegacyAutosave();
    const data = await getAutosave();
    if (!data || !Array.isArray(data.shapes)) return 0;
    for (const sd of data.shapes) {
      const shape = TinkerShape.deserialize(sd);
      state.scene.add(shape.mesh);
    }
    return data.shapes.length;
  } catch (e) {
    console.warn('Autosave restore failed:', e);
    return 0;
  }
}

export async function clearStorage() {
  try { await clearAutosave(); } catch {}
}

/** Hook saves into the render loop so any state change eventually persists.
 *  Poll fires every 2s and saveNow() short-circuits if nothing's dirty, so
 *  the expensive serialise + IDB put only happens when there's a real change. */
export function installAutoSaveLoop() {
  setInterval(() => {
    if (state.shapes.size > 0 && _dirty) saveNow();
  }, 2000);
  // Best-effort sync flush before unload. IndexedDB writes are async — the
  // browser doesn't guarantee they complete during unload — but since we
  // already saved on the last dirty tick, this is just a safety net.
  window.addEventListener('beforeunload', () => { _dirty = true; saveNow(); });
}
