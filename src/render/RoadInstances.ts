import * as THREE from "three";
import type { CityData } from "../sim/CityData";
import { TILE, tileCenterX, tileCenterZ, tileSurfaceY } from "./constants";

/** Connected-neighbour offsets and the marking-stub yaw for each. */
const DIRS = [
  { dx: 0, dz: -1, rot: 0 },
  { dx: 1, dz: 0, rot: Math.PI / 2 },
  { dx: 0, dz: 1, rot: 0 },
  { dx: -1, dz: 0, rot: Math.PI / 2 },
] as const;

/**
 * Renders the road layer with two `InstancedMesh`es: a dark asphalt slab per
 * road tile, and short centre-line stubs pointing at each connected neighbour.
 * The stubs meet across tile edges, producing automatic auto-tiled junctions.
 */
export class RoadInstances {
  readonly group = new THREE.Group();

  private readonly asphalt: THREE.InstancedMesh;
  private readonly markings: THREE.InstancedMesh;
  private readonly maxRoad: number;
  private readonly maxMark: number;
  private readonly dummy = new THREE.Object3D();

  constructor(city: CityData) {
    this.maxRoad = city.grid.size;
    this.maxMark = city.grid.size * 8;

    const asphaltGeo = new THREE.BoxGeometry(TILE * 0.98, 0.09, TILE * 0.98);
    const asphaltMat = new THREE.MeshStandardMaterial({ color: 0x303339, roughness: 0.95 });
    this.asphalt = new THREE.InstancedMesh(asphaltGeo, asphaltMat, this.maxRoad);
    this.asphalt.frustumCulled = false;

    const markGeo = new THREE.BoxGeometry(0.09, 0.035, TILE * 0.2);
    const markMat = new THREE.MeshStandardMaterial({ color: 0xe6e3d6, roughness: 0.75 });
    this.markings = new THREE.InstancedMesh(markGeo, markMat, this.maxMark);
    this.markings.frustumCulled = false;

    this.group.add(this.asphalt, this.markings);
    this.rebuild(city);
  }

  /** Re-place every instance from the current road layer. */
  rebuild(city: CityData): void {
    const { grid } = city;
    let roadN = 0;
    let markN = 0;

    for (let ty = 0; ty < grid.height; ty++) {
      for (let tx = 0; tx < grid.width; tx++) {
        const i = grid.index(tx, ty);
        if (city.road[i] === 0) continue;

        const cx = tileCenterX(tx, grid);
        const cz = tileCenterZ(ty, grid);
        const y = tileSurfaceY(city, i) + 0.06;

        this.dummy.position.set(cx, y, cz);
        this.dummy.rotation.set(0, 0, 0);
        this.dummy.updateMatrix();
        this.asphalt.setMatrixAt(roadN++, this.dummy.matrix);

        for (const d of DIRS) {
          const nx = tx + d.dx;
          const ny = ty + d.dz;
          if (!grid.inBounds(nx, ny) || city.road[grid.index(nx, ny)] === 0) continue;
          // Two dashes per connected arm — they meet across edges as a lane line.
          for (const t of [0.15, 0.36]) {
            if (markN >= this.maxMark) continue;
            this.dummy.position.set(
              cx + d.dx * TILE * t,
              y + 0.03,
              cz + d.dz * TILE * t,
            );
            this.dummy.rotation.set(0, d.rot, 0);
            this.dummy.updateMatrix();
            this.markings.setMatrixAt(markN++, this.dummy.matrix);
          }
        }
      }
    }

    this.asphalt.count = roadN;
    this.markings.count = markN;
    this.asphalt.instanceMatrix.needsUpdate = true;
    this.markings.instanceMatrix.needsUpdate = true;
  }

  dispose(): void {
    this.asphalt.geometry.dispose();
    (this.asphalt.material as THREE.Material).dispose();
    this.markings.geometry.dispose();
    (this.markings.material as THREE.Material).dispose();
  }
}
