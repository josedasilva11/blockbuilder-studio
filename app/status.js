// Lightweight status indicator pinned to the top of the viewport. Used while
// long-running ops are in flight (CSG, big imports, baked exports) so the
// user knows the program is busy rather than frozen.

let _el = null;
let _hideTimer = null;

export function initStatus() {
  _el = document.createElement('div');
  _el.className = 'status-pill';
  _el.hidden = true;
  _el.innerHTML = `<span class="status-spinner"></span><span class="status-text"></span>`;
  document.body.appendChild(_el);
}

export function showStatus(text) {
  if (!_el) initStatus();
  clearTimeout(_hideTimer);
  _el.querySelector('.status-text').textContent = text;
  _el.hidden = false;
  // Trigger the CSS transition one frame later so the .toast-style fade-in
  // applies (browsers skip transitions on first paint of a freshly-shown el).
  requestAnimationFrame(() => _el.classList.add('status-pill-in'));
}

export function hideStatus() {
  if (!_el) return;
  _el.classList.remove('status-pill-in');
  clearTimeout(_hideTimer);
  // Wait for the fade-out to finish before display:none — otherwise the pill
  // pops out instead of fading. 200ms matches the CSS transition duration.
  _hideTimer = setTimeout(() => { _el.hidden = true; }, 200);
}
