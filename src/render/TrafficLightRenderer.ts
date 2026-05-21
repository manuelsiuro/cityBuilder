import * as THREE from "three";
import type { CityData } from "../sim/CityData";
import type { Intersection } from "../sim/systems/IntersectionSystem";
import { lightState, dirAxis } from "../sim/systems/IntersectionSystem";
import { DIR_DX, DIR_DY } from "../sim/traffic/TrafficGrid";
import { TILE, tileSurfaceY } from "./constants";

/** Lens hues in top-to-bottom order: red, amber, green. */
const LENS_HEX = [0xd6464a, 0xe9b53a, 0x46d66a] as const;
/** The signal state each lens index lights up on. */
const LENS_STATE = ["red", "yellow", "green"] as const;

/** Pole height, in world units. */
const POLE_H = 0.62;
/** Signal-housing height. */
const HOUSING_H = 0.44;
/** World Y of the housing centre. */
const HOUSING_Y = POLE_H + HOUSING_H / 2;
/** Vertical spacing between lenses. */
const LENS_GAP = 0.13;
/** Offset from the junction centre toward the approach edge. */
const EDGE = 0.46;
/** Offset from the centreline to the kerb, on the driver's right. */
const SIDE = 0.46;
/** How dark an unlit lens looks — still tinted so it reads as red/amber/green. */
const UNLIT_DIM = 0.26;

/** One signal fixture — three lenses driven by one axis of one junction. */
interface Fixture {
  inter: Intersection;
  axis: 0 | 1;
  /** Lens materials, red → amber → green. */
  lenses: THREE.MeshStandardMaterial[];
}

/**
 * Renders traffic signals at 4-way crossroads. Each approach gets a kerb-side
 * fixture — a pole, a housing, and three stacked lenses (red/amber/green) — set
 * on the driver's right and facing the oncoming traffic. Every frame the lens
 * for the live signal state lights up; the other two stay dimly tinted.
 */
export class TrafficLightRenderer {
  readonly group = new THREE.Group();

  private readonly poleGeo = new THREE.BoxGeometry(0.05, POLE_H, 0.05);
  private readonly housingGeo = new THREE.BoxGeometry(0.18, HOUSING_H, 0.12);
  private readonly lensGeo = new THREE.BoxGeometry(0.1, 0.1, 0.05);
  private readonly bodyMat = new THREE.MeshStandardMaterial({
    color: 0x23262c,
    roughness: 0.7,
    metalness: 0.1,
  });
  private fixtures: Fixture[] = [];

  /** Rebuild every signal fixture from the current intersection list. */
  rebuild(city: CityData, intersections: readonly Intersection[]): void {
    this.clearFixtures();
    const { grid } = city;

    for (const inter of intersections) {
      if (inter.kind !== "light") continue;
      const tx = grid.x(inter.tile);
      const ty = grid.y(inter.tile);
      const surfaceY = tileSurfaceY(city, inter.tile);
      for (let d = 0; d < 4; d++) {
        this.fixtures.push(this.buildFixture(grid, tx, ty, surfaceY, d, inter));
      }
    }
  }

  /** Build one fixture for the approach arriving from direction `d`. */
  private buildFixture(
    grid: CityData["grid"],
    tx: number,
    ty: number,
    surfaceY: number,
    d: number,
    inter: Intersection,
  ): Fixture {
    // Traffic arrives from `d` and travels `t`; the fixture sits at the kerb on
    // that traffic's right and faces back toward the oncoming driver.
    const t = (d + 2) % 4;
    const offX = DIR_DX[d] * EDGE + -DIR_DY[t] * SIDE;
    const offZ = DIR_DY[d] * EDGE + DIR_DX[t] * SIDE;

    const fixture = new THREE.Group();
    fixture.position.set(
      (tx - grid.width / 2 + 0.5 + offX) * TILE,
      surfaceY,
      (ty - grid.height / 2 + 0.5 + offZ) * TILE,
    );
    fixture.rotation.y = Math.atan2(DIR_DX[d], DIR_DY[d]);

    const pole = new THREE.Mesh(this.poleGeo, this.bodyMat);
    pole.position.y = POLE_H / 2;
    fixture.add(pole);

    const housing = new THREE.Mesh(this.housingGeo, this.bodyMat);
    housing.position.y = HOUSING_Y;
    fixture.add(housing);

    const lenses: THREE.MeshStandardMaterial[] = [];
    for (let k = 0; k < 3; k++) {
      const mat = new THREE.MeshStandardMaterial({ roughness: 0.4 });
      const lens = new THREE.Mesh(this.lensGeo, mat);
      lens.position.set(0, HOUSING_Y + LENS_GAP * (1 - k), 0.085);
      fixture.add(lens);
      lenses.push(mat);
    }

    this.group.add(fixture);
    return { inter, axis: dirAxis(d), lenses };
  }

  /** Light the active lens of every fixture from the signal state at `tick`. */
  update(tick: number): void {
    for (const f of this.fixtures) {
      const state = lightState(f.inter, tick, f.axis);
      for (let k = 0; k < 3; k++) {
        const mat = f.lenses[k];
        if (LENS_STATE[k] === state) {
          mat.color.setHex(LENS_HEX[k]);
          mat.emissive.setHex(LENS_HEX[k]);
          mat.emissiveIntensity = 1;
        } else {
          mat.color.setHex(LENS_HEX[k]).multiplyScalar(UNLIT_DIM);
          mat.emissive.setHex(0x000000);
        }
      }
    }
  }

  dispose(): void {
    this.clearFixtures();
    this.poleGeo.dispose();
    this.housingGeo.dispose();
    this.lensGeo.dispose();
    this.bodyMat.dispose();
  }

  private clearFixtures(): void {
    for (const f of this.fixtures) {
      for (const mat of f.lenses) mat.dispose();
    }
    this.fixtures = [];
    this.group.clear();
  }
}
