// In-App Purchases via RevenueCat. Only fires when the app runs inside the
// Capacitor native shell on iOS or Android, the desktop Electron build and
// the browser PWA both skip this module and use the existing Lemon Squeezy
// flow + ECDSA-signed licence key path.
//
// Apple guideline 3.1.1 and Google Play billing both force native IAP for
// any in-app unlock that costs money, no fallback to Stripe / Lemon Squeezy
// is allowed on iOS or Android. So this file exists only to bridge those two
// platforms; everywhere else, isNative() returns false and the API no-ops.
//
// Product layout (single tier, lifetime):
//   pt.marjers.blockbuilder.commercial.lifetime   EUR 14.99 once
//
// Buying the product grants the "commercial" entitlement in the RevenueCat
// dashboard, which silences the soft reminder + flips Settings -> Licence
// status to "Commercial (mobile IAP)".

import { state } from './state.js';
import { toast } from './toast.js';

const PRODUCT_ID = 'pt.marjers.blockbuilder.commercial.lifetime';
const ENTITLEMENT = 'commercial';

let _Purchases = null;
let _ready = false;
let _hasCommercial = false;

function isNative() {
  return typeof window !== 'undefined'
    && window.Capacitor
    && typeof window.Capacitor.isNativePlatform === 'function'
    && window.Capacitor.isNativePlatform();
}

function platformKey() {
  if (!isNative()) return null;
  const p = window.Capacitor.getPlatform?.();
  return p === 'ios' ? 'IOS' : p === 'android' ? 'ANDROID' : null;
}

// API keys are public-side identifiers (RevenueCat splits secret server
// keys from these). Marjers will paste the real values into a .env at
// build time and the bundler can inline them, OR the keys can be hard-
// coded here once the dashboard issues them. For now both default to a
// placeholder so the app boots without crashing.
const RC_API_KEYS = {
  IOS:     globalThis.__RC_IOS_API_KEY__     ?? 'appl_PLACEHOLDER',
  ANDROID: globalThis.__RC_ANDROID_API_KEY__ ?? 'goog_PLACEHOLDER',
};

export async function initIap() {
  if (!isNative()) return;
  try {
    const mod = await import('@revenuecat/purchases-capacitor');
    _Purchases = mod.Purchases;
    const apiKey = RC_API_KEYS[platformKey()];
    if (!apiKey || apiKey.endsWith('PLACEHOLDER')) {
      console.warn('[iap] RevenueCat API key not configured for', platformKey());
      return;
    }
    await _Purchases.configure({ apiKey });
    _ready = true;
    await refreshEntitlement();
  } catch (err) {
    console.warn('[iap] init failed:', err);
  }
}

export async function refreshEntitlement() {
  if (!_ready) return false;
  try {
    const info = await _Purchases.getCustomerInfo();
    _hasCommercial = !!info.customerInfo?.entitlements?.active?.[ENTITLEMENT];
    state.iapCommercial = _hasCommercial;
    return _hasCommercial;
  } catch (err) {
    console.warn('[iap] refresh failed:', err);
    return false;
  }
}

export function isCommercialActive() { return _hasCommercial; }
export function isIapAvailable() { return _ready; }

// Show the native paywall sheet. Use this instead of the desktop "I have a
// key" dialog when running on iOS or Android, where pasting an LS-issued
// key would be both confusing and against store policy.
export async function showPaywall() {
  if (!_ready) {
    toast.info('Purchases unavailable', { detail: 'In-app purchases are only available on the iOS and Android builds.' });
    return false;
  }
  try {
    const offerings = await _Purchases.getOfferings();
    const offering = offerings?.current;
    const pkg = offering?.availablePackages?.find(
      (p) => p.product?.identifier === PRODUCT_ID,
    ) || offering?.availablePackages?.[0];
    if (!pkg) {
      toast.error('No products available', { detail: 'The commercial licence product is not configured on this store yet.' });
      return false;
    }
    const result = await _Purchases.purchasePackage({ aPackage: pkg });
    const active = !!result?.customerInfo?.entitlements?.active?.[ENTITLEMENT];
    _hasCommercial = active;
    state.iapCommercial = active;
    if (active) {
      toast.ok('Commercial licence active', { detail: 'Thank you. The reminder dialog is gone for good.' });
    }
    return active;
  } catch (err) {
    if (err?.code === 'PURCHASE_CANCELLED' || /cancelled/i.test(err?.message || '')) {
      return false;
    }
    console.warn('[iap] purchase failed:', err);
    toast.error('Purchase failed', { detail: err?.message || 'Please try again.' });
    return false;
  }
}

// Restore purchases for users who bought on another device or reinstalled.
// Apple guideline 3.1.1 requires a visible Restore button on any app that
// sells IAP.
export async function restorePurchases() {
  if (!_ready) return false;
  try {
    const info = await _Purchases.restorePurchases();
    const active = !!info?.customerInfo?.entitlements?.active?.[ENTITLEMENT];
    _hasCommercial = active;
    state.iapCommercial = active;
    if (active) toast.ok('Commercial licence restored');
    else toast.info('No previous purchase found on this Apple ID / Google account.');
    return active;
  } catch (err) {
    console.warn('[iap] restore failed:', err);
    return false;
  }
}
