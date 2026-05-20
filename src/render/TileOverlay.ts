import * as THREE from "three";
import type { CityData } from "../sim/CityData";
import { TILE, tileCenterX, tileCenterZ, tileSurfaceY } from "./constants";

/** Returns a tile's overlay colour, or null to leave the tile uncovered. */
export type TileColorFn = (city: CityData, index: number) => number | null;

/**
 * A reusable grid-tint layer: one translucent, per-instance-coloured flat quad
 * per tile that a colour function selects. Used for the always-on zone tint and
 * the toggleable power / water coverage overlay.
 */
export class TileOverlay {
  readonly mesh: THREE.InstancedMesh;

  private readonly dummy = new THREE.Object3D();
  private readonly color = new THREE.Color();

  constructor(maxTiles: number, private readonly yOffset: number, opacity: number) {
    const geo = new THREE.PlaneGeometry(TILE, TILE);
    geo.rotateX(-Math.PI / 2);
    const mat = new THREE.MeshBasicMaterial({
      transparent: true,
      opacity,
      depthWrite: false,
    });
    this.mesh = new THREE.InstancedMesh(geo, mat, maxTiles);
    this.mesh.count = 0;
    this.mesh.frustumCulled = false;
  }

  /** Re-place and re-colour instances from the current city state. */
  rebuild(city: CityData, colorFn: TileColorFn): void {
    const { grid } = city;
    let n = 0;
    for (let i = 0; i < grid.size; i++) {
      const hex = colorFn(city, i);
      if (hex === null) continue;
      this.dummy.position.set(
        tileCenterX(grid.x(i), grid),
        tileSurfaceY(city, i) + this.yOffset,
        tileCenterZ(grid.y(i), grid),
      );
      this.dummy.updateMatrix();
      this.mesh.setMatrixAt(n, this.dummy.matrix);
      this.mesh.setColorAt(n, this.color.setHex(hex));
      n++;
    }
    this.mesh.count = n;
    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }

  set visible(v: boolean) {
    this.mesh.visible = v;
  }

  dispose(): void {
    this.mesh.geometry.dispose();
    (this.mesh.material as THREE.Material).dispose();
  }
}
