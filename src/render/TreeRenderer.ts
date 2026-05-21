import * as THREE from "three";
import type { CityData } from "../sim/CityData";
import { treeGeometry } from "./meshlib/buildingFactory";
import { TILE, hashTile, tileCenterX, tileCenterZ, tileSurfaceY } from "./constants";

/**
 * Renders the forest scattered by the terrain generator: one instanced mesh of
 * a low-poly tree, placed on every forested tile that is still empty. Rebuilt
 * whenever terrain or tile contents change.
 */
export class TreeRenderer {
  readonly group = new THREE.Group();

  private readonly material: THREE.MeshStandardMaterial;
  private readonly mesh: THREE.InstancedMesh;
  private readonly dummy = new THREE.Object3D();

  constructor(city: CityData) {
    this.material = new THREE.MeshStandardMaterial({
      vertexColors: true,
      roughness: 0.9,
      flatShading: true,
    });
    this.mesh = new THREE.InstancedMesh(treeGeometry(0), this.material, city.grid.size);
    this.mesh.count = 0;
    this.mesh.frustumCulled = false;
    this.mesh.castShadow = true;
    this.mesh.receiveShadow = true;
    this.group.add(this.mesh);
    this.rebuild(city);
  }

  /** Re-place a tree instance on every forested, unoccupied tile. */
  rebuild(city: CityData): void {
    const { grid } = city;
    let n = 0;
    for (let i = 0; i < grid.size; i++) {
      if (city.trees[i] === 0) continue;
      // A tree yields to anything the player builds on its tile.
      if (city.buildingId[i] !== 0 || city.road[i] !== 0 || city.zone[i] !== 0) continue;

      const x = grid.x(i);
      const y = grid.y(i);
      const hash = hashTile(x, y);
      // Jitter the tree off the tile centre so forests don't look gridded.
      const ox = (((hash >>> 9) & 0xff) / 255 - 0.5) * 0.6 * TILE;
      const oz = (((hash >>> 17) & 0xff) / 255 - 0.5) * 0.6 * TILE;
      this.dummy.position.set(
        tileCenterX(x, grid) + ox,
        tileSurfaceY(city, i),
        tileCenterZ(y, grid) + oz,
      );
      this.dummy.rotation.set(0, (hash % 360) * (Math.PI / 180), 0);
      this.dummy.scale.setScalar(0.7 + (city.trees[i] / 255) * 0.6);
      this.dummy.updateMatrix();
      this.mesh.setMatrixAt(n, this.dummy.matrix);
      n++;
    }
    this.mesh.count = n;
    this.mesh.instanceMatrix.needsUpdate = true;
  }

  dispose(): void {
    this.mesh.geometry.dispose();
    this.material.dispose();
  }
}
