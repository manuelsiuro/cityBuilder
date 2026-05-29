import * as THREE from "three";
import type { CityData } from "../sim/CityData";
import type { GameEventBus } from "../sim/events";
import type { IsoCamera } from "./IsoCamera";
import { tileCenterX, tileCenterZ, tileSurfaceY } from "./constants";

/** Render ms a crack set takes to open, linger, and close. */
const CRACK_MS = 2600;
/** Camera-shake duration / amplitude (world units). */
const SHAKE_MS = 900;
const SHAKE_AMP = 1.6;
/** Cracks spawned per quake. */
const CRACKS = 9;
/** Max simultaneous quakes' cracks on screen. */
const MAX_SETS = 3;

interface CrackSet {
  x: number;
  z: number;
  groundY: number;
  spawnedAtMs: number;
  /** Per-crack [angle, length] baked at spawn. */
  cracks: number[];
}

/**
 * Earthquake feedback: a decaying camera shake plus dark fissures that tear
 * open across the ground around the epicentre and slowly close again. Driven by
 * `disaster:earthquake`. Cracks fade by narrowing to nothing (a dark mark can't
 * fade via additive blending), which reads as the ground settling.
 */
export class EarthquakeRenderer {
  readonly group = new THREE.Group();

  private readonly mesh: THREE.InstancedMesh;
  private readonly geometry: THREE.PlaneGeometry;
  private readonly material: THREE.MeshBasicMaterial;
  private readonly dummy = new THREE.Object3D();
  private readonly sets: CrackSet[] = [];
  private readonly unsubscribe: Array<() => void> = [];

  constructor(
    events: GameEventBus,
    private readonly city: CityData,
    private readonly camera: IsoCamera,
  ) {
    this.geometry = new THREE.PlaneGeometry(1, 1);
    this.geometry.rotateX(-Math.PI / 2);
    this.material = new THREE.MeshBasicMaterial({
      color: 0x140f0b,
      transparent: true,
      opacity: 0.8,
      depthWrite: false,
    });
    this.mesh = new THREE.InstancedMesh(this.geometry, this.material, MAX_SETS * CRACKS);
    this.mesh.count = 0;
    this.mesh.frustumCulled = false;
    this.group.add(this.mesh);

    this.unsubscribe.push(events.on("disaster:earthquake", ({ x, y }) => {
      this.spawn(x, y);
    }));
  }

  private spawn(tx: number, ty: number): void {
    const { grid } = this.city;
    if (!grid.inBounds(tx, ty)) return;
    this.camera.shake(SHAKE_MS, SHAKE_AMP);
    if (this.sets.length >= MAX_SETS) this.sets.shift();
    const cracks: number[] = [];
    for (let c = 0; c < CRACKS; c++) {
      cracks.push(Math.random() * Math.PI * 2, 2.5 + Math.random() * 4);
    }
    this.sets.push({
      x: tileCenterX(tx, grid),
      z: tileCenterZ(ty, grid),
      groundY: tileSurfaceY(this.city, grid.index(tx, ty)),
      spawnedAtMs: performance.now(),
      cracks,
    });
  }

  update(timeMs: number): void {
    while (this.sets.length > 0 && timeMs - this.sets[0].spawnedAtMs > CRACK_MS) {
      this.sets.shift();
    }
    let n = 0;
    for (const set of this.sets) {
      const age = (timeMs - set.spawnedAtMs) / CRACK_MS;
      // Open fast (first 15%), then narrow to nothing over the remainder.
      const open = Math.min(1, age / 0.15);
      const close = age < 0.15 ? 1 : 1 - (age - 0.15) / 0.85;
      for (let c = 0; c < set.cracks.length; c += 2) {
        const angle = set.cracks[c];
        const length = set.cracks[c + 1] * open;
        const mid = length / 2;
        this.dummy.position.set(
          set.x + Math.cos(angle) * mid,
          set.groundY + 0.05,
          set.z + Math.sin(angle) * mid,
        );
        this.dummy.rotation.set(0, -angle, 0);
        this.dummy.scale.set(length, 1, 0.28 * close);
        this.dummy.updateMatrix();
        this.mesh.setMatrixAt(n, this.dummy.matrix);
        n++;
      }
    }
    this.mesh.count = n;
    this.mesh.instanceMatrix.needsUpdate = true;
  }

  dispose(): void {
    this.unsubscribe.forEach((fn) => fn());
    this.mesh.dispose();
    this.geometry.dispose();
    this.material.dispose();
  }
}
