import * as THREE from "three";
import type { CityData } from "../sim/CityData";
import { Biome, TerrainType } from "../sim/layers";
import {
  BASE_Y,
  TILE,
  WATER_Y,
  hashTile,
  tileCornerX,
  tileCornerZ,
  tileCornerYs,
} from "./constants";

/**
 * Builds the city terrain as a single stepped mesh — flat tile tops with
 * vertical cliff walls where neighbouring tiles differ in height, giving the
 * blocky SimCity-2000 silhouette. Rebuilt only when the terrain layer changes.
 */
export class TerrainMesh {
  readonly mesh: THREE.Mesh;
  private geometry: THREE.BufferGeometry;
  private readonly material: THREE.MeshStandardMaterial;

  constructor(city: CityData) {
    this.material = new THREE.MeshStandardMaterial({
      vertexColors: true,
      roughness: 0.95,
      metalness: 0.0,
      flatShading: true,
    });
    this.geometry = buildGeometry(city);
    this.mesh = new THREE.Mesh(this.geometry, this.material);
    this.mesh.receiveShadow = true;
    this.mesh.castShadow = true;
  }

  /** Regenerate geometry after the terrain layer was edited. */
  rebuild(city: CityData): void {
    this.geometry.dispose();
    this.geometry = buildGeometry(city);
    this.mesh.geometry = this.geometry;
  }

  dispose(): void {
    this.geometry.dispose();
    this.material.dispose();
  }
}

const _color = new THREE.Color();

/** Base ground colour per biome (water is coloured separately). */
const BIOME_COLOR: Record<Biome, number> = {
  [Biome.Ocean]: 0x4f7d3a,
  [Biome.Beach]: 0xdcc88f,
  [Biome.Plains]: 0x6f9c4a,
  [Biome.Forest]: 0x3f6f37,
  [Biome.Desert]: 0xc9a86a,
  [Biome.Tundra]: 0x8a9477,
  [Biome.Snow]: 0xe8edf0,
  [Biome.Mountain]: 0x8b8784,
};

function tileColor(city: CityData, i: number, out: THREE.Color): void {
  if (city.terrainType[i] === TerrainType.Water) {
    // Lighter shallows where water laps the shore, deeper blue offshore.
    out.setHex(touchesLand(city, i) ? 0x4791b5 : 0x2f6ea5);
  } else {
    out.setHex(BIOME_COLOR[city.biome[i] as Biome]);
    // Higher ground catches more light.
    const t = city.elevation[i] / 8;
    out.lerp(_lerpTarget.setHex(0xffffff), t * 0.12);
  }
  // Subtle deterministic per-tile jitter breaks up the flat ground.
  const j = (hashTile(city.grid.x(i), city.grid.y(i)) % 1000) / 1000;
  out.multiplyScalar(0.94 + j * 0.12);
}
const _lerpTarget = new THREE.Color();

/** True if any 4-neighbour of tile `i` is land (non-water). */
function touchesLand(city: CityData, i: number): boolean {
  return hasNeighbor(city, i, false);
}

/** True if any 4-neighbour of `i` is (or isn't, per `water`) a water tile. */
function hasNeighbor(city: CityData, i: number, water: boolean): boolean {
  const { grid } = city;
  const x = grid.x(i);
  const y = grid.y(i);
  for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
    if (!grid.inBounds(x + dx, y + dy)) continue;
    const isWater =
      city.terrainType[grid.index(x + dx, y + dy)] === TerrainType.Water;
    if (isWater === water) return true;
  }
  return false;
}

function buildGeometry(city: CityData): THREE.BufferGeometry {
  const { grid } = city;
  const positions: number[] = [];
  const colors: number[] = [];

  const pushVert = (x: number, y: number, z: number, c: THREE.Color): void => {
    positions.push(x, y, z);
    colors.push(c.r, c.g, c.b);
  };
  const pushTri = (
    ax: number, ay: number, az: number,
    bx: number, by: number, bz: number,
    cx: number, cy: number, cz: number,
    c: THREE.Color,
  ): void => {
    pushVert(ax, ay, az, c);
    pushVert(bx, by, bz, c);
    pushVert(cx, cy, cz, c);
  };

  const wall = new THREE.Color();

  // Water tiles stay flat at WATER_Y; only land uses the corner-averaged Ys
  // (which smooth around road tiles).
  for (let ty = 0; ty < grid.height; ty++) {
    for (let tx = 0; tx < grid.width; tx++) {
      const i = grid.index(tx, ty);
      const isWater = city.terrainType[i] === TerrainType.Water;
      const corners = isWater
        ? ([WATER_Y, WATER_Y, WATER_Y, WATER_Y] as [number, number, number, number])
        : tileCornerYs(city, tx, ty);
      const [yNW, yNE, ySW, ySE] = corners;
      const x0 = tileCornerX(tx, grid);
      const x1 = x0 + TILE;
      const z0 = tileCornerZ(ty, grid);
      const z1 = z0 + TILE;

      tileColor(city, i, _color);

      // Top quad — possibly sloped via per-corner Ys.
      pushTri(x0, yNW, z0, x0, ySW, z1, x1, ySE, z1, _color);
      pushTri(x0, yNW, z0, x1, ySE, z1, x1, yNE, z0, _color);

      // Cliff/ramp walls toward each neighbour. Each wall is a quad between
      // this tile's two corner Ys at the shared edge and the neighbour's two
      // corner Ys at the same edge. Skip when both pairs match.
      wall.copy(_color).multiplyScalar(0.62);
      const nbrEast = neighborCorners(city, tx + 1, ty);
      // East edge: my NE (z0) & SE (z1) vs neighbour NW & SW.
      if (yNE - nbrEast[0] > 1e-4 || ySE - nbrEast[2] > 1e-4) {
        pushTri(x1, nbrEast[0], z0, x1, yNE, z0, x1, ySE, z1, wall);
        pushTri(x1, nbrEast[0], z0, x1, ySE, z1, x1, nbrEast[2], z1, wall);
      }
      const nbrWest = neighborCorners(city, tx - 1, ty);
      // West edge: my NW (z0) & SW (z1) vs neighbour NE & SE.
      if (yNW - nbrWest[1] > 1e-4 || ySW - nbrWest[3] > 1e-4) {
        pushTri(x0, nbrWest[3], z1, x0, ySW, z1, x0, yNW, z0, wall);
        pushTri(x0, nbrWest[3], z1, x0, yNW, z0, x0, nbrWest[1], z0, wall);
      }
      const nbrSouth = neighborCorners(city, tx, ty + 1);
      // South edge: my SW (x0) & SE (x1) vs neighbour NW & NE.
      if (ySW - nbrSouth[0] > 1e-4 || ySE - nbrSouth[1] > 1e-4) {
        pushTri(x1, nbrSouth[1], z1, x1, ySE, z1, x0, ySW, z1, wall);
        pushTri(x1, nbrSouth[1], z1, x0, ySW, z1, x0, nbrSouth[0], z1, wall);
      }
      const nbrNorth = neighborCorners(city, tx, ty - 1);
      // North edge: my NW (x0) & NE (x1) vs neighbour SW & SE.
      if (yNW - nbrNorth[2] > 1e-4 || yNE - nbrNorth[3] > 1e-4) {
        pushTri(x0, nbrNorth[2], z0, x0, yNW, z0, x1, yNE, z0, wall);
        pushTri(x0, nbrNorth[2], z0, x1, yNE, z0, x1, nbrNorth[3], z0, wall);
      }
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
  geo.computeVertexNormals();
  return geo;
}

/**
 * 4 corner Ys of a neighbour tile (NW, NE, SW, SE), or BASE_Y at all corners
 * when the neighbour is off-map (the plinth wall drops to BASE_Y).
 */
function neighborCorners(
  city: CityData,
  tx: number,
  ty: number,
): [number, number, number, number] {
  if (!city.grid.inBounds(tx, ty)) return [BASE_Y, BASE_Y, BASE_Y, BASE_Y];
  const i = city.grid.index(tx, ty);
  if (city.terrainType[i] === TerrainType.Water) {
    return [WATER_Y, WATER_Y, WATER_Y, WATER_Y];
  }
  return tileCornerYs(city, tx, ty);
}
