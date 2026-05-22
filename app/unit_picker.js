// First-run unit picker. Asks the user which base unit they prefer (mm, cm or
// inches) and stores the choice in localStorage. All dimension labels and grid
// spacing read from `state.unit`.

import { state } from './state.js';

const STORAGE_KEY = 'blockbuilder.unit.v1';
const UNITS = [
  { id: 'mm',  label: 'Millimetres', sub: 'Best for 3D printing, jewellery, small parts' },
  { id: 'cm',  label: 'Centimetres', sub: 'Furniture, large objects' },
  { id: 'in',  label: 'Inches',      sub: 'US engineering, plumbing' },
];

export function maybeShowUnitPicker(onDone) {
  const saved = readSaved();
  if (saved) {
    state.unit = saved;
    applyUnitToUi();
    onDone?.();
    return;
  }
  show(onDone);
}

function readSaved() {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    return v && UNITS.find(u => u.id === v) ? v : null;
  } catch { return null; }
}

function persist(unit) {
  try { localStorage.setItem(STORAGE_KEY, unit); } catch {}
}

function show(onDone) {
  const overlay = document.createElement('div');
  overlay.className = 'unit-modal';
  overlay.innerHTML = `
    <div class="unit-modal-card">
      <h2>Choose your unit</h2>
      <p>Everything you build will use this unit. You can change it later in Settings.</p>
      <div class="unit-options">
        ${UNITS.map(u => `
          <button data-unit="${u.id}">
            <div class="unit-tag">${u.id}</div>
            <div class="unit-label">${u.label}</div>
            <div class="unit-sub">${u.sub}</div>
          </button>
        `).join('')}
      </div>
    </div>
  `;
  document.body.appendChild(overlay);

  for (const btn of overlay.querySelectorAll('[data-unit]')) {
    btn.addEventListener('click', () => {
      const u = btn.dataset.unit;
      state.unit = u;
      persist(u);
      applyUnitToUi();
      overlay.remove();
      onDone?.();
    });
  }
}

export function applyUnitToUi() {
  for (const el of document.querySelectorAll('.snap-suffix, [data-unit-label]')) {
    el.textContent = state.unit;
  }
  // Patch any inline "mm" suffix in the dimension pill input wrapper
  document.querySelectorAll('.dim-pill .suffix').forEach(el => el.textContent = state.unit);
}

/**
 * Show the unit picker on demand (from the Settings panel "Change unit…"
 * button). Same modal as on first run, just no skipping. The new unit
 * takes effect immediately for new dimension labels; existing geometry
 * is NOT rescaled (the world units are abstract — only display labels
 * change).
 */
export function showUnitPicker(onDone) {
  show(onDone);
}

export function getCurrentUnit() {
  return state.unit;
}
