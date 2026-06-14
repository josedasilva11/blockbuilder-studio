// Keyboard shortcut palette. Ctrl+K opens a searchable modal that lists every
// recognised shortcut and what it does. Reduces 'how do I X?' support load
// without adding a separate help/docs site.
//
// Source of truth lives here, hand-maintained. When a new shortcut lands in
// main.js, add it to SHORTCUTS below. The palette stays in sync because the
// authoritative key handler is still wherever the keyboard listener lives —
// this module is purely descriptive.

const SHORTCUTS = [
  // View
  { keys: ['1'], group: 'View', label: 'Front view' },
  { keys: ['3'], group: 'View', label: 'Right view' },
  { keys: ['7'], group: 'View', label: 'Top view' },
  { keys: ['0'], group: 'View', label: 'Isometric view' },
  { keys: ['F'], group: 'View', label: 'Frame selection / fit all' },
  { keys: ['Numpad 5'], group: 'View', label: 'Toggle ortho / perspective' },

  // Selection
  { keys: ['Click'], group: 'Selection', label: 'Pick a shape' },
  { keys: ['Shift', 'Click'], group: 'Selection', label: 'Add / remove from selection' },
  { keys: ['Drag'], group: 'Selection', label: 'Marquee-select multiple shapes' },
  { keys: ['Ctrl', 'A'], group: 'Selection', label: 'Select all visible' },
  { keys: ['Esc'], group: 'Selection', label: 'Clear selection' },

  // Move / edit
  { keys: ['Drag shape body'], group: 'Edit', label: 'Move on the workplane (Ctrl bypasses snap)' },
  { keys: ['Ctrl', 'D'], group: 'Edit', label: 'Duplicate selected' },
  { keys: ['Delete'], group: 'Edit', label: 'Delete selected' },
  { keys: ['D'], group: 'Edit', label: 'Drop to ground (Z = 0)' },
  { keys: ['H'], group: 'Edit', label: 'Hide / show selected' },
  { keys: ['R'], group: 'Edit', label: 'Rotate gizmo (TransformControls)' },
  { keys: ['S'], group: 'Edit', label: 'Scale gizmo' },
  { keys: ['G'], group: 'Edit', label: 'Hide gizmo' },

  // CSG
  { keys: ['Ctrl', 'G'], group: 'CSG', label: 'Group (union + subtract), reversible until Bake' },
  { keys: ['Ctrl', 'Shift', 'G'], group: 'CSG', label: 'Intersect, keep only common volume' },

  // Tools
  { keys: ['Push/Pull toolbar'], group: 'Tools', label: 'Click any face, drag to extrude a prism along its normal (works on slanted faces)' },
  { keys: ['Ref Plane toolbar'], group: 'Tools', label: 'Click 3 points to spawn a reference plane (construction, not printable)' },
  { keys: ['Ref Axis toolbar'], group: 'Tools', label: 'Click any edge to spawn a dashed reference axis along it' },
  { keys: ['Midpoint toolbar'], group: 'Tools', label: 'Click any edge to drop a midpoint marker on it' },
  { keys: ['Hover edge'], group: 'Tools', label: 'Show edge length label (any visible shape)' },
  { keys: ['Array, Skip instances'], group: 'Tools', label: 'Comma-separated 1-based indices to omit from the pattern' },

  // History
  { keys: ['Ctrl', 'Z'], group: 'History', label: 'Undo' },
  { keys: ['Ctrl', 'Shift', 'Z'], group: 'History', label: 'Redo' },
  { keys: ['Ctrl', 'Y'], group: 'History', label: 'Redo (alternative)' },

  // File
  { keys: ['Ctrl', 'S'], group: 'File', label: 'Save project (.json)' },

  // Help
  { keys: ['Ctrl', 'K'], group: 'Help', label: 'Open this shortcuts palette' },
  { keys: ['?'], group: 'Help', label: 'Open this shortcuts palette' },
];

let _overlay = null;

function build() {
  if (_overlay) return _overlay;
  _overlay = document.createElement('div');
  _overlay.className = 'shortcut-palette-overlay';
  _overlay.innerHTML = `
    <div class="shortcut-palette" role="dialog" aria-modal="true" aria-labelledby="shortcut-palette-title">
      <div class="shortcut-palette-head">
        <input id="shortcut-palette-search" type="text" placeholder="Search shortcuts — try 'group', 'undo', 'view'…" autocomplete="off" spellcheck="false" />
        <button class="shortcut-palette-close" aria-label="Close (Esc)">&times;</button>
      </div>
      <div class="shortcut-palette-body" id="shortcut-palette-body"></div>
      <div class="shortcut-palette-foot">
        <span><kbd>Esc</kbd> close · <kbd>Ctrl</kbd>+<kbd>K</kbd> reopen</span>
      </div>
    </div>
  `;
  document.body.appendChild(_overlay);

  _overlay.addEventListener('click', (ev) => {
    if (ev.target === _overlay || ev.target.classList.contains('shortcut-palette-close')) close();
  });
  const search = _overlay.querySelector('#shortcut-palette-search');
  search.addEventListener('input', () => render(search.value.trim().toLowerCase()));
  search.addEventListener('keydown', (ev) => {
    if (ev.key === 'Escape') { ev.preventDefault(); close(); }
  });
  return _overlay;
}

function render(query = '') {
  const body = _overlay.querySelector('#shortcut-palette-body');
  const filtered = query
    ? SHORTCUTS.filter(s => s.label.toLowerCase().includes(query) || s.group.toLowerCase().includes(query) || s.keys.join(' ').toLowerCase().includes(query))
    : SHORTCUTS;

  if (filtered.length === 0) {
    body.innerHTML = `<p class="shortcut-empty">No shortcut matches "${escapeHtml(query)}".</p>`;
    return;
  }

  const byGroup = new Map();
  for (const s of filtered) {
    if (!byGroup.has(s.group)) byGroup.set(s.group, []);
    byGroup.get(s.group).push(s);
  }

  let html = '';
  for (const [group, items] of byGroup) {
    html += `<div class="shortcut-group"><h4>${escapeHtml(group)}</h4><div class="shortcut-list">`;
    for (const s of items) {
      html += `<div class="shortcut-row"><span class="shortcut-keys">${s.keys.map(k => `<kbd>${escapeHtml(k)}</kbd>`).join('<span class="plus">+</span>')}</span><span class="shortcut-label">${escapeHtml(s.label)}</span></div>`;
    }
    html += `</div></div>`;
  }
  body.innerHTML = html;
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}

export function openShortcutsPalette() {
  build();
  _overlay.style.display = 'flex';
  render('');
  const search = _overlay.querySelector('#shortcut-palette-search');
  search.value = '';
  setTimeout(() => search.focus(), 30);
}

export function close() {
  if (_overlay) _overlay.style.display = 'none';
}

export function isOpen() {
  return !!(_overlay && _overlay.style.display === 'flex');
}

export function installShortcutsPaletteKeybind() {
  window.addEventListener('keydown', (ev) => {
    // Skip if typing into a field (unless we're inside the palette's own search box)
    const inField = ev.target && ['INPUT','TEXTAREA','SELECT'].includes(ev.target.tagName);
    const insidePalette = ev.target && ev.target.closest && ev.target.closest('.shortcut-palette');
    if (inField && !insidePalette) return;

    const k = ev.key;
    if (ev.ctrlKey && (k === 'k' || k === 'K')) {
      ev.preventDefault();
      openShortcutsPalette();
    } else if (k === '?' && !ev.ctrlKey) {
      ev.preventDefault();
      openShortcutsPalette();
    } else if (k === 'Escape' && isOpen()) {
      ev.preventDefault();
      close();
    }
  });
}
