// Lightweight custom tooltip. Any element with `[data-tip]` triggers a floating
// hint near the cursor on hover. Replaces the browser's stock title tooltip
// which is slow to show, ugly, and inconsistent across OSes.

let _el = null;
let _hideTimer = null;
const SHOW_DELAY = 350;

export function initTooltip() {
  _el = document.getElementById('tooltip');
  if (!_el) return;
  document.addEventListener('mouseover', onOver);
  document.addEventListener('mouseout', onOut);
  document.addEventListener('mousemove', onMove);
}

function onOver(ev) {
  // Bail entirely when the user has switched tooltips off in Settings — saves
  // the event work and keeps the floating bubble out of the DOM tree.
  if (document.documentElement.classList.contains('no-tooltips')) return;
  const target = ev.target.closest('[data-tip]');
  if (!target) return;
  clearTimeout(_hideTimer);
  _el.textContent = target.dataset.tip;
  _el.hidden = false;
  setTimeout(() => _el.classList.add('show'), 10);
  positionAt(ev.clientX, ev.clientY);
}

function onMove(ev) {
  if (_el.hidden) return;
  positionAt(ev.clientX, ev.clientY);
}

function onOut(ev) {
  const target = ev.target.closest('[data-tip]');
  if (!target) return;
  _el.classList.remove('show');
  _hideTimer = setTimeout(() => { _el.hidden = true; }, 100);
}

function positionAt(x, y) {
  const margin = 14;
  const rect = _el.getBoundingClientRect();
  const px = Math.min(x + margin, window.innerWidth - rect.width - 8);
  const py = Math.min(y + margin, window.innerHeight - rect.height - 8);
  _el.style.left = `${px}px`;
  _el.style.top = `${py}px`;
}
