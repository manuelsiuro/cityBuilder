import * as THREE from "three";
import type { CityData } from "../sim/CityData";
import { TerrainType } from "../sim/layers";
import { BASE_Y, ELEV_STEP, TILE, WATER_Y, tileCornerX, tileCornerZ } from "./constants";

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

function tileTopY(city: CityData, i: number): number {
  return city.terrainType[i] === TerrainType.Water ? WATER_Y : city.elevation[i] * ELEV_STEP;
}

function tileColor(city: CityData, i: number, out: THREE.Color): void {
  const type = city.terrainType[i];
  if (type === TerrainType.Water) {
    out.setHex(0x2f6ea5);
  } else if (type === TerrainType.Rock) {
    out.setHex(0x8b8784);
  } else {
    const t = city.elevation[i] / 8;
    out.setHex(0x4f7d3a).lerp(_lerpTarget.setHex(0x86ad5c), t);
  }
}
const _lerpTarget = new THREE.Color();

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

  for (let ty = 0; ty < grid.height; ty++) {
    for (let tx = 0; tx < grid.width; tx++) {
      const i = grid.index(tx, ty);
      const h = tileTopY(city, i);
      const x0 = tileCornerX(tx, grid);
      const x1 = x0 + TILE;
      const z0 = tileCornerZ(ty, grid);
      const z1 = z0 + TILE;

      tileColor(city, i, _color);

      // Flat top quad (normal +Y).
      pushTri(x0, h, z0, x0, h, z1, x1, h, z1, _color);
      pushTri(x0, h, z0, x1, h, z1, x1, h, z0, _color);

      // Cliff walls toward any lower neighbour (or the map edge).
      wall.copy(_color).multiplyScalar(0.62);
      const east = neighborTopY(city, tx + 1, ty);
      if (h - east > 1e-4) {
        pushTri(x1, east, z0, x1, h, z0, x1, h, z1, wall);
        pushTri(x1, east, z0, x1, h, z1, x1, east, z1, wall);
      }
      const west = neighborTopY(city, tx - 1, ty);
      if (h - west > 1e-4) {
        pushTri(x0, west, z1, x0, h, z1, x0, h, z0, wall);
        pushTri(x0, west, z1, x0, h, z0, x0, west, z0, wall);
      }
      const south = neighborTopY(city, tx, ty + 1);
      if (h - south > 1e-4) {
        pushTri(x1, south, z1, x1, h, z1, x0, h, z1, wall);
        pushTri(x1, south, z1, x0, h, z1, x0, south, z1, wall);
      }
      const north = neighborTopY(city, tx, ty - 1);
      if (h - north > 1e-4) {
        pushTri(x0, north, z0, x0, h, z0, x1, h, z0, wall);
        pushTri(x0, north, z0, x1, h, z0, x1, north, z0, wall);
      }
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
  geo.computeVertexNormals();
  return geo;
}

/** Top Y of a neighbour tile, or the plinth base when out of bounds. */
function neighborTopY(city: CityData, x: number, y: number): number {
  if (!city.grid.inBounds(x, y)) return BASE_Y;
  return tileTopY(city, city.grid.index(x, y));
}
