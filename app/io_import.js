// Import 3D mesh files (.stl, .obj) and add them to the scene as an IMPORT
// TinkerShape. They behave like any other shape afterwards — selectable,
// movable, scalable, hideable, listed in the outliner — but their geometry is
// fixed (you can't rebuild it from params).

import * as THREE from 'three';
import { STLLoader } from 'three/addons/loaders/STLLoader.js';
import { OBJLoader } from 'three/addons/loaders/OBJLoader.js';
import { MeshBVH } from 'three-mesh-bvh';
import { state } from './state.js';
import { TinkerShape } from './shape.js';
import { selectShape } from './selection.js';
import { pushHistory } from './history.js';
import { toast } from './toast.js';
// BVH raycast patch lives in its own eager module (loaded by main.js) so
// autosave-restored imports keep fast picking even though this whole module
// is now lazy-loaded.
import './bvh_raycast_patch.js';

const stl = new STLLoader();
const obj = new OBJLoader();

export function pickAndImport() {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = '.stl,.obj';
  input.multiple = true;
  input.addEventListener('change', () => {
    for (const file of input.files) importFile(file);
  });
  input.click();
}

export function importFile(file) {
  const ext = (file.name.split('.').pop() || '').toLowerCase();
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const buf = reader.result;
      let geometry = null;
      if (ext === 'stl') {
        geometry = stl.parse(buf);
      } else if (ext === 'obj') {
        const text = new TextDecoder().decode(buf);
        const group = obj.parse(text);
        geometry = collapseObjGroup(group);
      } else {
        throw new Error(`Unsupported format: .${ext}`);
      }
      placeImported(geometry, file.name);
    } catch (e) {
      console.error('Import failed:', e);
      toast.error(`Couldn't import ${file.name}`, { detail: e.message });
    }
  };
  if (ext === 'stl') reader.readAsArrayBuffer(file);
  else reader.readAsArrayBuffer(file);
}

function collapseObjGroup(group) {
  // OBJ files often parse to a Group of meshes. Merge their geometries so we
  // end up with one BufferGeometry the shape can own.
  const geoms = [];
  group.traverse(child => {
    if (child.isMesh && child.geometry) {
      child.geometry.applyMatrix4(child.matrixWorld);
      geoms.push(child.geometry);
    }
  });
  if (geoms.length === 0) throw new Error('No geometry found in OBJ');
  if (geoms.length === 1) return geoms[0];
  // Cheap merge: use BufferGeometry.merge via mergeAttributes when possible
  const merged = mergeBuffers(geoms);
  return merged;
}

function mergeBuffers(geos) {
  // Manual merge of POSITION + NORMAL attributes for simple OBJ meshes.
  let totalVerts = 0;
  for (const g of geos) totalVerts += g.attributes.position.count;
  const positions = new Float32Array(totalVerts * 3);
  const normals = new Float32Array(totalVerts * 3);
  let off = 0;
  for (const g of geos) {
    positions.set(g.attributes.position.array, off * 3);
    if (g.attributes.normal) {
      normals.set(g.attributes.normal.array, off * 3);
    }
    off += g.attributes.position.count;
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  out.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
  out.computeVertexNormals();
  return out;
}

function placeImported(geometry, name) {
  // Centre + lift the import so it sits on the workplane.
  geometry.computeBoundingBox();
  const bb = geometry.boundingBox;
  const c = bb.getCenter(new THREE.Vector3());
  geometry.translate(-c.x, -c.y, -bb.min.z);
  geometry.computeVertexNormals();

  // Build a BVH so raycasts (picking + hover) on this mesh are O(log n) per
  // ray. Without this, every mouse move on a 100K-tri STL eats real CPU.
  try { geometry.boundsTree = new MeshBVH(geometry); } catch {}

  // Strip extension from filename for cleaner display
  const displayName = name.replace(/\.[^.]+$/, '');
  pushHistory();
  const shape = new TinkerShape('IMPORT', { geometry, name: displayName, importedName: displayName });
  state.scene.add(shape.mesh);
  selectShape(shape.id);
}
