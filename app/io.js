// I/O: STL export and JSON project save/load.

import * as THREE from 'three';
import { STLExporter } from 'three/addons/exporters/STLExporter.js';
import { state } from './state.js';
import { TinkerShape } from './shape.js';
import { selectShape } from './selection.js';

const exporter = new STLExporter();

/** Export every visible solid (non-hole) shape as one merged binary STL. */
export function exportSTL() {
  // Build a temporary scene with fresh Mesh objects (cloning the originals trips
  // a circular-userData reference when the mesh holds a TinkerShape back-pointer).
  const group = new THREE.Group();
  for (const s of state.shapes.values()) {
    if (s.isHole && !s.csgChildren) continue;
    if (!s.mesh.visible && !s.isGroup) continue;
    const m = new THREE.Mesh(s.mesh.geometry, new THREE.MeshStandardMaterial());
    s.mesh.updateMatrixWorld(true);
    m.applyMatrix4(s.mesh.matrixWorld);
    group.add(m);
  }
  const stl = exporter.parse(group, { binary: true });
  const blob = new Blob([stl], { type: 'application/octet-stream' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'blockbuilder.stl';
  a.click();
  URL.revokeObjectURL(url);
}

export function saveProject() {
  const data = {
    version: 1,
    shapes: [...state.shapes.values()].map(s => s.serialize()),
    workplane: state.workplane,
    snapStep: state.snapStep,
  };
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'blockbuilder-project.json';
  a.click();
  URL.revokeObjectURL(url);
}

export function loadProject(file) {
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const data = JSON.parse(reader.result);
      // Wipe existing scene shapes
      for (const s of [...state.shapes.values()]) {
        s.dispose();
      }
      state.shapes.clear();
      selectShape(null);
      for (const sd of data.shapes || []) {
        const shape = TinkerShape.deserialize(sd);
        state.scene.add(shape.mesh);
      }
      if (data.workplane) state.workplane = data.workplane;
      if (typeof data.snapStep === 'number') state.snapStep = data.snapStep;
    } catch (err) {
      console.error('Failed to load project:', err);
      alert('Could not parse project file: ' + err.message);
    }
  };
  reader.readAsText(file);
}
