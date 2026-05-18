// LocalStorage auto-save. Every change (debounced) snapshots the scene as JSON
// so a tab refresh or accidental close doesn't lose work.

import { state } from './state.js';
import { TinkerShape } from './shape.js';
import { selectShape } from './selection.js';

const STORAGE_KEY = 'blockbuilder.project.v1';
const DEBOUNCE_MS = 800;

let _timer = null;

export function scheduleSave() {
  clearTimeout(_timer);
  _timer = setTimeout(saveNow, DEBOUNCE_MS);
}

export function saveNow() {
  try {
    const data = {
      version: 1,
      ts: Date.now(),
      shapes: [...state.shapes.values()].map(s => s.serialize()),
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch (e) {
    console.warn('Autosave failed:', e);
  }
}

export function loadFromStorage() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return 0;
    const data = JSON.parse(raw);
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

export function clearStorage() {
  try { localStorage.removeItem(STORAGE_KEY); } catch {}
}

/** Hook saves into the render loop so any state change eventually persists. */
export function installAutoSaveLoop() {
  // Poll once per second; saveNow is cheap and the JSON is small.
  setInterval(() => {
    if (state.shapes.size > 0) scheduleSave();
  }, 1000);
  // Save synchronously before unload too.
  window.addEventListener('beforeunload', saveNow);
}
