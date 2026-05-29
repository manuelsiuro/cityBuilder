import * as THREE from "three";
import type { CityData } from "../sim/CityData";
import type { GameEventBus } from "../sim/events";
import { tileCenterX, tileCenterZ, tileSurfaceY } from "./constants";

/** How long, in render ms, a flash lives from spawn to full fade. */
const FLASH_LIFE_MS = 900;
/** Hard cap on simultaneous flashes — overflow simply discards the oldest. */
const MAX_FLASHES = 32;

interface Flash {
  worldX: number;
  worldY: number;
  worldZ: number;
  spawnedAtMs: number;
  /** 0 = white meteor flash, 2 = orange plane crash (1 reserved). */
  kind: 0 | 1 | 2;
}

const KIND_COLORS = [0xfff4d0, 0xffe04a, 0xff8a3a];

/**
 * Renders the brief light flash left at the impact point of a meteor or plane
 * crash. Subscribes to the matching events on `World.events` and owns its own
 * lifetime — flashes auto-expire. The falling bodies themselves and lightning
 * bolts are drawn by their dedicated renderers.
 */
export class ImpactFlashRenderer {
  readonly group = new THREE.Group();

  private readonly mesh: THREE.InstancedMesh;
  private readonly geometry: THREE.CircleGeometry;
  private readonly material: THREE.MeshBasicMaterial;
  private readonly capacity = MAX_FLASHES;
  private readonly dummy = new THREE.Object3D();
  private readonly tint = new THREE.Color();
  private readonly flashes: Flash[] = [];
  private readonly unsubscribe: Array<() => void> = [];

  constructor(events: GameEventBus, private readonly city: CityData) {
    this.geometry = new THREE.CircleGeometry(2.0, 28);
    this.geometry.rotateX(-Math.PI / 2);
    this.material = new THREE.MeshBasicMaterial({
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    this.mesh = new THREE.InstancedMesh(this.geometry, this.material, this.capacity);
    this.mesh.count = 0;
    this.mesh.frustumCulled = false;
    this.group.add(this.mesh);

    this.unsubscribe.push(events.on("disaster:meteor", ({ x, y }) => {
      this.spawnAt(x, y, 0);
    }));
    this.unsubscribe.push(events.on("disaster:planeCrash", ({ x, y }) => {
      this.spawnAt(x, y, 2);
    }));
  }

  private spawnAt(x: number, y: number, kind: 0 | 1 | 2): void {
    if (!this.city.grid.inBounds(x, y)) return;
    const i = this.city.grid.index(x, y);
    const f: Flash = {
      worldX: tileCenterX(x, this.city.grid),
      worldY: tileSurfaceY(this.city, i),
      worldZ: tileCenterZ(y, this.city.grid),
      spawnedAtMs: performance.now(),
      kind,
    };
    if (this.flashes.length >= this.capacity) this.flashes.shift();
    this.flashes.push(f);
  }

  /** Re-place active flashes; cull expired ones. Call each render frame. */
  update(timeMs: number): void {
    // Prune expired flashes from the front.
    while (this.flashes.length > 0 &&
      timeMs - this.flashes[0].spawnedAtMs > FLASH_LIFE_MS) {
      this.flashes.shift();
    }
    let n = 0;
    for (const f of this.flashes) {
      const age = (timeMs - f.spawnedAtMs) / FLASH_LIFE_MS;
      if (age >= 1) continue;
      // Bright early, fades quickly, ring expands.
      const intensity = 1 - age;
      const ringScale = 0.4 + age * 1.6;
      this.dummy.position.set(f.worldX, f.worldY + 0.05, f.worldZ);
      this.dummy.scale.set(ringScale, 1, ringScale);
      this.dummy.rotation.set(0, 0, 0);
      this.dummy.updateMatrix();
      this.mesh.setMatrixAt(n, this.dummy.matrix);
      this.mesh.setColorAt(n,
        this.tint.setHex(KIND_COLORS[f.kind]).multiplyScalar(intensity));
      n++;
    }
    this.mesh.count = n;
    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }

  dispose(): void {
    this.unsubscribe.forEach((fn) => fn());
    this.geometry.dispose();
    this.material.dispose();
  }
}
