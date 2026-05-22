# Changelog

All notable changes to BlockBuilder Studio are listed here.
Latest at the top. Date format: YYYY-MM-DD.

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
