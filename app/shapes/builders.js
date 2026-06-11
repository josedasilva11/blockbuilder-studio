// Geometry builders for every TinkerDesk primitive. Each builder returns a
// THREE.BufferGeometry. Dimensions are in millimetres throughout (we treat the
// Three.js world unit as 1 mm so STL export sits in slicer-native scale).

import * as THREE from 'three';
import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';

const { PI, sin, cos } = Math;

function buildCube(p) {
  // Origin at center; user shifts with location.
  const c = Math.max(0, +p.chamfer || 0);
  if (c > 0.001) return buildChamferedBox(p.width, p.depth, p.height, c);
  return new THREE.BoxGeometry(p.width, p.depth, p.height);
}

// Box with 45° chamfered edges. 24 unique vertices (3 per corner × 8 corners),
// 6 main rectangular faces (shrunk by c on each in-plane axis), 12 edge
// chamfer quads, 8 corner triangles. Total 44 triangles.
//
// Naming convention: for corner sign (sx, sy, sz) where each is ±1, the corner
// produces three vertices:
//   V_X  on the X-perpendicular face (left/right): receded inward on Y and Z
//   V_Y  on the Y-perpendicular face (front/back): receded inward on X and Z
//   V_Z  on the Z-perpendicular face (top/bottom): receded inward on X and Y
// Winding is CCW from outside (positive cross product in normal direction)
// so back-face culling and lighting work without a doubled material.
function buildChamferedBox(w, d, h, c) {
  const hw = w / 2, hd = d / 2, hh = h / 2;
  // Clamp chamfer to leave at least a few mm of original face — too aggressive
  // a chamfer collapses faces to zero area and breaks normals.
  c = Math.min(c, hw * 0.49, hd * 0.49, hh * 0.49);

  const positions = [];
  const indices = [];
  const V = {};  // V[sx][sy][sz] = { X, Y, Z } indices

  function addVert(x, y, z) {
    const i = positions.length / 3;
    positions.push(x, y, z);
    return i;
  }

  // Build the 24 vertices.
  for (const sx of [-1, 1]) {
    V[sx] = {};
    for (const sy of [-1, 1]) {
      V[sx][sy] = {};
      for (const sz of [-1, 1]) {
        V[sx][sy][sz] = {
          X: addVert(sx * hw,     sy * (hd - c), sz * (hh - c)),
          Y: addVert(sx * (hw - c), sy * hd,     sz * (hh - c)),
          Z: addVert(sx * (hw - c), sy * (hd - c), sz * hh),
        };
      }
    }
  }

  function quad(a, b, cI, d) {
    indices.push(a, b, cI, a, cI, d);
  }
  function tri(a, b, cI) {
    indices.push(a, b, cI);
  }

  // --- 6 main faces (shrunken rectangles) ---
  // +X (right): vertices V[+1][sy][sz].X for sy,sz ∈ {-1,+1}
  // Looking against the +X normal (from outside): +Y is left, +Z is up.
  // CCW (positive cross): (-Y,-Z) → (+Y,-Z) → (+Y,+Z) → (-Y,+Z)
  quad(V[1][-1][-1].X, V[1][ 1][-1].X, V[1][ 1][ 1].X, V[1][-1][ 1].X);
  // -X (left): reverse winding
  quad(V[-1][ 1][-1].X, V[-1][-1][-1].X, V[-1][-1][ 1].X, V[-1][ 1][ 1].X);
  // +Y (front): looking against +Y, +X is to right, +Z is up
  // CCW: (-X,-Z) → (+X,-Z) → (+X,+Z) → (-X,+Z)? Verify with cross product:
  // For +Y face, v1-v0 should be in +X direction and v3-v0 should be in +Z, then cross gives +Y. Confirmed.
  quad(V[-1][ 1][-1].Y, V[ 1][ 1][-1].Y, V[ 1][ 1][ 1].Y, V[-1][ 1][ 1].Y);
  // -Y (back): reverse
  quad(V[ 1][-1][-1].Y, V[-1][-1][-1].Y, V[-1][-1][ 1].Y, V[ 1][-1][ 1].Y);
  // +Z (top)
  quad(V[-1][-1][ 1].Z, V[ 1][-1][ 1].Z, V[ 1][ 1][ 1].Z, V[-1][ 1][ 1].Z);
  // -Z (bottom): reverse
  quad(V[ 1][-1][-1].Z, V[-1][-1][-1].Z, V[-1][ 1][-1].Z, V[ 1][ 1][-1].Z);

  // --- 12 edge chamfer quads ---
  // X-axis edges: between Y face (sy) and Z face (sz). 4 such edges (sy, sz ∈ {-1,+1}).
  // Outward normal direction: (0, sy, sz) normalised.
  // The chamfer plane has 4 corners: V_Y and V_Z at sx=-1 and sx=+1.
  // To get CCW from outside, the cross product (v1-v0)×(v2-v0) must align with
  // the outward normal. Going (V_Z[-1] → V_Z[+1] → V_Y[+1] → V_Y[-1]) gives a
  // normal proportional to (0, sz, sy). So this works when sy = sz (i.e.,
  // sy*sz > 0). When sy*sz < 0, reverse the order.
  for (const sy of [-1, 1]) {
    for (const sz of [-1, 1]) {
      const a = V[-1][sy][sz].Z, b = V[ 1][sy][sz].Z;
      const cI = V[ 1][sy][sz].Y, d = V[-1][sy][sz].Y;
      if (sy * sz > 0) quad(a, b, cI, d);
      else             quad(d, cI, b, a);
    }
  }
  // Y-axis edges: between X face (sx) and Z face (sz). Outward normal (sx, 0, sz).
  // Going V_Z[-1] → V_Z[+1] → V_X[+1] → V_X[-1] along Y: cross product proportional to (sz, 0, sx).
  // Aligns with (sx, 0, sz) iff sx = sz.
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      const a = V[sx][-1][sz].Z, b = V[sx][ 1][sz].Z;
      const cI = V[sx][ 1][sz].X, d = V[sx][-1][sz].X;
      if (sx * sz > 0) quad(d, cI, b, a);
      else             quad(a, b, cI, d);
    }
  }
  // Z-axis edges: between X face (sx) and Y face (sy). Outward normal (sx, sy, 0).
  // Going V_Y[-1] → V_Y[+1] → V_X[+1] → V_X[-1] along Z: cross product proportional to (sy, sx, 0).
  // Aligns with (sx, sy, 0) iff sx = sy.
  for (const sx of [-1, 1]) {
    for (const sy of [-1, 1]) {
      const a = V[sx][sy][-1].Y, b = V[sx][sy][ 1].Y;
      const cI = V[sx][sy][ 1].X, d = V[sx][sy][-1].X;
      if (sx * sy > 0) quad(a, b, cI, d);
      else             quad(d, cI, b, a);
    }
  }

  // --- 8 corner triangles ---
  // Each corner (sx, sy, sz) has three vertices V_X, V_Y, V_Z forming a triangle.
  // Outward normal: (sx, sy, sz) / sqrt(3). To get CCW from outside, the order
  // depends on the signs. We need to ensure (V_Y - V_X) × (V_Z - V_X) aligns
  // with the outward direction. Let's compute symbolically:
  //   V_X = (sx·hw, sy·(hd-c), sz·(hh-c))
  //   V_Y = (sx·(hw-c), sy·hd, sz·(hh-c))
  //   V_Z = (sx·(hw-c), sy·(hd-c), sz·hh)
  //   V_Y - V_X = (-sx·c, sy·c, 0)
  //   V_Z - V_X = (-sx·c, 0, sz·c)
  //   Cross = (sy·c · sz·c - 0 · 0,  0·(-sx·c) - (-sx·c)·sz·c,  (-sx·c)·0 - sy·c·(-sx·c))
  //         = (sy·sz·c²,  sx·sz·c²,  sx·sy·c²)
  // Compared to outward direction (sx, sy, sz):
  //   Components match when sy·sz = sx, sx·sz = sy, sx·sy = sz.
  //   This is equivalent to sx·sy·sz = 1 (all three signs multiplied = +1).
  // So when sx·sy·sz = +1, (X, Y, Z) gives correct outward winding.
  // When sx·sy·sz = -1, reverse: (X, Z, Y).
  for (const sx of [-1, 1]) {
    for (const sy of [-1, 1]) {
      for (const sz of [-1, 1]) {
        const v = V[sx][sy][sz];
        if (sx * sy * sz > 0) tri(v.X, v.Y, v.Z);
        else                  tri(v.X, v.Z, v.Y);
      }
    }
  }

  const geom = new THREE.BufferGeometry();
  geom.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geom.setIndex(indices);
  geom.computeVertexNormals();
  return geom;
}

function buildCylinder(p) {
  const c = Math.max(0, +p.chamfer || 0);
  if (c > 0.001) return buildChamferedLathe(p.radius, p.radius, p.height, c, p.segments);
  const g = new THREE.CylinderGeometry(p.radius, p.radius, p.height, p.segments);
  g.rotateX(PI / 2); // align axis to +Z
  return g;
}

function buildCone(p) {
  // Truncated cone; radius_top=0 → pointed
  const c = Math.max(0, +p.chamfer || 0);
  if (c > 0.001 && p.radius_top > 0.001) {
    // Only chamfer truncated cones. Chamfering a pointed cone is moot
    // — the tip has no edge to bevel.
    return buildChamferedLathe(p.radius_top, p.radius, p.height, c, p.segments);
  }
  const g = new THREE.CylinderGeometry(p.radius_top, p.radius, p.height, p.segments);
  g.rotateX(PI / 2);
  return g;
}

// Cylinder / truncated-cone with a 45° chamfer on both rim edges. Built as
// a LatheGeometry from a chamfered profile sweeping around the Y axis, then
// rotated so the axis lines up with +Z (BlockBuilder's vertical).
//
// Profile (X = radial, Y = axial):
//   (0, -h/2) → (R_bot - c, -h/2) → (R_bot, -h/2 + c)
//   → (R_top, h/2 - c) → (R_top - c, h/2) → (0, h/2)
// LatheGeometry connects the points around the Y axis and seals both ends
// when X starts/ends at 0.
function buildChamferedLathe(rTop, rBot, h, c, segments) {
  const hh = h / 2;
  // Clamp chamfer so it never eats more than half the rim. For the cone case
  // the smaller radius (top) bounds it.
  const rMin = Math.min(rTop, rBot);
  c = Math.min(c, rMin * 0.49, hh * 0.49);
  const points = [
    new THREE.Vector2(0,           -hh),
    new THREE.Vector2(rBot - c,    -hh),
    new THREE.Vector2(rBot,        -hh + c),
    new THREE.Vector2(rTop,         hh - c),
    new THREE.Vector2(rTop - c,     hh),
    new THREE.Vector2(0,            hh),
  ];
  const g = new THREE.LatheGeometry(points, segments || 48);
  g.rotateX(PI / 2);
  // Lathe seams produce duplicate vertices along one meridian; merge them so
  // CSG operations don't complain about non-manifold geometry.
  return mergeVerticesSafe(g);
}

function mergeVerticesSafe(g) {
  try { return mergeVertices(g, 1e-5); } catch { return g; }
}

// Tube with chamfered outer + inner rim edges (both top and bottom). Same
// LatheGeometry strategy as buildChamferedLathe, but the swept polyline is
// closed (annular cross-section): it traces all 4 corners of the ring.
function buildChamferedTube(rOut, rIn, h, c, segments) {
  const hh = h / 2;
  rIn = Math.max(0.01, Math.min(rIn, rOut - 0.01));
  // Each chamfer eats c from the radial AND axial extent of the corner it
  // bevels. Clamp so no chamfer larger than 49 % of the smallest free dim.
  const wallThickness = rOut - rIn;
  c = Math.min(c, hh * 0.49, wallThickness * 0.49);
  // Polyline closes on itself: ends meet the start so the swept surface is
  // a watertight annulus. Order goes: outer-top corner → outer wall →
  // outer-bottom corner → bottom face → inner-bottom corner → inner wall →
  // inner-top corner → top face → back to start.
  const points = [
    new THREE.Vector2(rOut - c,  hh),
    new THREE.Vector2(rOut,      hh - c),
    new THREE.Vector2(rOut,     -hh + c),
    new THREE.Vector2(rOut - c, -hh),
    new THREE.Vector2(rIn  + c, -hh),
    new THREE.Vector2(rIn,      -hh + c),
    new THREE.Vector2(rIn,       hh - c),
    new THREE.Vector2(rIn  + c,  hh),
    new THREE.Vector2(rOut - c,  hh),
  ];
  const g = new THREE.LatheGeometry(points, segments || 48);
  g.rotateX(PI / 2);
  return mergeVerticesSafe(g);
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
  // N-sided pyramid (3 = tetrahedron, 4 = square pyramid, 5+ = pentagonal etc).
  // We use a ConeGeometry with low segment count and zero top radius — that's
  // mathematically equivalent to a regular N-gon pyramid. The radial scale
  // matches the cube's diagonal so a default 20×20 base still looks right.
  const sides = Math.max(3, Math.floor(p.sides ?? 4));
  // Radius of the circumscribed circle so a regular polygon with `sides`
  // edges has the same XY footprint as the requested width/depth.
  const r = Math.hypot(p.width / 2, p.depth / 2);
  const g = new THREE.ConeGeometry(r, p.height, sides);
  g.rotateX(PI / 2);
  // For square base, rotate 45° so the flat face points along +X (consistent
  // with the previous square-pyramid orientation).
  if (sides === 4) g.rotateZ(PI / 4);
  return g;
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
  const chamfer = Math.max(0, +p.chamfer || 0);
  if (chamfer > 0.001) return buildChamferedTube(p.radius, p.inner_radius, p.height, chamfer, p.segments);
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
