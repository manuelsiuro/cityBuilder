import * as THREE from "three";
import type { CityData } from "../sim/CityData";
import type { Intersection } from "../sim/systems/IntersectionSystem";
import { lightState, dirAxis } from "../sim/systems/IntersectionSystem";
import { DIR_DX, DIR_DY } from "../sim/traffic/TrafficGrid";
import { TILE, tileSurfaceY } from "./constants";

/** Emissive colours for the three signal states. */
const SIGNAL_COLOR: Record<string, number> = {
  green: 0x46d66a,
  yellow: 0xe9b53a,
  red: 0xd6464a,
};

/** One signal head, lit by the state of the axis it controls. */
interface Head {
  mesh: THREE.Mesh;
  material: THREE.MeshStandardMaterial;
  inter: Intersection;
  axis: 0 | 1;
}

/**
 * Renders traffic signals at 4-way crossroads. Each signalled junction gets a
 * lit head on every approach edge; a head's colour is the live signal state of
 * the axis it faces. Built from the intersection list whenever junctions
 * change; recoloured every frame.
 */
export class TrafficLightRenderer {
  readonly group = new THREE.Group();

  private readonly headGeo = new THREE.BoxGeometry(0.2, 0.2, 0.2);
  private readonly poleGeo = new THREE.BoxGeometry(0.05, 0.55, 0.05);
  private readonly poleMat = new THREE.MeshStandardMaterial({
    color: 0x2a2e35,
    roughness: 0.8,
  });
  private heads: Head[] = [];

  /** Rebuild every signal head from the current intersection list. */
  rebuild(city: CityData, intersections: readonly Intersection[]): void {
    this.clearHeads();
    const { grid } = city;

    for (const inter of intersections) {
      if (inter.kind !== "light") continue;
      const tx = grid.x(inter.tile);
      const ty = grid.y(inter.tile);
      const surfaceY = tileSurfaceY(city, inter.tile);

      for (let d = 0; d < 4; d++) {
        const wx = (tx - grid.width / 2 + 0.5 + DIR_DX[d] * 0.42) * TILE;
        const wz = (ty - grid.height / 2 + 0.5 + DIR_DY[d] * 0.42) * TILE;

        const pole = new THREE.Mesh(this.poleGeo, this.poleMat);
        pole.position.set(wx, surfaceY + 0.275, wz);
        this.group.add(pole);

        const material = new THREE.MeshStandardMaterial({
          emissiveIntensity: 1,
          roughness: 0.5,
        });
        const mesh = new THREE.Mesh(this.headGeo, material);
        mesh.position.set(wx, surfaceY + 0.62, wz);
        this.group.add(mesh);

        this.heads.push({ mesh, material, inter, axis: dirAxis(d) });
      }
    }
  }

  /** Recolour every head from the signal state at simulation `tick`. */
  update(tick: number): void {
    for (const head of this.heads) {
      const state = lightState(head.inter, tick, head.axis);
      const hex = SIGNAL_COLOR[state];
      head.material.color.setHex(hex);
      head.material.emissive.setHex(hex);
    }
  }

  dispose(): void {
    this.clearHeads();
    this.headGeo.dispose();
    this.poleGeo.dispose();
    this.poleMat.dispose();
  }

  private clearHeads(): void {
    for (const head of this.heads) head.material.dispose();
    this.heads = [];
    this.group.clear();
  }
}
