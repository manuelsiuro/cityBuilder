import { Biome, TerrainType } from "./layers";

/**
 * Whittaker-style biome classification and the per-biome modifier tables that
 * let biomes influence the simulation. All tables are indexed by the `Biome`
 * enum value.
 */

/**
 * Pick a biome for a tile from its terrain, elevation, and the generator's
 * normalized temperature / moisture (both 0..1). Water is always `Ocean`;
 * `Beach` is assigned separately by the generator for shoreline tiles.
 */
export function classifyBiome(
  terrain: TerrainType,
  _elevation: number,
  temp: number,
  moist: number,
): Biome {
  if (terrain === TerrainType.Water) return Biome.Ocean;
  if (terrain === TerrainType.Rock) return temp < 0.35 ? Biome.Snow : Biome.Mountain;

  // Grass land — temperature/moisture climate bands.
  if (temp < 0.28) return moist > 0.45 ? Biome.Snow : Biome.Tundra;
  if (temp > 0.68 && moist < 0.35) return Biome.Desert;
  if (moist > 0.52) return Biome.Forest;
  return Biome.Plains;
}

/** Flat land-value bonus/penalty added per tile, by biome. */
export const BIOME_LAND_VALUE_MOD: Record<Biome, number> = {
  [Biome.Ocean]: 0,
  [Biome.Beach]: 20,
  [Biome.Plains]: 0,
  [Biome.Forest]: 12,
  [Biome.Desert]: -10,
  [Biome.Tundra]: -6,
  [Biome.Snow]: -8,
  [Biome.Mountain]: -4,
};

/** Multiplier on a tile's development/growth chance, by biome. */
export const BIOME_GROWTH_MOD: Record<Biome, number> = {
  [Biome.Ocean]: 0,
  [Biome.Beach]: 1.05,
  [Biome.Plains]: 1,
  [Biome.Forest]: 1,
  [Biome.Desert]: 0.6,
  [Biome.Tundra]: 0.75,
  [Biome.Snow]: 0.5,
  [Biome.Mountain]: 0.7,
};

/** Multiplier on pollution deposited onto a tile — forests absorb, deserts bake. */
export const BIOME_POLLUTION_MOD: Record<Biome, number> = {
  [Biome.Ocean]: 1,
  [Biome.Beach]: 1,
  [Biome.Plains]: 1,
  [Biome.Forest]: 0.7,
  [Biome.Desert]: 1.2,
  [Biome.Tundra]: 1,
  [Biome.Snow]: 1,
  [Biome.Mountain]: 1,
};

/** Probability weight that a tile of this biome carries a tree. */
export function biomeTreeWeight(biome: Biome): number {
  switch (biome) {
    case Biome.Forest:
      return 0.9;
    case Biome.Plains:
      return 0.18;
    case Biome.Tundra:
      return 0.1;
    case Biome.Beach:
      return 0.04;
    default:
      return 0;
  }
}
