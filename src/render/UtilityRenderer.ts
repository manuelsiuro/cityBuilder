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
  private readonly police: THREE.InstancedMesh;
  private readonly fire: THREE.InstancedMesh;
  private readonly park: THREE.InstancedMesh;
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
    this.police = this.makeInstanced(policeGeometry(), max);
    this.fire = this.makeInstanced(fireStationGeometry(), max);
    this.park = this.makeInstanced(parkGeometry(), max);

    const pipeGeo = new THREE.PlaneGeometry(TILE * 0.6, TILE * 0.6);
    pipeGeo.rotateX(-Math.PI / 2);
    const pipeMat = new THREE.MeshStandardMaterial({ color: 0x37a6d8, roughness: 0.85 });
    this.pipe = new THREE.InstancedMesh(pipeGeo, pipeMat, max);
    this.pipe.count = 0;
    this.pipe.frustumCulled = false;

    this.group.add(
      this.plant, this.pump, this.pylon,
      this.police, this.fire, this.park, this.pipe,
    );
    this.rebuild(city);
  }

  /** Re-place every instance from the current city state. */
  rebuild(city: CityData): void {
    const { grid } = city;
    let plants = 0;
    let pumps = 0;
    let pylons = 0;
    let police = 0;
    let fire = 0;
    let parks = 0;
    let pipes = 0;

    for (let i = 0; i < grid.size; i++) {
      const cx = tileCenterX(grid.x(i), grid);
      const cz = tileCenterZ(grid.y(i), grid);
      const surf = tileSurfaceY(city, i);

      switch (city.buildingId[i]) {
        case BUILDING.PowerPlant:
          plants = this.place(this.plant, plants, cx, surf, cz);
          break;
        case BUILDING.WaterPump:
          pumps = this.place(this.pump, pumps, cx, surf, cz);
          break;
        case BUILDING.PoliceStation:
          police = this.place(this.police, police, cx, surf, cz);
          break;
        case BUILDING.FireStation:
          fire = this.place(this.fire, fire, cx, surf, cz);
          break;
        case BUILDING.Park:
          parks = this.place(this.park, parks, cx, surf, cz);
          break;
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
    finalize(this.police, police);
    finalize(this.fire, fire);
    finalize(this.park, parks);
    finalize(this.pipe, pipes);
  }

  /** Show or hide the underground pipe markers (used by the water overlay). */
  setShowPipes(show: boolean): void {
    this.pipe.visible = show;
  }

  dispose(): void {
    for (const m of [
      this.plant, this.pump, this.pylon,
      this.police, this.fire, this.park, this.pipe,
    ]) {
      m.geometry.dispose();
    }
    (this.pipe.material as THREE.Material).dispose();
    this.material.dispose();
  }

  private makeInstanced(geo: THREE.BufferGeometry, max: number): THREE.InstancedMesh {
    const mesh = new THREE.InstancedMesh(geo, this.material, max);
    mesh.count = 0;
    mesh.frustumCulled = false;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
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
export function plantGeometry(): THREE.BufferGeometry {
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
export function pumpGeometry(): THREE.BufferGeometry {
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
export function pylonGeometry(): THREE.BufferGeometry {
  const b = new MeshBuilder();
  b.box(0.07, 0.82, 0.07, 0, 0, 0, 0x6b5b4a);
  b.box(0.46, 0.06, 0.07, 0, 0.66, 0, 0x6b5b4a);
  b.box(0.06, 0.06, 0.06, -0.18, 0.72, 0, 0xd9d9d9);
  b.box(0.06, 0.06, 0.06, 0.18, 0.72, 0, 0xd9d9d9);
  return b.build();
}

/** Police station: slate civic block, columned entrance and a blue beacon. */
export function policeGeometry(): THREE.BufferGeometry {
  const b = new MeshBuilder();
  b.box(0.88, 0.08, 0.88, 0, 0, 0, 0xb7b1a4);             // foundation pad
  b.box(0.68, 0.46, 0.6, 0, 0.08, -0.06, 0x46506a);       // main block
  b.box(0.74, 0.07, 0.66, 0, 0.54, -0.06, 0x2b3445);      // roof slab
  b.box(0.62, 0.05, 0.54, 0, 0.5, -0.06, 0xc6cbd2);       // white cornice band
  // Columned entrance porch on the south face.
  b.box(0.4, 0.06, 0.2, 0, 0.08, 0.32, 0xd6d2c6);         // porch step
  b.box(0.07, 0.3, 0.07, -0.13, 0.14, 0.36, 0xe6e6e6);    // column
  b.box(0.07, 0.3, 0.07, 0.13, 0.14, 0.36, 0xe6e6e6);     // column
  b.box(0.42, 0.08, 0.16, 0, 0.44, 0.34, 0x2b3445);       // porch lintel
  b.box(0.3, 0.12, 0.04, 0, 0.3, 0.27, 0x29408c);         // blue "POLICE" sign
  // Roof beacon.
  b.box(0.1, 0.1, 0.1, 0.2, 0.61, -0.18, 0x2b3445);
  b.ico(0.06, 0.2, 0.71, -0.18, 0x4a90d8);
  return b.build();
}

/** Fire station: red engine bay, white trim, flat roof and a hose tower. */
export function fireStationGeometry(): THREE.BufferGeometry {
  const b = new MeshBuilder();
  b.box(0.88, 0.08, 0.88, 0, 0, 0, 0xb7b1a4);             // foundation pad
  b.box(0.72, 0.42, 0.6, 0, 0.08, -0.06, 0xb1402f);       // main block
  b.box(0.74, 0.06, 0.62, 0, 0.46, -0.05, 0xe4e4e4);      // white trim band
  b.box(0.78, 0.07, 0.66, 0, 0.5, -0.06, 0x7c2a20);       // roof slab
  // Three engine-bay doors on the south face.
  for (const x of [-0.22, 0, 0.22]) {
    b.box(0.18, 0.32, 0.06, x, 0.08, 0.24, 0x8b8f96);
  }
  // Hose-drying tower on the back corner.
  b.box(0.2, 0.78, 0.2, 0.27, 0.08, -0.24, 0xc24a38);
  b.box(0.24, 0.07, 0.24, 0.27, 0.86, -0.24, 0x7c2a20);
  b.box(0.1, 0.1, 0.1, -0.22, 0.57, -0.22, 0xe4e4e4);     // roof vent
  return b.build();
}

/** Park: a grassy plot with low-poly trees, a pond, a path and a bench. */
export function parkGeometry(): THREE.BufferGeometry {
  const b = new MeshBuilder();
  b.box(0.92, 0.07, 0.92, 0, 0, 0, 0x5a8f3e);             // grass plot
  b.box(0.34, 0.03, 0.28, -0.18, 0.07, 0.16, 0x4791b5);   // pond
  b.box(0.15, 0.02, 0.74, 0.24, 0.07, 0, 0xcabf94);       // gravel path
  // A few low-poly trees.
  const tree = (x: number, z: number, lush: number): void => {
    b.cyl(0.035, 0.16, x, 0.07, z, 0x6b4a2e, 6);
    b.ico(0.15, x, 0.2, z, lush);
  };
  tree(-0.22, -0.22, 0x3f7a3a);
  tree(0.26, 0.28, 0x478a3e);
  tree(0.04, -0.3, 0x4f8a44);
  // A bench beside the path.
  b.box(0.16, 0.04, 0.06, 0.02, 0.1, 0.18, 0x9a7b4e);
  b.box(0.16, 0.05, 0.02, 0.02, 0.14, 0.15, 0x9a7b4e);
  return b.build();
}
