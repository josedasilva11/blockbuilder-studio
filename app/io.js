// I/O: STL export and JSON project save/load.

import * as THREE from 'three';
import { STLExporter } from 'three/addons/exporters/STLExporter.js';
import { OBJExporter } from 'three/addons/exporters/OBJExporter.js';
import { state } from './state.js';
import { TinkerShape } from './shape.js';
import { RefGeom } from './ref_geom.js';
import { selectShape } from './selection.js';
import { clearHistory } from './history.js';
import { migrateLayersFromLoad } from './layers.js';
import { isLicensed, revalidateLicense, getLicenseName } from './support_nag.js';
import { toast } from './toast.js';

// Reference geometry survives save / load. Format is the minimum needed to
// reconstruct each kind: 3 points for PLANE_3P, two endpoints for AXIS_EDGE,
// one point for MIDPOINT. Position arrays use [x, y, z] for JSON readability.
function serializeRefGeom(rg) {
  const out = { id: rg.id, kind: rg.kind, name: rg.name, visible: rg.visible };
  if (rg.kind === 'PLANE_3P') out.points = rg.data.points.map((p) => [p.x, p.y, p.z]);
  else if (rg.kind === 'AXIS_EDGE') {
    out.from = [rg.data.from.x, rg.data.from.y, rg.data.from.z];
    out.to = [rg.data.to.x, rg.data.to.y, rg.data.to.z];
  } else if (rg.kind === 'MIDPOINT') {
    out.point = [rg.data.point.x, rg.data.point.y, rg.data.point.z];
  }
  return out;
}

function deserializeRefGeom(rd) {
  let data;
  if (rd.kind === 'PLANE_3P') {
    data = { points: rd.points.map(([x, y, z]) => new THREE.Vector3(x, y, z)) };
  } else if (rd.kind === 'AXIS_EDGE') {
    data = {
      from: new THREE.Vector3(...rd.from),
      to: new THREE.Vector3(...rd.to),
    };
  } else if (rd.kind === 'MIDPOINT') {
    data = { point: new THREE.Vector3(...rd.point) };
  } else {
    return null;
  }
  const rg = new RefGeom(rd.kind, data, { id: rd.id, name: rd.name });
  if (rd.visible === false) rg.setVisible(false);
  return rg;
}

const stlExporter = new STLExporter();
const objExporter = new OBJExporter();

// Brand stamp embedded in every export. STL binary keeps the first 80 bytes
// as a free-form header (slicers ignore it). OBJ accepts comments. This
// turns every exported file into a tiny back-link to marjers.com.
//
// Licensed users get a clean header naming the licensee; free users get the
// generic stamp. Differentiation is small but visible enough to nudge people
// who export a lot to consider buying.
function stlHeader() {
  return isLicensed()
    ? `Made with BlockBuilder Studio · Licensed to ${getLicenseName()} · marjers.com`
    : 'Made with BlockBuilder Studio (Free) · marjers.com';
}
function objHeader() {
  if (isLicensed()) {
    return `# Made with BlockBuilder Studio · Licensed to ${getLicenseName()}\n# Offline 3D editor by Marjers, https://marjers.com\n`;
  }
  return `# Made with BlockBuilder Studio (Free)\n# Offline 3D editor by Marjers, https://marjers.com\n`;
}

function patchStlHeader(stl, headerString) {
  // STLExporter binary returns either DataView, Uint8Array or ArrayBuffer
  // across Three.js versions; normalise to a Uint8Array view on the buffer.
  const buf = stl.buffer || stl;
  const view = new Uint8Array(buf);
  const bytes = new TextEncoder().encode(headerString);
  for (let i = 0; i < Math.min(80, bytes.length); i++) view[i] = bytes[i];
  return stl;
}

function buildExportGroup() {
  const group = new THREE.Group();
  for (const s of state.shapes.values()) {
    if (s.isHole && !s.csgChildren) continue;
    if (!s.mesh.visible && !s.isGroup) continue;
    const m = new THREE.Mesh(s.mesh.geometry, new THREE.MeshStandardMaterial());
    s.mesh.updateMatrixWorld(true);
    m.applyMatrix4(s.mesh.matrixWorld);
    group.add(m);
  }
  return group;
}

function triggerDownload(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

/** Export every visible solid (non-hole) shape as one binary STL. */
export async function exportSTL() {
  // Cheap re-check on every export so a hand-edited localStorage doesn't fool
  // the in-memory `isLicensed` flag without going through verify().
  await revalidateLicense();
  const group = buildExportGroup();
  if (group.children.length === 0) {
    toast.warn('Nothing to export', { detail: 'Add at least one visible solid shape, then try again.' });
    return;
  }
  const stl = stlExporter.parse(group, { binary: true });
  patchStlHeader(stl, stlHeader());
  triggerDownload(new Blob([stl], { type: 'application/octet-stream' }), 'blockbuilder.stl');
  toast.ok('STL exported', { detail: `blockbuilder.stl · ${group.children.length} shape${group.children.length === 1 ? '' : 's'}` });
}

/** Export as Wavefront OBJ (ASCII, no materials). */
export async function exportOBJ() {
  await revalidateLicense();
  const group = buildExportGroup();
  if (group.children.length === 0) {
    toast.warn('Nothing to export', { detail: 'Add at least one visible solid shape, then try again.' });
    return;
  }
  const obj = objHeader() + objExporter.parse(group);
  triggerDownload(new Blob([obj], { type: 'text/plain' }), 'blockbuilder.obj');
  toast.ok('OBJ exported', { detail: 'blockbuilder.obj' });
}

export function saveProject() {
  const data = {
    version: 3,
    generator: 'BlockBuilder Studio',
    source: 'https://marjers.com',
    ts: Date.now(),
    shapes: [...state.shapes.values()].map(s => s.serialize()),
    refGeoms: [...state.refGeoms.values()].map(serializeRefGeom),
    layers: state.layers.map(l => ({
      id: l.id,
      name: l.name,
      visible: l.visible !== false,
      locked: !!l.locked,
      color: l.color || null,
    })),
    activeLayerId: state.activeLayerId,
    workplane: state.workplane,
    snapStep: state.snapStep,
  };
  const name = `blockbuilder-${new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-')}.json`;
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
  import('./welcome.js').then(m => m.addRecent(name, data));
  toast.ok('Project saved', { detail: `${name} · ${data.shapes.length} shape${data.shapes.length === 1 ? '' : 's'}` });
}

export function loadProject(file) {
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const data = JSON.parse(reader.result);
      for (const s of [...state.shapes.values()]) s.dispose();
      state.shapes.clear();
      selectShape(null);
      clearHistory(); // a freshly-loaded project starts with a clean slate

      for (const sd of data.shapes || []) {
        const shape = TinkerShape.deserialize(sd);
        state.scene.add(shape.mesh);
      }
      // Reference geometry: dispose any existing refs, then re-create from
      // serialised data. Older v1 project files won't have refGeoms; missing
      // key just means no refs to restore.
      for (const rg of [...state.refGeoms.values()]) rg.dispose();
      for (const rd of data.refGeoms || []) deserializeRefGeom(rd);
      // Layers: v3+ projects ship a layers array. Older projects get one
      // default layer with every shape moved into it.
      migrateLayersFromLoad(data.layers, data.activeLayerId);
      if (data.workplane) state.workplane = data.workplane;
      if (typeof data.snapStep === 'number') state.snapStep = data.snapStep;
      // Track in recents so the welcome modal lists it
      import('./welcome.js').then(m => m.addRecent(file.name, data));
      toast.ok('Project loaded', { detail: `${file.name} · ${(data.shapes || []).length} shape${(data.shapes || []).length === 1 ? '' : 's'}` });
    } catch (err) {
      console.error('Failed to load project:', err);
      toast.error('Could not load project', { detail: err.message });
    }
  };
  reader.readAsText(file);
}
