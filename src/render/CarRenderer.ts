import * as THREE from "three";
import type { CityData } from "../sim/CityData";
import type { Car } from "../sim/systems/TrafficSystem";
import { MeshBuilder } from "./meshlib/buildingFactory";
import { TILE, tileSurfaceY } from "./constants";

/**
 * Renders car agents as a single instanced low-poly vehicle — chassis, cabin,
 * glazing and four wheels. The body parts are white in the geometry so the
 * per-instance colour tints them to each car's paint; wheels are black and
 * glazing dark, so they survive the tint. Tile positions are interpolated by
 * the loop's `alpha` between sim ticks, smoothing 10 Hz motion to 60 fps.
 */
export class CarRenderer {
  readonly mesh: THREE.InstancedMesh;

  private readonly material: THREE.MeshStandardMaterial;
  private readonly dummy = new THREE.Object3D();
  private readonly color = new THREE.Color();

  constructor(maxCars: number) {
    this.material = new THREE.MeshStandardMaterial({
      vertexColors: true,
      roughness: 0.5,
      metalness: 0.12,
      flatShading: true,
    });
    this.mesh = new THREE.InstancedMesh(carGeometry(), this.material, maxCars);
    this.mesh.count = 0;
    this.mesh.frustumCulled = false;
  }

  /** Re-place every active car, interpolated by `alpha` (0–1). */
  sync(cars: readonly Car[], city: CityData, alpha: number): void {
    const { grid } = city;
    let n = 0;

    for (const car of cars) {
      if (!car.active) continue;
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
      this.mesh.setMatrixAt(n, this.dummy.matrix);
      this.mesh.setColorAt(n, this.color.setHex(car.color));
      n++;
    }

    this.mesh.count = n;
    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }

  dispose(): void {
    this.mesh.geometry.dispose();
    this.material.dispose();
  }
}

/** A low-poly car: white body (tinted per instance), dark glazing and wheels. */
function carGeometry(): THREE.BufferGeometry {
  const b = new MeshBuilder();
  const w = 0.3;
  const l = 0.54;

  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      b.box(0.08, 0.1, 0.14, sx * (w / 2 - 0.01), 0, sz * (l / 2 - 0.13), 0x080808);
    }
  }
  b.box(w, 0.13, l, 0, 0.07, 0, 0xffffff);
  b.box(w * 0.86, 0.12, l * 0.46, 0, 0.2, -0.03, 0xffffff);
  b.box(w * 0.92, 0.085, l * 0.42, 0, 0.215, -0.03, 0x161a20);

  return b.build();
}
