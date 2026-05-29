import * as THREE from "three";
import type { CityData } from "../sim/CityData";
import type { GameEventBus } from "../sim/events";
import { WATER_Y, tileCenterX, tileCenterZ } from "./constants";

/** Render ms the wavefront takes to expand and dissipate. */
const WAVE_MS = 1600;
/** World radius the ring expands to. */
const MAX_RADIUS = 14;
/** Concurrent waves — overflow recycles the oldest slot. */
const POOL = 2;

interface Slot {
  active: boolean;
  spawnedAtMs: number;
  x: number;
  z: number;
  mesh: THREE.Mesh;
  material: THREE.MeshBasicMaterial;
}

/**
 * The advancing wavefront of a tsunami: a bright crest ring that surges out
 * from the coast entry point and dissipates, layered over the flood water that
 * `FloodRenderer` fills in. Driven by `disaster:tsunami`.
 */
export class TsunamiWaveRenderer {
  readonly group = new THREE.Group();

  private readonly geometry: THREE.RingGeometry;
  private readonly slots: Slot[] = [];
  private readonly unsubscribe: Array<() => void> = [];
  private next = 0;

  constructor(events: GameEventBus, private readonly city: CityData) {
    // Unit ring (inner 0.82, outer 1.0) laid flat; scaled up per frame.
    this.geometry = new THREE.RingGeometry(0.82, 1.0, 48);
    this.geometry.rotateX(-Math.PI / 2);

    for (let s = 0; s < POOL; s++) {
      const material = new THREE.MeshBasicMaterial({
        color: 0xbfe4ff,
        transparent: true,
        opacity: 0,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        side: THREE.DoubleSide,
      });
      const mesh = new THREE.Mesh(this.geometry, material);
      mesh.visible = false;
      this.group.add(mesh);
      this.slots.push({ active: false, spawnedAtMs: 0, x: 0, z: 0, mesh, material });
    }

    this.unsubscribe.push(events.on("disaster:tsunami", ({ fromX, fromY }) => {
      this.spawn(fromX, fromY);
    }));
  }

  private spawn(tx: number, ty: number): void {
    const { grid } = this.city;
    if (!grid.inBounds(tx, ty)) return;
    const slot = this.slots[this.next];
    this.next = (this.next + 1) % POOL;
    slot.active = true;
    slot.spawnedAtMs = performance.now();
    slot.x = tileCenterX(tx, grid);
    slot.z = tileCenterZ(ty, grid);
    slot.mesh.position.set(slot.x, WATER_Y + 0.08, slot.z);
    slot.mesh.visible = true;
  }

  update(timeMs: number): void {
    for (const slot of this.slots) {
      if (!slot.active) continue;
      const t = (timeMs - slot.spawnedAtMs) / WAVE_MS;
      if (t >= 1) {
        slot.active = false;
        slot.mesh.visible = false;
        continue;
      }
      // Ring grows out from the entry point; crest brightens then fades.
      const r = 1 + t * MAX_RADIUS;
      slot.mesh.scale.set(r, 1, r);
      slot.material.opacity = 0.85 * Math.sin(Math.PI * t); // 0 → peak → 0
    }
  }

  dispose(): void {
    this.unsubscribe.forEach((fn) => fn());
    this.geometry.dispose();
    this.slots.forEach((s) => s.material.dispose());
  }
}
