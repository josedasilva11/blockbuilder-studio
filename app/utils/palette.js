// BlockBuilder Studio palette — distinct from Autodesk Tinkercad. Two banks:
// PALETTE is the curated quick-pick set (shows as the swatch grid). PALETTE_EXT
// is a wider preset library shown when the user expands the picker. The native
// `<input type="color">` covers anything outside both banks.

export const PALETTE = [
  0xc4f04f, // signature lime
  0xff6e6e, // coral red
  0xffae34, // amber
  0xffd84a, // honey yellow
  0x44c1a4, // teal
  0x4a8df0, // azure blue
  0xb478f0, // lavender
  0xff8fb1, // peach pink
];

// Extended bank — material/PMS-inspired. Shown in a second grid when the user
// clicks "More". Order goes roughly hue-rotated so neighbours feel related.
export const PALETTE_EXT = [
  0xffffff, 0xe5e7eb, 0xa1a8b3, 0x60697a, 0x2f3543, 0x111418,
  0xb91c1c, 0xdc2626, 0xef4444, 0xf87171, 0xfca5a5, 0xfee2e2,
  0xea580c, 0xf97316, 0xfb923c, 0xfdba74, 0xfed7aa,
  0xb45309, 0xd97706, 0xf59e0b, 0xfbbf24, 0xfde68a,
  0x65a30d, 0x84cc16, 0xa3e635, 0xbef264, 0xd9f99d,
  0x059669, 0x10b981, 0x34d399, 0x6ee7b7, 0xa7f3d0,
  0x0e7490, 0x06b6d4, 0x22d3ee, 0x67e8f9, 0xa5f3fc,
  0x1d4ed8, 0x2563eb, 0x3b82f6, 0x60a5fa, 0x93c5fd,
  0x4338ca, 0x6366f1, 0x818cf8, 0xa5b4fc,
  0x7c3aed, 0x8b5cf6, 0xa78bfa, 0xc4b5fd,
  0xbe185d, 0xdb2777, 0xec4899, 0xf472b6, 0xf9a8d4,
  0x854d0e, 0xa16207, 0xca8a04, 0xeab308,
  0x44403c, 0x78716c, 0xa8a29e, 0xd6d3d1,
];

export const HOLE_COLOR = 0xff5566;

let _paletteIndex = 0;
export function nextPaletteColor() {
  const c = PALETTE[_paletteIndex % PALETTE.length];
  _paletteIndex += 1;
  return c;
}

export function hexToInt(hex) {
  if (typeof hex !== 'string') return 0;
  const m = hex.replace(/^#/, '');
  return parseInt(m, 16) || 0;
}
export function intToHex(int) {
  return '#' + (int >>> 0).toString(16).padStart(6, '0');
}
