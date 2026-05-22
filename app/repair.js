// Mesh repair helpers. STL imports often arrive as a soup of unindexed
// triangles with duplicate vertices, occasional zero-area triangles, and
// stale normals — all of which trip up CSG and look facetted in the viewport.
// `repairMesh` welds vertices, drops degenerate triangles, and rebuilds
// normals. It's not full topology repair (no T-junction fixing or hole
// filling) but it's enough to unblock most CSG failures.
//
// `decimateMesh` is intentionally absent: proper edge-collapse simplification
// needs the Three.js SimplifyModifier addon which isn't bundled here. If you
// want it, add `vendor/three/addons/modifiers/SimplifyModifier.js` to the
// vendor tree and wire it through here.

import * as THREE from 'three';
import { MeshBVH } from 'three-mesh-bvh';
import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import { state } from './state.js';
import { pushHistory } from './history.js';
import { requestRender } from './scene.js';
import { showStatus, hideStatus } from './status.js';
import { toast } from './toast.js';

export async function repairSelected() {
  const s = state.shapes.get(state.selectedId);
  if (!s) { toast.warn('Select a mesh first'); return; }
  if (s.kind !== 'IMPORT' && !s.isGroup) {
    toast.info('Nothing to repair', { detail: 'Primitives are already clean. Repair only applies to imported or baked meshes.' });
    return;
  }

  showStatus('Repairing mesh…');
  await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));

  pushHistory();
  const mesh = s.mesh;
  let geom = mesh.geometry;
  const before = countTris(geom);

  // 1. Strip non-essential attrs so mergeVertices/CSG-bound checks behave.
  for (const attr of Object.keys(geom.attributes)) {
    if (attr !== 'position' && attr !== 'normal') geom.deleteAttribute(attr);
  }
  // 2. Weld duplicate vertices. Tighter epsilon for already-indexed, looser
  //    for the un-indexed STL soup we typically see right after import.
  try { geom = mergeVertices(geom, geom.index ? 1e-5 : 1e-4); } catch {}

  // 3. Strip zero-area triangles.
  geom = dropDegenerateTriangles(geom);

  // 4. Recompute normals fresh — old ones may not match the welded topology.
  geom.computeVertexNormals();

  // 5. Rebuild BVH so picking stays fast.
  try { geom.boundsTree = new MeshBVH(geom); } catch {}

  mesh.geometry.dispose();
  mesh.geometry = geom;

  const after = countTris(geom);
  hideStatus();
  requestRender();
  // Tiny non-blocking summary in the status pill region.
  showStatus(`Repaired: ${before} → ${after} triangles`);
  setTimeout(hideStatus, 1800);
}

function countTris(geom) {
  if (!geom) return 0;
  return geom.index ? geom.index.count / 3 : geom.attributes.position.count / 3;
}

function dropDegenerateTriangles(geom) {
  const pos = geom.attributes.position;
  const idx = geom.index;
  if (!idx) return geom;
  const arr = idx.array;
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
  const ab = new THREE.Vector3(), ac = new THREE.Vector3(), n = new THREE.Vector3();
  const kept = [];
  const EPS = 1e-10;
  for (let i = 0; i < arr.length; i += 3) {
    a.fromBufferAttribute(pos, arr[i]);
    b.fromBufferAttribute(pos, arr[i + 1]);
    c.fromBufferAttribute(pos, arr[i + 2]);
    ab.subVectors(b, a); ac.subVectors(c, a);
    n.crossVectors(ab, ac);
    if (n.lengthSq() > EPS) kept.push(arr[i], arr[i + 1], arr[i + 2]);
  }
  if (kept.length === arr.length) return geom;
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', pos);
  if (geom.attributes.normal) out.setAttribute('normal', geom.attributes.normal);
  out.setIndex(kept.length > 65535 ? new THREE.Uint32BufferAttribute(kept, 1) : new THREE.Uint16BufferAttribute(kept, 1));
  return out;
}
