// Geometry metrics: signed volume + surface area + triangle count of a mesh.
// Used by the Properties panel to show real-world numbers (filament cost,
// mass, complexity).
//
// Caching: the Properties polling loop calls these every 250 ms on whatever
// shape is currently selected. Iterating every triangle of a 100k-tri STL
// four times a second is a real cost. We cache per-mesh keyed by
// `geometry.uuid + scale signature`. Translation and rotation are rigid
// transforms — they don't change volume or surface area mathematically — so
// they don't invalidate the cache.

import * as THREE from 'three';

const _cache = new WeakMap();  // Mesh -> { sig, volume, area, tri }

function sigOf(mesh) {
  const g = mesh.geometry;
  const s = mesh.scale;
  return `${g?.uuid ?? '?'}|${s.x}|${s.y}|${s.z}`;
}

function compute(mesh) {
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const c = new THREE.Vector3();
  const ab = new THREE.Vector3();
  const ac = new THREE.Vector3();
  const cross = new THREE.Vector3();

  mesh.updateMatrixWorld(true);
  const geom = mesh.geometry;
  if (!geom) return { volume: 0, area: 0, tri: 0 };
  const pos = geom.attributes.position;
  if (!pos) return { volume: 0, area: 0, tri: 0 };
  const idx = geom.index;
  const mat = mesh.matrixWorld;

  let volume = 0;
  let area = 0;
  let tri = 0;

  const iterate = (ia, ib, ic) => {
    a.fromBufferAttribute(pos, ia).applyMatrix4(mat);
    b.fromBufferAttribute(pos, ib).applyMatrix4(mat);
    c.fromBufferAttribute(pos, ic).applyMatrix4(mat);
    // Signed tetrahedral volume contribution.
    volume += a.dot(cross.crossVectors(b, c));
    // Triangle area = 0.5 * |AB × AC|. Use a side variable for area so the
    // crossVectors call above isn't overwritten by reuse.
    ab.subVectors(b, a);
    ac.subVectors(c, a);
    area += 0.5 * cross.crossVectors(ab, ac).length();
    tri++;
  };

  if (idx) {
    const arr = idx.array;
    for (let i = 0; i < arr.length; i += 3) iterate(arr[i], arr[i + 1], arr[i + 2]);
  } else {
    for (let i = 0; i < pos.count; i += 3) iterate(i, i + 1, i + 2);
  }
  return { volume: Math.abs(volume) / 6, area, tri };
}

function get(mesh) {
  const sig = sigOf(mesh);
  const c = _cache.get(mesh);
  if (c && c.sig === sig) return c;
  const m = compute(mesh);
  const entry = { sig, ...m };
  _cache.set(mesh, entry);
  return entry;
}

export function meshVolume(mesh)        { return mesh ? get(mesh).volume : 0; }
export function meshSurfaceArea(mesh)   { return mesh ? get(mesh).area   : 0; }
export function triangleCount(mesh)     { return mesh ? get(mesh).tri    : 0; }
