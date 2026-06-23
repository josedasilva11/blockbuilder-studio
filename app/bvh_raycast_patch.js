// Eager-loaded BVH raycast patch. Lives in its own tiny module so the
// main.js boot can lazy-import the heavier io_import.js (STL/OBJ loaders)
// without losing picking on autosave-restored imports, which arrive with
// boundsTree already attached but need this patch to actually use it.

import * as THREE from 'three';
import { acceleratedRaycast } from 'three-mesh-bvh';

if (!THREE.Mesh.prototype.__bvhPatched) {
  THREE.Mesh.prototype.raycast = acceleratedRaycast;
  THREE.Mesh.prototype.__bvhPatched = true;
}
