import * as THREE from "three";
import type { CityData } from "../sim/CityData";
import type { Incident, IncidentKind } from "../sim/systems/IncidentSystem";
import { MeshBuilder } from "./meshlib/buildingFactory";
import { tileCenterX, tileCenterZ, tileSurfaceY } from "./constants";

/** Pool index order — keeps the InstancedMesh array aligned with `KIND`. */
const KIND: IncidentKind[] = ["crime", "medical"];

/**
 * Floats a beacon over every open or assigned incident so the player can see
 * what the emergency services are responding to — a red marker for crime, a
 * white cross for a medical emergency. One `InstancedMesh` per kind; positions
 * are re-placed each frame from the live incident list.
 */
export class IncidentMarkerRenderer {
  readonly group = new THREE.Group();

  private readonly material: THREE.MeshStandardMaterial;
  private readonly meshes: THREE.InstancedMesh[];
  private readonly counts = [0, 0];
  private readonly dummy = new THREE.Object3D();

  constructor(maxPerKind: number) {
    this.material = new THREE.MeshStandardMaterial({
      vertexColors: true,
      roughness: 0.45,
      flatShading: true,
      emissive: 0x000000,
    });
    this.meshes = [crimeMarkerGeometry(), medicalMarkerGeometry()].map((geo) => {
      const mesh = new THREE.InstancedMesh(geo, this.material, maxPerKind);
      mesh.count = 0;
      mesh.frustumCulled = false;
      this.group.add(mesh);
      return mesh;
    });
  }

  /** Re-place a beacon over every live incident. Call every render frame. */
  sync(incidents: readonly Incident[], city: CityData, timeMs: number): void {
    const { grid } = city;
    this.counts[0] = this.counts[1] = 0;
    // A gentle shared bob so the markers read as active.
    const bob = Math.sin(timeMs / 320) * 0.05;

    for (const inc of incidents) {
      if (inc.state === "resolved") continue;
      const type = KIND.indexOf(inc.kind);
      if (type < 0) continue;
      this.dummy.position.set(
        tileCenterX(grid.x(inc.tile), grid),
        tileSurfaceY(city, inc.tile) + 0.16 + bob,
        tileCenterZ(grid.y(inc.tile), grid),
      );
      this.dummy.rotation.set(0, timeMs / 900, 0);
      this.dummy.updateMatrix();
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

/** Crime beacon: a slim post topped with a red warning diamond. */
function crimeMarkerGeometry(): THREE.BufferGeometry {
  const b = new MeshBuilder();
  b.box(0.04, 0.36, 0.04, 0, 0, 0, 0x4a4f57);
  b.ico(0.13, 0, 0.34, 0, 0xe23a36, 0);
  return b.build();
}

/** Medical beacon: a slim post topped with a white cross. */
function medicalMarkerGeometry(): THREE.BufferGeometry {
  const b = new MeshBuilder();
  b.box(0.04, 0.36, 0.04, 0, 0, 0, 0x4a4f57);
  b.box(0.2, 0.18, 0.18, 0, 0.36, 0, 0xf2f4f6);
  // Red cross on the front face of the white box.
  b.box(0.05, 0.13, 0.02, 0, 0.385, 0.09, 0xe23a36);
  b.box(0.13, 0.05, 0.02, 0, 0.42, 0.09, 0xe23a36);
  return b.build();
}
