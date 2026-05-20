import * as THREE from "three";
import type { CityData } from "../sim/CityData";
import type { Car } from "../sim/systems/TrafficSystem";
import { MeshBuilder } from "./meshlib/buildingFactory";
import { TILE, tileSurfaceY } from "./constants";

/**
 * Renders car agents as low-poly vehicles. Three body types — sedan, van and
 * box truck — are each their own `InstancedMesh`; a car's pool index picks its
 * type so the streets carry a varied fleet. Body parts are white in geometry
 * so the per-instance colour tints them; wheels and glazing stay dark. Tile
 * positions are interpolated by the loop's `alpha` between sim ticks.
 */
export class CarRenderer {
  readonly group = new THREE.Group();

  private readonly material: THREE.MeshStandardMaterial;
  private readonly meshes: THREE.InstancedMesh[];
  private readonly counts: number[] = [0, 0, 0];
  private readonly dummy = new THREE.Object3D();
  private readonly color = new THREE.Color();

  constructor(maxCars: number) {
    this.material = new THREE.MeshStandardMaterial({
      vertexColors: true,
      roughness: 0.5,
      metalness: 0.12,
      flatShading: true,
    });
    this.meshes = [sedanGeometry(), vanGeometry(), truckGeometry()].map((geo) => {
      const mesh = new THREE.InstancedMesh(geo, this.material, maxCars);
      mesh.count = 0;
      mesh.frustumCulled = false;
      this.group.add(mesh);
      return mesh;
    });
  }

  /** Re-place every active car, interpolated by `alpha` (0–1). */
  sync(cars: readonly Car[], city: CityData, alpha: number): void {
    const { grid } = city;
    this.counts[0] = this.counts[1] = this.counts[2] = 0;

    cars.forEach((car, idx) => {
      if (!car.active) return;
      const tx = car.prevTileX + (car.tileX - car.prevTileX) * alpha;
      const ty = car.prevTileY + (car.tileY - car.prevTileY) * alpha;

      const tile = grid.index(
        Math.max(0, Math.min(grid.width - 1, Math.round(tx))),
        Math.max(0, Math.min(grid.height - 1, Math.round(ty))),
      );
      const dx = car.tileX - car.prevTileX;
      const dz = car.tileY - car.prevTileY;
      const heading = dx !== 0 || dz !== 0 ? Math.atan2(dx, dz) : 0;

      this.dummy.position.set(
        (tx - grid.width / 2 + 0.5) * TILE,
        tileSurfaceY(city, tile) + 0.11,
        (ty - grid.height / 2 + 0.5) * TILE,
      );
      this.dummy.rotation.set(0, heading, 0);
      this.dummy.updateMatrix();

      const type = idx % 3;
      const mesh = this.meshes[type];
      const n = this.counts[type]++;
      mesh.setMatrixAt(n, this.dummy.matrix);
      mesh.setColorAt(n, this.color.setHex(car.color));
    });

    for (let t = 0; t < this.meshes.length; t++) {
      const mesh = this.meshes[t];
      mesh.count = this.counts[t];
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    }
  }

  dispose(): void {
    for (const mesh of this.meshes) mesh.geometry.dispose();
    this.material.dispose();
  }
}

/** Four dark wheels at the corners of a `w`×`l` footprint. */
function wheels(b: MeshBuilder, w: number, l: number): void {
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      b.box(0.08, 0.1, 0.14, sx * (w / 2 - 0.01), 0, sz * (l / 2 - 0.13), 0x080808);
    }
  }
}

/** A low-poly sedan: chassis, raised cabin, glazing band, four wheels. */
export function sedanGeometry(): THREE.BufferGeometry {
  const b = new MeshBuilder();
  const w = 0.3;
  const l = 0.54;
  wheels(b, w, l);
  b.box(w, 0.13, l, 0, 0.07, 0, 0xffffff);
  b.box(w * 0.86, 0.12, l * 0.46, 0, 0.2, -0.03, 0xffffff);
  b.box(w * 0.92, 0.085, l * 0.42, 0, 0.215, -0.03, 0x161a20);
  return b.build();
}

/** A tall delivery van with a front cab and glazing. */
export function vanGeometry(): THREE.BufferGeometry {
  const b = new MeshBuilder();
  const w = 0.32;
  const l = 0.56;
  wheels(b, w, l);
  b.box(w, 0.32, l, 0, 0.06, 0, 0xffffff);
  b.box(w * 0.9, 0.11, 0.05, 0, 0.21, l / 2, 0x161a20);
  for (const sx of [-1, 1]) {
    b.box(0.05, 0.1, 0.15, sx * (w / 2), 0.22, l * 0.26, 0x161a20);
  }
  return b.build();
}

/** A box truck: cab up front, tall cargo box behind, six wheels. */
export function truckGeometry(): THREE.BufferGeometry {
  const b = new MeshBuilder();
  const w = 0.32;
  const l = 0.62;
  for (const sx of [-1, 1]) {
    b.box(0.08, 0.1, 0.13, sx * (w / 2 - 0.01), 0, l / 2 - 0.12, 0x080808);
    b.box(0.08, 0.1, 0.13, sx * (w / 2 - 0.01), 0, -l / 2 + 0.3, 0x080808);
    b.box(0.08, 0.1, 0.13, sx * (w / 2 - 0.01), 0, -l / 2 + 0.14, 0x080808);
  }
  b.box(w, 0.2, 0.2, 0, 0.06, l / 2 - 0.11, 0xffffff);
  b.box(w * 0.92, 0.1, 0.05, 0, 0.17, l / 2 - 0.02, 0x161a20);
  b.box(w, 0.33, l * 0.6, 0, 0.06, -l * 0.13, 0xeaeaea);
  return b.build();
}
