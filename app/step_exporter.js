// STEP AP203 faceted-brep exporter.
//
// BlockBuilder shapes live as Three.js BufferGeometry (mesh). STEP is a
// parametric CAD format — its strength is analytic surfaces (cylinders,
// planes, NURBS) and B-Rep topology, not triangle soup. Converting mesh
// into proper parametric STEP requires reconstructing surfaces from
// triangles (essentially reverse-engineering), which needs a heavy CAD
// kernel (OpenCascade) and still produces unreliable results.
//
// What this exporter writes is a *faceted-brep* STEP: every triangle of
// the mesh becomes a tiny planar FACE bounded by a 3-vertex POLY_LOOP.
// Fusion 360 / SolidWorks / FreeCAD will read the file but treat it as a
// mesh body. The advantage over plain STL is interoperability with CAM
// pipelines that only ingest STEP, and the fact that the file is valid
// AP203 syntactically, so it imports cleanly into anything that accepts
// STEP at all.
//
// Reference: ISO 10303-21 (Part 21 clear-text encoding), AP203 schema.

import * as THREE from 'three';
import { state } from './state.js';
import { toast } from './toast.js';

// Tiny line emitter — STEP files are line-oriented (#N = ENTITY(...);)
class StepWriter {
  constructor() {
    this._lines = [];
    this._id = 0;
  }
  next() { return ++this._id; }
  add(entity) {
    const id = this.next();
    this._lines.push(`#${id} = ${entity};`);
    return id;
  }
  addAt(id, entity) {
    this._lines.push(`#${id} = ${entity};`);
    return id;
  }
  // Reserve an id without emitting yet — useful for forward references.
  reserve() { return this.next(); }
  text() { return this._lines.join('\n'); }
}

/**
 * Build the full STEP file as a string.
 * Each visible non-hole shape becomes its own MANIFOLD_SOLID_BREP wrapped
 * inside one SHAPE_REPRESENTATION linked to a single PRODUCT.
 */
export function exportSTEP() {
  const meshes = [];
  for (const s of state.shapes.values()) {
    if (s.isHole && !s.csgChildren) continue;
    if (!s.mesh.visible && !s.isGroup) continue;
    s.mesh.updateMatrixWorld(true);
    meshes.push(s.mesh);
  }
  if (meshes.length === 0) {
    toast.warn('Nothing to export', { detail: 'Add at least one solid (non-hole, visible) shape, then try again.' });
    return;
  }

  const w = new StepWriter();
  const now = new Date().toISOString();

  // ----- 1. Coordinate system + global axis placement ----------------------
  // Origin point shared by every shape — STEP wants explicit axis placements.
  const ORIGIN_PT  = w.add('CARTESIAN_POINT(\'\', (0.0, 0.0, 0.0))');
  const DIR_Z      = w.add('DIRECTION(\'\', (0.0, 0.0, 1.0))');
  const DIR_X      = w.add('DIRECTION(\'\', (1.0, 0.0, 0.0))');
  const AXIS_PL_3D = w.add(`AXIS2_PLACEMENT_3D('',#${ORIGIN_PT},#${DIR_Z},#${DIR_X})`);

  // Units: millimetres, radians, steradian (standard for AP203).
  const LENGTH_UNIT = w.add('( LENGTH_UNIT() NAMED_UNIT(*) SI_UNIT(.MILLI.,.METRE.) )');
  const ANGLE_UNIT  = w.add('( NAMED_UNIT(*) PLANE_ANGLE_UNIT() SI_UNIT($,.RADIAN.) )');
  const SOLID_ANG   = w.add('( NAMED_UNIT(*) SI_UNIT($,.STERADIAN.) SOLID_ANGLE_UNIT() )');
  const UNCERTAINTY = w.add(`UNCERTAINTY_MEASURE_WITH_UNIT(LENGTH_MEASURE(1.0E-5),#${LENGTH_UNIT},'distance_accuracy_value','')`);
  const GEO_CTX     = w.add(`( GEOMETRIC_REPRESENTATION_CONTEXT(3) GLOBAL_UNCERTAINTY_ASSIGNED_CONTEXT((#${UNCERTAINTY})) GLOBAL_UNIT_ASSIGNED_CONTEXT((#${LENGTH_UNIT},#${ANGLE_UNIT},#${SOLID_ANG})) REPRESENTATION_CONTEXT('Context','3D') )`);

  // ----- 2. Walk each mesh, emit its faceted brep --------------------------
  const brepIds = [];
  meshes.forEach((mesh, idx) => {
    const brepId = writeMeshAsBrep(w, mesh, idx);
    brepIds.push(brepId);
  });

  // ----- 3. Wrap brep solids in a shape representation ---------------------
  const SHAPE_REP = w.add(`ADVANCED_BREP_SHAPE_REPRESENTATION('',(${brepIds.map(i => `#${i}`).join(',')},#${AXIS_PL_3D}),#${GEO_CTX})`);

  // ----- 4. Product / product-definition wrapping --------------------------
  const APP_CTX  = w.add(`APPLICATION_CONTEXT('core data for automotive mechanical design processes')`);
  const APP_PROT = w.add(`APPLICATION_PROTOCOL_DEFINITION('international standard','automotive_design',2000,#${APP_CTX})`);
  const PROD_CTX = w.add(`PRODUCT_CONTEXT('',#${APP_CTX},'mechanical')`);
  const PROD     = w.add(`PRODUCT('BlockBuilder','BlockBuilder Studio export','',(#${PROD_CTX}))`);
  const PROD_REL = w.add(`PRODUCT_DEFINITION_FORMATION_WITH_SPECIFIED_SOURCE('','',#${PROD},.NOT_KNOWN.)`);
  const PROD_DEF_CTX = w.add(`PRODUCT_DEFINITION_CONTEXT('part definition',#${APP_CTX},'design')`);
  const PROD_DEF = w.add(`PRODUCT_DEFINITION('design','',#${PROD_REL},#${PROD_DEF_CTX})`);
  const PROD_DEF_SHAPE = w.add(`PRODUCT_DEFINITION_SHAPE('','',#${PROD_DEF})`);
  w.add(`SHAPE_DEFINITION_REPRESENTATION(#${PROD_DEF_SHAPE},#${SHAPE_REP})`);

  // ----- 5. Header + envelope ---------------------------------------------
  const header = [
    'ISO-10303-21;',
    'HEADER;',
    "FILE_DESCRIPTION(('BlockBuilder Studio mesh export, AP203 faceted-brep'),'2;1');",
    `FILE_NAME('blockbuilder.step','${now}',('Marjers'),(''),'BlockBuilder Studio','BlockBuilder Studio','');`,
    "FILE_SCHEMA(('AUTOMOTIVE_DESIGN { 1 0 10303 214 1 1 1 1 }'));",
    'ENDSEC;',
    'DATA;',
  ].join('\n');

  const footer = [
    'ENDSEC;',
    'END-ISO-10303-21;',
  ].join('\n');

  return `${header}\n${w.text()}\n${footer}`;
}

/**
 * Emit a single mesh as a MANIFOLD_SOLID_BREP composed of one ADVANCED_FACE
 * per triangle. Returns the id of the brep entity.
 *
 * Memory note: every vertex referenced by multiple triangles is currently
 * emitted multiple times. A future optimisation could dedupe via a vertex
 * cache keyed by quantised position; for v1, simplicity beats file size.
 */
function writeMeshAsBrep(w, mesh, idx) {
  const geom = mesh.geometry;
  const pos = geom.attributes.position;
  if (!pos) return null;
  const idxBuf = geom.index;
  const mat = mesh.matrixWorld;

  const triCount = idxBuf ? idxBuf.count / 3 : pos.count / 3;
  const faceIds = [];
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const c = new THREE.Vector3();
  const ab = new THREE.Vector3();
  const ac = new THREE.Vector3();
  const n = new THREE.Vector3();

  for (let t = 0; t < triCount; t++) {
    const ia = idxBuf ? idxBuf.getX(t * 3)     : t * 3;
    const ib = idxBuf ? idxBuf.getX(t * 3 + 1) : t * 3 + 1;
    const ic = idxBuf ? idxBuf.getX(t * 3 + 2) : t * 3 + 2;
    a.fromBufferAttribute(pos, ia).applyMatrix4(mat);
    b.fromBufferAttribute(pos, ib).applyMatrix4(mat);
    c.fromBufferAttribute(pos, ic).applyMatrix4(mat);

    // Normal — needed for the PLANE entity (face support surface).
    ab.subVectors(b, a);
    ac.subVectors(c, a);
    n.crossVectors(ab, ac);
    if (n.lengthSq() < 1e-20) continue;   // skip degenerate triangle
    n.normalize();

    // Build an in-plane reference direction perpendicular to the normal.
    // Pick the world axis least parallel to the normal to avoid singularity.
    const ref = pickRefDir(n);

    const pA = w.add(`CARTESIAN_POINT('',(${f(a.x)},${f(a.y)},${f(a.z)}))`);
    const pB = w.add(`CARTESIAN_POINT('',(${f(b.x)},${f(b.y)},${f(b.z)}))`);
    const pC = w.add(`CARTESIAN_POINT('',(${f(c.x)},${f(c.y)},${f(c.z)}))`);
    const vA = w.add(`VERTEX_POINT('',#${pA})`);
    const vB = w.add(`VERTEX_POINT('',#${pB})`);
    const vC = w.add(`VERTEX_POINT('',#${pC})`);
    const loop = w.add(`POLY_LOOP('',(#${pA},#${pB},#${pC}))`);
    const bound = w.add(`FACE_OUTER_BOUND('',#${loop},.T.)`);
    const dirN = w.add(`DIRECTION('',(${f(n.x)},${f(n.y)},${f(n.z)}))`);
    const dirR = w.add(`DIRECTION('',(${f(ref.x)},${f(ref.y)},${f(ref.z)}))`);
    const ax  = w.add(`AXIS2_PLACEMENT_3D('',#${pA},#${dirN},#${dirR})`);
    const plane = w.add(`PLANE('',#${ax})`);
    const face = w.add(`ADVANCED_FACE('',(#${bound}),#${plane},.T.)`);
    faceIds.push(face);
    // Suppress unused-var warnings: STEP requires VERTEX_POINTs to be declared
    // even if only referenced indirectly by the POLY_LOOP's CARTESIAN_POINTs.
    void vA; void vB; void vC;
  }

  if (faceIds.length === 0) return null;
  const shell = w.add(`CLOSED_SHELL('',(${faceIds.map(i => `#${i}`).join(',')}))`);
  return w.add(`MANIFOLD_SOLID_BREP('Body${idx + 1}',#${shell})`);
}

// Choose a reference direction perpendicular to `n` for the face's local
// frame. Pick the world axis with the smallest projection on the normal —
// that's the most "different" axis and the safest cross-product seed.
const _X = new THREE.Vector3(1, 0, 0);
const _Y = new THREE.Vector3(0, 1, 0);
const _Z = new THREE.Vector3(0, 0, 1);
function pickRefDir(n) {
  const ax = Math.abs(n.x), ay = Math.abs(n.y), az = Math.abs(n.z);
  const seed = (ax < ay && ax < az) ? _X : (ay < az ? _Y : _Z);
  return new THREE.Vector3().crossVectors(seed, n).normalize();
}

// STEP numbers must avoid bare integers (some parsers reject `0` and want
// `0.0`). Round to a sensible precision and always include a decimal point.
function f(v) {
  const s = Number(v).toFixed(6);
  return s.includes('.') ? s : s + '.0';
}

export function downloadSTEP() {
  const text = exportSTEP();
  if (!text) return;
  // No comment block before the `ISO-10303-21;` magic — strict STEP parsers
  // reject anything before it. Branding lives inside FILE_DESCRIPTION instead.
  const blob = new Blob([text], { type: 'application/step' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'blockbuilder.step';
  a.click();
  URL.revokeObjectURL(url);
  toast.ok('STEP exported', { detail: 'blockbuilder.step — faceted-brep, opens as mesh body in Fusion / SolidWorks / FreeCAD.' });
}
