// Tinkercad-inspired colour palette. Indices cycle as new shapes are added.

export const PALETTE = [
  0xd9a574, // warm tan (Tinkercad default)
  0xd95252, // red
  0xf5a623, // orange
  0xf5d83e, // yellow
  0x7cb959, // green
  0x529bdb, // blue
  0xa674da, // purple
  0xed9fc1, // pink
];

export const HOLE_COLOR = 0xff6262;

let _paletteIndex = 0;
export function nextPaletteColor() {
  const c = PALETTE[_paletteIndex % PALETTE.length];
  _paletteIndex += 1;
  return c;
}
