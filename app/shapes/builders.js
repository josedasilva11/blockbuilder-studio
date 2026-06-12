// Geometry builders for every TinkerDesk primitive. Each builder returns a
// THREE.BufferGeometry. Dimensions are in millimetres throughout (we treat the
// Three.js world unit as 1 mm so STL export sits in slicer-native scale).

import * as THREE from 'three';
import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';

const { PI, sin, cos } = Math;

function buildCube(p) {
  // Origin at center; user shifts with location.
  const r = Math.max(0, +p.fillet || 0);
  if (r > 0.001) return buildFilletedBox(p.width, p.depth, p.height, r, p.fillet_segments || 8);
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
  const r = Math.max(0, +p.fillet || 0);
  if (r > 0.001) return buildFilletedLathe(p.radius, p.radius, p.height, r, p.fillet_segments || 8, p.segments);
  const c = Math.max(0, +p.chamfer || 0);
  if (c > 0.001) return buildChamferedLathe(p.radius, p.radius, p.height, c, p.segments);
  const g = new THREE.CylinderGeometry(p.radius, p.radius, p.height, p.segments);
  g.rotateX(PI / 2); // align axis to +Z
  return g;
}

function buildCone(p) {
  // Truncated cone; radius_top=0 → pointed
  const r = Math.max(0, +p.fillet || 0);
  if (r > 0.001 && p.radius_top > 0.001) {
    return buildFilletedLathe(p.radius_top, p.radius, p.height, r, p.fillet_segments || 8, p.segments);
  }
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

// Box with filleted (rounded) edges. Same overall topology as the chamfered
// box but each of the 12 cube edges is replaced by a quarter-cylinder arc
// with N segments, and each of the 8 corners by an octant of a sphere of
// the same radius. The 6 main faces shrink to inset rectangles whose corners
// sit at the equator points of the corner spheres.
//
// Parameterisation per corner octant (sx, sy, sz):
//   P(α, β) = (sx·(hw-r) + r·sx·cos(β)·cos(α),
//              sy·(hd-r) + r·sy·cos(β)·sin(α),
//              sz·(hh-r) + r·sz·sin(β))
//   α ∈ [0, π/2]  (rotation around Z, from X-meridian toward Y-meridian)
//   β ∈ [0, π/2]  (latitude from XY equator up to +Z pole)
//
// Boundaries (where the octant meets the adjacent edge cylinders):
//   α = 0     ↔ Y-axis edge cylinder (axis runs along Y, X+Z quadrant)
//   α = π/2   ↔ X-axis edge cylinder (axis runs along X, Y+Z quadrant)
//   β = 0     ↔ Z-axis edge cylinder (axis runs along Z, X+Y quadrant)
//   β = π/2   ↔ Z-face corner (a single point per corner — the pole)
//   α=0,β=0   ↔ X-face corner of the inset rectangle
//   α=π/2,β=0 ↔ Y-face corner of the inset rectangle
//
// The pole vertex is shared by all (i, j=N) of one corner — mergeVertices at
// the end welds them into a single index. Edge cylinders re-use the corner
// octants' boundary vertices, so the seam is naturally watertight.
//
// Triangle winding is chosen analytically per region so the outward normal
// computed by computeVertexNormals matches the surface (no double-sided
// material needed; CSG operations work).
function buildFilletedBox(w, d, h, r, N) {
  const hw = w / 2, hd = d / 2, hh = h / 2;
  N = Math.max(2, Math.min(32, Math.floor(N || 8)));
  r = Math.min(r, hw * 0.49, hd * 0.49, hh * 0.49);

  const positions = [];
  const indices = [];
  function addV(x, y, z) {
    const i = positions.length / 3;
    positions.push(x, y, z);
    return i;
  }
  function pushQuad(a, b, c, d, reverse) {
    if (reverse) indices.push(a, d, c, a, c, b);
    else         indices.push(a, b, c, a, c, d);
  }

  // Build the 8 corner octant vertex grids.
  // Corner[sx][sy][sz][i][j], i,j ∈ 0..N
  const Corner = {};
  for (const sx of [-1, 1]) {
    Corner[sx] = {};
    for (const sy of [-1, 1]) {
      Corner[sx][sy] = {};
      for (const sz of [-1, 1]) {
        const cx = sx * (hw - r);
        const cy = sy * (hd - r);
        const cz = sz * (hh - r);
        const grid = [];
        for (let i = 0; i <= N; i++) {
          const a = (i / N) * (Math.PI / 2);
          const ca = Math.cos(a), sa = Math.sin(a);
          const row = [];
          for (let j = 0; j <= N; j++) {
            const b = (j / N) * (Math.PI / 2);
            const cb = Math.cos(b), sb = Math.sin(b);
            row.push(addV(cx + r * sx * cb * ca, cy + r * sy * cb * sa, cz + r * sz * sb));
          }
          grid.push(row);
        }
        Corner[sx][sy][sz] = grid;
      }
    }
  }

  // 8 corner octants. Winding outward when sx·sy·sz = +1 (derivation: cross
  // ∂α × ∂β = r²·(sy·sz·cos²β·cos α, sx·sz·cos²β·sin α, sx·sy·cos β·sin β);
  // for this to align with the outward radial direction (sx, sy, sz) we need
  // sy·sz = sx, sx·sz = sy, sx·sy = sz, all equivalent to sx·sy·sz = 1).
  for (const sx of [-1, 1]) {
    for (const sy of [-1, 1]) {
      for (const sz of [-1, 1]) {
        const C = Corner[sx][sy][sz];
        const reverse = (sx * sy * sz) < 0;
        for (let i = 0; i < N; i++) {
          for (let j = 0; j < N; j++) {
            pushQuad(C[i][j], C[i+1][j], C[i+1][j+1], C[i][j+1], reverse);
          }
        }
      }
    }
  }

  // 12 edge cylinders. Each edge runs along one axis; we re-use the boundary
  // vertices already created on the adjacent corner octants — no new positions.
  //
  // X-axis edges: indexed by (sy, sz). The cylinder uses the α=π/2 boundary
  // (i=N) of corners (−1,sy,sz) and (+1,sy,sz).
  // Cross ∂x × ∂β (going axial +X, angular +β) = (0, −sz·r·cos β, −sy·r·sin β).
  // Aligns with outward (0, sy, sz) iff sy·sz = −1. So reverse when sy·sz > 0.
  for (const sy of [-1, 1]) {
    for (const sz of [-1, 1]) {
      const reverse = (sy * sz) > 0;
      for (let j = 0; j < N; j++) {
        const a = Corner[-1][sy][sz][N][j];
        const b = Corner[+1][sy][sz][N][j];
        const c = Corner[+1][sy][sz][N][j+1];
        const d = Corner[-1][sy][sz][N][j+1];
        pushQuad(a, b, c, d, reverse);
      }
    }
  }
  // Y-axis edges: (sx, sz), α=0 boundary (i=0). Going sy=−1 → +1 axially.
  // Cross ∂y × ∂β = (sz·r·cos β, 0, sx·r·sin β). Aligns with outward (sx,0,sz)
  // iff sx·sz = +1. Reverse when sx·sz < 0.
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      const reverse = (sx * sz) < 0;
      for (let j = 0; j < N; j++) {
        const a = Corner[sx][-1][sz][0][j];
        const b = Corner[sx][+1][sz][0][j];
        const c = Corner[sx][+1][sz][0][j+1];
        const d = Corner[sx][-1][sz][0][j+1];
        pushQuad(a, b, c, d, reverse);
      }
    }
  }
  // Z-axis edges: (sx, sy), β=0 boundary (j=0). Going sz=−1 → +1 axially.
  // Cross ∂z × ∂α = (−sy·r·cos α, −sx·r·sin α, 0). Aligns with outward (sx,sy,0)
  // iff sx·sy = −1. Reverse when sx·sy > 0.
  for (const sx of [-1, 1]) {
    for (const sy of [-1, 1]) {
      const reverse = (sx * sy) > 0;
      for (let i = 0; i < N; i++) {
        const a = Corner[sx][sy][-1][i][0];
        const b = Corner[sx][sy][+1][i][0];
        const c = Corner[sx][sy][+1][i+1][0];
        const d = Corner[sx][sy][-1][i+1][0];
        pushQuad(a, b, c, d, reverse);
      }
    }
  }

  // 6 main faces. Each is a rectangle whose 4 corners sit at the equator-or-
  // pole points of the 4 corner octants on the same face.
  // +X face: vertices at (α=0, β=0) of (+1, sy, sz). Going CCW from +X view
  // means (sy,sz) = (−1,−1) → (+1,−1) → (+1,+1) → (−1,+1).
  // The default pushQuad winding gives (v0→v1→v2→v3); we cross-check that
  // (v1−v0) × (v2−v0) aligns with the outward normal.
  function faceQuad(v0, v1, v2, v3, outward) {
    const p0 = [positions[3*v0], positions[3*v0+1], positions[3*v0+2]];
    const p1 = [positions[3*v1], positions[3*v1+1], positions[3*v1+2]];
    const p2 = [positions[3*v2], positions[3*v2+1], positions[3*v2+2]];
    const e1 = [p1[0]-p0[0], p1[1]-p0[1], p1[2]-p0[2]];
    const e2 = [p2[0]-p0[0], p2[1]-p0[1], p2[2]-p0[2]];
    const n = [e1[1]*e2[2]-e1[2]*e2[1], e1[2]*e2[0]-e1[0]*e2[2], e1[0]*e2[1]-e1[1]*e2[0]];
    const dot = n[0]*outward[0] + n[1]*outward[1] + n[2]*outward[2];
    pushQuad(v0, v1, v2, v3, dot < 0);
  }
  // +X face
  faceQuad(
    Corner[+1][-1][-1][0][0], Corner[+1][+1][-1][0][0],
    Corner[+1][+1][+1][0][0], Corner[+1][-1][+1][0][0],
    [+1, 0, 0]);
  // -X face
  faceQuad(
    Corner[-1][-1][-1][0][0], Corner[-1][+1][-1][0][0],
    Corner[-1][+1][+1][0][0], Corner[-1][-1][+1][0][0],
    [-1, 0, 0]);
  // +Y face: vertices at (α=π/2, β=0) of (sx, +1, sz)
  faceQuad(
    Corner[-1][+1][-1][N][0], Corner[+1][+1][-1][N][0],
    Corner[+1][+1][+1][N][0], Corner[-1][+1][+1][N][0],
    [0, +1, 0]);
  // -Y face
  faceQuad(
    Corner[-1][-1][-1][N][0], Corner[+1][-1][-1][N][0],
    Corner[+1][-1][+1][N][0], Corner[-1][-1][+1][N][0],
    [0, -1, 0]);
  // +Z face: vertices at pole (β=π/2) of (sx, sy, +1). Any α works.
  faceQuad(
    Corner[-1][-1][+1][0][N], Corner[+1][-1][+1][0][N],
    Corner[+1][+1][+1][0][N], Corner[-1][+1][+1][0][N],
    [0, 0, +1]);
  // -Z face
  faceQuad(
    Corner[-1][-1][-1][0][N], Corner[+1][-1][-1][0][N],
    Corner[+1][+1][-1][0][N], Corner[-1][+1][-1][0][N],
    [0, 0, -1]);

  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  g.setIndex(indices);
  // Merge the (N+1) duplicate pole vertices at each corner into one each.
  // mergeVertices also resolves any tiny float-rounding seams between corner
  // octants and adjacent edge cylinders (positions are derived from sin/cos
  // so should match exactly, but be defensive).
  const merged = mergeVerticesSafe(g);
  merged.computeVertexNormals();
  return merged;
}

// Cylinder / truncated-cone with 90° filleted rim edges (rounded transitions
// between the wall and the top/bottom face). Same LatheGeometry strategy as
// buildChamferedLathe — sweep a profile around the Y axis, then rotate so
// the axis aligns with +Z — but the profile uses circular arcs at the rim
// corners instead of single chamfer segments.
//
// Profile sketch (Cylinder, rTop = rBot = R):
//   (0, -h/2) → (R-r, -h/2) → bottom arc (centered at (R-r, -h/2+r), N segs)
//   → (R, -h/2+r) → (R, h/2-r) [straight wall] → top arc (centered at
//   (R-r, h/2-r), N segs) → (R-r, h/2) → (0, h/2)
//
// For truncated cones (rTop ≠ rBot) the wall between the two arcs is slanted;
// the arcs themselves stay 90° in the radial-axial plane.
function buildFilletedLathe(rTop, rBot, h, r, filletSegments, radialSegments) {
  const hh = h / 2;
  const rMin = Math.min(rTop, rBot);
  r = Math.min(r, rMin * 0.49, hh * 0.49);
  const N = Math.max(2, Math.min(32, Math.floor(filletSegments || 8)));

  const pts = [];
  pts.push(new THREE.Vector2(0, -hh));
  // Bottom rim arc: angle θ from -π/2 to 0
  // Center (rBot - r, -hh + r), radius r
  for (let i = 0; i <= N; i++) {
    const t = (i / N) * (PI / 2) - PI / 2;  // [-π/2 .. 0]
    pts.push(new THREE.Vector2(
      (rBot - r) + r * Math.cos(t),
      (-hh + r) + r * Math.sin(t),
    ));
  }
  // Slanted wall (straight): from end of bottom arc to start of top arc
  // The wall already starts at (rBot, -hh+r); the top arc starts at (rTop, hh-r).
  // No extra point needed; the next arc's first point is appended directly.
  // Top rim arc: angle θ from 0 to π/2, center (rTop - r, hh - r)
  for (let i = 0; i <= N; i++) {
    const t = (i / N) * (PI / 2);  // [0 .. π/2]
    pts.push(new THREE.Vector2(
      (rTop - r) + r * Math.cos(t),
      (hh - r) + r * Math.sin(t),
    ));
  }
  pts.push(new THREE.Vector2(0, hh));

  const g = new THREE.LatheGeometry(pts, radialSegments || 48);
  g.rotateX(PI / 2);
  return mergeVerticesSafe(g);
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

// Tube with filleted rim edges (rounded corners instead of 45° bevels). The
// 8 chamfer segments of the chamfered tube get replaced with 4 quarter-arc
// curves, one per rim corner. The annular profile stays closed so the
// swept surface is a watertight ring.
//
// Cross-section sweep order (radial, axial):
//   outer-top corner arc (start at outer wall, end at top face)
//   → top face (R_out_top → R_in_top)
//   → inner-top corner arc (top face → inner wall)
//   → inner wall (down)
//   → inner-bottom corner arc (inner wall → bottom face)
//   → bottom face (R_in_bot → R_out_bot)
//   → outer-bottom corner arc (bottom face → outer wall)
//   → outer wall (up) → back to start
function buildFilletedTube(rOut, rIn, h, r, filletSegments, segments) {
  const hh = h / 2;
  rIn = Math.max(0.01, Math.min(rIn, rOut - 0.01));
  const wallThickness = rOut - rIn;
  r = Math.min(r, hh * 0.49, wallThickness * 0.49);
  const N = Math.max(2, Math.min(32, Math.floor(filletSegments || 8)));

  const points = [];
  // Helper to push an arc from angle θ₀ to θ₁ around center (cx, cy), radius r,
  // with N segments. Skips first point if it duplicates the previous push.
  function arc(cx, cy, t0, t1) {
    for (let i = 0; i <= N; i++) {
      const t = t0 + (i / N) * (t1 - t0);
      points.push(new THREE.Vector2(cx + r * Math.cos(t), cy + r * Math.sin(t)));
    }
  }

  // Outer-top arc: angle 0 (pointing +radial) to π/2 (pointing +axial)
  // Centered at (rOut - r, hh - r). Starts at (rOut, hh-r), ends at (rOut-r, hh).
  arc(rOut - r, hh - r, 0, PI / 2);
  // Top face is straight from (rOut-r, hh) to (rIn+r, hh) — last point of
  // previous arc IS (rOut-r, hh); next arc start is (rIn+r, hh), so push only
  // the latter as the next arc's first point automatically.
  // Inner-top arc: angle π/2 to π. Centered at (rIn + r, hh - r).
  // Starts at (rIn+r, hh), ends at (rIn, hh-r).
  arc(rIn + r, hh - r, PI / 2, PI);
  // Inner wall: straight from (rIn, hh-r) down to (rIn, -hh+r). No extra point.
  // Inner-bottom arc: angle π to 3π/2. Centered at (rIn + r, -hh + r).
  // Starts at (rIn, -hh+r), ends at (rIn+r, -hh).
  arc(rIn + r, -hh + r, PI, 3 * PI / 2);
  // Bottom face: straight from (rIn+r, -hh) to (rOut-r, -hh). No extra point.
  // Outer-bottom arc: angle 3π/2 to 2π. Centered at (rOut - r, -hh + r).
  // Starts at (rOut-r, -hh), ends at (rOut, -hh+r).
  arc(rOut - r, -hh + r, 3 * PI / 2, 2 * PI);
  // Outer wall: straight from (rOut, -hh+r) up to (rOut, hh-r). No extra point.
  // Close the loop by repeating the very first point — LatheGeometry won't
  // auto-close, so we explicitly bridge back to start.
  points.push(new THREE.Vector2(rOut, hh - r));
  points.push(new THREE.Vector2(rOut - r + r * Math.cos(0), hh - r + r * Math.sin(0)));

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
  const sides = Math.max(3, Math.floor(p.sides ?? 4));
  const r = Math.hypot(p.width / 2, p.depth / 2);
  const fillet = Math.max(0, +p.fillet || 0);
  const chamfer = Math.max(0, +p.chamfer || 0);
  if (fillet > 0.001 || chamfer > 0.001) {
    const result = buildPyramidWithBaseBevel(r, p.height, sides, fillet, chamfer, p.fillet_segments || 8);
    if (sides === 4) result.rotateZ(PI / 4);
    return result;
  }
  // We use a ConeGeometry with low segment count and zero top radius — that's
  // mathematically equivalent to a regular N-gon pyramid. The radial scale
  // matches the cube's diagonal so a default 20×20 base still looks right.
  const g = new THREE.ConeGeometry(r, p.height, sides);
  g.rotateX(PI / 2);
  // For square base, rotate 45° so the flat face points along +X (consistent
  // with the previous square-pyramid orientation).
  if (sides === 4) g.rotateZ(PI / 4);
  return g;
}

// N-sided pyramid with the base perimeter bevelled. Lateral edges (going up
// from each base corner to the apex) stay sharp because they meet at the
// apex point — chamfering them would round the apex into a small cap which
// changes the shape's identity. Only the N base edges (where the base face
// meets the N lateral faces) are bevelled.
//
// Chamfer: single 45° plane per edge → 2N quad triangles forming the bevel.
// Fillet: K-segment arc per edge → 2N*K quad triangles forming a rounded
// transition from base to lateral face.
//
// Geometry layers (bottom to top):
//   - Apex: 1 vertex at (0, 0, +h/2)
//   - K+1 rings of vertices following the arc/chamfer profile (K=1 for
//     chamfer, fillet_segments for fillet). Each ring has N vertices at
//     positions interpolated between the base ring and the lateral start.
//   - Base inner ring: N vertices at (r_inset, z=-h/2) — the shrunken base
//   - Centre of base face: 1 vertex at (0, 0, -h/2)
function buildPyramidWithBaseBevel(radius, height, sides, fillet, chamfer, filletSegments) {
  const hh = height / 2;
  const useArc = fillet > 0.001;
  const K = useArc ? Math.max(2, Math.min(32, Math.floor(filletSegments || 8))) : 1;
  // Bevel size (clamped). The "thickness" eats into the bottom of the
  // pyramid; the "size" eats into the base's radius.
  let bevel = useArc ? fillet : chamfer;
  bevel = Math.min(bevel, radius * 0.45, hh * 0.45);
  const innerRadius = radius - bevel;
  const baseZ = -hh;
  const arcTopZ = -hh + bevel;

  const positions = [];
  const indices = [];
  function addV(x, y, z) {
    const i = positions.length / 3;
    positions.push(x, y, z);
    return i;
  }

  // Apex
  const apex = addV(0, 0, hh);

  // K+1 perimeter rings, from the bottom (j=0, base inset) to top of the
  // bevel (j=K, where the lateral face starts).
  // For chamfer (K=1): just 2 rings forming a single flat plane per edge.
  // For fillet (K>1): K+1 rings forming an arc.
  //
  // Arc geometry: in the radial-axial plane, the curve goes from
  // (innerRadius, baseZ) at j=0 to (radius, arcTopZ) at j=K.
  // For chamfer: straight line between those two points.
  // For fillet: circular arc, centre at (innerRadius, arcTopZ), radius bevel.
  // At parameter t ∈ [0, 1]: angle θ = -π/2 + t * π/2 (going from -π/2 to 0).
  //   point = (innerRadius + bevel*cos(θ), arcTopZ + bevel*sin(θ))
  //   at t=0, θ=-π/2: (innerRadius, arcTopZ - bevel) = (innerRadius, baseZ) ✓
  //   at t=1, θ=0:    (innerRadius + bevel, arcTopZ) = (radius, arcTopZ) ✓
  const rings = [];
  for (let j = 0; j <= K; j++) {
    const ring = [];
    let rRing, zRing;
    if (useArc) {
      const t = j / K;
      const ang = -PI / 2 + t * (PI / 2);
      rRing = innerRadius + bevel * Math.cos(ang);
      zRing = arcTopZ + bevel * Math.sin(ang);
    } else {
      // Chamfer: linear interpolation
      const t = j / K;
      rRing = innerRadius + (radius - innerRadius) * t;
      zRing = baseZ + (arcTopZ - baseZ) * t;
    }
    for (let i = 0; i < sides; i++) {
      const a = (2 * PI * i) / sides;
      ring.push(addV(rRing * Math.cos(a), rRing * Math.sin(a), zRing));
    }
    rings.push(ring);
  }

  // Base centre + base fan
  const baseCentre = addV(0, 0, baseZ);
  for (let i = 0; i < sides; i++) {
    const a = rings[0][i];
    const b = rings[0][(i + 1) % sides];
    // Base face faces -Z, so winding for outward normal (-Z) is reversed
    // from the natural CCW-from-above traversal.
    indices.push(baseCentre, b, a);
  }

  // Bevel quads between consecutive rings
  for (let j = 0; j < K; j++) {
    const lo = rings[j];
    const hi = rings[j + 1];
    for (let i = 0; i < sides; i++) {
      const i2 = (i + 1) % sides;
      // CCW from outside (the bevel surface faces outward + downward).
      indices.push(lo[i], lo[i2], hi[i2]);
      indices.push(lo[i], hi[i2], hi[i]);
    }
  }

  // Lateral faces: triangle from each top-ring edge up to the apex.
  const top = rings[K];
  for (let i = 0; i < sides; i++) {
    const a = top[i];
    const b = top[(i + 1) % sides];
    indices.push(a, b, apex);
  }

  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  g.setIndex(indices);
  g.computeVertexNormals();
  // Apply the same axis convention as the sharp pyramid (Z = up, base in XY).
  // ConeGeometry rotateX(PI/2) is no longer needed because we built directly
  // with the right axes. No extra rotation here; sides===4 rotation handled
  // by the caller.
  return g;
}

function buildWedge(p) {
  // Right-triangular prism — tall vertical wall at +X, slopes down to -X.
  const fillet = Math.max(0, +p.fillet || 0);
  const chamfer = Math.max(0, +p.chamfer || 0);
  if (fillet > 0.001 || chamfer > 0.001) {
    // Right triangle in XZ plane: (-w,-h), (w,-h), (w,h). ExtrudeGeometry
    // bevels the perimeter edges of front/back faces; the 3 long edges along
    // the prism axis are NOT bevelled by this approach. For full edge cover
    // a custom geometry is needed (deferred). This is the partial version.
    return buildExtrudedPrism(
      [[-p.width/2, -p.height/2], [p.width/2, -p.height/2], [p.width/2, p.height/2]],
      p.depth, fillet, chamfer, p.fillet_segments || 8
    );
  }
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
  const fillet = Math.max(0, +p.fillet || 0);
  const chamfer = Math.max(0, +p.chamfer || 0);
  if (fillet > 0.001 || chamfer > 0.001) {
    // Isoceles triangle in XZ plane: apex at (0, h), base at (-w,-h)..(w,-h).
    // Same caveat as Wedge: only perimeter (front/back face) edges bevel via
    // ExtrudeGeometry. Long ridge + base edges along the prism axis are sharp.
    return buildExtrudedPrism(
      [[-p.width/2, -p.height/2], [p.width/2, -p.height/2], [0, p.height/2]],
      p.depth, fillet, chamfer, p.fillet_segments || 8
    );
  }
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

// Generic prism builder for shapes whose cross-section is a flat polygon
// extruded along the Y axis. Used by buildWedge and buildRoof when chamfer
// or fillet is non-zero. Bevels the perimeter edges of the front/back faces
// (where the extrude top/bottom meets the side walls). The long axial edges
// (where adjacent side faces meet) are not bevelled — that needs a custom
// geometry that this Extrude-based path doesn't support.
function buildExtrudedPrism(profile2D, fullDepth, fillet, chamfer, filletSegments) {
  // Build the 2D shape from the profile (list of [x, y] points). The profile
  // is in the local XZ plane in world coordinates, but we hand it to
  // ExtrudeGeometry as XY (it extrudes along Z) and rotate the result.
  const shape = new THREE.Shape();
  profile2D.forEach(([x, y], i) => { i === 0 ? shape.moveTo(x, y) : shape.lineTo(x, y); });
  shape.closePath();
  // Bound the bevel against half-depth, plus a fraction of the smallest
  // profile span so it doesn't eat the whole prism.
  const xs = profile2D.map(p => p[0]);
  const ys = profile2D.map(p => p[1]);
  const halfDepth = fullDepth / 2;
  const minProfileSpan = Math.min(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys));
  const bevelSize = Math.min(fillet || chamfer, minProfileSpan * 0.24, halfDepth * 0.49);
  const bevelSeg = fillet > 0 ? Math.max(2, Math.min(32, Math.floor(filletSegments || 8))) : 1;
  const g = new THREE.ExtrudeGeometry(shape, {
    depth: fullDepth - 2 * bevelSize,
    bevelEnabled: true,
    bevelSize,
    bevelThickness: bevelSize,
    bevelSegments: bevelSeg,
    bevelOffset: 0,
  });
  // Centre Z (the extrusion axis) on 0, then rotate -90° around X so the
  // extrusion axis becomes world Y. The 2D Y-up (profile height) becomes
  // world Z (up).
  g.translate(0, 0, -(halfDepth - bevelSize));
  g.rotateX(-PI / 2);
  return mergeVerticesSafe(g);
}

function buildTube(p) {
  const fillet = Math.max(0, +p.fillet || 0);
  if (fillet > 0.001) return buildFilletedTube(p.radius, p.inner_radius, p.height, fillet, p.fillet_segments || 8, p.segments);
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
  // N-sided prism around Z. When fillet > 0 or chamfer > 0 we switch from
  // CylinderGeometry to ExtrudeGeometry of an N-gon profile so we can use
  // three.js's built-in bevel options (top + bottom rim bevels along the
  // extrusion axis).
  const fillet = Math.max(0, +p.fillet || 0);
  const chamfer = Math.max(0, +p.chamfer || 0);
  if (fillet > 0.001 || chamfer > 0.001) {
    return buildExtrudedPolygon(p.radius, p.height, p.sides, fillet, chamfer, p.fillet_segments || 8);
  }
  const g = new THREE.CylinderGeometry(p.radius, p.radius, p.height, p.sides);
  g.rotateX(PI / 2);
  return g;
}

// N-sided prism via ExtrudeGeometry, with optional bevel on the rim (top +
// bottom edges around the perimeter). Bevel size + thickness are equal so
// the bevel goes in at 45° — chamfer if bevelSegments = 1, rounded fillet
// if bevelSegments > 1.
function buildExtrudedPolygon(radius, height, sides, fillet, chamfer, filletSegments) {
  const n = Math.max(3, sides);
  // Build the N-gon outline in the XY plane.
  const shape = new THREE.Shape();
  for (let i = 0; i < n; i++) {
    const a = PI / 2 + (2 * PI * i) / n;
    const x = radius * cos(a);
    const y = radius * sin(a);
    if (i === 0) shape.moveTo(x, y); else shape.lineTo(x, y);
  }
  shape.closePath();
  // Resolve bevel size (clamped to < radius and < height/2 so the bevel
  // doesn't eat the whole shape).
  const bevelSize = Math.min(fillet || chamfer, radius * 0.49, (height / 2) * 0.49);
  const bevelSeg = fillet > 0 ? Math.max(2, Math.min(32, Math.floor(filletSegments || 8))) : 1;
  const g = new THREE.ExtrudeGeometry(shape, {
    depth: height - 2 * bevelSize,
    bevelEnabled: true,
    bevelSize,
    bevelThickness: bevelSize,
    bevelSegments: bevelSeg,
    bevelOffset: 0,
    curveSegments: n,  // matches the polygon side count
  });
  // ExtrudeGeometry extrudes along +Z from z=0. Centre on Z=0 and account for
  // the bevel that grows beyond the depth.
  g.translate(0, 0, -(height / 2));
  return mergeVerticesSafe(g);
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
  const fillet = Math.max(0, +p.fillet || 0);
  const chamfer = Math.max(0, +p.chamfer || 0);
  const useBevel = fillet > 0.001 || chamfer > 0.001;
  const bevelSize = useBevel
    ? Math.min(fillet || chamfer, rIn * 0.49, (p.height / 2) * 0.49)
    : 0;
  const bevelSeg = fillet > 0 ? Math.max(2, Math.min(32, Math.floor(p.fillet_segments || 8))) : 1;
  const g = new THREE.ExtrudeGeometry(shape, {
    depth: p.height - 2 * bevelSize,
    bevelEnabled: useBevel,
    bevelSize,
    bevelThickness: bevelSize,
    bevelSegments: bevelSeg,
    bevelOffset: 0,
  });
  g.translate(0, 0, -p.height / 2);
  return useBevel ? mergeVerticesSafe(g) : g;
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
  const fillet = Math.max(0, +p.fillet || 0);
  const chamfer = Math.max(0, +p.chamfer || 0);
  const useBevel = fillet > 0.001 || chamfer > 0.001;
  // Heart is irregular; clamp bevel against half-height and a fraction of the
  // heart's radius to avoid the bevel eating concave features near the dip.
  const bevelSize = useBevel
    ? Math.min(fillet || chamfer, r * 0.20, (p.height / 2) * 0.49)
    : 0;
  const bevelSeg = fillet > 0 ? Math.max(2, Math.min(32, Math.floor(p.fillet_segments || 8))) : 1;
  const g = new THREE.ExtrudeGeometry(shape, {
    depth: p.height - 2 * bevelSize,
    bevelEnabled: useBevel,
    bevelSize,
    bevelThickness: bevelSize,
    bevelSegments: bevelSeg,
    bevelOffset: 0,
  });
  g.translate(0, 0, -p.height / 2);
  return useBevel ? mergeVerticesSafe(g) : g;
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
