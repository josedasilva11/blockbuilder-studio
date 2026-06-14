// Auto-save backed by IndexedDB (multi-GB room) with dirty-flag debouncing.
// The previous localStorage backend silently failed when STL imports pushed
// the payload past ~5 MB. IndexedDB also lets us write asynchronously so the
// main thread doesn't hitch during big saves.

import * as THREE from 'three';
import { state } from './state.js';
import { TinkerShape } from './shape.js';
import { RefGeom } from './ref_geom.js';
import { selectShape } from './selection.js';
import { putAutosave, getAutosave, clearAutosave, migrateLegacyAutosave } from './storage.js';

const DEBOUNCE_MS = 800;

let _timer = null;
let _dirty = true;       // start dirty so the first poll captures initial state
let _saveInFlight = null; // dedupes overlapping save promises

export function markDirty() { _dirty = true; }

// Same shape as io.js's serializeRefGeom but duplicated here to avoid a
// circular import between autosave.js and io.js (io.js imports ref_geom which
// would otherwise need to know about autosave). Keep the two in lockstep.
function serRef(rg) {
  const out = { id: rg.id, kind: rg.kind, name: rg.name, visible: rg.visible };
  if (rg.kind === 'PLANE_3P') out.points = rg.data.points.map((p) => [p.x, p.y, p.z]);
  else if (rg.kind === 'AXIS_EDGE') {
    out.from = [rg.data.from.x, rg.data.from.y, rg.data.from.z];
    out.to = [rg.data.to.x, rg.data.to.y, rg.data.to.z];
  } else if (rg.kind === 'MIDPOINT') {
    out.point = [rg.data.point.x, rg.data.point.y, rg.data.point.z];
  }
  return out;
}

function deserRef(rd) {
  let data;
  if (rd.kind === 'PLANE_3P') data = { points: rd.points.map(([x, y, z]) => new THREE.Vector3(x, y, z)) };
  else if (rd.kind === 'AXIS_EDGE') data = { from: new THREE.Vector3(...rd.from), to: new THREE.Vector3(...rd.to) };
  else if (rd.kind === 'MIDPOINT') data = { point: new THREE.Vector3(...rd.point) };
  else return null;
  const rg = new RefGeom(rd.kind, data, { id: rd.id, name: rd.name });
  if (rd.visible === false) rg.setVisible(false);
  return rg;
}

export function scheduleSave() {
  _dirty = true;
  clearTimeout(_timer);
  _timer = setTimeout(saveNow, DEBOUNCE_MS);
}

export async function saveNow() {
  if (!_dirty) return;
  // If an autosave is already writing, wait for it to finish, then save the
  // CURRENT state on top (the in-flight one may have snapshotted before the
  // caller's mutations landed). Previously this just returned, which dropped
  // any change made between the in-flight snapshot and this call.
  if (_saveInFlight) { await _saveInFlight; if (!_dirty) return; }
  const data = {
    version: 2,
    ts: Date.now(),
    shapes: [...state.shapes.values()].map(s => s.serialize()),
    refGeoms: [...state.refGeoms.values()].map(serRef),
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
    // Reference geometry (v2 autosave only). Missing on v1 saves.
    for (const rd of data.refGeoms || []) {
      try { deserRef(rd); } catch (e) { console.warn('Skipped corrupt ref:', e); }
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
