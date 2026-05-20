import * as THREE from "three";
import type { CityData } from "../sim/CityData";
import { BUILDING } from "../sim/buildings";
import { TILE, tileCenterX, tileCenterZ, tileSurfaceY } from "./constants";

/**
 * Renders the utility structures and networks: power plants and water pumps as
 * instanced boxes, power lines as instanced pylons, and underground pipes as
 * instanced markers (shown only with the water overlay).
 */
export class UtilityRenderer {
  readonly group = new THREE.Group();

  private readonly plant: THREE.InstancedMesh;
  private readonly pump: THREE.InstancedMesh;
  private readonly pylon: THREE.InstancedMesh;
  private readonly pipe: THREE.InstancedMesh;
  private readonly dummy = new THREE.Object3D();

  constructor(city: CityData) {
    const max = city.grid.size;
    this.plant = makeInstanced(new THREE.BoxGeometry(0.86, 0.72, 0.86), 0xc94f3d, max);
    this.pump = makeInstanced(new THREE.BoxGeometry(0.52, 0.46, 0.52), 0x3f6f8c, max);
    this.pylon = makeInstanced(new THREE.BoxGeometry(0.13, 1.1, 0.13), 0x59606e, max);

    const pipeGeo = new THREE.PlaneGeometry(TILE * 0.6, TILE * 0.6);
    pipeGeo.rotateX(-Math.PI / 2);
    this.pipe = makeInstanced(pipeGeo, 0x37a6d8, max);

    this.group.add(this.plant, this.pump, this.pylon, this.pipe);
    this.rebuild(city);
  }

  /** Re-place every instance from the current city state. */
  rebuild(city: CityData): void {
    const { grid } = city;
    let plants = 0;
    let pumps = 0;
    let pylons = 0;
    let pipes = 0;

    for (let i = 0; i < grid.size; i++) {
      const cx = tileCenterX(grid.x(i), grid);
      const cz = tileCenterZ(grid.y(i), grid);
      const surf = tileSurfaceY(city, i);

      if (city.buildingId[i] === BUILDING.PowerPlant) {
        plants = this.place(this.plant, plants, cx, surf + 0.36, cz);
      } else if (city.buildingId[i] === BUILDING.WaterPump) {
        pumps = this.place(this.pump, pumps, cx, surf + 0.23, cz);
      }
      if (city.powerLine[i] === 1) {
        pylons = this.place(this.pylon, pylons, cx, surf + 0.55, cz);
      }
      if (city.pipe[i] === 1) {
        pipes = this.place(this.pipe, pipes, cx, surf - 0.06, cz);
      }
    }

    finalize(this.plant, plants);
    finalize(this.pump, pumps);
    finalize(this.pylon, pylons);
    finalize(this.pipe, pipes);
  }

  /** Show or hide the underground pipe markers (used by the water overlay). */
  setShowPipes(show: boolean): void {
    this.pipe.visible = show;
  }

  dispose(): void {
    for (const m of [this.plant, this.pump, this.pylon, this.pipe]) {
      m.geometry.dispose();
      (m.material as THREE.Material).dispose();
    }
  }

  private place(
    mesh: THREE.InstancedMesh,
    n: number,
    x: number,
    y: number,
    z: number,
  ): number {
    this.dummy.position.set(x, y, z);
    this.dummy.rotation.set(0, 0, 0);
    this.dummy.updateMatrix();
    mesh.setMatrixAt(n, this.dummy.matrix);
    return n + 1;
  }
}

function makeInstanced(
  geo: THREE.BufferGeometry,
  color: number,
  max: number,
): THREE.InstancedMesh {
  const mat = new THREE.MeshStandardMaterial({ color, roughness: 0.85 });
  const mesh = new THREE.InstancedMesh(geo, mat, max);
  mesh.count = 0;
  mesh.frustumCulled = false;
  mesh.castShadow = false;
  return mesh;
}

function finalize(mesh: THREE.InstancedMesh, count: number): void {
  mesh.count = count;
  mesh.instanceMatrix.needsUpdate = true;
}
