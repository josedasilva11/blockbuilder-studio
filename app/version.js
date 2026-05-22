// Single source of truth for the app version string. Bumped in lockstep with
// package.json on each release. Imported by anything that displays the
// version (Settings → About, the support-nag dialog, the welcome modal).
//
// In a more elaborate build we'd read from package.json at bundle time; for
// a small Electron app, a hardcoded constant is one less moving part.
export const APP_VERSION = '0.5.0';
export const APP_NAME = 'BlockBuilder Studio';
