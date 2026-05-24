import * as THREE from "three";

/** Fixed isometric tilt — angle above the horizon. */
const PITCH = THREE.MathUtils.degToRad(33);
/** Distance of the camera from its target (ortho — affects only clip planes). */
const DISTANCE = 220;
/** Yaw rotation tween speed (higher = snappier). */
const ROT_LERP = 9;

const ZOOM_MIN = 6;
const ZOOM_MAX = 80;

/**
 * Orthographic isometric camera rig. Looks at a ground-plane `target`; supports
 * screen-space panning, zoom, and 90° yaw rotation steps (smoothly tweened).
 * Pure camera maths — input wiring lives elsewhere.
 */
export class IsoCamera {
  readonly camera = new THREE.OrthographicCamera();

  /** Ground-plane point the camera looks at. */
  readonly target = new THREE.Vector3(0, 0, 0);

  /** Half-height of the ortho view in world units — smaller = zoomed in. */
  private zoom = 26;
  /** Discrete 90° rotation step; the rendered yaw tweens toward it. */
  private rotationStep = 0;
  private targetYaw = Math.PI / 4;
  private currentYaw = Math.PI / 4;

  private viewW = 1;
  private viewH = 1;

  // Ground-plane basis for the current yaw, refreshed every update().
  private readonly rightGround = new THREE.Vector3(1, 0, 0);
  private readonly forwardGround = new THREE.Vector3(0, 0, 1);

  private mapBound = { x: 0, z: 0 };

  /** Define the pan clamp region from the map dimensions (in world units). */
  setMapExtent(halfWidth: number, halfHeight: number): void {
    this.mapBound = { x: halfWidth, z: halfHeight };
  }

  setViewport(width: number, height: number): void {
    this.viewW = Math.max(1, width);
    this.viewH = Math.max(1, height);
    this.applyProjection();
  }

  /** Pan by a screen-space drag delta (pixels). */
  panByPixels(dxPixels: number, dyPixels: number): void {
    const worldPerPixel = (2 * this.zoom) / this.viewH;
    this.target.addScaledVector(this.rightGround, -dxPixels * worldPerPixel);
    this.target.addScaledVector(this.forwardGround, dyPixels * worldPerPixel);
    this.clampTarget();
  }

  /** Multiply zoom by `factor` (>1 zooms out). */
  zoomBy(factor: number): void {
    this.zoom = THREE.MathUtils.clamp(this.zoom * factor, ZOOM_MIN, ZOOM_MAX);
    this.applyProjection();
  }

  /** Rotate the view by a quarter turn. `dir` is +1 or -1. */
  rotate(dir: number): void {
    this.rotationStep += Math.sign(dir);
    this.targetYaw = Math.PI / 4 + this.rotationStep * (Math.PI / 2);
  }

  /** Tweened yaw in radians — useful for keeping a HUD compass in sync. */
  getYaw(): number {
    return this.currentYaw;
  }

  /** Advance the rotation tween and reposition the camera. Call every frame. */
  update(dtMs: number): void {
    const t = Math.min(1, (dtMs / 1000) * ROT_LERP);
    this.currentYaw += (this.targetYaw - this.currentYaw) * t;

    const yaw = this.currentYaw;
    this.forwardGround.set(-Math.sin(yaw), 0, -Math.cos(yaw));
    this.rightGround.set(Math.cos(yaw), 0, -Math.sin(yaw));

    const horiz = Math.cos(PITCH) * DISTANCE;
    this.camera.position.set(
      this.target.x - this.forwardGround.x * horiz,
      this.target.y + Math.sin(PITCH) * DISTANCE,
      this.target.z - this.forwardGround.z * horiz,
    );
    this.camera.up.set(0, 1, 0);
    this.camera.lookAt(this.target);
  }

  private applyProjection(): void {
    const aspect = this.viewW / this.viewH;
    const z = this.zoom;
    this.camera.left = -z * aspect;
    this.camera.right = z * aspect;
    this.camera.top = z;
    this.camera.bottom = -z;
    this.camera.near = 1;
    this.camera.far = DISTANCE * 2 + 200;
    this.camera.updateProjectionMatrix();
  }

  private clampTarget(): void {
    const pad = 4;
    this.target.x = THREE.MathUtils.clamp(
      this.target.x,
      -this.mapBound.x - pad,
      this.mapBound.x + pad,
    );
    this.target.z = THREE.MathUtils.clamp(
      this.target.z,
      -this.mapBound.z - pad,
      this.mapBound.z + pad,
    );
  }
}
