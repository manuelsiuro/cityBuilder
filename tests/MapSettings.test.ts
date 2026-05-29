import { describe, it, expect } from "vitest";
import {
  DEFAULT_MAP_SETTINGS,
  DEFAULT_DISASTER_SETTINGS,
  DISASTER_IDS,
  normalizeDisasterSettings,
} from "../src/sim/MapSettings";
import { migrate } from "../src/save/migrations";
import { CURRENT_VERSION, type SaveFileV3 } from "../src/save/schema";

describe("MapSettings", () => {
  it("default settings enable every disaster at 1× frequency", () => {
    expect(DEFAULT_MAP_SETTINGS.disasters).toEqual(DEFAULT_DISASTER_SETTINGS);
    expect(DEFAULT_DISASTER_SETTINGS.frequency).toBe(1);
    for (const id of DISASTER_IDS) {
      expect(DEFAULT_DISASTER_SETTINGS.enabled[id]).toBe(true);
    }
  });

  it("normalizeDisasterSettings fills missing fields from the defaults", () => {
    const partial = { enabled: { fire: false } } as Parameters<typeof normalizeDisasterSettings>[0];
    const result = normalizeDisasterSettings(partial);
    expect(result.enabled.fire).toBe(false);
    expect(result.enabled.earthquake).toBe(true);
    expect(result.frequency).toBe(DEFAULT_DISASTER_SETTINGS.frequency);
  });

  it("normalizeDisasterSettings rejects a bad frequency", () => {
    expect(normalizeDisasterSettings({ frequency: NaN }).frequency).toBe(1);
    expect(normalizeDisasterSettings({ frequency: -5 }).frequency).toBe(1);
    expect(normalizeDisasterSettings(undefined).frequency).toBe(1);
  });
});

describe("save migration v3 → v4", () => {
  it("adds the default disaster settings to a pre-v4 save", () => {
    const file: SaveFileV3 = {
      version: 3,
      meta: { name: "X", savedAt: 0, simTick: 0, population: 0, funds: 0 },
      width: 1,
      height: 1,
      seed: 0,
      rngState: 1,
      layers: {
        elevation: new Uint8Array(1),
        terrainType: new Uint8Array(1),
        biome: new Uint8Array(1),
        trees: new Uint8Array(1),
        zone: new Uint8Array(1),
        buildingId: new Uint16Array(1),
        buildLevel: new Uint8Array(1),
        buildAge: new Uint16Array(1),
        road: new Uint8Array(1),
        powerLine: new Uint8Array(1),
        pipe: new Uint8Array(1),
      },
      city: { funds: 0, taxRateR: 0, taxRateC: 0, taxRateI: 0 },
    };

    const upgraded = migrate(file);
    expect(upgraded.version).toBe(CURRENT_VERSION);
    expect(upgraded.disasters).toEqual(DEFAULT_DISASTER_SETTINGS);
  });

  it("a current-version save round-trips through migrate unchanged", () => {
    const file = {
      version: CURRENT_VERSION,
      meta: { name: "X", savedAt: 0, simTick: 0, population: 0, funds: 0 },
      width: 1,
      height: 1,
      seed: 0,
      rngState: 1,
      layers: {
        elevation: new Uint8Array(1),
        terrainType: new Uint8Array(1),
        biome: new Uint8Array(1),
        trees: new Uint8Array(1),
        zone: new Uint8Array(1),
        buildingId: new Uint16Array(1),
        buildLevel: new Uint8Array(1),
        buildAge: new Uint16Array(1),
        road: new Uint8Array(1),
        powerLine: new Uint8Array(1),
        pipe: new Uint8Array(1),
      },
      city: { funds: 0, taxRateR: 0, taxRateC: 0, taxRateI: 0 },
      disasters: {
        ...DEFAULT_DISASTER_SETTINGS,
        enabled: { ...DEFAULT_DISASTER_SETTINGS.enabled, tornado: false },
        frequency: 2,
      },
    };
    const upgraded = migrate(file);
    expect(upgraded.disasters.enabled.tornado).toBe(false);
    expect(upgraded.disasters.frequency).toBe(2);
  });
});
