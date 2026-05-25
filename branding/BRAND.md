# BlockBuilder Studio brand

The brand is small on purpose. Lime + dark + a wireframe cube. Type does
the rest. This file documents the parts so the next month's marketing,
press kit, or App Store submission doesn't reinvent them.

## Colour palette

| Token | Hex | RGB | Use |
|---|---|---|---|
| Lime (hi) | `#cdff45` | 205, 255, 69 | Brand accent. Gradient top, hover states |
| Lime (lo) | `#7cbe1e` | 124, 190, 30 | Gradient bottom. Hover-active fills |
| Lime (mid) | `#c4f04f` | 196, 240, 79 | Single-tone lime when no gradient |
| Dark base | `#0a0c10` | 10, 12, 16 | Site background, app dark theme bg |
| Panel | `#161a23` | 22, 26, 35 | Cards, modals, second-tier surfaces |
| Border | `#232838` | 35, 40, 56 | Hairlines, separators |
| Text high | `#eef0f5` | 238, 240, 245 | Primary copy on dark |
| Text mid | `#aab2c4` | 170, 178, 196 | Secondary copy |
| Text dim | `#6b7388` | 107, 115, 136 | Tertiary, captions, footnotes |
| Amber (beta) | `#f7c948` | 247, 201, 72 | BETA banners + coffee tier only. Never primary |
| Orange (beta lo) | `#f59e0b` | 245, 158, 11 | Gradient bottom for amber |

Notes:
- The Lime gradient (hi to lo) is the brand mark's signature. Use it on
  the wireframe stroke and on primary CTAs.
- Amber is exclusively for "tip jar" / coffee / paused-state / beta
  warnings. Don't extend amber to anything else, otherwise it loses
  meaning.
- Always test contrast: lime mid on dark base is `#c4f04f` on `#0a0c10`,
  contrast ratio 14.4:1 — safe everywhere.

## Typography

| Family | Where | Weights |
|---|---|---|
| **Inter** | All UI body, headings, buttons | 400, 500, 600, 700 |
| **Instrument Serif** (italic) | Editorial headlines: "Print the *same day*" | 400 italic |
| **JetBrains Mono** (or ui-monospace) | Code, version pills, technical labels | 400, 700 |

Inter is hosted via Google Fonts on the site. The app uses system fonts
inside Electron (Segoe UI on Windows). When designing in Figma offline,
substitute Instrument Serif italic with Georgia italic — visually
equivalent enough for mockups.

## The mark

The wireframe cube is the only logo. No words, no descender, no
gimmicks. The mark IS the brand.

### Variants

| File | Use |
|---|---|
| `branding/mark-color.svg` | Default. Lime gradient on transparent. Use on dark surfaces. |
| `branding/mark-mono-light.svg` | White wireframe. For dark photos, brand-coloured backgrounds, or single-colour print. |
| `branding/mark-mono-dark.svg` | Dark wireframe. For light surfaces (paper press kits, embeds on white blogs). |
| `build/icon-source.svg` | App icon — dark squircle background + lime cube. Used for desktop Electron build. |
| `branding/appstore-icon-1024.png` | App Store icon. 1024x1024, square (NO rounded corners — iOS applies them), no alpha. |

### Don'ts

- Don't recolour the gradient. Lime is the brand.
- Don't put a stroke around the squircle (it already has a bevel).
- Don't add a drop shadow to the mark itself. The squircle background
  has gradient depth; the mark sits flat on top.
- Don't rotate the cube. The isometric angle is the recognizable shape.
- Don't stretch or skew either axis.
- Don't use the mark below 16px. At 12 or 8px the wireframe becomes
  illegible. Use a solid silhouette stamp in that case (TODO: ship
  a `mark-glyph.svg` for ≤16px use).

## Lockups

For the rare case where mark + wordmark must travel together.

| File | Use |
|---|---|
| `branding/lockup-horizontal.svg` | Email signatures, partner co-marketing, ~4:1 ratio |
| `branding/lockup-stacked.svg` | Vertical banners, mobile splash, sidebar branding |

Both lockups assume Inter is loaded. For environments where webfonts
aren't available (PDF press kit, printed materials, partner co-marketing
where you can't control the renderer), convert the wordmark text to
paths in your design tool before exporting.

## Wordmark style rules

Block**B**uilder is one word, no space. The "B" in "Builder" is uppercase.

In code / docs / titles use the styled form: <strong>Block</strong>Builder
(bold "Block", regular "Builder", no space).

"Studio" follows in uppercase monospace, smaller, with letter-spacing
0.18em-0.22em (depending on size). It acts like a subtitle tag, not part
of the wordmark itself. In short contexts (favicon alt text, tab title),
drop "Studio" and use just "BlockBuilder".

## Tone of voice

- **Honest, not corporate.** "No accounts, no limits, no nonsense" — say
  what we don't do and mean it.
- **Direct, not chirpy.** "Print the same day" not "Bring your dreams to
  life in 3D!". Makers respect tools that get out of the way.
- **Specific, not aspirational.** "13 primitives, full CSG, STL/OBJ/STEP
  export" not "Everything you need to be creative".
- **Solo, not corporate-we.** "Built by Marjers" / "I built it on
  evenings and weekends" — single-developer authenticity is a feature,
  not something to hide.

## Forbidden

- Em-dashes (`—`) in user-facing copy. Use commas, colons, periods, or
  middle dots (`·`). This is enforced repo-wide.
- Brazilian Portuguese forms in PT copy. Use PT-PT: "tu" not "você",
  "ficheiro" not "arquivo", "ecrã" not "tela", "fixe" not "legal".
- Stock photography of "creative people working". The brand is the
  product itself; show actual rendered models (Porsche, Eiffel, hinge),
  not bought imagery.
- Emojis in marketing copy or product UI. The amber coffee `☕` and the
  beta banner are the two sanctioned exceptions; everything else stays
  emoji-free.

## When this document changes

- Adding a new lockup variant: drop the SVG in `branding/`, list it here
- Adding a new colour: extend the palette table, justify the use case
- Adding a new font: must support all CSS weights we use, check licence
  for embedding in App Store binaries
