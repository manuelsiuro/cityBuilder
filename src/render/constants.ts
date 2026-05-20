import type { Grid } from "../engine/Grid";
import type { CityData } from "../sim/CityData";
import { TerrainType } from "../sim/layers";

/** World-space size of one tile. */
export const TILE = 1;

/** Vertical world-space gap between two elevation tiers. */
export const ELEV_STEP = 0.42;

/** World-space Y of water surfaces. */
export const WATER_Y = -0.18;

/** World-space Y of the plinth bottom — border walls drop to here. */
export const BASE_Y = -1.6;

/** World-space Y of the top surface of an elevation tier. */
export function elevationY(tier: number): number {
  return tier * ELEV_STEP;
}

/** World-space X of the *corner* of tile column `tx`. Map is centred on origin. */
export function tileCornerX(tx: number, grid: Grid): number {
  return (tx - grid.width / 2) * TILE;
}

/** World-space Z of the *corner* of tile row `ty`. */
export function tileCornerZ(ty: number, grid: Grid): number {
  return (ty - grid.height / 2) * TILE;
}

/** World-space X of the *centre* of tile column `tx`. */
export function tileCenterX(tx: number, grid: Grid): number {
  return tileCornerX(tx, grid) + TILE / 2;
}

/** World-space Z of the *centre* of tile row `ty`. */
export function tileCenterZ(ty: number, grid: Grid): number {
  return tileCornerZ(ty, grid) + TILE / 2;
}

/** World-space Y of a tile's walkable surface (water surface or land top). */
export function tileSurfaceY(city: CityData, index: number): number {
  return city.terrainType[index] === TerrainType.Water
    ? WATER_Y
    : city.elevation[index] * ELEV_STEP;
}

/** Convert a world X/Z back to integer tile coordinates. */
export function worldToTile(
  worldX: number,
  worldZ: number,
  grid: Grid,
): { x: number; y: number } {
  return {
    x: Math.floor(worldX / TILE + grid.width / 2),
    y: Math.floor(worldZ / TILE + grid.height / 2),
  };
}
