import * as THREE from "three";
import type { CityData } from "../sim/CityData";
import type { Car } from "../sim/systems/TrafficSystem";
import { TILE, tileSurfaceY } from "./constants";

/**
 * Renders car agents as a single instanced mesh. Each render frame their tile
 * positions are interpolated by the loop's `alpha` between the previous and
 * current sim tick, turning 10 Hz movement into smooth 60 fps motion.
 */
export class CarRenderer {
  readonly mesh: THREE.InstancedMesh;

  private readonly dummy = new THREE.Object3D();
  private readonly color = new THREE.Color();

  constructor(maxCars: number) {
    const geo = new THREE.BoxGeometry(0.3, 0.2, 0.5);
    const mat = new THREE.MeshStandardMaterial({ roughness: 0.55, metalness: 0.1 });
    this.mesh = new THREE.InstancedMesh(geo, mat, maxCars);
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
        tileSurfaceY(city, tile) + 0.17,
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
    (this.mesh.material as THREE.Material).dispose();
  }
}
