import * as THREE from "three";
import type { CityData } from "../sim/CityData";
import { Zone } from "../sim/layers";
import { MAX_BUILD_LEVEL } from "../sim/development";
import { createBuildingGeometry, BUILDING_VARIANTS } from "./meshlib/buildingFactory";
import { tileCenterX, tileCenterZ, tileSurfaceY } from "./constants";

const ZONES = [Zone.Residential, Zone.Commercial, Zone.Industrial] as const;
const ARCHETYPES = ZONES.length * MAX_BUILD_LEVEL * BUILDING_VARIANTS;

/**
 * Renders developed zone buildings as instanced low-poly meshes — one
 * `InstancedMesh` per (zone × level) archetype. Meshes are re-sized to the
 * exact building count on each rebuild, keeping GPU memory tight. Per-instance
 * rotation, scale and brightness give a varied skyline from shared geometry.
 */
export class BuildingInstances {
  readonly group = new THREE.Group();

  private readonly material: THREE.MeshStandardMaterial;
  private readonly geometries: THREE.BufferGeometry[] = [];
  private readonly meshes: (THREE.InstancedMesh | null)[] = new Array(ARCHETYPES).fill(null);
  private readonly dummy = new THREE.Object3D();
  private readonly tint = new THREE.Color();

  constructor() {
    this.material = new THREE.MeshStandardMaterial({
      vertexColors: true,
      roughness: 0.82,
      flatShading: true,
    });
    for (let z = 0; z < ZONES.length; z++) {
      for (let level = 1; level <= MAX_BUILD_LEVEL; level++) {
        for (let v = 0; v < BUILDING_VARIANTS; v++) {
          this.geometries.push(createBuildingGeometry(ZONES[z], level, v));
        }
      }
    }
  }

  /** Re-place every building from the current city state. */
  rebuild(city: CityData): void {
    const { grid } = city;

    const counts = new Array(ARCHETYPES).fill(0);
    for (let i = 0; i < grid.size; i++) {
      const key = archetypeKey(city, i);
      if (key >= 0) counts[key]++;
    }

    for (let k = 0; k < ARCHETYPES; k++) {
      const old = this.meshes[k];
      if (old) {
        this.group.remove(old);
        old.dispose();
      }
      if (counts[k] === 0) {
        this.meshes[k] = null;
        continue;
      }
      const mesh = new THREE.InstancedMesh(this.geometries[k], this.material, counts[k]);
      mesh.frustumCulled = false;
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      this.meshes[k] = mesh;
      this.group.add(mesh);
    }

    const cursor = new Array(ARCHETYPES).fill(0);
    for (let i = 0; i < grid.size; i++) {
      const key = archetypeKey(city, i);
      if (key < 0) continue;
      const mesh = this.meshes[key]!;
      const tx = grid.x(i);
      const ty = grid.y(i);
      const h = hash(tx, ty);

      this.dummy.position.set(
        tileCenterX(tx, grid),
        tileSurfaceY(city, i),
        tileCenterZ(ty, grid),
      );
      this.dummy.rotation.set(0, (h & 3) * (Math.PI / 2), 0);
      const footprint = 0.97 + ((h >>> 2) % 7) / 100;
      const heightScale = 0.98 + ((h >>> 6) % 9) / 100;
      this.dummy.scale.set(footprint, heightScale, footprint);
      this.dummy.updateMatrix();

      const idx = cursor[key]++;
      mesh.setMatrixAt(idx, this.dummy.matrix);
      const b = 0.86 + ((h >>> 11) % 28) / 100;
      mesh.setColorAt(idx, this.tint.setRGB(b, b, b));
    }

    for (const mesh of this.meshes) {
      if (!mesh) continue;
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    }
  }

  dispose(): void {
    for (const mesh of this.meshes) mesh?.dispose();
    for (const geo of this.geometries) geo.dispose();
    this.material.dispose();
  }
}

/** Archetype index (zone × level × variant) for a tile's building, or -1. */
function archetypeKey(city: CityData, i: number): number {
  const level = city.buildLevel[i];
  if (level === 0 || city.buildingId[i] !== 0) return -1;
  const clamped = Math.min(level, MAX_BUILD_LEVEL);
  let zoneIdx: number;
  switch (city.zone[i]) {
    case Zone.Residential: zoneIdx = 0; break;
    case Zone.Commercial: zoneIdx = 1; break;
    case Zone.Industrial: zoneIdx = 2; break;
    default: return -1;
  }
  const base = zoneIdx * MAX_BUILD_LEVEL + (clamped - 1);
  const variant = hash(city.grid.x(i), city.grid.y(i)) % BUILDING_VARIANTS;
  return base * BUILDING_VARIANTS + variant;
}

/** Deterministic per-tile hash for placement variety. */
function hash(x: number, y: number): number {
  let h = (Math.imul(x, 73856093) ^ Math.imul(y, 19349663)) >>> 0;
  h ^= h >>> 13;
  return h >>> 0;
}
