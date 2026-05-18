// Geometry builders for every TinkerDesk primitive. Each builder returns a
// THREE.BufferGeometry. Dimensions are in millimetres throughout (we treat the
// Three.js world unit as 1 mm so STL export sits in slicer-native scale).

import * as THREE from 'three';

const { PI, sin, cos } = Math;

function buildCube(p) {
  // Origin at center; user shifts with location.
  return new THREE.BoxGeometry(p.width, p.depth, p.height);
}

function buildCylinder(p) {
  const g = new THREE.CylinderGeometry(p.radius, p.radius, p.height, p.segments);
  g.rotateX(PI / 2); // align axis to +Z
  return g;
}

function buildCone(p) {
  // Truncated cone; radius_top=0 → pointed
  const g = new THREE.CylinderGeometry(p.radius_top, p.radius, p.height, p.segments);
  g.rotateX(PI / 2);
  return g;
}

function buildSphere(p) {
  return new THREE.SphereGeometry(p.radius, p.segments, Math.max(2, Math.floor(p.segments / 2)));
}

function buildHalfSphere(p) {
  // Dome: top half of UV sphere with flat circular base.
  const g = new THREE.SphereGeometry(
    p.radius,
    p.segments,
    Math.max(2, Math.floor(p.segments / 2)),
    0,
    PI * 2,
    0,
    PI / 2
  );
  // Cap the open bottom ring
  const cap = new THREE.CircleGeometry(p.radius, p.segments);
  cap.rotateX(PI); // face downwards (normal pointing -Z)
  const merged = mergeGeometries([g, cap]);
  // Lift so flat base sits at z=0 instead of z=-r? Actually keep origin at base, lift mesh.
  merged.translate(0, 0, 0); // origin already at base because we capped at z=0
  return merged;
}

function buildPyramid(p) {
  // Square-base pyramid (4 sides).
  return new THREE.ConeGeometry(Math.hypot(p.width / 2, p.depth / 2), p.height, 4)
    .rotateX(PI / 2)
    .rotateZ(PI / 4);
}

function buildWedge(p) {
  // Right-triangular prism — tall vertical wall at +X, slopes down to -X.
  const w = p.width / 2;
  const d = p.depth / 2;
  const h = p.height / 2;
  const verts = new Float32Array([
    // 6 unique verts
    -w, -d, -h,  // 0
     w, -d, -h,  // 1
     w,  d, -h,  // 2
    -w,  d, -h,  // 3
     w, -d,  h,  // 4
     w,  d,  h,  // 5
  ]);
  const indices = [
    3, 2, 1,  3, 1, 0,    // bottom
    1, 2, 5,  1, 5, 4,    // +X wall
    0, 4, 5,  0, 5, 3,    // sloped top
    0, 1, 4,              // -Y triangle
    2, 3, 5,              // +Y triangle (but verts ordered for outward normal)
  ];
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(verts, 3));
  g.setIndex(indices);
  g.computeVertexNormals();
  return g;
}

function buildRoof(p) {
  // Gable roof: triangle prism with ridge along Y.
  const w = p.width / 2, d = p.depth / 2, h = p.height / 2;
  const verts = new Float32Array([
    -w, -d, -h,  // 0
     w, -d, -h,  // 1
     w,  d, -h,  // 2
    -w,  d, -h,  // 3
     0, -d,  h,  // 4 ridge -Y
     0,  d,  h,  // 5 ridge +Y
  ]);
  const indices = [
    3, 2, 1,  3, 1, 0,     // bottom
    0, 1, 4,               // -Y gable
    2, 3, 5,               // +Y gable
    0, 4, 5,  0, 5, 3,     // -X slope
    1, 2, 5,  1, 5, 4,     // +X slope
  ];
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(verts, 3));
  g.setIndex(indices);
  g.computeVertexNormals();
  return g;
}

function buildTube(p) {
  // Annular cylinder = outer cylinder with concentric hole.
  const seg = p.segments;
  const rOut = p.radius;
  const rIn = Math.max(0.01, Math.min(p.inner_radius, rOut - 0.01));
  const hHalf = p.height / 2;
  const verts = [];
  const indices = [];
  for (let i = 0; i < seg; i++) {
    const a = (2 * PI * i) / seg;
    const c = cos(a), s = sin(a);
    verts.push(rOut * c, rOut * s, -hHalf); // 0
    verts.push(rOut * c, rOut * s,  hHalf); // 1
    verts.push(rIn  * c, rIn  * s, -hHalf); // 2
    verts.push(rIn  * c, rIn  * s,  hHalf); // 3
  }
  for (let i = 0; i < seg; i++) {
    const j = (i + 1) % seg;
    const a = i * 4, b = j * 4;
    // outer wall
    indices.push(a + 0, b + 0, b + 1,  a + 0, b + 1, a + 1);
    // inner wall (reversed)
    indices.push(a + 3, b + 3, b + 2,  a + 3, b + 2, a + 2);
    // bottom ring
    indices.push(a + 2, b + 2, b + 0,  a + 2, b + 0, a + 0);
    // top ring
    indices.push(a + 1, b + 1, b + 3,  a + 1, b + 3, a + 3);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(verts), 3));
  g.setIndex(indices);
  g.computeVertexNormals();
  return g;
}

function buildTorus(p) {
  const g = new THREE.TorusGeometry(p.radius, p.minor_radius, p.minor_segments, p.segments);
  return g; // ring lies in XY by default
}

function buildPolygon(p) {
  // N-sided prism around Z.
  const g = new THREE.CylinderGeometry(p.radius, p.radius, p.height, p.sides);
  g.rotateX(PI / 2);
  return g;
}

function buildStar(p) {
  // N-pointed star, extruded along Z.
  const points = Math.max(3, p.sides);
  const rOut = p.radius;
  const rIn = Math.max(0.01, p.inner_radius > 0 ? p.inner_radius : rOut * 0.4);
  const shape = new THREE.Shape();
  const n = points * 2;
  for (let i = 0; i < n; i++) {
    const a = PI / 2 + (2 * PI * i) / n;
    const r = i % 2 === 0 ? rOut : rIn;
    const x = r * cos(a);
    const y = r * sin(a);
    if (i === 0) shape.moveTo(x, y); else shape.lineTo(x, y);
  }
  shape.closePath();
  const g = new THREE.ExtrudeGeometry(shape, { depth: p.height, bevelEnabled: false });
  g.translate(0, 0, -p.height / 2);
  return g;
}

function buildHeart(p) {
  const seg = Math.max(8, p.segments);
  const r = p.radius;
  const pts = [];
  for (let i = 0; i < seg; i++) {
    const t = (2 * PI * i) / seg;
    const st = sin(t);
    const x = 16 * st * st * st;
    const y = 13 * cos(t) - 5 * cos(2 * t) - 2 * cos(3 * t) - cos(4 * t);
    pts.push([x, y]);
  }
  const xs = pts.map(p => p[0]);
  const ys = pts.map(p => p[1]);
  const span = Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys));
  const cx = (Math.max(...xs) + Math.min(...xs)) / 2;
  const cy = (Math.max(...ys) + Math.min(...ys)) / 2;
  const shape = new THREE.Shape();
  pts.forEach(([x, y], i) => {
    const nx = ((x - cx) / span) * 2 * r;
    const ny = ((y - cy) / span) * 2 * r;
    if (i === 0) shape.moveTo(nx, ny); else shape.lineTo(nx, ny);
  });
  shape.closePath();
  const g = new THREE.ExtrudeGeometry(shape, { depth: p.height, bevelEnabled: false });
  g.translate(0, 0, -p.height / 2);
  return g;
}

// Cheap geometry merger that concatenates BufferGeometries with the same attribute layout.
function mergeGeometries(geoms) {
  const out = new THREE.BufferGeometry();
  let totalVerts = 0;
  let totalIdx = 0;
  for (const g of geoms) {
    totalVerts += g.attributes.position.count;
    totalIdx += g.index ? g.index.count : g.attributes.position.count;
  }
  const positions = new Float32Array(totalVerts * 3);
  const normals = new Float32Array(totalVerts * 3);
  const indices = totalIdx > 65535 ? new Uint32Array(totalIdx) : new Uint16Array(totalIdx);
  let vOff = 0, iOff = 0;
  for (const g of geoms) {
    g.computeVertexNormals();
    positions.set(g.attributes.position.array, vOff * 3);
    if (g.attributes.normal) normals.set(g.attributes.normal.array, vOff * 3);
    const idx = g.index ? g.index.array : [...Array(g.attributes.position.count).keys()];
    for (let i = 0; i < idx.length; i++) indices[iOff + i] = idx[i] + vOff;
    vOff += g.attributes.position.count;
    iOff += idx.length;
  }
  out.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  out.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
  out.setIndex(new THREE.BufferAttribute(indices, 1));
  return out;
}

export const BUILDERS = {
  CUBE: buildCube,
  CYLINDER: buildCylinder,
  CONE: buildCone,
  SPHERE: buildSphere,
  HALF_SPHERE: buildHalfSphere,
  PYRAMID: buildPyramid,
  WEDGE: buildWedge,
  ROOF: buildRoof,
  TUBE: buildTube,
  TORUS: buildTorus,
  POLYGON: buildPolygon,
  STAR: buildStar,
  HEART: buildHeart,
};

export function buildGeometry(kind, params) {
  const builder = BUILDERS[kind];
  if (!builder) throw new Error(`Unknown kind: ${kind}`);
  return builder(params);
}
