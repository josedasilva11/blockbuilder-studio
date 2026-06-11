// Shape definitions: defaults, parameter schema, thumbnail SVG, friendly label.

export const SHAPES = [
  { kind: 'CUBE', label: 'Box', hint: 'rectangular block, edit width/depth/height. Chamfer > 0 bevels all 12 edges.',
    icon: cubeIcon(), defaults: { width: 20, depth: 20, height: 20, chamfer: 0 }, params: ['width', 'depth', 'height', 'chamfer'] },
  { kind: 'CYLINDER', label: 'Cylinder', hint: 'round column, radius + height (segments control smoothness)',
    icon: cylinderIcon(), defaults: { radius: 10, height: 20, segments: 48 }, params: ['radius', 'height', 'segments'] },
  { kind: 'SPHERE', label: 'Sphere', hint: 'ball — only radius matters; raise segments for smoother surface',
    icon: sphereIcon(), defaults: { radius: 10, segments: 32 }, params: ['radius', 'segments'] },
  { kind: 'CONE', label: 'Cone', hint: 'tapered shape — set top radius > 0 for a truncated cone (frustum)',
    icon: coneIcon(), defaults: { radius: 10, radius_top: 0, height: 20, segments: 48 }, params: ['radius', 'radius_top', 'height', 'segments'] },
  // Dome (HALF_SPHERE) hidden from the sidebar — geometry produced bad normals
  // on the flat cap, which made CSG flaky. Kept in SHAPE_BY_KIND so existing
  // saves still deserialise without throwing; just not pickable any more.
  { kind: 'HALF_SPHERE', label: 'Dome', hidden: true,
    icon: domeIcon(), defaults: { radius: 10, segments: 32 }, params: ['radius', 'segments'] },
  { kind: 'PYRAMID', label: 'Pyramid', hint: 'N-sided pyramid (3 = tetrahedron, 4 = square, 5+ = pentagonal…); apex on top',
    icon: pyramidIcon(), defaults: { width: 20, depth: 20, height: 20, sides: 4 }, params: ['width', 'depth', 'height', 'sides'] },
  { kind: 'WEDGE', label: 'Wedge', hint: 'right-angle ramp — useful for transitions and supports',
    icon: wedgeIcon(), defaults: { width: 20, depth: 20, height: 20 }, params: ['width', 'depth', 'height'] },
  { kind: 'ROOF', label: 'Roof', hint: 'triangular prism — like a house roof',
    icon: roofIcon(), defaults: { width: 20, depth: 30, height: 15 }, params: ['width', 'depth', 'height'] },
  { kind: 'TUBE', label: 'Tube', hint: 'hollow cylinder — inner radius cuts the hole; great as a pipe / ring',
    icon: tubeIcon(), defaults: { radius: 10, inner_radius: 6, height: 20, segments: 48 }, params: ['radius', 'inner_radius', 'height', 'segments'] },
  { kind: 'TORUS', label: 'Torus', hint: 'donut shape — radius = ring size, minor radius = tube thickness',
    icon: torusIcon(), defaults: { radius: 10, minor_radius: 3, segments: 48, minor_segments: 16 }, params: ['radius', 'minor_radius', 'segments', 'minor_segments'] },
  { kind: 'POLYGON', label: 'Polygon', hint: 'N-sided prism — set sides for triangle (3), pentagon (5), hex (6), etc.',
    icon: polygonIcon(), defaults: { radius: 10, height: 20, sides: 6 }, params: ['radius', 'height', 'sides'] },
  { kind: 'STAR', label: 'Star', hint: 'N-pointed star prism — outer radius is points, inner is valleys',
    icon: starIcon(), defaults: { radius: 12, inner_radius: 5, height: 8, sides: 5 }, params: ['radius', 'inner_radius', 'height', 'sides'] },
  { kind: 'HEART', label: 'Heart', hint: 'heart-shaped prism — flat extrusion of a heart silhouette',
    icon: heartIcon(), defaults: { radius: 12, height: 8, segments: 64 }, params: ['radius', 'height', 'segments'] },
];

export const SHAPE_BY_KIND = Object.fromEntries(SHAPES.map(s => [s.kind, s]));


// ----- SVG icon factories (kept inline so the project has no asset deps) -----

function svg(content) {
  return `<svg viewBox="0 0 40 40" xmlns="http://www.w3.org/2000/svg">${content}</svg>`;
}

function cubeIcon() {
  return svg(`
    <g stroke="currentColor" stroke-width="1.2" fill="none">
      <path d="M8 14 L20 8 L32 14 L32 28 L20 34 L8 28 Z" />
      <path d="M8 14 L20 20 L32 14" />
      <path d="M20 20 L20 34" />
    </g>`);
}

function cylinderIcon() {
  return svg(`
    <g stroke="currentColor" stroke-width="1.2" fill="none">
      <ellipse cx="20" cy="10" rx="10" ry="3" />
      <path d="M10 10 L10 30 M30 10 L30 30" />
      <path d="M10 30 A10 3 0 0 0 30 30" />
    </g>`);
}

function sphereIcon() {
  return svg(`
    <g stroke="currentColor" stroke-width="1.2" fill="none">
      <circle cx="20" cy="20" r="11" />
      <ellipse cx="20" cy="20" rx="11" ry="3.5" />
    </g>`);
}

function coneIcon() {
  return svg(`
    <g stroke="currentColor" stroke-width="1.2" fill="none">
      <path d="M20 8 L10 30 L30 30 Z" />
      <ellipse cx="20" cy="30" rx="10" ry="3" />
    </g>`);
}

function domeIcon() {
  return svg(`
    <g stroke="currentColor" stroke-width="1.2" fill="none">
      <path d="M9 28 A11 11 0 0 1 31 28" />
      <line x1="9" y1="28" x2="31" y2="28" />
    </g>`);
}

function pyramidIcon() {
  return svg(`
    <g stroke="currentColor" stroke-width="1.2" fill="none">
      <path d="M20 7 L8 28 L20 33 L32 28 Z" />
      <path d="M20 7 L20 33" />
    </g>`);
}

function wedgeIcon() {
  return svg(`
    <g stroke="currentColor" stroke-width="1.2" fill="none">
      <path d="M8 30 L30 8 L30 30 Z" />
    </g>`);
}

function roofIcon() {
  return svg(`
    <g stroke="currentColor" stroke-width="1.2" fill="none">
      <path d="M8 28 L20 12 L32 28 Z" />
    </g>`);
}

function tubeIcon() {
  return svg(`
    <g stroke="currentColor" stroke-width="1.2" fill="none">
      <ellipse cx="20" cy="12" rx="11" ry="3" />
      <ellipse cx="20" cy="12" rx="6" ry="1.5" />
      <path d="M9 12 L9 28 M31 12 L31 28 M14 12 L14 28 M26 12 L26 28" />
      <path d="M9 28 A11 3 0 0 0 31 28" />
    </g>`);
}

function torusIcon() {
  return svg(`
    <g stroke="currentColor" stroke-width="1.2" fill="none">
      <ellipse cx="20" cy="20" rx="12" ry="6" />
      <ellipse cx="20" cy="20" rx="6" ry="2.5" />
    </g>`);
}

function polygonIcon() {
  return svg(`
    <g stroke="currentColor" stroke-width="1.2" fill="none">
      <path d="M20 8 L31 14 L31 26 L20 32 L9 26 L9 14 Z" />
    </g>`);
}

function starIcon() {
  return svg(`
    <g stroke="currentColor" stroke-width="1.2" fill="none">
      <path d="M20 6 L23 15 L33 15 L25 21 L28 31 L20 25 L12 31 L15 21 L7 15 L17 15 Z" />
    </g>`);
}

function heartIcon() {
  return svg(`
    <g stroke="currentColor" stroke-width="1.2" fill="none">
      <path d="M20 32 C 8 22, 8 12, 15 12 C 18 12, 20 14, 20 16 C 20 14, 22 12, 25 12 C 32 12, 32 22, 20 32 Z" />
    </g>`);
}
