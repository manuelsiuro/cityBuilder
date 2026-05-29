import * as THREE from "three";
import type { CityData } from "../sim/CityData";
import type { GameEventBus } from "../sim/events";
import { tileCenterX, tileCenterZ, tileSurfaceY } from "./constants";

/** Render ms the meteor takes to fall from the sky to the impact point. */
const FALL_MS = 720;
/** Render ms the scorch mark lingers and fades after impact. */
const SCORCH_MS = 2800;
/** World height the meteor falls through. */
const FALL_HEIGHT = 30;
/** Horizontal slant of the incoming trajectory (world units across the fall). */
const SLANT = 10;
/** Concurrent meteors — overflow recycles the oldest slot. */
const POOL = 4;

interface Slot {
  active: boolean;
  spawnedAtMs: number;
  x: number;
  z: number;
  groundY: number;
  group: THREE.Group;
  rock: THREE.Mesh;
  trail: THREE.Mesh;
  scorch: THREE.Mesh;
  scorchMat: THREE.MeshBasicMaterial;
}

/**
 * A meteor streaking down from the sky: a tumbling rock with a glowing additive
 * trail that fades in as it falls, then a dark scorch mark that lingers on the
 * ground. Event-driven off `disaster:meteor`; the bright impact pop is left to
 * `ImpactFlashRenderer`.
 */
export class MeteorRenderer {
  readonly group = new THREE.Group();

  private readonly rockGeo: THREE.IcosahedronGeometry;
  private readonly rockMat: THREE.MeshStandardMaterial;
  private readonly trailGeo: THREE.ConeGeometry;
  private readonly trailMat: THREE.MeshBasicMaterial;
  private readonly scorchGeo: THREE.CircleGeometry;
  private readonly slots: Slot[] = [];
  private readonly unsubscribe: Array<() => void> = [];
  private next = 0;

  constructor(events: GameEventBus, private readonly city: CityData) {
    this.rockGeo = new THREE.IcosahedronGeometry(0.42, 0);
    this.rockMat = new THREE.MeshStandardMaterial({
      color: 0x3a2c24,
      emissive: 0xff5a1e,
      emissiveIntensity: 1.4,
      flatShading: true,
    });
    // Trail: an additive cone pointing back up the trajectory.
    this.trailGeo = new THREE.ConeGeometry(0.5, 4.5, 10, 1, true);
    this.trailMat = new THREE.MeshBasicMaterial({
      color: 0xff8a3a,
      transparent: true,
      opacity: 0.7,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
    });
    this.scorchGeo = new THREE.CircleGeometry(1.5, 24);
    this.scorchGeo.rotateX(-Math.PI / 2);

    for (let s = 0; s < POOL; s++) {
      const group = new THREE.Group();
      group.visible = false;
      const rock = new THREE.Mesh(this.rockGeo, this.rockMat);
      const trail = new THREE.Mesh(this.trailGeo, this.trailMat);
      trail.position.y = 2.6; // sit above the rock, tapering upward
      const scorchMat = new THREE.MeshBasicMaterial({
        color: 0x14100d,
        transparent: true,
        opacity: 0,
        depthWrite: false,
      });
      const scorch = new THREE.Mesh(this.scorchGeo, scorchMat);
      scorch.visible = false;
      group.add(rock, trail, scorch);
      this.group.add(group);
      this.slots.push({
        active: false, spawnedAtMs: 0, x: 0, z: 0, groundY: 0,
        group, rock, trail, scorch, scorchMat,
      });
    }

    this.unsubscribe.push(events.on("disaster:meteor", ({ x, y }) => {
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
    slot.group.visible = true;
    slot.rock.visible = true;
    slot.trail.visible = true;
    slot.scorch.visible = false;
  }

  update(timeMs: number): void {
    for (const slot of this.slots) {
      if (!slot.active) continue;
      const age = timeMs - slot.spawnedAtMs;
      if (age < FALL_MS) {
        // Falling: lerp from the slanted sky entry down to the impact point.
        const t = age / FALL_MS;
        slot.group.position.set(
          slot.x + SLANT * (1 - t),
          slot.groundY + FALL_HEIGHT * (1 - t),
          slot.z + SLANT * 0.5 * (1 - t),
        );
        slot.rock.rotation.set(age * 0.02, age * 0.015, 0);
        // Trail brightens as the meteor heats up on descent.
        this.trailMat.opacity = 0.35 + 0.5 * t;
        slot.rock.visible = true;
        slot.trail.visible = true;
        slot.scorch.visible = false;
      } else if (age < FALL_MS + SCORCH_MS) {
        // Impacted: hide the rock, fade the scorch where it landed.
        const t = (age - FALL_MS) / SCORCH_MS;
        slot.group.position.set(slot.x, slot.groundY + 0.04, slot.z);
        slot.rock.visible = false;
        slot.trail.visible = false;
        slot.scorch.visible = true;
        slot.scorchMat.opacity = 0.7 * (1 - t);
      } else {
        slot.active = false;
        slot.group.visible = false;
      }
    }
  }

  dispose(): void {
    this.unsubscribe.forEach((fn) => fn());
    this.rockGeo.dispose();
    this.rockMat.dispose();
    this.trailGeo.dispose();
    this.trailMat.dispose();
    this.scorchGeo.dispose();
    this.slots.forEach((s) => s.scorchMat.dispose());
  }
}
