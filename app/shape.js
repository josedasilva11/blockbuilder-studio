// TinkerShape: wraps a Three.Mesh with parametric state so dimensions/segments/colour
// can be edited and the geometry rebuilt on the fly.

import * as THREE from 'three';
import { buildGeometry } from './shapes/builders.js';
import { SHAPE_BY_KIND } from './shapes/registry.js';
import { HOLE_COLOR, nextPaletteColor } from './utils/palette.js';
import { freshId, registerShape, state } from './state.js';

export class TinkerShape {
  constructor(kind, opts = {}) {
    const def = SHAPE_BY_KIND[kind];
    if (!def) throw new Error(`Unknown shape: ${kind}`);
    this.id = opts.id ?? freshId(kind.toLowerCase());
    this.kind = kind;
    this.params = { ...def.defaults, ...(opts.params || {}) };
    this.isHole = !!opts.isHole;
    this.color = opts.color ?? (this.isHole ? HOLE_COLOR : nextPaletteColor());
    this.locked = false;

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
    // Soft plastic look — slight clearcoat so colours pop without looking metallic.
    return new THREE.MeshPhysicalMaterial({
      color: this.color,
      roughness: 0.45,
      metalness: 0.0,
      clearcoat: 0.25,
      clearcoatRoughness: 0.55,
      sheen: 0.05,
      reflectivity: 0.4,
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
    this.mesh.geometry.dispose();
    this.mesh.geometry = buildGeometry(this.kind, this.params);
  }

  dispose() {
    if (this.mesh.geometry) this.mesh.geometry.dispose();
    if (this.mesh.material) this.mesh.material.dispose();
    if (this.mesh.parent) this.mesh.parent.remove(this.mesh);
  }

  serialize() {
    return {
      id: this.id,
      kind: this.kind,
      params: { ...this.params },
      isHole: this.isHole,
      color: this.color,
      position: this.mesh.position.toArray(),
      rotation: this.mesh.rotation.toArray().slice(0, 3),
      scale: this.mesh.scale.toArray(),
    };
  }

  static deserialize(data) {
    const shape = new TinkerShape(data.kind, {
      id: data.id,
      params: data.params,
      isHole: data.isHole,
      color: data.color,
      position: data.position,
      rotation: data.rotation,
      scale: data.scale,
    });
    return shape;
  }
}
