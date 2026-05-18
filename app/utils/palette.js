// BlockBuilder Studio palette — distinct from Autodesk Tinkercad. Cooler, more
// saturated tones suited to a dark-theme UI. New shapes cycle through these.

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

export const HOLE_COLOR = 0xff5566;

let _paletteIndex = 0;
export function nextPaletteColor() {
  const c = PALETTE[_paletteIndex % PALETTE.length];
  _paletteIndex += 1;
  return c;
}
