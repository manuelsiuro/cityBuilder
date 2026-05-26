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

/**
 * 4 corner Ys for the top of tile (tx, ty): [NW, NE, SW, SE].
 *
 * Each grid corner touched by any road tile takes its Y from the *highest*
 * road tier touching it. A road tile then reads its 4 corners from this
 * implicit shared heightmap, which means:
 *
 *  - Continuity at every road-to-road boundary (both sides see the same
 *    touching tiles, so they agree on the corner Y).
 *  - The single-tile ramp lives on the *lower* tile facing a higher road
 *    neighbour, which preserves peak elevations (a peak's MAX is its own
 *    tier) and keeps plateau tiles fully flat (junctions and corners on a
 *    plateau stay at the plateau's tier).
 *  - Uniform rule across straights, corners, T-junctions, 4-ways and
 *    dead-ends — no special-cased configurations.
 *
 * Non-road tiles always return four equal Ys at their own surface Y.
 */
export function tileCornerYs(
  city: CityData,
  tx: number,
  ty: number,
): [number, number, number, number] {
  const i = city.grid.index(tx, ty);
  if (city.terrainType[i] === TerrainType.Water) {
    return [WATER_Y, WATER_Y, WATER_Y, WATER_Y];
  }
  const E = city.elevation[i];
  const baseY = E * ELEV_STEP;

  if (city.road[i] === 0) return [baseY, baseY, baseY, baseY];

  return [
    cornerLiftY(city, tx, ty, E, -1, 0, 0, -1), // NW: touches W and N
    cornerLiftY(city, tx, ty, E, 0, -1, 1, 0),  // NE: touches N and E
    cornerLiftY(city, tx, ty, E, -1, 0, 0, 1),  // SW: touches W and S
    cornerLiftY(city, tx, ty, E, 0, 1, 1, 0),   // SE: touches S and E
  ];
}

/**
 * For one of a road tile's 4 corners, return the corner Y. Looks at the two
 * cardinal neighbours touching the corner (offsets `dx1,dz1` and `dx2,dz2`);
 * if either is a road tile at a strictly higher elevation than `ownE`, the
 * corner lifts to that higher elevation. Otherwise the corner stays at the
 * tile's own surface Y. (Water and non-road neighbours don't lift.)
 */
function cornerLiftY(
  city: CityData,
  tx: number,
  ty: number,
  ownE: number,
  dx1: number,
  dz1: number,
  dx2: number,
  dz2: number,
): number {
  let highest = ownE;
  for (const [dx, dz] of [
    [dx1, dz1],
    [dx2, dz2],
  ]) {
    const nx = tx + dx;
    const ny = ty + dz;
    if (!city.grid.inBounds(nx, ny)) continue;
    const ni = city.grid.index(nx, ny);
    if (city.road[ni] === 0) continue;
    if (city.terrainType[ni] === TerrainType.Water) continue;
    const nE = city.elevation[ni];
    if (nE > highest) highest = nE;
  }
  return highest * ELEV_STEP;
}

/**
 * Bilinear sample of a road tile's surface Y at fractional offset (fx, fz),
 * where (0,0) is the NW corner and (1,1) is the SE corner.
 */
export function sampleRoadY(
  corners: readonly [number, number, number, number],
  fx: number,
  fz: number,
): number {
  const [nw, ne, sw, se] = corners;
  const top = nw + (ne - nw) * fx;
  const bot = sw + (se - sw) * fx;
  return top + (bot - top) * fz;
}

/**
 * Deterministic per-tile hash used across renderers for placement variety —
 * ground-colour jitter, street-lamp placement, tree rotation. Same (x, y)
 * always yields the same value, so independent renderers stay consistent.
 */
export function hashTile(x: number, y: number): number {
  let h = (Math.imul(x, 374761393) ^ Math.imul(y, 668265263)) >>> 0;
  h ^= h >>> 13;
  return h >>> 0;
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
