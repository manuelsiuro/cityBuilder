import * as THREE from "three";
import type { CityData } from "../sim/CityData";
import { BUILDING } from "../sim/buildings";
import { MeshBuilder } from "./meshlib/buildingFactory";
import { TILE, tileCenterX, tileCenterZ, tileSurfaceY } from "./constants";

/**
 * Renders the utility structures and networks: low-poly power plants and water
 * pumps, slim power-line poles with crossarms, and underground pipe markers
 * (shown only with the water overlay). Structures share one vertex-coloured
 * material; their geometry origin sits on the tile surface.
 */
export class UtilityRenderer {
  readonly group = new THREE.Group();

  private readonly material: THREE.MeshStandardMaterial;
  private readonly plant: THREE.InstancedMesh;
  private readonly pump: THREE.InstancedMesh;
  private readonly pylon: THREE.InstancedMesh;
  private readonly pipe: THREE.InstancedMesh;
  private readonly dummy = new THREE.Object3D();

  constructor(city: CityData) {
    const max = city.grid.size;
    this.material = new THREE.MeshStandardMaterial({
      vertexColors: true,
      roughness: 0.82,
      flatShading: true,
    });

    this.plant = this.makeInstanced(plantGeometry(), max);
    this.pump = this.makeInstanced(pumpGeometry(), max);
    this.pylon = this.makeInstanced(pylonGeometry(), max);

    const pipeGeo = new THREE.PlaneGeometry(TILE * 0.6, TILE * 0.6);
    pipeGeo.rotateX(-Math.PI / 2);
    const pipeMat = new THREE.MeshStandardMaterial({ color: 0x37a6d8, roughness: 0.85 });
    this.pipe = new THREE.InstancedMesh(pipeGeo, pipeMat, max);
    this.pipe.count = 0;
    this.pipe.frustumCulled = false;

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
        plants = this.place(this.plant, plants, cx, surf, cz);
      } else if (city.buildingId[i] === BUILDING.WaterPump) {
        pumps = this.place(this.pump, pumps, cx, surf, cz);
      }
      if (city.powerLine[i] === 1) {
        pylons = this.place(this.pylon, pylons, cx, surf, cz);
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
    }
    (this.pipe.material as THREE.Material).dispose();
    this.material.dispose();
  }

  private makeInstanced(geo: THREE.BufferGeometry, max: number): THREE.InstancedMesh {
    const mesh = new THREE.InstancedMesh(geo, this.material, max);
    mesh.count = 0;
    mesh.frustumCulled = false;
    mesh.castShadow = false;
    return mesh;
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

function finalize(mesh: THREE.InstancedMesh, count: number): void {
  mesh.count = count;
  mesh.instanceMatrix.needsUpdate = true;
}

/** Power plant: turbine hall, hyperboloid cooling tower and a striped stack. */
function plantGeometry(): THREE.BufferGeometry {
  const b = new MeshBuilder();
  b.box(0.86, 0.1, 0.86, 0, 0, 0, 0xb7b1a4);
  b.box(0.5, 0.46, 0.78, -0.16, 0.08, 0, 0xa9aeb4);
  b.box(0.5, 0.16, 0.78, -0.16, 0.54, 0, 0xc94f3d);
  b.box(0.42, 0.2, 0.7, -0.16, 0.2, 0, 0x6f7986);
  b.cyl(0.2, 0.62, 0.24, 0.08, -0.16, 0xc6c9ce, 12, 0.16);
  b.cyl(0.21, 0.06, 0.24, 0.7, -0.16, 0xaeb2b8, 12);
  b.cyl(0.07, 0.78, 0.26, 0.08, 0.22, 0xc94f3d);
  b.cyl(0.075, 0.12, 0.26, 0.5, 0.22, 0xe4e4e4);
  // Steam billowing from the cooling tower, smoke from the stack.
  b.ico(0.15, 0.24, 0.72, -0.16, 0xeef0f2);
  b.ico(0.17, 0.31, 0.92, -0.2, 0xe4e7ea);
  b.ico(0.09, 0.26, 0.64, 0.22, 0xdcdee3);
  b.ico(0.11, 0.33, 0.82, 0.18, 0xd0d3d9);
  return b.build();
}

/** Water pump: pump house, sloped roof, rooftop tank and an outlet pipe. */
function pumpGeometry(): THREE.BufferGeometry {
  const b = new MeshBuilder();
  b.box(0.62, 0.09, 0.62, 0, 0, 0, 0xb7b1a4);
  b.box(0.5, 0.36, 0.5, 0, 0.07, 0, 0x6f93a8);
  b.box(0.56, 0.07, 0.56, 0, 0.43, 0, 0x3f6f8c);
  b.box(0.16, 0.22, 0.05, 0, 0.07, -0.25, 0x2f5063);
  b.cyl(0.15, 0.3, 0.04, 0.5, 0.05, 0x9bb4c0, 10);
  b.cyl(0.155, 0.05, 0.04, 0.8, 0.05, 0x3f6f8c, 10);
  b.box(0.06, 0.5, 0.06, 0.04, 0.5, -0.18, 0x55606b);
  b.box(0.06, 0.5, 0.06, 0.04, 0.5, 0.26, 0x55606b);
  return b.build();
}

/** Slim utility pole: post, crossarm and two insulators. */
function pylonGeometry(): THREE.BufferGeometry {
  const b = new MeshBuilder();
  b.box(0.07, 0.82, 0.07, 0, 0, 0, 0x6b5b4a);
  b.box(0.46, 0.06, 0.07, 0, 0.66, 0, 0x6b5b4a);
  b.box(0.06, 0.06, 0.06, -0.18, 0.72, 0, 0xd9d9d9);
  b.box(0.06, 0.06, 0.06, 0.18, 0.72, 0, 0xd9d9d9);
  return b.build();
}
