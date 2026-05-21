import * as THREE from "three";
import type { CityData } from "../sim/CityData";
import type { ServiceVehicle, VehicleKind } from "../sim/systems/DispatchSystem";
import { MeshBuilder } from "./meshlib/buildingFactory";
import { TILE, tileSurfaceY } from "./constants";

/** World-space Y rotation for each travel-direction code (N/E/S/W). */
const DIR_HEADING = [Math.PI, Math.PI / 2, 0, -Math.PI / 2];

/** Pool index order — keeps the InstancedMesh array aligned with `KIND`. */
const KIND: VehicleKind[] = ["fire", "police", "medical"];

/**
 * Renders dispatched emergency vehicles as low-poly instanced meshes — a fire
 * truck, a police car and an ambulance, one `InstancedMesh` per kind. Unlike
 * civilian cars these carry fixed liveries, so colours are baked into the
 * geometry rather than tinted per instance. Tile positions are interpolated by
 * the loop's `alpha` between sim ticks.
 */
export class ServiceVehicleRenderer {
  readonly group = new THREE.Group();

  private readonly material: THREE.MeshStandardMaterial;
  private readonly meshes: THREE.InstancedMesh[];
  private readonly counts = [0, 0, 0];
  private readonly dummy = new THREE.Object3D();

  constructor(maxPerKind: number) {
    this.material = new THREE.MeshStandardMaterial({
      vertexColors: true,
      roughness: 0.5,
      metalness: 0.14,
      flatShading: true,
    });
    this.meshes = [fireTruckGeometry(), policeCarGeometry(), ambulanceGeometry()].map(
      (geo) => {
        const mesh = new THREE.InstancedMesh(geo, this.material, maxPerKind);
        mesh.count = 0;
        mesh.frustumCulled = false;
        mesh.castShadow = true;
        this.group.add(mesh);
        return mesh;
      },
    );
  }

  /** Re-place every active vehicle, interpolated by `alpha` (0–1). */
  sync(vehicles: readonly ServiceVehicle[], city: CityData, alpha: number): void {
    const { grid } = city;
    this.counts[0] = this.counts[1] = this.counts[2] = 0;

    for (const v of vehicles) {
      if (!v.active) continue;
      const tx = v.prevTileX + (v.tileX - v.prevTileX) * alpha;
      const ty = v.prevTileY + (v.tileY - v.prevTileY) * alpha;
      const tile = grid.index(
        Math.max(0, Math.min(grid.width - 1, Math.round(tx))),
        Math.max(0, Math.min(grid.height - 1, Math.round(ty))),
      );

      const dx = v.tileX - v.prevTileX;
      const dz = v.tileY - v.prevTileY;
      const heading =
        Math.abs(dx) > 1e-4 || Math.abs(dz) > 1e-4
          ? Math.atan2(dx, dz)
          : DIR_HEADING[v.dir];

      this.dummy.position.set(
        (tx - grid.width / 2 + 0.5) * TILE,
        tileSurfaceY(city, tile) + 0.11,
        (ty - grid.height / 2 + 0.5) * TILE,
      );
      this.dummy.rotation.set(0, heading, 0);
      this.dummy.updateMatrix();

      const type = KIND.indexOf(v.kind);
      const mesh = this.meshes[type];
      mesh.setMatrixAt(this.counts[type]++, this.dummy.matrix);
    }

    for (let t = 0; t < this.meshes.length; t++) {
      this.meshes[t].count = this.counts[t];
      this.meshes[t].instanceMatrix.needsUpdate = true;
    }
  }

  dispose(): void {
    for (const mesh of this.meshes) mesh.geometry.dispose();
    this.material.dispose();
  }
}

/** Wheels along a `w`×`l` footprint — `axles` z-positions, both sides. */
function wheels(b: MeshBuilder, w: number, axles: number[]): void {
  for (const sx of [-1, 1]) {
    for (const z of axles) {
      b.box(0.08, 0.1, 0.14, sx * (w / 2 - 0.01), 0, z, 0x0a0a0a);
    }
  }
}

/** A roof light bar split into red and blue lamps. */
function lightBar(b: MeshBuilder, y: number, z: number): void {
  b.box(0.07, 0.05, 0.12, -0.05, y, z, 0xe23a36);
  b.box(0.07, 0.05, 0.12, 0.05, y, z, 0x2f6ad8);
}

/** Fire truck: a long red engine with a cab, a silver ladder and six wheels. */
export function fireTruckGeometry(): THREE.BufferGeometry {
  const b = new MeshBuilder();
  const w = 0.32;
  const l = 0.66;
  wheels(b, w, [l / 2 - 0.13, -0.06, -l / 2 + 0.12]);
  // Chassis and the long pump-body behind the cab.
  b.box(w, 0.14, l, 0, 0.05, 0, 0xc0241c);
  b.box(w, 0.16, l * 0.52, 0, 0.19, -l * 0.16, 0xd22a20);
  // Cab up front with a dark windscreen.
  b.box(w, 0.2, l * 0.3, 0, 0.19, l * 0.3, 0xc0241c);
  b.box(w * 0.92, 0.1, 0.05, 0, 0.3, l * 0.44, 0x1b2128);
  // White detailing stripe and bumper.
  b.box(w + 0.01, 0.04, l, 0, 0.12, 0, 0xf0f0f0);
  b.box(w, 0.08, 0.06, 0, 0.05, l / 2, 0xe8e8e8);
  // Silver ladder running the length of the body.
  b.box(0.05, 0.04, l * 0.62, -0.07, 0.36, -l * 0.12, 0xb9bdc2);
  b.box(0.05, 0.04, l * 0.62, 0.07, 0.36, -l * 0.12, 0xb9bdc2);
  for (let k = 0; k < 5; k++) {
    b.box(0.13, 0.03, 0.03, 0, 0.37, -l * 0.32 + k * 0.1, 0xa6abb0);
  }
  lightBar(b, 0.39, l * 0.16);
  return b.build();
}

/** Police car: a two-tone sedan with a roof light bar. */
export function policeCarGeometry(): THREE.BufferGeometry {
  const b = new MeshBuilder();
  const w = 0.3;
  const l = 0.56;
  wheels(b, w, [l / 2 - 0.13, -l / 2 + 0.13]);
  // White lower body, black mid-band — the classic livery.
  b.box(w, 0.09, l, 0, 0.05, 0, 0xf0f2f4);
  b.box(w + 0.005, 0.06, l * 0.9, 0, 0.12, 0, 0x14171c);
  b.box(w, 0.04, l, 0, 0.18, 0, 0xf0f2f4);
  // Raised cabin with glazing.
  b.box(w * 0.86, 0.12, l * 0.46, 0, 0.22, -0.03, 0xf0f2f4);
  b.box(w * 0.92, 0.085, l * 0.42, 0, 0.235, -0.03, 0x161a20);
  // Door star badge and the roof light bar.
  b.box(0.005, 0.07, 0.09, w / 2, 0.1, 0.04, 0x2f6ad8);
  lightBar(b, 0.345, -0.03);
  return b.build();
}

/** Ambulance: a white box van with red crosses and a light bar. */
export function ambulanceGeometry(): THREE.BufferGeometry {
  const b = new MeshBuilder();
  const w = 0.32;
  const l = 0.6;
  wheels(b, w, [l / 2 - 0.14, -l / 2 + 0.14]);
  // White box body and a slightly lower cab.
  b.box(w, 0.3, l * 0.62, 0, 0.06, -l * 0.16, 0xf2f4f6);
  b.box(w, 0.22, l * 0.4, 0, 0.06, l * 0.28, 0xf2f4f6);
  b.box(w * 0.9, 0.1, 0.05, 0, 0.2, l / 2, 0x1b2128);
  // Red accent stripe wrapping the body.
  b.box(w + 0.01, 0.05, l, 0, 0.16, 0, 0xe23a36);
  // Red cross on each side panel.
  for (const sx of [-1, 1]) {
    b.box(0.01, 0.12, 0.04, sx * (w / 2), 0.21, -l * 0.16, 0xe23a36);
    b.box(0.01, 0.04, 0.12, sx * (w / 2), 0.25, -l * 0.16, 0xe23a36);
  }
  lightBar(b, 0.37, l * 0.05);
  return b.build();
}
