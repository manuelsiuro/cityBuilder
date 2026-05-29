import * as THREE from "three";
import type { CityData } from "../sim/CityData";
import type { GameEventBus } from "../sim/events";
import { tileCenterX, tileCenterZ, tileSurfaceY } from "./constants";

/** Render ms the plane takes to dive from the sky to the crash point. */
const DIVE_MS = 1100;
/** Render ms the smoke plume rises and fades after impact. */
const SMOKE_MS = 2600;
/** World height the plane starts above the ground. */
const DIVE_HEIGHT = 22;
/** Horizontal run-in of the approach (world units). */
const APPROACH = 26;
/** Smoke puffs per crash. */
const PUFFS = 7;
/** Concurrent crashes — overflow recycles the oldest slot. */
const POOL = 3;

interface Slot {
  active: boolean;
  spawnedAtMs: number;
  x: number;
  z: number;
  groundY: number;
  dirX: number;
  dirZ: number;
  group: THREE.Group;
  plane: THREE.Group;
  smoke: THREE.Group;
  smokeMat: THREE.MeshBasicMaterial;
  puffSeed: number[];
}

/** Build a chunky low-poly airliner pointing along +X, centred at the origin. */
function buildPlane(body: THREE.Material, accent: THREE.Material): THREE.Group {
  const g = new THREE.Group();
  const fuselage = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.5, 0.5), body);
  const nose = new THREE.Mesh(new THREE.ConeGeometry(0.28, 0.7, 8), body);
  nose.rotation.z = -Math.PI / 2;
  nose.position.x = 1.3;
  const wing = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.1, 2.6), accent);
  const tailWing = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.08, 1.1), accent);
  tailWing.position.x = -0.9;
  const fin = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.6, 0.08), accent);
  fin.position.set(-0.9, 0.35, 0);
  g.add(fuselage, nose, wing, tailWing, fin);
  return g;
}

/**
 * A doomed airliner diving out of the sky into the city, trailing a banking
 * descent, then a dark smoke plume rising from the wreck. Event-driven off
 * `disaster:planeCrash`; the impact flash itself is left to
 * `ImpactFlashRenderer`.
 */
export class PlaneCrashRenderer {
  readonly group = new THREE.Group();

  private readonly bodyMat: THREE.MeshStandardMaterial;
  private readonly accentMat: THREE.MeshStandardMaterial;
  private readonly puffGeo: THREE.SphereGeometry;
  private readonly slots: Slot[] = [];
  private readonly unsubscribe: Array<() => void> = [];
  private next = 0;

  constructor(events: GameEventBus, private readonly city: CityData) {
    this.bodyMat = new THREE.MeshStandardMaterial({ color: 0xe6e9ef, flatShading: true });
    this.accentMat = new THREE.MeshStandardMaterial({ color: 0xb33a3a, flatShading: true });
    this.puffGeo = new THREE.SphereGeometry(0.6, 8, 6);

    for (let s = 0; s < POOL; s++) {
      const group = new THREE.Group();
      group.visible = false;
      const plane = buildPlane(this.bodyMat, this.accentMat);
      const smoke = new THREE.Group();
      const smokeMat = new THREE.MeshBasicMaterial({
        color: 0x2a2a2e,
        transparent: true,
        opacity: 0,
        depthWrite: false,
      });
      const puffSeed: number[] = [];
      for (let p = 0; p < PUFFS; p++) {
        const puff = new THREE.Mesh(this.puffGeo, smokeMat);
        smoke.add(puff);
        // Deterministic per-puff spread / drift, baked once.
        puffSeed.push(Math.random(), Math.random(), Math.random());
      }
      group.add(plane, smoke);
      this.group.add(group);
      this.slots.push({
        active: false, spawnedAtMs: 0, x: 0, z: 0, groundY: 0, dirX: 1, dirZ: 0,
        group, plane, smoke, smokeMat, puffSeed,
      });
    }

    this.unsubscribe.push(events.on("disaster:planeCrash", ({ x, y }) => {
      this.spawn(x, y);
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
    slot.groundY = tileSurfaceY(this.city, grid.index(tx, ty));
    // Approach from a fixed compass-ish heading, varied a touch per crash.
    const a = (grid.x(grid.index(tx, ty)) * 0.7 + ty * 1.3);
    slot.dirX = Math.cos(a);
    slot.dirZ = Math.sin(a);
    slot.group.visible = true;
    slot.plane.visible = true;
  }

  update(timeMs: number): void {
    for (const slot of this.slots) {
      if (!slot.active) continue;
      const age = timeMs - slot.spawnedAtMs;
      if (age < DIVE_MS) {
        // Diving: lerp in from the slanted approach down to the crash point.
        const t = age / DIVE_MS;
        const e = 1 - t;
        const px = slot.x + slot.dirX * APPROACH * e;
        const pz = slot.z + slot.dirZ * APPROACH * e;
        const py = slot.groundY + DIVE_HEIGHT * e * e; // accelerating fall
        slot.plane.position.set(px, py, pz);
        // Point the nose down its trajectory and roll as it loses control.
        slot.plane.rotation.set(0, -Math.atan2(slot.dirZ, slot.dirX), -0.5 - t * 0.9);
        slot.plane.visible = true;
        slot.smokeMat.opacity = 0;
      } else if (age < DIVE_MS + SMOKE_MS) {
        // Crashed: hide the plane, billow smoke up from the wreck.
        const t = (age - DIVE_MS) / SMOKE_MS;
        slot.plane.visible = false;
        slot.smokeMat.opacity = 0.6 * (1 - t);
        const puffs = slot.smoke.children;
        for (let p = 0; p < puffs.length; p++) {
          const sx = slot.puffSeed[p * 3] - 0.5;
          const sz = slot.puffSeed[p * 3 + 1] - 0.5;
          const rise = slot.puffSeed[p * 3 + 2];
          const puff = puffs[p];
          puff.position.set(
            slot.x + sx * 2.2 * (0.4 + t),
            slot.groundY + 0.4 + (1.5 + rise * 3) * t,
            slot.z + sz * 2.2 * (0.4 + t),
          );
          const sc = 0.5 + t * (1.2 + rise);
          puff.scale.setScalar(sc);
        }
      } else {
        slot.active = false;
        slot.group.visible = false;
      }
    }
  }

  dispose(): void {
    this.unsubscribe.forEach((fn) => fn());
    this.bodyMat.dispose();
    this.accentMat.dispose();
    this.puffGeo.dispose();
    this.slots.forEach((s) => s.smokeMat.dispose());
    // Dispose the per-part geometries created in buildPlane.
    this.slots.forEach((s) => s.plane.traverse((o) => {
      if (o instanceof THREE.Mesh) o.geometry.dispose();
    }));
  }
}
