# Build icons

Source: `icon-source.svg` (1024×1024, lime cube wireframe on dark squircle).

## Already generated

- `icon.png` — 512×512, used for Linux AppImage
- `icon.ico` — multi-res (16/32/48/64/128/256), used for Windows installer + .exe
- `icon-1024.png`, `icon-256.png`, `icon-128.png` — intermediate sizes (keep for reference)

## macOS `.icns` (generate on a Mac)

`iconutil` is macOS-only. From a Mac in this folder:

```bash
mkdir icon.iconset
for s in 16 32 64 128 256 512 1024; do
  sips -z $s $s icon-1024.png --out icon.iconset/icon_${s}x${s}.png
done
iconutil -c icns icon.iconset -o icon.icns
rm -rf icon.iconset
```

If you don't have a Mac handy, electron-builder will accept `icon.png`
alone and synthesise the `.icns` at build time when run on macOS.

## Rebuilding from the SVG

```bash
inkscape icon-source.svg --export-type=png --export-filename=icon-1024.png -w 1024 -h 1024
python -c "from PIL import Image; Image.open('icon-1024.png').save('icon.ico', sizes=[(16,16),(32,32),(48,48),(64,64),(128,128),(256,256)])"
inkscape icon-source.svg --export-type=png --export-filename=icon.png -w 512 -h 512
```
