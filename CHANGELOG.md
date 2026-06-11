# Changelog

All notable changes to BlockBuilder Studio are listed here.
Latest at the top. Date format: YYYY-MM-DD.

## [0.6.0] — 2026-06-02 — Tinkercad++

### Added
- **Intersect boolean (Ctrl+Shift+G).** Completes the CSG triad: Union (Group), Subtract (Hole + Group), and now Intersect. The result is only the volume common to every selected solid. Reversible until Bake, just like Group.
- **Dimension overlay.** Select any shape (or several) and the X / Y / Z size labels appear at the bounding-box edges in the active unit. Colour-coded per axis (red / green / blue). Toggle via the setting `bb.showDims` (defaults on; click the gear icon to flip it).
- **Improved body-drag snap.** Snap targets now include the 4 edge midpoints of every neighbouring shape's bounding box (on top of the 4 corners + centre we already had). Centring a screw hole on the midline of a bracket is one drag away. A lime ring marker pops over the snap point while the snap is active; hold Ctrl to bypass.
- **Arithmetic in property values.** Type `2 * 12 + 4`, `(40 - 6) / 2`, `sqrt(50)`, or `max(10, 8)` into any size / position input and it evaluates on Enter. Supports `+ - * / % **` plus `sqrt abs round ceil floor min max sin cos tan pow`. Resolves to the numeric value once entered.
- **Keyboard shortcuts palette.** `Ctrl+K` (or `?`) opens a searchable modal listing every shortcut grouped by topic (View, Selection, Edit, CSG, History, File, Help). Search across labels, group names, or key combos. Esc closes. Reduces the "how do I X?" surface without a docs site.
- **Quickstart-by-default empty state.** When the scene is empty (first launch, or after deleting everything), the central card now shows a 4-step numbered walkthrough — drag a primitive, move with handles, add a Hole and Ctrl+G to combine, export STL — plus a one-line nudge to press `Ctrl+K` for the full shortcut list. Same card was previously a single "Drag a shape to start" line.
- **Chamfered Box / Cylinder / Cone / Tube (primitive parameter).** All four primitives now have a `Chamfer` parameter alongside their existing dimensions. Set to `0` for sharp edges, or any positive value up to ~half the smallest free dimension for a 45° bevel. Box gets all 12 edges bevelled (24-vertex analytical geometry). Cylinder / truncated Cone / Tube get top + bottom rim chamfers (built from a LatheGeometry around a chamfered profile, watertight after a merge-vertices pass). Pointed cones (top radius = 0) silently skip the chamfer — there's no rim edge to bevel. Other primitives (Sphere, Pyramid, Wedge, Roof, Polygon, Star, Heart, Torus) don't have chamfer yet.
- **Filleted Box (primitive parameter).** Box gets a `Fillet` parameter that, when > 0, rounds every edge with the given radius and overrides `Chamfer`. Each of the 12 cube edges becomes a quarter-cylinder arc with `fillet_segments` segments (default 8); each of the 8 corners becomes an octant of a sphere with the same radius. Triangle winding is derived analytically per region so the outward normal matches the surface — no doubled material, CSG operations and STL export work. Bumping `fillet_segments` from 8 to 16 doubles smoothness; 4 gives a polygonal "stepped" look.
- **Filleted Cylinder / truncated Cone / Tube.** Same `Fillet` parameter extended to the three lathe primitives. Cylinder + truncated Cone: each rim corner (top, bottom) becomes a 90° arc in the radial-axial plane with `fillet_segments` arc segments. Tube: all 4 rim corners (outer + inner, top + bottom) get rounded; the swept profile stays a closed annular polyline so the surface is watertight. Pointed cones (top radius = 0) skip the fillet branch — there's no rim to round. `Fillet` overrides `Chamfer` when both are > 0.
- **Chamfer + Fillet for Polygon / Star / Heart.** The three extruded-shape primitives gain top + bottom rim bevels via three.js's built-in `ExtrudeGeometry` bevel options. `bevelSegments = 1` produces a 45° chamfer; `bevelSegments = fillet_segments` (default 8) produces a smooth fillet. Polygon switches from `CylinderGeometry(N sides)` to `ExtrudeGeometry` of an N-gon profile whenever chamfer or fillet > 0 — bevel applies along the rim perpendicular to the extrusion axis. Heart's bevel is clamped tighter (≤20 % of radius) because the silhouette has concave features near the top dip that would self-intersect with aggressive bevels.
- **Chamfer + Fillet for Wedge / Roof (partial).** Wedge and Roof get the `Chamfer` and `Fillet` params via a generic `buildExtrudedPrism` helper that switches the geometry to `ExtrudeGeometry` of the triangular cross-section. Bevels the perimeter of the front and back face (the two triangular ends along the prism axis). The three long axial edges (Wedge: bottom, vertical wall, slope; Roof: bottom, two slopes meeting at the ridge) stay sharp — full edge coverage needs a custom analytical generator like the chamfered box, deferred to a later release. Pyramid is also deferred because its tapered geometry doesn't fit the Extrude pattern; it would need a dedicated builder.

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

## [0.5.0] — 2026-05-22 — First public preview

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
- **Screenshot** button — instant PNG of the viewport.
- **Light theme** plus customisable viewport background.
- **Tooltips everywhere** that can be disabled in Settings.
- **Toast notifications** replace all `alert()` calls.
- **Quality preset**: Fast / Balanced / Sharp (pixel ratio 1.0 / 1.5 / native).

### Performance
- Render-on-demand main loop — idle scenes cost ~0.
- three-mesh-bvh acceleration on imports + CSG results.
- MeshStandardMaterial for solids (lighter than Physical).
- Shadow map reduced to 1024².

### Reliability
- **IndexedDB autosave** replaces localStorage (no more 5 MB cap on STL imports).
- **Single-instance lock** in Electron — second launch focuses the existing window.
- Legacy localStorage autosave auto-migrates to IndexedDB on first run.

### Distribution
- Cross-platform installers: Windows NSIS + portable, macOS DMG, Linux AppImage.
- Code-signing pipeline for Windows (Azure Trusted Signing) + macOS notarisation.
- GitHub Releases as the binary host, electron-updater ready.
- STEP export (AP203 faceted-brep) — imports as a mesh body in CAD tools.

### Licence + payments
- ECDSA P-256 signed licence keys verified offline via Web Crypto.
- Cloudflare Worker handles Lemon Squeezy webhook + sends keys via Resend.
- Personal use stays free forever. €12 one-time commercial licence.

## [0.4.0] — internal, not released

- Rebrand TinkerDesk → BlockBuilder Studio.
- Electron 32 wrapper with contextIsolation + sandbox.
- Welcome modal (New / Continue / Open / Recents).
- Unit picker on first run (mm / cm / inches).
- Autosave to localStorage.
