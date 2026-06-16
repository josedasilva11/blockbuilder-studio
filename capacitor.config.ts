// Capacitor config for the iOS + Android wrappers. webDir points at the
// staged PWA bundle, copy it fresh (npm run pwa:stage) before any cap sync.
//
// Bundle ID is locked to pt.marjers.blockbuilder, App Store + Play Store
// both reject changes after the first build is uploaded, so picking this
// before first publish is critical.

import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'pt.marjers.blockbuilder',
  appName: 'BlockBuilder Studio',
  webDir: 'pwa-stage',
  backgroundColor: '#0e1117',
  loggingBehavior: 'production',
  ios: {
    // Allow custom WebKit URLs needed by the import map. The app is
    // self-contained, no remote loads.
    contentInset: 'always',
    scrollEnabled: false,
    backgroundColor: '#0e1117',
  },
  android: {
    // Standard production settings. allowMixedContent stays false because
    // every asset is local. backgroundColor matches the brand bg so there's
    // no flash of white during cold-start before the canvas paints.
    allowMixedContent: false,
    backgroundColor: '#0e1117',
    captureInput: true,
  },
  plugins: {
    // Splash screen kept brief, the app starts on the empty-state card
    // which is itself a low-effort splash.
    SplashScreen: {
      launchShowDuration: 600,
      launchAutoHide: true,
      backgroundColor: '#0e1117',
      androidSplashResourceName: 'splash',
      androidScaleType: 'CENTER_CROP',
      showSpinner: false,
      splashImmersive: true,
    },
  },
};

export default config;
