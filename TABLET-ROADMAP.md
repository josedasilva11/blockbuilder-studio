# Tablet / iPad roadmap

Target: **iPad Pro + Apple Pencil**, secondary Surface Pro + Wacom MobileStudio.
Phone scope is deferred (touch-only 3D editing without precision is the wrong
fight).

## Why iPad first

- Validated buyer demographic (Procreate €13, Affinity €18, Nomad €19, all
  one-time, all profitable solo/small-team)
- Apple Pencil gives pixel-perfect input, hover (M2 Pencil), pressure
- Landscape screens fit existing toolbar/properties/viewport layout with
  minor adaptation
- Shapr3D charges $25/mo subscription, leaving room for a €14.99 one-time
  alternative
- Cross-device workflow with the free desktop = unique selling point
  (start on iPad, finish on desktop, same `.json` file)

## Architecture: shared engine, separate shells

```
app/
├── engine/              shared: three.js, CSG, .json, autosave, license
│   └── (eventually: csg.js, shape.js, shapes/, storage.js,
│        license_crypto.js, history.js, io.js, metrics.js, etc.)
├── shell-desktop/       Electron, mouse/keyboard, sidebars, small gizmos
│   └── (eventually: main.js, sidebar.js, properties.js, tooltip.js, etc.)
├── shell-touch/         Capacitor (iPad/Android), touch + Pencil
│   ├── touch-input.js   multi-touch + Pencil event router
│   ├── touch-shell.js   entry point, scene bootstrap, tool bar
│   └── styles/touch.css mobile-optimized layout
└── touch.html           browser-launchable entry for the touch shell
```

The engine stays platform-agnostic. Shells own the UI/input differences.
Same `.json` saves on either shell roundtrip cleanly.

## Phases

### Phase 0 — Spike (this week, 1-2 days)

Goal: confirm 3D editing with touch + Pencil is viable on iPad before
committing to the full build.

- [x] Create `app/shell-touch/` + `touch.html` entry
- [x] Implement `TouchInputController`:
  - Multi-touch tracking (pointerdown/move/up keyed by pointerId)
  - One-finger drag = orbit
  - Two-finger pinch = zoom
  - Two-finger drag = pan
  - Pencil (`pointerType === 'pen'`) = precision pointer
  - Tap = pick / select
  - Long-press = context menu
- [ ] Test on actual iPad via local network (`http://<laptop-ip>:8080/touch.html`)
- [ ] Decide:
  - WORKS  → commit to Phase 1
  - PARTIAL → narrow to iPad+Pencil-only (drop generic Android)
  - DOESN'T WORK → pivot to mobile companion viewer instead

### Phase 1 — Touch shell MVP (3-4 weeks)

- Bottom drawer toolbar (shape palette + actions)
- Touch-friendly gizmos (44pt hit targets, larger handles)
- Properties panel as a bottom sheet (swipe up)
- Long-press context menu
- Pinch-to-zoom on the viewport
- Engine refactor: move shared code from `app/*.js` to `app/engine/*.js`,
  rewire imports
- Pencil-specific affordances (pressure for sketch lines, hover preview
  before tap)

### Phase 2 — Native wrap (1-2 weeks)

- `npm install @capacitor/core @capacitor/ios`
- `npx cap init "BlockBuilder Studio for iPad" studio.blockbuilder.ipad`
- Wire IndexedDB persistence (Capacitor exposes filesystem)
- Apple file sharing: open/save `.json` in Files app, iCloud Drive sync
- Build IPA, sideload to physical iPad for testing

### Phase 3 — App Store submission (1-2 weeks)

- Apple Developer enrollment (€99/year)
- App Store Connect: listing, screenshots, privacy policy, age rating
- TestFlight: invite-only beta (separate from desktop beta testers)
- Submit for review (1-3 days typical wait)
- Launch at €14.99 one-time

### Phase 4 — Android tablet (deferred, only if iPad sells)

Capacitor already supports Android. Reuse the same touch shell, package
as APK. Skip until iPad has 100+ paid units.

## Constraints / decisions

- **Pricing**: €14.99 one-time. Not subscription. Not lower (designers
  expect tools to cost). Not higher (positioned below Affinity €18, way
  below Shapr3D $25/mo).
- **No phone-sized layouts** in v1. The shell-touch is iPad-first; phone
  support is a separate effort with different UI tradeoffs.
- **Same engine** as desktop. `.json` files roundtrip without conversion.
- **No cloud sync** initially. Files app + iCloud Drive is enough. Avoid
  building auth + backend infrastructure for v1.
- **License model on iPad**: paid via App Store IAP. No BBS2 key needed,
  the App Store receipt is the license. (No way to share a desktop
  commercial licence with the iPad app — separate products.)

## Budget

- Apple Developer: €99/year
- Engineering time: ~6-10 weeks solo (Phases 1+2+3 combined)
- No infrastructure cost beyond what we already have

## Risk register

| Risk | Likelihood | Mitigation |
|---|---|---|
| Touch UX feels bad even with Pencil | Medium | Phase 0 spike catches this before any commitment |
| iPad WebGL2 has limits we hit | Low | Three.js handles fallbacks; tested on iOS 17+ |
| App Store rejects (e.g., privacy nutrition labels) | Medium | Standard form-fill, reuse desktop privacy.html |
| Sell <50 units in 3 months | Real | Niche product. Accept it. Beta validates desktop first. |
| Beta-fatigue maintaining two builds in parallel | High | The shared engine minimizes this. One bug fix benefits both. |
