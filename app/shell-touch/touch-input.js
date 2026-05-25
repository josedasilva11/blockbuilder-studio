// Touch + Pencil input controller for the iPad/tablet shell.
//
// Replaces three.js OrbitControls (mouse-only) with a multi-pointer router
// that handles touch, Apple Pencil, and mouse uniformly via the Pointer
// Events API. The viewport canvas is the event target.
//
// Gestures (Phase 0 spike, may evolve):
//   1 pointer drag       -> orbit camera around target
//   2 pointers pinch     -> dolly (zoom in/out)
//   2 pointers drag      -> pan (camera + target together)
//   single tap           -> emit 'tap' with hit position
//   long press (>500ms)  -> emit 'longpress' with hit position
//   pencil hover         -> emit 'hover' (iPad Pro M2+, pointerType==='pen')
//
// The controller doesn't know about shapes or selection. It dispatches
// CustomEvents that the touch shell or tools listen to. Keeps the input
// layer reusable.

import * as THREE from 'three';

const ORBIT_SPEED  = 0.005;
const PAN_SPEED    = 0.4;
const DOLLY_SPEED  = 0.01;
const LONGPRESS_MS = 500;
const TAP_MAX_PX   = 8;     // movement above this cancels the tap
const TAP_MAX_MS   = 300;   // hold longer than this is not a tap

export class TouchInputController extends EventTarget {
  /**
   * @param {THREE.PerspectiveCamera} camera
   * @param {HTMLElement} domElement - the canvas (or wrapper) receiving events
   * @param {THREE.Vector3} [target] - point the camera orbits around
   */
  constructor(camera, domElement, target = new THREE.Vector3(0, 0, 10)) {
    super();
    this.camera = camera;
    this.dom    = domElement;
    this.target = target;
    this.enabled = true;

    // Per-pointer state, keyed by event.pointerId. Each entry tracks the
    // pointer's lifecycle (down position, last move, type) so we can detect
    // gestures from any combination of active pointers.
    this.pointers = new Map();

    // Tap / longpress detection on the most recently started single pointer
    this._pressStart = null;
    this._longPressTimer = null;

    // Gesture state machine. We commit to a gesture on the second move event
    // to avoid jitter triggering things. Possible values:
    //   'idle' | 'orbiting' | 'panning' | 'dollying'
    this._gesture = 'idle';
    this._gestureStartDist = 0;
    this._gestureStartMid  = { x: 0, y: 0 };

    this._spherical = new THREE.Spherical();
    this._panOffset = new THREE.Vector3();

    this._bind();
  }

  _bind() {
    const opts = { passive: false };
    this.dom.addEventListener('pointerdown',  this._onDown.bind(this), opts);
    this.dom.addEventListener('pointermove',  this._onMove.bind(this), opts);
    this.dom.addEventListener('pointerup',    this._onUp.bind(this),   opts);
    this.dom.addEventListener('pointercancel',this._onUp.bind(this),   opts);
    // Hover events from Apple Pencil (M2+) or mouse. No pointerId for hover
    // in some browsers; we don't track it in the pointers map.
    this.dom.addEventListener('pointerenter', this._onHoverEnter.bind(this));
    this.dom.addEventListener('pointerleave', this._onHoverLeave.bind(this));
    // Block default browser gestures (pull-to-refresh, accidental zoom).
    this.dom.style.touchAction = 'none';
  }

  _onDown(ev) {
    if (!this.enabled) return;
    this.dom.setPointerCapture?.(ev.pointerId);
    ev.preventDefault();

    const p = {
      id: ev.pointerId,
      type: ev.pointerType,       // 'mouse' | 'pen' | 'touch'
      startX: ev.clientX,
      startY: ev.clientY,
      x: ev.clientX,
      y: ev.clientY,
      startTime: performance.now(),
      moved: false,
    };
    this.pointers.set(ev.pointerId, p);

    // Tap / longpress applies only when exactly one pointer is down.
    if (this.pointers.size === 1) {
      this._pressStart = p;
      this._longPressTimer = setTimeout(() => {
        const press = this._pressStart;
        if (!press || press.moved) return;
        this._emit('longpress', { x: press.x, y: press.y, pointerType: press.type, pointerId: press.id });
        this._pressStart = null;
      }, LONGPRESS_MS);
    } else {
      // Second pointer cancels tap/longpress; we're in a gesture now.
      clearTimeout(this._longPressTimer);
      this._pressStart = null;
      this._startTwoPointerGesture();
    }
  }

  _onMove(ev) {
    if (!this.enabled) return;
    const p = this.pointers.get(ev.pointerId);

    // Hover-without-press (Apple Pencil hover, mouse hover): no entry in
    // pointers map, just emit a hover event.
    if (!p) {
      if (ev.pointerType === 'pen' || ev.pointerType === 'mouse') {
        this._emit('hover', { x: ev.clientX, y: ev.clientY, pointerType: ev.pointerType });
      }
      return;
    }
    ev.preventDefault();

    const dx = ev.clientX - p.x;
    const dy = ev.clientY - p.y;
    p.x = ev.clientX;
    p.y = ev.clientY;

    // Mark this pointer as moved if displacement exceeded TAP_MAX_PX.
    const totalDx = ev.clientX - p.startX;
    const totalDy = ev.clientY - p.startY;
    if (Math.hypot(totalDx, totalDy) > TAP_MAX_PX) {
      p.moved = true;
    }

    if (this.pointers.size === 1) {
      this._orbit(dx, dy);
    } else if (this.pointers.size === 2) {
      this._handleTwoPointerMove();
    }
  }

  _onUp(ev) {
    if (!this.enabled) return;
    const p = this.pointers.get(ev.pointerId);
    this.pointers.delete(ev.pointerId);
    this.dom.releasePointerCapture?.(ev.pointerId);
    if (!p) return;

    // Tap detection: single pointer, didn't move much, short duration.
    if (this._pressStart && this._pressStart.id === p.id) {
      clearTimeout(this._longPressTimer);
      const dt = performance.now() - p.startTime;
      const dist = Math.hypot(p.x - p.startX, p.y - p.startY);
      if (!p.moved && dist < TAP_MAX_PX && dt < TAP_MAX_MS) {
        this._emit('tap', { x: p.x, y: p.y, pointerType: p.type, pointerId: p.id });
      }
      this._pressStart = null;
    }

    if (this.pointers.size < 2) {
      this._gesture = 'idle';
    }
  }

  _onHoverEnter(ev) {
    if (ev.pointerType === 'pen' || ev.pointerType === 'mouse') {
      this._emit('hover', { x: ev.clientX, y: ev.clientY, pointerType: ev.pointerType });
    }
  }
  _onHoverLeave() {
    this._emit('hoverend', {});
  }

  // ----- gesture logic -----

  _orbit(dx, dy) {
    // Spherical coords around target.
    const offset = new THREE.Vector3().subVectors(this.camera.position, this.target);
    this._spherical.setFromVector3(offset);
    this._spherical.theta -= dx * ORBIT_SPEED;
    this._spherical.phi   -= dy * ORBIT_SPEED;
    this._spherical.phi = Math.max(0.05, Math.min(Math.PI - 0.05, this._spherical.phi));
    offset.setFromSpherical(this._spherical);
    this.camera.position.copy(this.target).add(offset);
    this.camera.lookAt(this.target);
    this._emit('change', {});
  }

  _startTwoPointerGesture() {
    const [a, b] = [...this.pointers.values()];
    this._gestureStartDist = Math.hypot(a.x - b.x, a.y - b.y);
    this._gestureStartMid  = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
  }

  _handleTwoPointerMove() {
    const [a, b] = [...this.pointers.values()];
    const dist  = Math.hypot(a.x - b.x, a.y - b.y);
    const mid   = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
    const dDist = dist - this._gestureStartDist;
    const dMid  = { x: mid.x - this._gestureStartMid.x, y: mid.y - this._gestureStartMid.y };

    // Heuristic: if the midpoint moved more than 6 px AND the distance
    // delta is below 12 px, we're panning. Otherwise we treat as dolly
    // (pinch). Realistic two-finger gestures usually do both at once,
    // so we apply both per frame.
    if (Math.abs(dDist) > 1) {
      this._dolly(-dDist * DOLLY_SPEED);
    }
    if (Math.hypot(dMid.x, dMid.y) > 1) {
      this._pan(dMid.x, dMid.y);
    }
    this._gestureStartDist = dist;
    this._gestureStartMid  = mid;
  }

  _dolly(amount) {
    const dir = new THREE.Vector3().subVectors(this.camera.position, this.target).normalize();
    const dist = this.camera.position.distanceTo(this.target);
    const newDist = Math.max(10, Math.min(2000, dist * (1 + amount)));
    this.camera.position.copy(this.target).add(dir.multiplyScalar(newDist));
    this._emit('change', {});
  }

  _pan(dx, dy) {
    // Pan in the camera's local frame, scaled by depth so a 1-px finger
    // motion moves the world by roughly the same number of world units
    // regardless of zoom.
    const offset = new THREE.Vector3().subVectors(this.camera.position, this.target);
    const distance = offset.length();
    const targetHalfH = Math.tan((this.camera.fov / 2) * Math.PI / 180) * distance;
    const targetHalfW = targetHalfH * this.camera.aspect;
    const right = new THREE.Vector3().setFromMatrixColumn(this.camera.matrix, 0);
    const up    = new THREE.Vector3().setFromMatrixColumn(this.camera.matrix, 1);
    const moveX = right.multiplyScalar(-dx * (2 * targetHalfW / this.dom.clientWidth));
    const moveY = up.multiplyScalar(   dy * (2 * targetHalfH / this.dom.clientHeight));
    const move = new THREE.Vector3().add(moveX).add(moveY);
    this.camera.position.add(move);
    this.target.add(move);
    this._emit('change', {});
  }

  // ----- helpers -----

  _emit(name, detail) {
    this.dispatchEvent(new CustomEvent(name, { detail }));
  }

  dispose() {
    this.pointers.clear();
    clearTimeout(this._longPressTimer);
    // We rely on dom node removal to detach listeners. Fine for the spike;
    // tighten if we mount/unmount the controller dynamically.
  }
}
