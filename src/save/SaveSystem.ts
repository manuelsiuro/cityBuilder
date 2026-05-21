import type { World } from "../sim/World";
import { idbGet, idbSet, idbKeys } from "./storage";
import { migrate } from "./migrations";
import { CURRENT_VERSION, type SaveFile } from "./schema";

const SLOT_PREFIX = "slot:";

/** Snapshot a world into a save file. Pure — used by `save()` and by tests. */
export function serializeWorld(world: World, name = "City"): SaveFile {
  const c = world.city;
  return {
    version: CURRENT_VERSION,
    meta: {
      name,
      savedAt: Date.now(),
      simTick: world.tickCount,
      population: c.population,
      funds: c.funds,
    },
    width: c.grid.width,
    height: c.grid.height,
    seed: world.seed,
    rngState: world.random.state,
    layers: {
      elevation: c.elevation.slice(),
      terrainType: c.terrainType.slice(),
      biome: c.biome.slice(),
      trees: c.trees.slice(),
      zone: c.zone.slice(),
      buildingId: c.buildingId.slice(),
      buildLevel: c.buildLevel.slice(),
      buildAge: c.buildAge.slice(),
      road: c.road.slice(),
      powerLine: c.powerLine.slice(),
      pipe: c.pipe.slice(),
    },
    city: {
      funds: c.funds,
      taxRateR: c.taxRateR,
      taxRateC: c.taxRateC,
      taxRateI: c.taxRateI,
    },
  };
}

/**
 * Persists and restores a city to IndexedDB. A save is a snapshot of the
 * source-of-truth layers plus aggregates and RNG state — small, and free of
 * stale derived data.
 */
export class SaveSystem {
  /** Write the current city to a numbered slot. */
  async save(world: World, slot = 0, name = "City"): Promise<void> {
    await idbSet(SLOT_PREFIX + slot, serializeWorld(world, name));
  }

  /** Load a slot, migrating it forward. Returns null if the slot is empty. */
  async load(slot = 0): Promise<SaveFile | null> {
    const raw = await idbGet(SLOT_PREFIX + slot);
    if (raw == null) return null;
    return migrate(raw);
  }

  async hasSave(slot = 0): Promise<boolean> {
    return (await idbKeys()).includes(SLOT_PREFIX + slot);
  }

  /** Numbers of the slots that currently hold a saved city, ascending. */
  async slots(): Promise<number[]> {
    const keys = await idbKeys();
    return keys
      .filter((k): k is string => typeof k === "string" && k.startsWith(SLOT_PREFIX))
      .map((k) => Number(k.slice(SLOT_PREFIX.length)))
      .filter((n) => Number.isInteger(n))
      .sort((a, b) => a - b);
  }
}
