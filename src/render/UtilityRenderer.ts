import * as THREE from "three";
import type { CityData } from "../sim/CityData";
import { BUILDING } from "../sim/buildings";
import { MeshBuilder } from "./meshlib/buildingFactory";
import { TILE, tileCenterX, tileCenterZ, tileSurfaceY, hashTile } from "./constants";

/** Distinct procedural designs generated for the Small Park. */
export const SMALL_PARK_VARIANTS = 4;

/**
 * Renders the utility structures and networks: low-poly power plants and water
 * pumps, slim power-line poles with crossarms, the city-service buildings
 * (police, fire, hospital and the green-space variants), and underground pipe
 * markers (shown only with the water overlay). Structures share one
 * vertex-coloured material; their geometry origin sits on the tile surface.
 */
export class UtilityRenderer {
  readonly group = new THREE.Group();

  private readonly material: THREE.MeshStandardMaterial;
  private readonly plant: THREE.InstancedMesh;
  private readonly pump: THREE.InstancedMesh;
  private readonly pylon: THREE.InstancedMesh;
  private readonly police: THREE.InstancedMesh;
  private readonly fire: THREE.InstancedMesh;
  private readonly hospital: THREE.InstancedMesh;
  private readonly park: THREE.InstancedMesh;
  private readonly smallPark: THREE.InstancedMesh[];
  private readonly plaza: THREE.InstancedMesh;
  private readonly sportsField: THREE.InstancedMesh;
  private readonly botanical: THREE.InstancedMesh;
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
    this.hospital = this.makeInstanced(hospitalGeometry(), max);
    this.park = this.makeInstanced(parkGeometry(), max);
    this.smallPark = smallParkGeometries().map((geo) => this.makeInstanced(geo, max));
    this.plaza = this.makeInstanced(plazaGeometry(), max);
    this.sportsField = this.makeInstanced(sportsFieldGeometry(), max);
    this.botanical = this.makeInstanced(botanicalGardenGeometry(), max);

    const pipeGeo = new THREE.PlaneGeometry(TILE * 0.6, TILE * 0.6);
    pipeGeo.rotateX(-Math.PI / 2);
    const pipeMat = new THREE.MeshStandardMaterial({ color: 0x37a6d8, roughness: 0.85 });
    this.pipe = new THREE.InstancedMesh(pipeGeo, pipeMat, max);
    this.pipe.count = 0;
    this.pipe.frustumCulled = false;

    this.group.add(
      this.plant, this.pump, this.pylon,
      this.police, this.fire, this.hospital,
      this.park, ...this.smallPark, this.plaza, this.sportsField, this.botanical,
      this.pipe,
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
    let hospital = 0;
    let parks = 0;
    let plazas = 0;
    let fields = 0;
    let gardens = 0;
    let pipes = 0;
    const smallParks = new Array(SMALL_PARK_VARIANTS).fill(0);

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
        case BUILDING.Hospital:
          hospital = this.place(this.hospital, hospital, cx, surf, cz);
          break;
        case BUILDING.Park:
          parks = this.place(this.park, parks, cx, surf, cz);
          break;
        case BUILDING.ParkSmall: {
          const v = hashTile(grid.x(i), grid.y(i)) % SMALL_PARK_VARIANTS;
          smallParks[v] = this.place(this.smallPark[v], smallParks[v], cx, surf, cz);
          break;
        }
        case BUILDING.Plaza:
          plazas = this.place(this.plaza, plazas, cx, surf, cz);
          break;
        case BUILDING.SportsField:
          fields = this.place(this.sportsField, fields, cx, surf, cz);
          break;
        case BUILDING.BotanicalGarden:
          gardens = this.place(this.botanical, gardens, cx, surf, cz);
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
    finalize(this.hospital, hospital);
    finalize(this.park, parks);
    for (let v = 0; v < SMALL_PARK_VARIANTS; v++) finalize(this.smallPark[v], smallParks[v]);
    finalize(this.plaza, plazas);
    finalize(this.sportsField, fields);
    finalize(this.botanical, gardens);
    finalize(this.pipe, pipes);
  }

  /** Show or hide the underground pipe markers (used by the water overlay). */
  setShowPipes(show: boolean): void {
    this.pipe.visible = show;
  }

  dispose(): void {
    for (const m of [
      this.plant, this.pump, this.pylon,
      this.police, this.fire, this.hospital,
      this.park, ...this.smallPark, this.plaza, this.sportsField, this.botanical,
      this.pipe,
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

/** Hospital: white ward block with red crosses, an ambulance bay and a helipad. */
export function hospitalGeometry(): THREE.BufferGeometry {
  const b = new MeshBuilder();
  b.box(0.92, 0.08, 0.92, 0, 0, 0, 0xb7b1a4);             // foundation pad
  b.box(0.74, 0.62, 0.62, 0, 0.08, -0.08, 0xeef1f4);      // main ward block
  b.box(0.78, 0.07, 0.66, 0, 0.7, -0.08, 0xd2d8de);       // roof slab
  // Window bands wrapping two storeys.
  for (const y of [0.22, 0.46]) {
    b.box(0.6, 0.12, 0.04, 0, y, 0.23, 0x7fa6c4);
    b.box(0.04, 0.12, 0.5, 0.37, y, -0.08, 0x7fa6c4);
    b.box(0.04, 0.12, 0.5, -0.37, y, -0.08, 0x7fa6c4);
  }
  // Red cross emblems — front and side.
  const cross = (x: number, y: number, z: number, vertical: boolean): void => {
    if (vertical) {
      b.box(0.05, 0.16, 0.02, x, y, z, 0xd83a36);
      b.box(0.16, 0.05, 0.02, x, y + 0.055, z, 0xd83a36);
    } else {
      b.box(0.02, 0.16, 0.05, x, y, z, 0xd83a36);
      b.box(0.02, 0.05, 0.16, x, y + 0.055, z, 0xd83a36);
    }
  };
  cross(0, 0.42, 0.235, true);
  cross(0.39, 0.42, -0.08, false);
  // Ambulance bay (covered drop-off porch) on the south face.
  b.box(0.5, 0.05, 0.26, 0, 0.34, 0.32, 0xe2e2e2);        // canopy
  b.box(0.05, 0.3, 0.05, -0.2, 0.08, 0.4, 0xc6cbd2);      // post
  b.box(0.05, 0.3, 0.05, 0.2, 0.08, 0.4, 0xc6cbd2);       // post
  b.box(0.34, 0.26, 0.04, 0, 0.08, 0.26, 0x9aa0a8);       // bay door
  // Rooftop helipad.
  b.box(0.34, 0.04, 0.34, 0, 0.77, -0.08, 0x394049);
  b.box(0.05, 0.02, 0.2, -0.07, 0.81, -0.08, 0xe6e6e6);
  b.box(0.05, 0.02, 0.2, 0.07, 0.81, -0.08, 0xe6e6e6);
  b.box(0.12, 0.02, 0.05, 0, 0.81, -0.08, 0xe6e6e6);
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

/** A low-poly tree — slim trunk and a faceted leafy crown. */
function smallTree(b: MeshBuilder, x: number, z: number, lush: number): void {
  b.cyl(0.035, 0.16, x, 0.07, z, 0x6b4a2e, 6);
  b.ico(0.15, x, 0.2, z, lush);
}

/** A simple slatted bench. */
function bench(b: MeshBuilder, x: number, z: number): void {
  b.box(0.18, 0.04, 0.07, x, 0.1, z, 0x9a7b4e);
  b.box(0.18, 0.06, 0.02, x, 0.14, z - 0.03, 0x9a7b4e);
}

/**
 * Four distinct Small-Park designs — chosen per placement by tile hash so a
 * city dotted with small parks never looks repetitive.
 */
export function smallParkGeometries(): THREE.BufferGeometry[] {
  const grass = 0x6aa048;

  // Variant 0 — a lone tree with a bench.
  const v0 = new MeshBuilder();
  v0.box(0.78, 0.07, 0.78, 0, 0, 0, grass);
  smallTree(v0, -0.04, -0.06, 0x478a3e);
  bench(v0, 0.06, 0.24);

  // Variant 1 — a pair of trees framing a short path.
  const v1 = new MeshBuilder();
  v1.box(0.78, 0.07, 0.78, 0, 0, 0, grass);
  v1.box(0.12, 0.02, 0.6, 0, 0.07, 0, 0xcabf94);
  smallTree(v1, -0.22, -0.16, 0x3f7a3a);
  smallTree(v1, 0.24, 0.18, 0x4f8a44);

  // Variant 2 — a flowerbed with colourful blooms.
  const v2 = new MeshBuilder();
  v2.box(0.78, 0.07, 0.78, 0, 0, 0, grass);
  v2.box(0.46, 0.05, 0.46, 0, 0.07, 0, 0x7a5a3e);         // soil bed
  const blooms = [0xe2604f, 0xe6c84a, 0xd47ab0, 0xf2f2f2];
  let bi = 0;
  for (const bx of [-0.13, 0.13]) {
    for (const bz of [-0.13, 0.13]) {
      v2.ico(0.07, bx, 0.12, bz, blooms[bi++ % blooms.length]);
    }
  }
  smallTree(v2, 0, -0.02, 0x478a3e);

  // Variant 3 — a hedged corner garden with a single tree.
  const v3 = new MeshBuilder();
  v3.box(0.78, 0.07, 0.78, 0, 0, 0, grass);
  v3.box(0.72, 0.14, 0.08, 0, 0.07, -0.32, 0x4f8a3e);     // hedge
  v3.box(0.08, 0.14, 0.72, -0.32, 0.07, 0, 0x4f8a3e);     // hedge
  smallTree(v3, 0.1, 0.1, 0x57864a);
  bench(v3, -0.05, 0.26);

  return [v0.build(), v1.build(), v2.build(), v3.build()];
}

/** Plaza: a paved civic square with a central fountain and benches. */
export function plazaGeometry(): THREE.BufferGeometry {
  const b = new MeshBuilder();
  b.box(0.94, 0.07, 0.94, 0, 0, 0, 0xc3b9a6);             // paved square
  b.box(0.94, 0.02, 0.94, 0, 0.07, 0, 0xb3a892);          // inlaid border tone
  // Central fountain — stone basin, water disc and a jet.
  b.cyl(0.26, 0.12, 0, 0.07, 0, 0xa9a08c, 16);
  b.cyl(0.2, 0.04, 0, 0.15, 0, 0x4fa3c4, 16);
  b.cyl(0.04, 0.22, 0, 0.19, 0, 0xcfe7f0, 8);
  b.ico(0.08, 0, 0.4, 0, 0xdff0f5);                       // spray crown
  // Four corner planters with shrubs.
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      b.box(0.16, 0.1, 0.16, sx * 0.32, 0.07, sz * 0.32, 0x8a8273);
      b.ico(0.1, sx * 0.32, 0.15, sz * 0.32, 0x4f8a3e);
    }
  }
  // Benches flanking the fountain.
  bench(b, -0.34, 0);
  bench(b, 0.34, 0);
  return b.build();
}

/** Sports Field: a marked pitch, two goals and a small stand. */
export function sportsFieldGeometry(): THREE.BufferGeometry {
  const b = new MeshBuilder();
  b.box(0.94, 0.07, 0.94, 0, 0, 0, 0x46992f);             // turf
  const line = 0xeef2f0;
  const y = 0.075;
  // Pitch boundary and halfway line.
  b.box(0.78, 0.012, 0.04, 0, y, 0.38, line);
  b.box(0.78, 0.012, 0.04, 0, y, -0.38, line);
  b.box(0.04, 0.012, 0.8, 0.39, y, 0, line);
  b.box(0.04, 0.012, 0.8, -0.39, y, 0, line);
  b.box(0.78, 0.012, 0.03, 0, y, 0, line);
  b.cyl(0.13, 0.012, 0, y, 0, line, 16);
  b.cyl(0.1, 0.014, 0, y + 0.002, 0, 0x46992f, 16);       // hollow centre circle
  // Goal frames at each end.
  const goal = (z: number): void => {
    b.box(0.3, 0.03, 0.03, 0, 0.2, z, 0xe6e6e6);
    b.box(0.03, 0.2, 0.03, -0.15, 0.07, z, 0xe6e6e6);
    b.box(0.03, 0.2, 0.03, 0.15, 0.07, z, 0xe6e6e6);
  };
  goal(0.42);
  goal(-0.42);
  // A small spectator stand along one side.
  for (let s = 0; s < 3; s++) {
    b.box(0.5, 0.06, 0.1, 0.42, 0.07 + s * 0.06, -0.16 + s * 0.1, 0x9aa0a8);
  }
  return b.build();
}

/** Botanical Garden: lush foliage, a pond, winding paths and a glasshouse. */
export function botanicalGardenGeometry(): THREE.BufferGeometry {
  const b = new MeshBuilder();
  b.box(0.94, 0.07, 0.94, 0, 0, 0, 0x4f9636);             // rich lawn
  // Curving gravel path.
  b.box(0.12, 0.02, 0.7, -0.06, 0.07, 0.1, 0xd8cda6);
  b.box(0.5, 0.02, 0.12, 0.14, 0.07, -0.18, 0xd8cda6);
  // Ornamental pond with a lily.
  b.box(0.32, 0.03, 0.26, 0.26, 0.07, 0.28, 0x4791b5);
  b.ico(0.05, 0.26, 0.09, 0.28, 0x57864a);
  // A cluster of trees of varied size and hue.
  smallTree(b, -0.3, -0.28, 0x3f7a3a);
  smallTree(b, -0.32, 0.24, 0x4f8a44);
  smallTree(b, 0.06, -0.32, 0x57864a);
  b.cyl(0.04, 0.2, -0.16, 0.07, 0.0, 0x6b4a2e, 6);
  b.cyl(0.16, 0.26, -0.16, 0.27, 0.0, 0x3f7a3a, 8, 0);    // tall conifer
  // Flowerbeds — rows of small blooms.
  const blooms = [0xe2604f, 0xe6c84a, 0xd47ab0, 0xf2f2f2];
  for (let k = 0; k < 4; k++) {
    b.ico(0.05, -0.34 + k * 0.06, 0.1, -0.04, blooms[k % blooms.length]);
  }
  // Glasshouse — a pale glazed pavilion with a pitched roof.
  b.box(0.3, 0.18, 0.22, 0.24, 0.07, -0.02, 0xcfe2e6);
  b.gable(0.32, 0.12, 0.24, 0.24, 0.25, -0.02, 0xa8c4c8);
  return b.build();
}
