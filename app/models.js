// Curated models section in the sidebar.
//
// Currently disabled: the sidebar shows a single link straight to Marjers'
// MakerWorld profile sorted by most-downloaded, instead of curated picks.
// The init function is kept as a no-op so main.js doesn't need updating
// when we either re-add picks or remove the section entirely.
//
// To re-enable curated picks: restore the MARJERS_PICKS array + the grid
// container in index.html (#models-grid), and the renderer below.

export function initModelsSection() {
  // No-op. Sidebar section is now a single static link in index.html.
  // Kept as an exported function so main.js keeps booting cleanly.
}
