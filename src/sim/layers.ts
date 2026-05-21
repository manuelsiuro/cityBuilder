/**
 * Tile-layer enums, map constants, and the dirty-flag bitset. These describe
 * the *simulation* data — purely numeric, renderer-agnostic.
 */

/** Elevation tiers a land tile can occupy (0 = sea level). */
export const MAX_ELEVATION = 8;

export enum TerrainType {
  Grass = 0,
  Water = 1,
  Rock = 2,
}

/**
 * Climate biome of a land tile — orthogonal to `TerrainType`. Driven by the
 * generator's temperature/moisture maps; affects tile colour, tree placement,
 * land value, growth, and pollution. Water tiles are always `Ocean`.
 */
export enum Biome {
  /** Default for an unclassified tile — a benign, buildable land biome. */
  Plains = 0,
  Ocean = 1,
  Beach = 2,
  Forest = 3,
  Desert = 4,
  Tundra = 5,
  Snow = 6,
  Mountain = 7,
}

export enum Zone {
  None = 0,
  Residential = 1,
  Commercial = 2,
  Industrial = 3,
}

/**
 * Dirty-flag bitset on `CityData`. Editing a tile raises the relevant flags;
 * expensive systems (flood-fill, graph rebuild) early-out while their flag is
 * clear. Combine with bitwise OR.
 */
export const Dirty = {
  Terrain: 1 << 0,
  Power: 1 << 1,
  Water: 1 << 2,
  Road: 1 << 3,
  LandValue: 1 << 4,
  Zone: 1 << 5,
  /** Power lines, pipes, or structures changed — renderer rebuilds utilities. */
  Utility: 1 << 6,
  /** A service building was placed or removed — coverage needs recomputing. */
  Coverage: 1 << 7,
} as const;

export type DirtyFlag = (typeof Dirty)[keyof typeof Dirty];
