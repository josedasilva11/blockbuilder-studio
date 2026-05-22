// Thin wrapper around IndexedDB for storing the autosaved project. Why not
// localStorage?
//
//   * localStorage caps at ~5 MB per origin. A single mid-sized STL import
//     (head, vase, anything organic) is 2-15 MB in base64 form — easy to
//     blow past the cap. Old autosave was failing silently with `console.warn`.
//   * localStorage is synchronous. Serialising a 50 MB scene on the main
//     thread is a visible hitch.
//   * IndexedDB has multi-GB room, is async, and is built into every browser
//     / Electron renderer.
//
// One DB, one object store, one key — we only ever store the single
// autosaved project blob. Recents and small settings stay in localStorage
// because that data is tiny and the synchronous API is simpler there.

const DB_NAME  = 'blockbuilder';
const STORE    = 'autosave';
const KEY      = 'project.v1';
const DB_VER   = 1;

let _dbPromise = null;

function db() {
  if (_dbPromise) return _dbPromise;
  _dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VER);
    req.onupgradeneeded = () => {
      const d = req.result;
      if (!d.objectStoreNames.contains(STORE)) d.createObjectStore(STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return _dbPromise;
}

export async function putAutosave(payload) {
  const d = await db();
  return new Promise((resolve, reject) => {
    const tx = d.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).put(payload, KEY);
    tx.oncomplete = resolve;
    tx.onerror = () => reject(tx.error);
  });
}

export async function getAutosave() {
  const d = await db();
  return new Promise((resolve, reject) => {
    const tx = d.transaction(STORE, 'readonly');
    const req = tx.objectStore(STORE).get(KEY);
    req.onsuccess = () => resolve(req.result ?? null);
    req.onerror = () => reject(req.error);
  });
}

export async function clearAutosave() {
  const d = await db();
  return new Promise((resolve, reject) => {
    const tx = d.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).delete(KEY);
    tx.oncomplete = resolve;
    tx.onerror = () => reject(tx.error);
  });
}

// One-time migration: if there's an old autosave in localStorage from before
// the IndexedDB switch, lift it across and clear the old key. Idempotent.
const LEGACY_KEY = 'blockbuilder.project.v1';
export async function migrateLegacyAutosave() {
  try {
    const raw = localStorage.getItem(LEGACY_KEY);
    if (!raw) return false;
    const data = JSON.parse(raw);
    await putAutosave(data);
    localStorage.removeItem(LEGACY_KEY);
    return true;
  } catch (e) {
    console.warn('Legacy autosave migration failed:', e);
    return false;
  }
}
