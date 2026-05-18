// CSG operations via three-bvh-csg. Group selected shapes into a boolean stack
// hosted on the first solid; bake collapses the result to a static mesh.

import * as THREE from 'three';
import { Evaluator, Brush, ADDITION, SUBTRACTION } from 'three-bvh-csg';
import { state } from './state.js';
import { selectShape } from './selection.js';

const evaluator = new Evaluator();
evaluator.useGroups = false;

/**
 * Group the given shapes into a CSG result. First solid becomes the host; holes
 * are subtracted, additional solids are unioned. Children are parented under the
 * host so they move together, but kept editable until baked.
 */
export function groupShapes(ids) {
  const shapes = ids.map(id => state.shapes.get(id)).filter(Boolean);
  const solids = shapes.filter(s => !s.isHole);
  if (solids.length === 0) return null;

  const host = solids[0];
  // Remove any previous CSG bookkeeping
  host.csgChildren = (host.csgChildren || []).filter(id => !ids.includes(id));

  // Build resulting brush by sequentially applying booleans.
  const hostBrush = makeBrushFromMesh(host.mesh);
  let resultBrush = hostBrush;
  for (const s of shapes) {
    if (s === host) continue;
    const b = makeBrushFromMesh(s.mesh);
    const op = s.isHole ? SUBTRACTION : ADDITION;
    resultBrush = evaluator.evaluate(resultBrush, b, op);
  }

  // Update host mesh geometry to the booleans result
  const newGeo = resultBrush.geometry.clone();
  newGeo.computeVertexNormals();
  host.mesh.geometry.dispose();
  host.mesh.geometry = newGeo;
  // Restore host's world transform — the brush was evaluated in world coordinates,
  // so neutralise the host's transform on the new geometry.
  newGeo.applyMatrix4(host.mesh.matrixWorld.clone().invert());

  // Hide / parent the rest
  host.csgChildren = [];
  for (const s of shapes) {
    if (s === host) continue;
    host.csgChildren.push(s.id);
    s.mesh.visible = false;
  }
  host.isGroup = true;

  selectShape(host.id);
  return host;
}

export function ungroupShapes(host) {
  if (!host || !host.csgChildren) return;
  // We don't have the host's pre-group geometry stored; we keep the current
  // baked geometry but show the children again. For a true rebuild, see "Bake".
  for (const id of host.csgChildren) {
    const c = state.shapes.get(id);
    if (c) c.mesh.visible = true;
  }
  host.csgChildren = [];
  host.isGroup = false;
}

/** Apply the CSG group permanently: keep the host geometry, remove children. */
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

function makeBrushFromMesh(mesh) {
  // Bake world matrix into a clone of the geometry so the boolean works in world space.
  mesh.updateMatrixWorld(true);
  const geom = mesh.geometry.clone();
  geom.applyMatrix4(mesh.matrixWorld);
  const brush = new Brush(geom);
  brush.updateMatrixWorld();
  return brush;
}
