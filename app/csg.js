// CSG operations via three-bvh-csg. First selected solid becomes the host; holes
// subtract, additional solids union. Children stay parented + hidden until baked.
//
// Imports from STL/OBJ arrive with un-indexed geometry (each tri owns its 3
// verts) and three-bvh-csg fails or produces garbage on those. We always
// mergeVertices first so every brush is indexed + welded.

import * as THREE from 'three';
import { Evaluator, Brush, ADDITION, SUBTRACTION, INTERSECTION } from 'three-bvh-csg';
import { MeshBVH } from 'three-mesh-bvh';
import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import { state } from './state.js';
import { selectShape } from './selection.js';
import { showStatus, hideStatus } from './status.js';
import { TinkerShape } from './shape.js';
import { toast } from './toast.js';

function attachBVH(geom) {
  try { geom.boundsTree = new MeshBVH(geom); } catch {}
  return geom;
}

// Auto-repair pass for geometries that come out of Split / Bake. Same
// pipeline as the standalone "Repair mesh" button: tight re-weld, drop
// degenerate triangles, recompute normals, rebuild BVH. Without this,
// Split outputs had broken shading + dead BVH (couldn't pick to drag).
function cleanPartGeometry(geom) {
  // Strip non-essential attrs first so mergeVertices doesn't hash on them.
  for (const attr of Object.keys(geom.attributes)) {
    if (attr !== 'position' && attr !== 'normal') geom.deleteAttribute(attr);
  }
  try { geom = mergeVertices(geom, 1e-5); } catch {}
  geom = dropDegenerateTriangles(geom);
  geom.computeVertexNormals();
  attachBVH(geom);
  return geom;
}

function dropDegenerateTriangles(geom) {
  const pos = geom.attributes.position;
  const idx = geom.index;
  if (!idx) return geom;
  const arr = idx.array;
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
  const ab = new THREE.Vector3(), ac = new THREE.Vector3(), n = new THREE.Vector3();
  const kept = [];
  const EPS = 1e-12;
  for (let i = 0; i < arr.length; i += 3) {
    a.fromBufferAttribute(pos, arr[i]);
    b.fromBufferAttribute(pos, arr[i + 1]);
    c.fromBufferAttribute(pos, arr[i + 2]);
    ab.subVectors(b, a); ac.subVectors(c, a);
    n.crossVectors(ab, ac);
    if (n.lengthSq() > EPS) kept.push(arr[i], arr[i + 1], arr[i + 2]);
  }
  if (kept.length === arr.length) return geom;
  const Ctor = kept.length > 65535 ? Uint32Array : Uint16Array;
  geom.setIndex(new THREE.BufferAttribute(new Ctor(kept), 1));
  return geom;
}

// Manual vertex welder used by splitByLooseParts. Three's mergeVertices was
// failing silently on three-bvh-csg outputs — kept emitting unique-per-tri
// vertex indices that union-find couldn't connect. We bypass it with a
// quantised-position hash: round each vertex coordinate to a grid of size
// `tol`, then assign one new index per occupied cell. Triangles that share
// a corner end up sharing an index, which is exactly what union-find needs.
function weldVertices(geom, tol) {
  const pos = geom.attributes.position;
  if (!pos) return geom;
  const oldIdx = geom.index ? geom.index.array : null;
  const oldVertCount = pos.count;
  const triCount = oldIdx ? oldIdx.length / 3 : oldVertCount / 3;

  const cells = new Map();          // quantised "x,y,z" key → new index
  const newPositions = [];
  const newIndex = [];
  const remap = new Int32Array(oldVertCount);
  const scale = 1 / tol;

  for (let i = 0; i < oldVertCount; i++) {
    const qx = Math.round(pos.getX(i) * scale);
    const qy = Math.round(pos.getY(i) * scale);
    const qz = Math.round(pos.getZ(i) * scale);
    const key = `${qx},${qy},${qz}`;
    let mapped = cells.get(key);
    if (mapped === undefined) {
      mapped = newPositions.length / 3;
      cells.set(key, mapped);
      newPositions.push(pos.getX(i), pos.getY(i), pos.getZ(i));
    }
    remap[i] = mapped;
  }

  for (let t = 0; t < triCount; t++) {
    const ia = oldIdx ? oldIdx[t * 3]     : t * 3;
    const ib = oldIdx ? oldIdx[t * 3 + 1] : t * 3 + 1;
    const ic = oldIdx ? oldIdx[t * 3 + 2] : t * 3 + 2;
    const a = remap[ia], b = remap[ib], c = remap[ic];
    // Drop degenerate triangles (two welded corners → zero area).
    if (a === b || b === c || c === a) continue;
    newIndex.push(a, b, c);
  }

  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.Float32BufferAttribute(newPositions, 3));
  const IdxCtor = newPositions.length / 3 > 65535 ? Uint32Array : Uint16Array;
  out.setIndex(new THREE.BufferAttribute(new IdxCtor(newIndex), 1));
  return out;
}

const evaluator = new Evaluator();
evaluator.useGroups = false;
// Only retain position + normal so every brush has a uniform attribute schema
// (avoids "reading 'array' of undefined" when one mesh has UVs and another
// doesn't, e.g. a primitive cylinder vs an STL import).
evaluator.attributes = ['position', 'normal'];

export async function groupShapes(ids) {
  const shapes = ids.map(id => state.shapes.get(id)).filter(Boolean);
  const solids = shapes.filter(s => !s.isHole);
  if (solids.length === 0) return null;

  const host = solids[0];
  host.csgChildren = (host.csgChildren || []).filter(id => !ids.includes(id));

  showStatus(`Computing CSG (${shapes.length} shapes)…`);
  // Yield TWICE so the browser actually paints the pill: one rAF schedules
  // the layout, the second confirms it landed on screen before the (slow,
  // synchronous) CSG evaluation blocks the main thread.
  await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));

  let resultBrush;
  try {
    resultBrush = makeBrushFromMesh(host.mesh);
    for (const s of shapes) {
      if (s === host) continue;
      const b = makeBrushFromMesh(s.mesh);
      const op = s.isHole ? SUBTRACTION : ADDITION;
      resultBrush = evaluator.evaluate(resultBrush, b, op);
    }
  } catch (err) {
    hideStatus();
    console.error('CSG failed:', err);
    toast.error('CSG failed', { detail: `${err.message}. Imported meshes need to be watertight. Try Repair in Properties, or use a cleaner mesh.` });
    return null;
  }

  const newGeo = resultBrush.geometry.clone();
  newGeo.computeVertexNormals();
  newGeo.applyMatrix4(host.mesh.matrixWorld.clone().invert());
  // NOTE: do NOT call mergeVertices / cleanPartGeometry here. The bvh-csg
  // kernel emits exactly the topology we want — welding sharp edges flips
  // adjacent triangle normals and produces corrupted shading + visible
  // holes in the result mesh. Auto-clean still runs inside Split (where
  // union-find depends on welded vertices), just not on direct CSG output.
  attachBVH(newGeo);
  host.mesh.geometry.dispose();
  host.mesh.geometry = newGeo;

  host.csgChildren = [];
  for (const s of shapes) {
    if (s === host) continue;
    host.csgChildren.push(s.id);
    s.mesh.visible = false;
  }
  host.isGroup = true;

  hideStatus();
  selectShape(host.id);
  return host;
}

// Intersect: keep only the volume common to all selected solids.
// First selected becomes the host; the rest are stored as hidden children
// so ungrouping restores the original parts. Holes in the selection are
// skipped (intersect against a void is meaningless).
export async function intersectShapes(ids) {
  const shapes = ids.map(id => state.shapes.get(id)).filter(Boolean);
  const solids = shapes.filter(s => !s.isHole);
  if (solids.length < 2) {
    toast.error('Intersect needs 2 or more solid shapes selected');
    return null;
  }
  if (solids.length !== shapes.length) {
    toast.warn('Holes ignored in Intersect (operates on solids only)');
  }

  const host = solids[0];
  host.csgChildren = (host.csgChildren || []).filter(id => !ids.includes(id));

  showStatus(`Computing intersect (${solids.length} shapes)…`);
  await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));

  let resultBrush;
  try {
    resultBrush = makeBrushFromMesh(host.mesh);
    for (let i = 1; i < solids.length; i++) {
      const b = makeBrushFromMesh(solids[i].mesh);
      resultBrush = evaluator.evaluate(resultBrush, b, INTERSECTION);
    }
  } catch (err) {
    hideStatus();
    console.error('Intersect CSG failed:', err);
    toast.error('Intersect failed', { detail: `${err.message}. Imported meshes need to be watertight. Try Repair, or use a cleaner mesh.` });
    return null;
  }

  const newGeo = resultBrush.geometry.clone();
  newGeo.computeVertexNormals();
  newGeo.applyMatrix4(host.mesh.matrixWorld.clone().invert());
  attachBVH(newGeo);
  host.mesh.geometry.dispose();
  host.mesh.geometry = newGeo;

  host.csgChildren = [];
  for (const s of solids) {
    if (s === host) continue;
    host.csgChildren.push(s.id);
    s.mesh.visible = false;
  }
  host.isGroup = true;
  host.groupKind = 'intersect';

  hideStatus();
  selectShape(host.id);
  toast.ok('Intersect baked', { detail: `${solids.length} shapes -> 1 (common volume)` });
  return host;
}

export function ungroupShapes(host) {
  if (!host || !host.csgChildren) return;
  for (const id of host.csgChildren) {
    const c = state.shapes.get(id);
    if (c) c.mesh.visible = true;
  }
  host.csgChildren = [];
  host.isGroup = false;
  // queueMicrotask so the render fires after the caller (toolbar handler)
  // finishes — covers any further mutation in the same tick.
  queueMicrotask(() => state.requestRender && state.requestRender());
}

export function bakeGroup(host) {
  if (!host || !host.csgChildren) return;
  for (const id of host.csgChildren) {
    const c = state.shapes.get(id);
    if (c) {
      c.dispose();
      state.shapes.delete(id);
    }
  }
  host.csgChildren = [];
  host.isGroup = false;
}

// Split a single mesh into its disconnected components. After a CSG cut, the
// result is often one geometry made of several "loose" pieces (e.g. a head
// chopped from a torso leaves head + torso + arms as separate parts). This
// walks the index buffer, finds connected components via union-find, and
// promotes each one to its own TinkerShape (IMPORT kind). Useful for
// destructuring CSG results without re-importing.
export function splitByLooseParts(shape) {
  if (!shape || !shape.mesh) return null;
  // If the shape is still hosting CSG children, bake them down to a single
  // mesh first — otherwise we'd be splitting the unbaked host geometry while
  // the child meshes still exist as separate shapes.
  if (Array.isArray(shape.csgChildren) && shape.csgChildren.length > 0) {
    bakeGroup(shape);
  }

  let geom = shape.mesh.geometry.clone();
  // Bake mesh.scale into the cloned positions so the welding tolerance is
  // expressed in the same units as the visible geometry (avoids tiny-scale
  // meshes welding everything and huge-scale meshes welding nothing).
  geom.applyMatrix4(new THREE.Matrix4().makeScale(shape.mesh.scale.x, shape.mesh.scale.y, shape.mesh.scale.z));

  // Manual vertex welder. mergeVertices from three was failing here on CSG
  // outputs (likely because the bvh-csg kernel emits each triangle with its
  // own 3 vertices and the hash collision detection wasn't catching the
  // float-jittered neighbours). This bypasses it entirely: quantise every
  // vertex position to a grid of size `tol`, then collapse to one index
  // per occupied cell. Guaranteed to weld every triangle that shares a
  // corner to within `tol`.
  geom.computeBoundingBox();
  const diag = geom.boundingBox ? geom.boundingBox.getSize(new THREE.Vector3()).length() : 100;
  // 0.1 % of diagonal, clamped. Loose enough to swallow any CSG jitter,
  // tight enough that two solids 1 mm+ apart never get welded together.
  const tol = Math.max(1e-3, Math.min(0.1, diag * 1e-3));
  geom = weldVertices(geom, tol);

  // Restore the original scale to mesh-local so per-part positioning later
  // works against the original world transform.
  const invScale = new THREE.Matrix4().makeScale(
    shape.mesh.scale.x !== 0 ? 1 / shape.mesh.scale.x : 1,
    shape.mesh.scale.y !== 0 ? 1 / shape.mesh.scale.y : 1,
    shape.mesh.scale.z !== 0 ? 1 / shape.mesh.scale.z : 1,
  );
  geom.applyMatrix4(invScale);

  // Geometry is always indexed after weldVertices().

  const pos = geom.attributes.position;
  const normalAttr = geom.attributes.normal;
  const idx = geom.index.array;
  const vCount = pos.count;

  // Union-Find on vertex indices: any two verts sharing a triangle are linked.
  const parent = new Int32Array(vCount);
  for (let i = 0; i < vCount; i++) parent[i] = i;
  function find(x) {
    while (parent[x] !== x) { parent[x] = parent[parent[x]]; x = parent[x]; }
    return x;
  }
  function union(a, b) {
    const ra = find(a), rb = find(b);
    if (ra !== rb) parent[ra] = rb;
  }
  for (let i = 0; i < idx.length; i += 3) {
    union(idx[i], idx[i + 1]);
    union(idx[i + 1], idx[i + 2]);
  }

  // Bucket triangles by their component root.
  const buckets = new Map();
  for (let i = 0; i < idx.length; i += 3) {
    const root = find(idx[i]);
    let arr = buckets.get(root);
    if (!arr) { arr = []; buckets.set(root, arr); }
    arr.push(idx[i], idx[i + 1], idx[i + 2]);
  }
  if (buckets.size <= 1) return null;  // nothing to split

  shape.mesh.updateMatrixWorld(true);
  const worldMat = shape.mesh.matrixWorld.clone();

  const newShapes = [];
  for (const tris of buckets.values()) {
    // Reindex this bucket into a fresh, compact geometry.
    const map = new Map();
    const newPos = [];
    const newNorm = [];
    const newIdx = [];
    for (const oldIdx of tris) {
      let ni = map.get(oldIdx);
      if (ni === undefined) {
        ni = map.size;
        map.set(oldIdx, ni);
        newPos.push(pos.getX(oldIdx), pos.getY(oldIdx), pos.getZ(oldIdx));
        if (normalAttr) newNorm.push(normalAttr.getX(oldIdx), normalAttr.getY(oldIdx), normalAttr.getZ(oldIdx));
      }
      newIdx.push(ni);
    }

    let partGeo = new THREE.BufferGeometry();
    partGeo.setAttribute('position', new THREE.Float32BufferAttribute(newPos, 3));
    if (newNorm.length) partGeo.setAttribute('normal', new THREE.Float32BufferAttribute(newNorm, 3));
    partGeo.setIndex(newIdx);

    // Inline auto-repair: weldVertices was aggressive enough to produce some
    // degenerate (zero-area) triangles + the normals copied from the original
    // mesh no longer correspond to the welded topology. Without this the
    // resulting parts had broken shading and the BVH was effectively useless
    // (couldn't click to select / drag). Same logic as the standalone Repair
    // button, applied automatically so the user doesn't have to.
    partGeo = cleanPartGeometry(partGeo);
    partGeo.computeBoundingBox();

    // Recentre the geometry around its local bbox centre, then put the new
    // mesh at the world position that centre would have occupied — so each
    // piece keeps its place in the scene while having a sensible local origin.
    const localCentre = partGeo.boundingBox.getCenter(new THREE.Vector3());
    partGeo.translate(-localCentre.x, -localCentre.y, -localCentre.z);
    const worldPos = localCentre.clone().applyMatrix4(worldMat);

    const partShape = new TinkerShape('IMPORT', {
      geometry: partGeo,
      importedName: `${shape.displayName()} part`,
      color: shape.color,
      isHole: shape.isHole,
    });
    // Inherit the host's rotation / scale so each piece sits in the same
    // orientation as the original.
    partShape.mesh.position.copy(worldPos);
    partShape.mesh.quaternion.copy(shape.mesh.quaternion);
    partShape.mesh.scale.copy(shape.mesh.scale);
    state.scene.add(partShape.mesh);
    newShapes.push(partShape);
  }

  // Drop the original — its pieces have taken its place.
  shape.dispose();
  state.shapes.delete(shape.id);

  // Select all newly created parts.
  if (newShapes.length > 0) {
    selectShape(newShapes[0].id);
    for (let i = 1; i < newShapes.length; i++) selectShape(newShapes[i].id, { additive: true });
  }
  return newShapes;
}

function makeBrushFromMesh(mesh) {
  mesh.updateMatrixWorld(true);
  let geom = mesh.geometry.clone();
  geom.applyMatrix4(mesh.matrixWorld);

  // Strip any non-essential attributes (uv, colour, tangent, …) so every
  // brush has the same schema. three-bvh-csg crashes when operands differ.
  for (const attr of Object.keys(geom.attributes)) {
    if (attr !== 'position' && attr !== 'normal') geom.deleteAttribute(attr);
  }

  // Weld duplicate verts so the mesh is indexed + manifold-friendly.
  try {
    geom = mergeVertices(geom, geom.index ? 1e-5 : 1e-4);
  } catch {}

  // (Re)compute normals on the merged mesh so they match the position welding.
  geom.computeVertexNormals();

  const brush = new Brush(geom);
  brush.updateMatrixWorld();
  return brush;
}
