// Stacked toast notifications. Replaces `alert()` everywhere — alerts are
// modal, blocking, and look like a 90s web app.
//
// Variants:
//   info     neutral grey            (default, 4s)
//   ok       lime accent             (e.g. "Saved", "Screenshot taken")
//   warn     amber                   (recoverable, e.g. "Mesh has X issues")
//   error    coral red               (CSG failed, license invalid, …)
//
// Each toast auto-dismisses after `duration` ms; longer durations for errors
// since the user might want to read the detail. Tap the body or × to close
// immediately. Multiple toasts stack from the bottom-right.

const DEFAULT_DURATIONS = {
  info:  3500,
  ok:    3000,
  warn:  5000,
  error: 6500,
};

let _container = null;

function ensureContainer() {
  if (_container) return _container;
  _container = document.createElement('div');
  _container.className = 'toast-stack';
  document.body.appendChild(_container);
  return _container;
}

/**
 * Show a toast. Returns a `close` function so callers can dismiss it early
 * (e.g. a long-running operation toast that wants to swap to "Done").
 *
 *   const close = toast.info('Computing CSG…', { duration: 0 });
 *   ...
 *   close();
 *   toast.ok('CSG done');
 */
function show(message, opts = {}) {
  const variant = opts.variant || 'info';
  const duration = opts.duration ?? DEFAULT_DURATIONS[variant] ?? 4000;
  const detail = opts.detail || '';
  ensureContainer();

  const el = document.createElement('div');
  el.className = `toast toast-${variant}`;
  el.innerHTML = `
    <div class="toast-body">
      <div class="toast-msg">${escape(message)}</div>
      ${detail ? `<div class="toast-detail">${escape(detail)}</div>` : ''}
    </div>
    <button class="toast-close" aria-label="Dismiss">×</button>
  `;
  _container.appendChild(el);
  // Animate in next tick so transition applies.
  requestAnimationFrame(() => el.classList.add('toast-in'));

  let closed = false;
  const close = () => {
    if (closed) return;
    closed = true;
    el.classList.remove('toast-in');
    el.classList.add('toast-out');
    setTimeout(() => el.remove(), 220);
  };
  el.querySelector('.toast-close').addEventListener('click', close);
  if (duration > 0) setTimeout(close, duration);
  return close;
}

function escape(s) {
  return String(s).replace(/[&<>"']/g, c =>
    ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
}

export const toast = {
  info:  (m, o = {}) => show(m, { ...o, variant: 'info' }),
  ok:    (m, o = {}) => show(m, { ...o, variant: 'ok' }),
  warn:  (m, o = {}) => show(m, { ...o, variant: 'warn' }),
  error: (m, o = {}) => show(m, { ...o, variant: 'error' }),
  // Convenience: replace `alert(msg)` with `toast.alertReplacement(msg)`.
  // Errors get longer dwell + the message in the detail row.
  alertReplacement(msg) {
    return show('Something went wrong', { variant: 'error', detail: msg });
  },
};
