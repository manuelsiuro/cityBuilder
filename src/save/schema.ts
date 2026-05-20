/**
 * Save-file schema. Only the *source-of-truth* layers are stored — per-tick
 * computed layers (powered, watered, land value, pollution, traffic) are
 * recomputed on load, and car agents are respawned.
 */
export const CURRENT_VERSION = 1;

export interface SaveMeta {
  name: string;
  savedAt: number;
  simTick: number;
  population: number;
  funds: number;
}

export interface SaveFileV1 {
  version: 1;
  meta: SaveMeta;
  width: number;
  height: number;
  seed: number;
  /** RNG state so the simulation resumes deterministically. */
  rngState: number;
  layers: {
    elevation: Uint8Array;
    terrainType: Uint8Array;
    zone: Uint8Array;
    buildingId: Uint16Array;
    buildLevel: Uint8Array;
    buildAge: Uint16Array;
    road: Uint8Array;
    powerLine: Uint8Array;
    pipe: Uint8Array;
  };
  city: {
    funds: number;
    taxRateR: number;
    taxRateC: number;
    taxRateI: number;
  };
}

/** The current save-file shape. Widen to a union as new versions are added. */
export type SaveFile = SaveFileV1;
