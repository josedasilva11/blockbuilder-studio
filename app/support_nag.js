// WinRAR-style support nag. The app is fully functional forever; this modal
// pops up every 5 launches or every 7 days of active use to remind the user
// they can donate or buy a commercial licence. Activated licences silence
// the nag for good. No feature lockout, no time bombs — just a friendly
// reminder.
//
// Storage keys (localStorage):
//   bb.launchCount    integer — how many times the app started
//   bb.firstLaunch    timestamp of the very first launch (for "days of use")
//   bb.lastNag        timestamp of the last time the nag was shown
//   bb.dismissCount   how many times the user picked "Maybe later"
//   bb.license.key    the activated key (presence silences the nag)
//   bb.license.name   licensee display name

import { verifyLicenseKey } from './license_crypto.js';

const KEY_COUNT     = 'bb.launchCount';
const KEY_FIRST     = 'bb.firstLaunch';
const KEY_LAST_NAG  = 'bb.lastNag';
const KEY_DISMISS   = 'bb.dismissCount';
const KEY_LICKEY    = 'bb.license.key';
const KEY_LICNAME   = 'bb.license.name';
const KEY_LICEMAIL  = 'bb.license.email';

// Tunables. The cadence widens after each dismissal so power users who
// repeatedly say "later" aren't pestered every session.
const FIRST_NAG_LAUNCH = 5;     // wait this many launches before the first nag
const NAG_EVERY        = 5;     // base cadence between nags
const SOFT_BACKOFF     = 2;     // each "Maybe later" adds N launches to the gap
const DAYS_GRACE       = 7;     // also delay first nag by N days from install

// All "donate / support" actions consolidate on a single marjers.com page so
// the in-app links never need to change when the user adds new platforms.
const DONATE_URL  = 'https://marjers.com/support';
const LICENSE_URL = 'https://marjers.com/blockbuilder';

export function bumpLaunchCount() {
  const cur = parseInt(localStorage.getItem(KEY_COUNT) || '0', 10) + 1;
  localStorage.setItem(KEY_COUNT, String(cur));
  if (!localStorage.getItem(KEY_FIRST)) {
    localStorage.setItem(KEY_FIRST, String(Date.now()));
  }
  return cur;
}

// In-memory cache of the verified licence so the rest of the app can read
// "is licensed?" synchronously even though Web Crypto verification is async.
// Set during boot via revalidateLicense().
let _licenseValid = false;

export function isLicensed() {
  return _licenseValid;
}

export function getLicenseName() {
  return localStorage.getItem(KEY_LICNAME) || '';
}

export function getLicenseEmail() {
  return localStorage.getItem(KEY_LICEMAIL) || '';
}

// Re-verify the stored key on demand. Called from main() at boot, when the
// Settings panel opens, and before any "licensed-only" branch. If the key
// fails (corrupted localStorage, tampered values, key revoked by a future
// version bump), the licence silently flips off and the nag dialog returns.
export async function revalidateLicense() {
  const stored = localStorage.getItem(KEY_LICKEY);
  if (!stored) { _licenseValid = false; return false; }
  const payload = await verifyLicenseKey(stored);
  if (!payload) {
    _licenseValid = false;
    // Don't auto-clear stored data — keep it around so the user can paste it
    // again into a future version if the public key changes.
    return false;
  }
  // Cross-check the cached name/email against the signed payload. If someone
  // edited the display name in localStorage to make the badge say something
  // they didn't pay for, snap it back to the signed value.
  localStorage.setItem(KEY_LICNAME, payload.name);
  localStorage.setItem(KEY_LICEMAIL, payload.email);
  _licenseValid = true;
  return true;
}

export async function activateLicense(key, name) {
  const k = (key || '').trim();
  if (!k.startsWith('BBS2-')) return false;
  const payload = await verifyLicenseKey(k);
  if (!payload) return false;
  localStorage.setItem(KEY_LICKEY, k);
  localStorage.setItem(KEY_LICNAME, payload.name);
  localStorage.setItem(KEY_LICEMAIL, payload.email);
  _licenseValid = true;
  return true;
}

export function clearLicense() {
  localStorage.removeItem(KEY_LICKEY);
  localStorage.removeItem(KEY_LICNAME);
  localStorage.removeItem(KEY_LICEMAIL);
  _licenseValid = false;
}

// Decide whether to show the nag this session.
export function shouldShowNag() {
  if (isLicensed()) return false;
  const launches = parseInt(localStorage.getItem(KEY_COUNT) || '0', 10);
  const dismisses = parseInt(localStorage.getItem(KEY_DISMISS) || '0', 10);
  const firstLaunch = parseInt(localStorage.getItem(KEY_FIRST) || `${Date.now()}`, 10);
  const lastNag = parseInt(localStorage.getItem(KEY_LAST_NAG) || '0', 10);

  // First nag waits FIRST_NAG_LAUNCH AND DAYS_GRACE days.
  if (launches < FIRST_NAG_LAUNCH) return false;
  if ((Date.now() - firstLaunch) < DAYS_GRACE * 86400_000) return false;

  // Subsequent nags wait NAG_EVERY + SOFT_BACKOFF×dismisses launches since the
  // last shown nag. The "since last nag" check uses launches, not time, so
  // someone who opens the app daily for a month doesn't get spammed.
  if (lastNag === 0) return true;  // first eligible nag
  const launchesSinceLastNag = Math.max(0, launches - parseInt(localStorage.getItem('bb.lastNagLaunch') || '0', 10));
  const needed = NAG_EVERY + SOFT_BACKOFF * dismisses;
  return launchesSinceLastNag >= needed;
}

export function showNag() {
  // Don't stack multiple instances if dev hot-reload triggers init twice.
  if (document.querySelector('.support-nag')) return;
  localStorage.setItem(KEY_LAST_NAG, String(Date.now()));
  localStorage.setItem('bb.lastNagLaunch', localStorage.getItem(KEY_COUNT) || '0');

  const overlay = document.createElement('div');
  overlay.className = 'support-nag';
  overlay.innerHTML = `
    <div class="support-card">
      <button class="support-close" title="Maybe later" aria-label="Close">×</button>
      <div class="support-mark">
        <svg viewBox="0 0 40 40" aria-hidden="true">
          <defs><linearGradient id="snlg" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stop-color="#cdff45"/><stop offset="100%" stop-color="#7cbe1e"/>
          </linearGradient></defs>
          <path d="M10 14 L20 9 L30 14 L30 26 L20 31 L10 26 Z" fill="url(#snlg)" opacity="0.18"/>
          <path d="M10 14 L20 9 L30 14 L30 26 L20 31 L10 26 Z M10 14 L20 19 L30 14 M20 19 L20 31"
                stroke="url(#snlg)" stroke-width="2" fill="none" stroke-linejoin="round" stroke-linecap="round"/>
        </svg>
      </div>
      <h2>Enjoying BlockBuilder?</h2>
      <p class="support-lede">
        It is and will stay free, with no accounts and no limits. Built solo by
        <a href="https://marjers.com" target="_blank" rel="noopener">Marjers</a>.
        If it saves you time, a one-off donation or commercial licence keeps
        the project going.
      </p>
      <div class="support-actions">
        <button class="support-btn primary" data-act="license">
          <span class="support-btn-title">Buy commercial licence</span>
          <span class="support-btn-sub">€12 one-time · unlocks for-profit use · silences this dialog forever</span>
        </button>
        <button class="support-btn" data-act="donate">
          <span class="support-btn-title">One-time donation</span>
          <span class="support-btn-sub">Any amount via marjers.com/support</span>
        </button>
        <button class="support-btn ghost" data-act="later">
          <span class="support-btn-title">Maybe later</span>
          <span class="support-btn-sub">Continue without paying — the app stays fully functional</span>
        </button>
      </div>
      <p class="support-foot">
        Already have a licence?
        <a href="#" class="support-have-key">Activate it →</a>
      </p>
    </div>
  `;
  document.body.appendChild(overlay);

  overlay.querySelector('.support-close').addEventListener('click', dismissLater);
  overlay.addEventListener('click', (ev) => {
    if (ev.target === overlay) dismissLater();   // click backdrop = dismiss
    const btn = ev.target.closest('[data-act]');
    if (!btn) return;
    const act = btn.dataset.act;
    if (act === 'license') window.open(LICENSE_URL, '_blank');
    else if (act === 'donate') window.open(DONATE_URL, '_blank');
    else if (act === 'later') dismissLater();
  });
  overlay.querySelector('.support-have-key').addEventListener('click', (ev) => {
    ev.preventDefault();
    overlay.remove();
    openLicenseDialog();
  });

  function dismissLater() {
    const cur = parseInt(localStorage.getItem(KEY_DISMISS) || '0', 10) + 1;
    localStorage.setItem(KEY_DISMISS, String(cur));
    overlay.remove();
  }
}

// Modal-style key entry. Same look as the nag so it feels like a continuation.
export function openLicenseDialog() {
  if (document.querySelector('.support-nag')) return;
  const overlay = document.createElement('div');
  overlay.className = 'support-nag';
  overlay.innerHTML = `
    <div class="support-card">
      <button class="support-close" title="Close" aria-label="Close">×</button>
      <h2>Activate licence</h2>
      <p class="support-lede">
        Paste the key you received after purchasing. Activation is offline:
        the key never leaves your machine.
      </p>
      <label class="lic-row">
        <span>Your name</span>
        <input type="text" class="lic-name" placeholder="e.g. Jane Maker" />
      </label>
      <label class="lic-row">
        <span>Licence key</span>
        <input type="text" class="lic-key" placeholder="BBS-XXXX-XXXX-XXXX" spellcheck="false" />
      </label>
      <div class="support-actions">
        <button class="support-btn primary" data-act="activate">
          <span class="support-btn-title">Activate</span>
        </button>
        <button class="support-btn ghost" data-act="close">
          <span class="support-btn-title">Cancel</span>
        </button>
      </div>
      <p class="support-foot">
        No key yet? <a href="${LICENSE_URL}" target="_blank" rel="noopener">Buy one at marjers.com/blockbuilder</a>
      </p>
      <p class="lic-msg" hidden></p>
    </div>
  `;
  document.body.appendChild(overlay);

  const close = () => overlay.remove();
  overlay.querySelector('.support-close').addEventListener('click', close);
  overlay.addEventListener('click', (ev) => {
    if (ev.target === overlay) close();
    const btn = ev.target.closest('[data-act]');
    if (!btn) return;
    if (btn.dataset.act === 'close') close();
    if (btn.dataset.act === 'activate') {
      const name = overlay.querySelector('.lic-name').value;
      const key  = overlay.querySelector('.lic-key').value;
      const msg = overlay.querySelector('.lic-msg');
      msg.hidden = false;
      msg.textContent = 'Verifying…';
      msg.className = 'lic-msg';
      activateLicense(key, name).then(ok => {
        if (ok) {
          msg.textContent = `Activated — thanks, ${getLicenseName()}. The reminder dialog is now silenced.`;
          msg.className = 'lic-msg ok';
          setTimeout(close, 1800);
        } else {
          msg.textContent = 'That key is not valid. Make sure you copied the full BBS2-... string from the purchase email. Contact geral@marjers.com if it still fails.';
          msg.className = 'lic-msg err';
        }
      });
    }
  });
}
