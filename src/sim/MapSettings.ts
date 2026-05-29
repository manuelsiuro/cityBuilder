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
  /** When true, skip procedural hills/water — generate flat buildable grassland. */
  flat: boolean;
  /** Which disasters are enabled and how often they fire. */
  disasters: DisasterSettings;
}

/** A disaster the simulation can roll for or the player can trigger. */
export type DisasterId =
  | "fire"
  | "earthquake"
  | "tornado"
  | "meteor"
  | "lightning"
  | "tsunami"
  | "riot"
  | "planeCrash";

export const DISASTER_IDS: readonly DisasterId[] = [
  "fire", "earthquake", "tornado", "meteor",
  "lightning", "tsunami", "riot", "planeCrash",
];

export const DISASTER_LABELS: Record<DisasterId, string> = {
  fire: "Fires",
  earthquake: "Earthquakes",
  tornado: "Tornadoes",
  meteor: "Meteor strikes",
  lightning: "Lightning storms",
  tsunami: "Tsunamis",
  riot: "Riots",
  planeCrash: "Plane crashes",
};

export interface DisasterSettings {
  enabled: Record<DisasterId, boolean>;
  /** Global multiplier applied to every random per-tick chance. */
  frequency: number;
}

/** Allowed frequency steps, shown as a segmented control in the UI. */
export const FREQUENCY_STEPS: readonly number[] = [0.25, 1, 2, 4];

export const DEFAULT_DISASTER_SETTINGS: DisasterSettings = {
  enabled: {
    fire: true,
    earthquake: true,
    tornado: true,
    meteor: true,
    lightning: true,
    tsunami: true,
    riot: true,
    planeCrash: true,
  },
  frequency: 1,
};

export const DEFAULT_MAP_SETTINGS: MapSettings = {
  seed: 1,
  size: "medium",
  water: 0.34,
  roughness: 0.5,
  treeDensity: 0.4,
  flat: false,
  disasters: DEFAULT_DISASTER_SETTINGS,
};

/** Fill in any disaster-settings fields missing from an older save. */
export function normalizeDisasterSettings(
  s: Partial<DisasterSettings> | undefined,
): DisasterSettings {
  const enabled = { ...DEFAULT_DISASTER_SETTINGS.enabled, ...(s?.enabled ?? {}) };
  const freq = s?.frequency;
  return {
    enabled,
    frequency:
      typeof freq === "number" && Number.isFinite(freq) && freq >= 0
        ? freq
        : DEFAULT_DISASTER_SETTINGS.frequency,
  };
}
