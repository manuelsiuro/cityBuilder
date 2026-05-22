import type { World } from "../sim/World";
import { idbGet, idbSet, idbKeys } from "./storage";
import { migrate } from "./migrations";
import { CURRENT_VERSION, type SaveFile, type SaveMeta } from "./schema";
import { encodeSaveFile, decodeSaveFile } from "./codec";

const SLOT_PREFIX = "slot:";

/** A slot number paired with its save metadata — drives the save/load UI. */
export interface SlotMeta {
  slot: number;
  meta: SaveMeta;
}

/** Snapshot a world into a save file. Pure — used by `save()` and by tests. */
export function serializeWorld(world: World, name = "City", thumbnail?: string): SaveFile {
  const c = world.city;
  return {
    version: CURRENT_VERSION,
    meta: {
      name,
      savedAt: Date.now(),
      simTick: world.tickCount,
      population: c.population,
      funds: c.funds,
      thumbnail,
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
 * Persists and restores a city. Saves live in IndexedDB numbered slots, and
 * can also be exported to / imported from portable `.json` files on disk.
 */
export class SaveSystem {
  /** Write the current city to a numbered slot. */
  async save(world: World, slot = 0, name = "City", thumbnail?: string): Promise<void> {
    await idbSet(SLOT_PREFIX + slot, serializeWorld(world, name, thumbnail));
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

  /** Slot + metadata for every saved city, ascending — feeds the save/load UI. */
  async metas(): Promise<SlotMeta[]> {
    const slots = await this.slots();
    const out: SlotMeta[] = [];
    for (const slot of slots) {
      const raw = await idbGet(SLOT_PREFIX + slot);
      const meta = (raw as { meta?: SaveMeta } | null)?.meta;
      if (meta) out.push({ slot, meta });
    }
    return out;
  }

  /** Serialize the city and trigger a browser download of a `.json` save file. */
  exportToFile(world: World, name = "City", thumbnail?: string): void {
    const file = serializeWorld(world, name, thumbnail);
    const blob = new Blob([encodeSaveFile(file)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${slugify(name)}-${dateStamp()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  /** Read a `.json` save file from disk, migrating it to the current schema. */
  async importFile(file: File): Promise<SaveFile> {
    const text = await file.text();
    return migrate(decodeSaveFile(text));
  }
}

/** A filename-safe form of a city name (`"My City!" → "my-city"`). */
function slugify(name: string): string {
  const s = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  return s || "city";
}

/** Today as `YYYY-MM-DD` for the export filename. */
function dateStamp(): string {
  return new Date().toISOString().slice(0, 10);
}
