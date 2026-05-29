import * as THREE from "three";
import type { CityData } from "../sim/CityData";
import type { GameEventBus } from "../sim/events";
import { tileCenterX, tileCenterZ, tileSurfaceY } from "./constants";

/** Render ms a bolt stays lit before it fades out. */
const BOLT_MS = 280;
/** Vertical reach of a bolt above the ground. */
const BOLT_HEIGHT = 16;
/** Segments per bolt — more = more jagged. */
const SEGMENTS = 5;
/** Max simultaneous bolts (a storm drops up to ~10). */
const MAX_BOLTS = 12;

interface Bolt {
  x: number;
  z: number;
  groundY: number;
  spawnedAtMs: number;
  /** Per-segment horizontal jitter, baked at spawn: [dx0,dz0, dx1,dz1, ...]. */
  jitter: number[];
}

/**
 * Sky-to-ground lightning bolts, one per struck tile. Each bolt is a jagged
 * column of additive segments that flashes bright then fades. Driven by
 * `disaster:lightning`, which carries the struck tiles. Per-instance colour
 * dimming does the fade (additive → dark = invisible).
 */
export class LightningRenderer {
  readonly group = new THREE.Group();

  private readonly mesh: THREE.InstancedMesh;
  private readonly geometry: THREE.CylinderGeometry;
  private readonly material: THREE.MeshBasicMaterial;
  private readonly dummy = new THREE.Object3D();
  private readonly tint = new THREE.Color();
  private readonly core = new THREE.Color(0xdff0ff);
  private readonly bolts: Bolt[] = [];
  private readonly unsubscribe: Array<() => void> = [];

  constructor(events: GameEventBus, private readonly city: CityData) {
    // Unit-height cylinder along Y; scaled per segment.
    this.geometry = new THREE.CylinderGeometry(0.06, 0.06, 1, 5);
    this.material = new THREE.MeshBasicMaterial({
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    this.mesh = new THREE.InstancedMesh(this.geometry, this.material, MAX_BOLTS * SEGMENTS);
    this.mesh.count = 0;
    this.mesh.frustumCulled = false;
    this.group.add(this.mesh);

    this.unsubscribe.push(events.on("disaster:lightning", ({ tiles }) => {
      this.spawn(tiles);
    }));
  }

  private spawn(tiles: number[]): void {
    const { grid } = this.city;
    const now = performance.now();
    for (const i of tiles) {
      if (this.bolts.length >= MAX_BOLTS) this.bolts.shift();
      const jitter: number[] = [];
      for (let s = 0; s < SEGMENTS; s++) {
        jitter.push((Math.random() * 2 - 1) * 0.8, (Math.random() * 2 - 1) * 0.8);
      }
      this.bolts.push({
        x: tileCenterX(grid.x(i), grid),
        z: tileCenterZ(grid.y(i), grid),
        groundY: tileSurfaceY(this.city, i),
        spawnedAtMs: now,
        jitter,
      });
    }
  }

  update(timeMs: number): void {
    // Drop expired bolts from the front (oldest first).
    while (this.bolts.length > 0 && timeMs - this.bolts[0].spawnedAtMs > BOLT_MS) {
      this.bolts.shift();
    }
    let n = 0;
    const segH = BOLT_HEIGHT / SEGMENTS;
    for (const b of this.bolts) {
      const age = (timeMs - b.spawnedAtMs) / BOLT_MS;
      // Bright flicker that decays — a couple of strobes before it dies.
      const intensity = (1 - age) * (0.6 + 0.4 * Math.abs(Math.sin(age * 18)));
      let prevX = b.x;
      let prevZ = b.z;
      for (let s = 0; s < SEGMENTS; s++) {
        const y0 = b.groundY + s * segH;
        const x1 = b.x + b.jitter[s * 2] * (1 - s / SEGMENTS);
        const z1 = b.z + b.jitter[s * 2 + 1] * (1 - s / SEGMENTS);
        // Place a segment between (prevX, y0) and (x1, y0+segH).
        const mx = (prevX + x1) / 2;
        const mz = (prevZ + z1) / 2;
        const my = y0 + segH / 2;
        const dx = x1 - prevX;
        const dz = z1 - prevZ;
        const len = Math.hypot(dx, segH, dz);
        this.dummy.position.set(mx, my, mz);
        this.dummy.scale.set(1, len, 1);
        // Tilt the segment to span the jittered endpoints.
        this.dummy.quaternion.setFromUnitVectors(
          UP,
          TMP.set(dx, segH, dz).normalize(),
        );
        this.dummy.updateMatrix();
        this.mesh.setMatrixAt(n, this.dummy.matrix);
        this.mesh.setColorAt(n, this.tint.copy(this.core).multiplyScalar(Math.max(0, intensity)));
        n++;
        prevX = x1;
        prevZ = z1;
      }
    }
    this.mesh.count = n;
    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }

  dispose(): void {
    this.unsubscribe.forEach((fn) => fn());
    this.mesh.dispose();
    this.geometry.dispose();
    this.material.dispose();
  }
}

const UP = new THREE.Vector3(0, 1, 0);
const TMP = new THREE.Vector3();
