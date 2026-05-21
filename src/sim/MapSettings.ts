/**
 * Player-chosen parameters for procedural map generation. Produced by the
 * main-menu settings panel, consumed by `World` and `generateTerrain`.
 */

export type MapSizeId = "small" | "medium" | "large";

/** Tile dimensions for each selectable map size (square maps). */
export const MAP_SIZES: Record<MapSizeId, number> = {
  small: 96,
  medium: 128,
  large: 192,
};

export interface MapSettings {
  /** RNG seed — same seed + settings reproduces the exact map. */
  seed: number;
  size: MapSizeId;
  /** Fraction of the map below sea level, 0..1. */
  water: number;
  /** Terrain ruggedness, 0..1 — drives fBm octaves and gain. */
  roughness: number;
  /** How much forest the biome pass places, 0..1. */
  treeDensity: number;
}

export const DEFAULT_MAP_SETTINGS: MapSettings = {
  seed: 1,
  size: "medium",
  water: 0.34,
  roughness: 0.5,
  treeDensity: 0.4,
};
