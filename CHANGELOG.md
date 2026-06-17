# Changelog

All notable changes to BlockBuilder Studio are listed here.
Latest at the top. Date format: YYYY-MM-DD.

## [0.6.1], 2026-06-17, Mobile shells + store prep

This is a build infra + marketing release on top of the v0.6.0 feature set, no new in-app primitives or tools. The Windows binary is unchanged, the web layer has small UX polish, and the project is now wired for App Store + Play Store distribution as paid apps EUR 4.99.

### Capacitor wrappers

- **iOS + Android native shells.** Bundle ID `pt.marjers.blockbuilder`. webDir points at `pwa-stage/`, refreshed via `npm run pwa:stage` before any `cap sync`. Both projects committed so Codemagic can clone + build (Marjers has no Mac + no Android SDK locally, so cloud build is the only path).
- **Native icons + splash.** Generated 74 Android + 7 iOS assets via `@capacitor/assets` from `build/icon-1024.png`. Alpha stripped by the pipeline so Apple's marketing-icon rule is met without a separate source file.
- **Signing keystore.** Local Android upload keystore generated, alias `blockbuilder`, valid until 2053, gitignored.

### Paid-app pricing on mobile

- **EUR 4.99 up-front, no IAP, no RevenueCat.** Paying for the download IS the licence on iOS and Android. Apple / Google handle billing, refunds (14-day), receipts. Desktop stays free + EUR 12 commercial via Lemon Squeezy. The soft reminder dialog is hard-coded off when the app runs inside Capacitor native, paying users get a clean app from first launch.

### Mobile UX (PWA + native both)

- **Tablet rail (Shapr3D-style)** at 769-1024 px. Vertical 56 px floating left rail with 10 icon-only tools. Insert opens the shape grid as a fly-out popover next to the rail. Floating Properties card on the right when a shape is selected.
- **Phone dock (Womp-style)** at =768 px. Six-icon bottom dock (Insert, Undo, Group, Edit, Help, More). Insert and Edit open as bottom-sheets above the dock. Insert auto-closes after spawn.
- **Long-press radial menu** on touch screens. Hold a finger on any shape for 500 ms, a floating 4-button popover shows Duplicate / Hide / Group / Delete at the press location. 20 ms vibration on open if the device supports the Vibration API.
- **More menu** lists every secondary tool (CSG, Modify, Reference, Sketch, Edit, History) plus a dedicated Layers section that re-hosts the existing Outliner DOM inside the menu when opened.
- **Touch handle sizing.** Resize sprites scale up 1.6x on coarse pointer.
- **Pixel ratio cap** 1.25 on coarse pointer (integrated mobile GPUs cope better at 1.25 than 2x with bevelled primitives).
- **Touch-aware quickstart copy.** First-launch card swaps text for the touch user ("Tap + Insert in the dock", "Two-finger orbit, pinch to zoom") via `@media (pointer: coarse)`.

### Marketing site

- **/tutorials.** New page with the 85-clip index, 12 categories, sidebar filter, full-text search, modal player (youtube-nocookie embed), watched-state in localStorage. `tutorials.json` data file ready to receive YouTube IDs as Marjers uploads.
- **/pricing.** Three tiers (Desktop free, Mobile EUR 4.99, Desktop commercial EUR 12), licensing FAQ, beta banner explaining payments-paused gate.
- **/privacy.** Bilingual PT/EN privacy policy, GDPR rights, third-party processors (Apple, Google, Lemon Squeezy, Buy Me Coffee, Cloudflare), CNPD reference.
- **Devices section** on the landing page. Real PWA screenshots embedded in CSS-only device frames (monitor + tablet + phone with notch + camera dot), composed at angles.
- **OG image** regenerated. 1200x630 with brand mark, headline, sub, 3 pills, and a 3-device mockup. Shared links to WhatsApp / Discord / Slack / Twitter now get a rich preview card.
- **Sitemap + robots.** Sitemap lists /, /pricing, /tutorials, /changelog, /privacy, blockbuilder-app.pages.dev. robots.txt allows all and references the sitemap.
- **Vanity URLs.** /app -> blockbuilder-app.pages.dev (302). /pricing, /privacy, /tutorials served as clean URLs via Cloudflare Pages rewrites.

### Store assets ready in `store-assets/`

- `icon-512x512.png` + `icon-apple-1024x1024.png` (RGB, no alpha)
- `feature-graphic-1024x500.png` for Play Store hero
- 4 iPhone 6.7" screenshots (1290x2796)
- 3 iPad 13" screenshots (2048x2732)
- `youtube-banner-2048x1152.png` for the eventual @marjers YouTube channel

### Fixed

- **Critical desktop layout regression.** The mobile-drawer scrim element added for tablet support was eating column 1 of the main grid on desktop, pushing Sidebar to column 2 (900 px wide) and Properties to column 1, breaking the entire 3-column layout. Caught by Playwright audit before any beta zip went out.
- **Dim pill console warning storm.** Corner-handle resize drags wrote "WxH" strings to a number input; switched to type=text + inputmode=decimal.
- **iOS-safe viewport units.** Replaced `100vh` with `100dvh` (with `100vh` fallback) so iOS Safari URL bar collapse doesn't crop the layout.

## [0.6.0], 2026-06-02, Tinkercad++

### Added
- **Intersect boolean (Ctrl+Shift+G).** Completes the CSG triad: Union (Group), Subtract (Hole + Group), and now Intersect. The result is only the volume common to every selected solid. Reversible until Bake, just like Group.
- **Dimension overlay.** Select any shape (or several) and the X / Y / Z size labels appear at the bounding-box edges in the active unit. Colour-coded per axis (red / green / blue). Toggle via the setting `bb.showDims` (defaults on; click the gear icon to flip it).
- **Improved body-drag snap.** Snap targets now include the 4 edge midpoints of every neighbouring shape's bounding box (on top of the 4 corners + centre we already had). Centring a screw hole on the midline of a bracket is one drag away. A lime ring marker pops over the snap point while the snap is active; hold Ctrl to bypass.
- **Arithmetic in property values.** Type `2 * 12 + 4`, `(40 - 6) / 2`, `sqrt(50)`, or `max(10, 8)` into any size / position input and it evaluates on Enter. Supports `+ - * / % **` plus `sqrt abs round ceil floor min max sin cos tan pow`. Resolves to the numeric value once entered.
- **Keyboard shortcuts palette.** `Ctrl+K` (or `?`) opens a searchable modal listing every shortcut grouped by topic (View, Selection, Edit, CSG, History, File, Help). Search across labels, group names, or key combos. Esc closes. Reduces the "how do I X?" surface without a docs site.
- **Quickstart-by-default empty state.** When the scene is empty (first launch, or after deleting everything), the central card now shows a 4-step numbered walkthrough, drag a primitive, move with handles, add a Hole and Ctrl+G to combine, export STL, plus a one-line nudge to press `Ctrl+K` for the full shortcut list. Same card was previously a single "Drag a shape to start" line.
- **Chamfered Box / Cylinder / Cone / Tube (primitive parameter).** All four primitives now have a `Chamfer` parameter alongside their existing dimensions. Set to `0` for sharp edges, or any positive value up to ~half the smallest free dimension for a 45° bevel. Box gets all 12 edges bevelled (24-vertex analytical geometry). Cylinder / truncated Cone / Tube get top + bottom rim chamfers (built from a LatheGeometry around a chamfered profile, watertight after a merge-vertices pass). Pointed cones (top radius = 0) silently skip the chamfer, there's no rim edge to bevel. Other primitives (Sphere, Pyramid, Wedge, Roof, Polygon, Star, Heart, Torus) don't have chamfer yet.
- **Filleted Box (primitive parameter).** Box gets a `Fillet` parameter that, when > 0, rounds every edge with the given radius and overrides `Chamfer`. Each of the 12 cube edges becomes a quarter-cylinder arc with `fillet_segments` segments (default 8); each of the 8 corners becomes an octant of a sphere with the same radius. Triangle winding is derived analytically per region so the outward normal matches the surface, no doubled material, CSG operations and STL export work. Bumping `fillet_segments` from 8 to 16 doubles smoothness; 4 gives a polygonal "stepped" look.
- **Filleted Cylinder / truncated Cone / Tube.** Same `Fillet` parameter extended to the three lathe primitives. Cylinder + truncated Cone: each rim corner (top, bottom) becomes a 90° arc in the radial-axial plane with `fillet_segments` arc segments. Tube: all 4 rim corners (outer + inner, top + bottom) get rounded; the swept profile stays a closed annular polyline so the surface is watertight. Pointed cones (top radius = 0) skip the fillet branch, there's no rim to round. `Fillet` overrides `Chamfer` when both are > 0.
- **Chamfer + Fillet for Polygon / Star / Heart.** The three extruded-shape primitives gain top + bottom rim bevels via three.js's built-in `ExtrudeGeometry` bevel options. `bevelSegments = 1` produces a 45° chamfer; `bevelSegments = fillet_segments` (default 8) produces a smooth fillet. Polygon switches from `CylinderGeometry(N sides)` to `ExtrudeGeometry` of an N-gon profile whenever chamfer or fillet > 0, bevel applies along the rim perpendicular to the extrusion axis. Heart's bevel is clamped tighter (≤20 % of radius) because the silhouette has concave features near the top dip that would self-intersect with aggressive bevels.
- **Chamfer + Fillet for Wedge / Roof (partial).** Wedge and Roof get the `Chamfer` and `Fillet` params via a generic `buildExtrudedPrism` helper that switches the geometry to `ExtrudeGeometry` of the triangular cross-section. Bevels the perimeter of the front and back face (the two triangular ends along the prism axis). The three long axial edges (Wedge: bottom, vertical wall, slope; Roof: bottom, two slopes meeting at the ridge) stay sharp, full edge coverage needs a custom analytical generator like the chamfered box, deferred to a later release.
- **Chamfer + Fillet for Pyramid (base edges).** Pyramid gets a custom `buildPyramidWithBaseBevel` that bevels the N base edges (where the base N-gon face meets the N slanted lateral faces). For chamfer the bevel is a single 45° plane per edge; for fillet it's a K-segment arc (K = `fillet_segments`). Lateral edges going up to the apex stay sharp, bevelling them would round the apex into a small cap which changes the shape's identity. Square pyramids (sides=4) still get the 45° rotation that aligns the flat face with +X.
- **Pattern v2, Skip instances.** Array tool gets a new "Skip instances" field: type comma- or space-separated 1-based indices (e.g. `3, 7, 9`) to omit those copies. Index 0 is the source shape (always kept). Lets you build hex grids with a missing centre, masonry patterns with feature gaps, or any non-uniform pattern in one step instead of duplicate-then-delete. Out-of-range / non-numeric tokens are silently dropped.
- **Edge-hover dimensions.** Move the cursor near any feature edge of any shape and a small label appears at the edge midpoint with its world-space length in the active unit. Internal triangulation edges (the hidden diagonal in a Box's quad face, for instance) are filtered out via `THREE.EdgesGeometry` with a 1° angle threshold, only edges a human can see get measured. Cache is per BufferGeometry via WeakMap, so rebuilding a primitive on a parameter edit auto-invalidates the cache. Pixel threshold for "near" is 24 px; beyond that, no label so a dense scene doesn't fill with noise.
- **Push / Pull along face normal.** New tool in the toolbar. Click any face (axis-aligned OR slanted), then drag away from it: a new prism extrudes outward along that face's normal, with depth driven by mouse travel projected onto the screen-space normal direction. Solves the "drop a tab on a 30° wall" case that the white XYZ resize handles couldn't reach. Snap step applies during the drag (Ctrl bypasses). On commit the result is a regular CUBE-kind shape oriented to the face quaternion, so its width / depth / height stay editable in Properties. The original picked shape is untouched (this isn't full Tinkercad-style push/pull yet, that requires a half-edge representation and is deferred).
- **Gizmo snap to features (scale).** Resize handles (the white squares on the bounding-box faces) now snap to neighbour shapes' AABB min / mid / max planes on the dragged axis, plus the world origin. Tolerance scales with the moving shape's size (max(0.5 mm, 2 % of start size)) so it works at any zoom. Only fires when global snap is on; Ctrl bypasses. Symmetric / uniform / corner drags skip it (the snap target would be ambiguous when both faces move). The lime ring marker from body-drag is reused so the snapped face plane is visible. Neighbour AABBs are captured once at drag start (not per pointermove), so the cost stays flat on 50-shape scenes. Rotation snap stays at 0.1° / `snapStep` degrees, feature-direction rotation snap is harder to define and was deferred.
- **Live-scrub sliders in Properties.** Every numeric param (width, depth, height, radius, segments, sides, chamfer, fillet, smoothness, etc.) gets a draggable range slider beneath its text input. Drag the slider, watch the shape rebuild in real time. One history slot per drag (not per input event), so Ctrl+Z reverses the whole scrub. Slider auto-extends past its default max if you type a larger number, so a 500 mm wall doesn't trap you. Text input still accepts expressions (`2*12+4`, `sqrt(50)`) as before.
- **Always-maximised Electron window.** App now opens covering the work area on launch (taskbar stays visible), instead of the previous 1440x920 floating window. F11 toggles borderless full-screen. The 1440x920 dimensions remain as the un-maximised fallback.
- **Reference geometry (MVP).** Three new toolbar tools after Push/Pull: Ref Plane (click 3 points to spawn a translucent cyan plane through them), Ref Axis (click any feature edge to spawn a dashed cyan line along it, extending 20 mm past each endpoint), Midpoint (click any feature edge to drop a cyan sphere + crosshair at its midpoint). Refs are construction geometry, not solids: not lit, not exported, not printable. They snap as targets for body-drag and resize handle drags (MIDPOINT contributes its point, AXIS_EDGE contributes its endpoints + midpoint, PLANE_3P contributes its 3 defining points + centroid). They survive project save / load + IndexedDB autosave (project format version bumped from 1 to 2; v1 files still load). They appear in the Outliner with a dedicated "Reference geometry" subsection, each row has a kind glyph (rectangle / arrow / dot), hide-eye, delete, and on PLANE_3P rows a "use as workplane" button that sets the plane as the active workplane override so new shapes spawn aligned to it. v2 work (not shipped yet): edit a ref's defining points after creation, undo support on ref add / delete, full-plane snap (not just defining points), workplane integration via toolbar.
- **Mobile / tablet PWA foundation.** Same codebase, responsive layer added. Tablet (=1024 px): tighter side panels. Phone (=768 px): sidebar + properties become off-canvas slide-in drawers, two new mobile-only toolbar buttons toggle them, toolbar becomes a horizontal scroller, floating tool panels dock to the screen bottom, touch handle sprites scale up 1.6x on coarse pointer, pixelRatio caps at 1.25 on coarse pointer so integrated mobile GPUs don't overdraw bevelled primitives. PWA install ready: manifest.webmanifest with apple / android meta tags, service worker precaches the app shell + vendored three.js so the app works fully offline once visited. iOS-safe `dvh` units used for panel max-heights with `vh` fallback. The Electron build doesn't register the service worker (file:// is skipped) so the desktop binary behaviour is unchanged.

### Brand
- New 3-staggered-cube mark replaces the single isometric cube wireframe. Applied to the favicon, app icon (16 / 32 / 64 / 128 / 256 / 1024), in-app brand area, welcome modal, support nag, and the App Store icon.

### Fixed
- **Critical:** `activateLicense()` now accepts both legacy `BBS2-...` keys (from the keygen script) and current `BBS2....` keys (from the Cloudflare worker). Previously a live LS purchase would have silently failed activation; caught by the launch-readiness audit before any real payment fired.
- Resend payload gets a `reply_to: geral@marjers.com` so replies route to the address promised in the email body.
- Buyer email is redacted before being logged on Resend error responses.

### Beta hardening
- New worker secret `ISSUANCE_ENABLED='false'` kill switch returns 503 to every webhook while payments are paused. Flip to `'true'` at launch (see LAUNCH.md, section B.1).
- Release notes now publish the SHA-256 of the portable zip with a `Get-FileHash` verify command. Bug reports point to `%APPDATA%\BlockBuilder Studio\` for log + autosave attachment.
- Welcome modal in beta builds nudges anonymous downloaders to say hi at `geral@marjers.com` so we can count + onboard.

## [0.5.0], 2026-05-22, First public preview

### New tools
- **Sketch tools**: Extrude, Scribble, Revolve. Click polygon corners, free-hand drag, or define a profile to lathe. Each becomes an editable shape.
- **Cut**: Bambu-style slice along X / Y / Z with live plane preview.
- **Hollow**: carve any shape into a shell with adjustable wall thickness.
- **Array**: linear (count + spacing) and circular (count + axis + total angle).
- **Ruler**: 2-point distance with per-axis deltas, vertex snap with screen-space radius.
- **Workplane on face**: pick any face, new shapes spawn aligned to it.
- **Split into loose parts**: separate a mesh into its disconnected components via union-find.

### Shape catalogue
- 13 primitives: Box, Cylinder, Sphere, Cone, Pyramid (now N-sided), Wedge, Roof, Tube, Torus, Polygon, Star, Heart.
- Pyramid and Polygon both get the **Sides** slider.

### Quality of life
- **Undo / Redo** (Ctrl+Z / Ctrl+Shift+Z) with 50-step history.
- **Ctrl+S** to save project.
- **Vertex / corner snap** during body drag and ruler picks.
- **Lock** per shape (keeps it visible but non-interactive).
- **Reset transform** button in Properties.
- **Volume, surface area, triangle count** in Properties (cached, fast).
- **STL repair** for imported meshes (weld + drop degenerate + recompute normals + rebuild BVH).
- **Screenshot** button, instant PNG of the viewport.
- **Light theme** plus customisable viewport background.
- **Tooltips everywhere** that can be disabled in Settings.
- **Toast notifications** replace all `alert()` calls.
- **Quality preset**: Fast / Balanced / Sharp (pixel ratio 1.0 / 1.5 / native).

### Performance
- Render-on-demand main loop, idle scenes cost ~0.
- three-mesh-bvh acceleration on imports + CSG results.
- MeshStandardMaterial for solids (lighter than Physical).
- Shadow map reduced to 1024².

### Reliability
- **IndexedDB autosave** replaces localStorage (no more 5 MB cap on STL imports).
- **Single-instance lock** in Electron, second launch focuses the existing window.
- Legacy localStorage autosave auto-migrates to IndexedDB on first run.

### Distribution
- Cross-platform installers: Windows NSIS + portable, macOS DMG, Linux AppImage.
- Code-signing pipeline for Windows (Azure Trusted Signing) + macOS notarisation.
- GitHub Releases as the binary host, electron-updater ready.
- STEP export (AP203 faceted-brep), imports as a mesh body in CAD tools.

### Licence + payments
- ECDSA P-256 signed licence keys verified offline via Web Crypto.
- Cloudflare Worker handles Lemon Squeezy webhook + sends keys via Resend.
- Personal use stays free forever. €12 one-time commercial licence.

## [0.4.0], internal, not released

- Rebrand TinkerDesk → BlockBuilder Studio.
- Electron 32 wrapper with contextIsolation + sandbox.
- Welcome modal (New / Continue / Open / Recents).
- Unit picker on first run (mm / cm / inches).
- Autosave to localStorage.
