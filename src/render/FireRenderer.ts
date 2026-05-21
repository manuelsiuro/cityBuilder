import * as THREE from "three";
import type { CityData } from "../sim/CityData";
import { hashTile, tileCenterX, tileCenterZ, tileSurfaceY } from "./constants";

/** How far above the tile surface a flame's base sits. */
const FLAME_LIFT = 0.22;
/** Hard cap on simultaneously-rendered flames. */
const MAX_FLAMES = 2048;

/**
 * Renders active fires as instanced low-poly flames — one bright, flickering
 * cone per burning tile, tinted from deep red (small) to hot yellow (intense).
 * Strictly downstream of `CityData.fire`; updated every render frame.
 */
export class FireRenderer {
  readonly group = new THREE.Group();

  private readonly mesh: THREE.InstancedMesh;
  private readonly material: THREE.MeshBasicMaterial;
  private readonly capacity: number;
  private readonly dummy = new THREE.Object3D();
  private readonly tint = new THREE.Color();
  private readonly hot = new THREE.Color(0xffd64a);
  private readonly cool = new THREE.Color(0xc4351a);

  constructor(maxTiles: number) {
    this.capacity = Math.min(maxTiles, MAX_FLAMES);
    const geo = new THREE.ConeGeometry(0.26, 0.8, 6);
    geo.translate(0, 0.4, 0); // base at the origin so it stands on the tile
    this.material = new THREE.MeshBasicMaterial();
    this.mesh = new THREE.InstancedMesh(geo, this.material, this.capacity);
    this.mesh.count = 0;
    this.mesh.frustumCulled = false;
    this.group.add(this.mesh);
  }

  /** Re-place a flickering flame on every burning tile. Call each frame. */
  update(city: CityData, timeMs: number): void {
    const { grid } = city;
    let n = 0;
    for (let i = 0; i < grid.size && n < this.capacity; i++) {
      const f = city.fire[i];
      if (f === 0) continue;

      const x = grid.x(i);
      const y = grid.y(i);
      const t = f / 255;
      const phase = ((hashTile(x, y) % 1000) / 1000) * Math.PI * 2;
      const flicker = 1 + 0.2 * Math.sin(timeMs * 0.013 + phase);
      const s = (0.5 + t * 0.9) * flicker;

      this.dummy.position.set(
        tileCenterX(x, grid),
        tileSurfaceY(city, i) + FLAME_LIFT,
        tileCenterZ(y, grid),
      );
      this.dummy.scale.set(s, s * (0.8 + 0.5 * t), s);
      this.dummy.rotation.set(0, phase, 0);
      this.dummy.updateMatrix();
      this.mesh.setMatrixAt(n, this.dummy.matrix);
      this.mesh.setColorAt(n, this.tint.copy(this.cool).lerp(this.hot, t));
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
