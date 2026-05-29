import * as THREE from "three";
import type { CityData } from "../sim/CityData";
import { TILE, tileCenterX, tileCenterZ, tileSurfaceY } from "./constants";

/** Hard cap on simultaneously-rendered flood tiles. */
const MAX_FLOOD = 4096;
/** Vertical lift above the tile surface so the water sits cleanly on top. */
const FLOOD_LIFT = 0.06;

/**
 * Renders tsunami floodwater as instanced translucent blue quads — one quad
 * per `city.flood[i] > 0` tile. Strictly downstream of `CityData.flood`;
 * updated every render frame.
 */
export class FloodRenderer {
  readonly group = new THREE.Group();

  private readonly mesh: THREE.InstancedMesh;
  private readonly material: THREE.MeshBasicMaterial;
  private readonly capacity: number;
  private readonly dummy = new THREE.Object3D();
  private readonly tint = new THREE.Color();
  private readonly shallow = new THREE.Color(0x4ea8e0);
  private readonly deep = new THREE.Color(0x1e4a8a);

  constructor(maxTiles: number) {
    this.capacity = Math.min(maxTiles, MAX_FLOOD);
    const geo = new THREE.PlaneGeometry(TILE * 0.98, TILE * 0.98);
    geo.rotateX(-Math.PI / 2);
    this.material = new THREE.MeshBasicMaterial({
      transparent: true,
      opacity: 0.62,
      depthWrite: false,
    });
    this.mesh = new THREE.InstancedMesh(geo, this.material, this.capacity);
    this.mesh.count = 0;
    this.mesh.frustumCulled = false;
    this.group.add(this.mesh);
  }

  update(city: CityData): void {
    const { grid } = city;
    let n = 0;
    for (let i = 0; i < grid.size && n < this.capacity; i++) {
      const d = city.flood[i];
      if (d === 0) continue;
      const t = d / 255;
      this.dummy.position.set(
        tileCenterX(grid.x(i), grid),
        tileSurfaceY(city, i) + FLOOD_LIFT,
        tileCenterZ(grid.y(i), grid),
      );
      this.dummy.scale.set(1, 1, 1);
      this.dummy.rotation.set(0, 0, 0);
      this.dummy.updateMatrix();
      this.mesh.setMatrixAt(n, this.dummy.matrix);
      this.mesh.setColorAt(n, this.tint.copy(this.shallow).lerp(this.deep, t));
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
