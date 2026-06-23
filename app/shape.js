// TinkerShape: wraps a Three.Mesh with parametric state so dimensions/segments/colour
// can be edited and the geometry rebuilt on the fly.

import * as THREE from 'three';
import { MeshBVH } from 'three-mesh-bvh';
import { buildGeometry } from './shapes/builders.js';
import { SHAPE_BY_KIND } from './shapes/registry.js';
import { HOLE_COLOR, nextPaletteColor } from './utils/palette.js';
import { freshId, registerShape, state } from './state.js';

export class TinkerShape {
  constructor(kind, opts = {}) {
    // Imported meshes use kind='IMPORT' and bring their own BufferGeometry.
    // They behave like any other shape (move / scale / rotate / hide / colour)
    // but can't rebuild geometry from params.
    if (kind === 'IMPORT') {
      this.id = opts.id ?? freshId('import');
      this.kind = 'IMPORT';
      this.params = {};
      this.isHole = !!opts.isHole;
      this.color = opts.color ?? (this.isHole ? HOLE_COLOR : nextPaletteColor());
      this.locked = false;
      this.name = opts.name || null;             // user-editable label
      this.layerId = opts.layerId || state.activeLayerId || 'default';
      this.importedName = opts.importedName || opts.name || 'Imported';
      this._geomSerialised = opts._geomSerialised || null;  // base64 buffers for autosave

      let geom = opts.geometry;
      if (!geom && opts._geomSerialised) geom = deserialiseImportGeometry(opts._geomSerialised);
      if (!geom) geom = new THREE.BoxGeometry(10, 10, 10);
      // Build (or rebuild) BVH for fast raycast picking on imports + restored
      // shapes. mergeVertices'd geometry already comes BVH-ready when from
      // the import path, but autosave-restored copies need it built fresh.
      if (!geom.boundsTree) {
        try { geom.boundsTree = new MeshBVH(geom); } catch {}
      }
      const mat = this._makeMaterial();
      this.mesh = new THREE.Mesh(geom, mat);
      // Heavy meshes (organic STL imports, figurines, scans) tank the shadow
      // map pass because the renderer redraws them every shadow frame. Cap
      // shadow casting at 20k tris; above that the visual gain is invisible
      // anyway because the mesh's own self-shadow noise dominates.
      const triCount = geom.index ? geom.index.count / 3 : geom.attributes.position.count / 3;
      const heavyImport = triCount > 20000;
      this.mesh.castShadow = !heavyImport;
      this.mesh.receiveShadow = true;
      this.mesh.userData.tinkerShape = this;
      this.mesh.name = this.id;

      if (opts.position) this.mesh.position.fromArray(opts.position);
      if (opts.rotation) this.mesh.rotation.fromArray(opts.rotation);
      if (opts.scale) this.mesh.scale.fromArray(opts.scale);

      // Cache serialised form so subsequent saves don't have to re-encode.
      if (!this._geomSerialised) this._geomSerialised = serialiseImportGeometry(geom);

      registerShape(this);
      return;
    }
    const def = SHAPE_BY_KIND[kind];
    if (!def) throw new Error(`Unknown shape: ${kind}`);
    this.id = opts.id ?? freshId(kind.toLowerCase());
    this.kind = kind;
    this.params = { ...def.defaults, ...(opts.params || {}) };
    this.isHole = !!opts.isHole;
    this.color = opts.color ?? (this.isHole ? HOLE_COLOR : nextPaletteColor());
    this.name = opts.name || null;
    this.locked = false;
    this.layerId = opts.layerId || state.activeLayerId || 'default';

    const geom = buildGeometry(this.kind, this.params);
    const mat = this._makeMaterial();
    this.mesh = new THREE.Mesh(geom, mat);
    this.mesh.castShadow = true;
    this.mesh.receiveShadow = true;
    this.mesh.userData.tinkerShape = this;
    this.mesh.name = this.id;

    if (opts.position) this.mesh.position.fromArray(opts.position);
    if (opts.rotation) this.mesh.rotation.fromArray(opts.rotation);
    if (opts.scale) this.mesh.scale.fromArray(opts.scale);

    registerShape(this);
  }

  _makeMaterial() {
    if (this.isHole) {
      // Holes still use PhysicalMaterial because the glassy "hole" look needs
      // transmission. Only one transmissive pass at a time is cheap; many
      // would tank perf, but holes are rare in a scene.
      return new THREE.MeshPhysicalMaterial({
        color: HOLE_COLOR,
        transparent: true,
        opacity: 0.40,
        roughness: 0.25,
        transmission: 0.4,
        thickness: 0.5,
        ior: 1.3,
        depthWrite: false,
        side: THREE.DoubleSide,
      });
    }
    // Solid shapes use the lighter MeshStandardMaterial (no clearcoat / sheen
    // / transmission shader). On integrated GPUs this is 2-3× faster per
    // pixel; visually it's near-identical for plastic-look shapes.
    return new THREE.MeshStandardMaterial({
      color: this.color,
      roughness: 0.5,
      metalness: 0.0,
    });
  }

  setParam(key, value) {
    this.params[key] = value;
    this._rebuildGeometry();
  }

  setColor(hex) {
    this.color = hex;
    if (!this.isHole) this.mesh.material.color.setHex(hex);
  }

  setHole(flag) {
    this.isHole = !!flag;
    this.mesh.material.dispose();
    this.mesh.material = this._makeMaterial();
  }

  _rebuildGeometry() {
    if (this.kind === 'IMPORT') return; // imported meshes keep their geometry
    this.mesh.geometry.dispose();
    this.mesh.geometry = buildGeometry(this.kind, this.params);
    // Mark the scene dirty so the render-on-demand loop in scene.js paints
    // the new geometry on the next frame. Without this, slider drags update
    // the geometry in memory but the canvas keeps showing the stale frame
    // until some other event (click, orbit) sets _dirty.
    if (state.requestRender) state.requestRender();
  }

  dispose() {
    if (this.mesh.geometry) {
      // three-mesh-bvh attaches boundsTree with internal typed-array buffers.
      // Geometry.dispose alone won't release them; null the reference first
      // so the BVH can be collected with the geometry. Without this we leak
      // megabytes per heavy STL import across delete/undo/CSG/repair cycles.
      this.mesh.geometry.boundsTree = null;
      this.mesh.geometry.dispose();
    }
    if (this.mesh.material) this.mesh.material.dispose();
    if (this.mesh.parent) this.mesh.parent.remove(this.mesh);
  }

  setName(name) { this.name = (name || '').trim() || null; }

  displayName() {
    if (this.name) return this.name;
    if (this.kind === 'IMPORT') return this.importedName || 'imported';
    return this.kind.toLowerCase();
  }

  serialize() {
    const out = {
      id: this.id,
      kind: this.kind,
      params: { ...this.params },
      isHole: this.isHole,
      color: this.color,
      name: this.name,
      locked: !!this.locked,
      layerId: this.layerId || 'default',
      position: this.mesh.position.toArray(),
      rotation: this.mesh.rotation.toArray().slice(0, 3),
      scale: this.mesh.scale.toArray(),
    };
    if (this.kind === 'IMPORT') {
      out.importedName = this.importedName;
      out._geomSerialised = this._geomSerialised;
    }
    return out;
  }

  static deserialize(data) {
    const shape = new TinkerShape(data.kind, {
      id: data.id,
      params: data.params,
      isHole: data.isHole,
      color: data.color,
      name: data.name,
      layerId: data.layerId || 'default',
      importedName: data.importedName,
      _geomSerialised: data._geomSerialised,
      position: data.position,
      rotation: data.rotation,
      scale: data.scale,
    });
    shape.locked = !!data.locked;
    return shape;
  }

  resetTransform({ keepPosition = true } = {}) {
    this.mesh.rotation.set(0, 0, 0);
    this.mesh.scale.set(1, 1, 1);
    if (!keepPosition) this.mesh.position.set(0, 0, 0);
  }
}

// ----- IMPORT geometry (base64) serialisation -----

function bufferToBase64(buf) {
  const u8 = new Uint8Array(buf);
  // Chunked btoa to avoid call-stack issues on big buffers
  const chunk = 0x8000;
  let str = '';
  for (let i = 0; i < u8.length; i += chunk) {
    str += String.fromCharCode.apply(null, u8.subarray(i, i + chunk));
  }
  return btoa(str);
}

function base64ToBuffer(b64) {
  const bin = atob(b64);
  const u8 = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
  return u8.buffer;
}

function serialiseImportGeometry(geom) {
  const out = {};
  for (const key of ['position', 'normal', 'uv']) {
    const attr = geom.attributes?.[key];
    if (!attr) continue;
    out[key] = {
      type: attr.array.constructor.name,
      itemSize: attr.itemSize,
      data: bufferToBase64(attr.array.buffer),
    };
  }
  if (geom.index) {
    out.index = {
      type: geom.index.array.constructor.name,
      data: bufferToBase64(geom.index.array.buffer),
    };
  }
  return out;
}

function deserialiseImportGeometry(payload) {
  const g = new THREE.BufferGeometry();
  const typed = {
    Float32Array, Float64Array, Int8Array, Uint8Array, Int16Array, Uint16Array, Int32Array, Uint32Array,
  };
  for (const key of ['position', 'normal', 'uv']) {
    const part = payload[key];
    if (!part) continue;
    const Ctor = typed[part.type] || Float32Array;
    const arr = new Ctor(base64ToBuffer(part.data));
    g.setAttribute(key, new THREE.BufferAttribute(arr, part.itemSize));
  }
  if (payload.index) {
    const Ctor = typed[payload.index.type] || Uint16Array;
    const arr = new Ctor(base64ToBuffer(payload.index.data));
    g.setIndex(new THREE.BufferAttribute(arr, 1));
  }
  g.computeBoundingBox();
  g.computeBoundingSphere();
  return g;
}
