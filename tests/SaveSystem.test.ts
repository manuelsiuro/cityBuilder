import { describe, it, expect } from "vitest";
import { World } from "../src/sim/World";
import { serializeWorld } from "../src/save/SaveSystem";
import { migrate } from "../src/save/migrations";
import { CURRENT_VERSION } from "../src/save/schema";
import { encodeSaveFile, decodeSaveFile } from "../src/save/codec";
import { Zone } from "../src/sim/layers";

describe("save serialization", () => {
  it("round-trips a city through serialize + restore", () => {
    const a = new World(777);
    // Centre tiles are land on the generated island.
    a.commands.push({ type: "buildRoad", x: 64, y: 64 });
    a.commands.push({ type: "buildRoad", x: 65, y: 64 });
    a.commands.push({ type: "zone", x: 66, y: 64, zone: Zone.Residential });
    a.tick(100);
    expect(a.city.road[a.city.grid.index(64, 64)]).toBe(1); // built on land

    const file = serializeWorld(a, "Test City");
    const b = new World(123); // a different starting world
    b.restore(file);

    expect(b.tickCount).toBe(a.tickCount);
    expect(b.seed).toBe(777);
    expect(b.city.funds).toBe(a.city.funds);
    expect(Array.from(b.city.road)).toEqual(Array.from(a.city.road));
    expect(Array.from(b.city.zone)).toEqual(Array.from(a.city.zone));
    expect(Array.from(b.city.elevation)).toEqual(Array.from(a.city.elevation));
  });

  it("round-trips disaster settings through serialize + restore", () => {
    const a = new World(777);
    a.setDisasterSettings({
      enabled: { ...a.disasterSettings.enabled, tornado: false, meteor: false },
      frequency: 2,
    });

    const b = new World(123);
    b.restore(serializeWorld(a, "Test City"));

    expect(b.disasterSettings.enabled.tornado).toBe(false);
    expect(b.disasterSettings.enabled.meteor).toBe(false);
    expect(b.disasterSettings.enabled.fire).toBe(true);
    expect(b.disasterSettings.frequency).toBe(2);
  });

  it("reset() produces a fresh, empty-of-construction city", () => {
    const w = new World(5);
    w.commands.push({ type: "buildRoad", x: 64, y: 64 });
    w.tick(100);
    expect(w.city.road[w.city.grid.index(64, 64)]).toBe(1);

    w.reset(9);
    expect(w.tickCount).toBe(0);
    expect(w.seed).toBe(9);
    let roads = 0;
    for (let i = 0; i < w.city.grid.size; i++) roads += w.city.road[i];
    expect(roads).toBe(0);
    expect(w.city.funds).toBe(20_000);
  });
});

describe("migrate", () => {
  it("accepts a current-version save", () => {
    const file = serializeWorld(new World(1));
    expect(migrate(file).version).toBe(CURRENT_VERSION);
  });

  it("rejects a non-save value", () => {
    expect(() => migrate(null)).toThrow();
    expect(() => migrate({})).toThrow();
  });

  it("rejects a save newer than this build", () => {
    expect(() => migrate({ version: CURRENT_VERSION + 1 })).toThrow();
  });

  it("upgrades a v1 save through to the current version with synthesized layers", () => {
    const file = serializeWorld(new World(1));
    // Strip the v2-only layers to fabricate a v1 save.
    const v1Layers: Record<string, unknown> = { ...file.layers };
    delete v1Layers.biome;
    delete v1Layers.trees;
    const v1 = { ...file, version: 1, layers: v1Layers };

    const migrated = migrate(v1);
    expect(migrated.version).toBe(CURRENT_VERSION);
    expect(migrated.layers.biome).toBeInstanceOf(Uint8Array);
    expect(migrated.layers.trees).toBeInstanceOf(Uint8Array);
    expect(migrated.layers.biome.length).toBe(file.layers.elevation.length);
  });

  it("upgrades a v2 save through the migration chain to the current version", () => {
    const file = serializeWorld(new World(1));
    const v2 = { ...file, version: 2, meta: { ...file.meta, thumbnail: undefined } };
    expect(migrate(v2).version).toBe(CURRENT_VERSION);
  });
});

describe("codec", () => {
  it("round-trips a save file through JSON text, preserving typed arrays", () => {
    const w = new World(42);
    w.commands.push({ type: "buildRoad", x: 64, y: 64 });
    w.commands.push({ type: "zone", x: 65, y: 64, zone: Zone.Commercial });
    w.tick(100);
    const file = serializeWorld(w, "Codec City", "data:image/png;base64,AAAA");

    const decoded = migrate(decodeSaveFile(encodeSaveFile(file)));

    expect(decoded.meta).toEqual(file.meta);
    expect(decoded.layers.road).toBeInstanceOf(Uint8Array);
    expect(decoded.layers.buildingId).toBeInstanceOf(Uint16Array);
    expect(Array.from(decoded.layers.road)).toEqual(Array.from(file.layers.road));
    expect(Array.from(decoded.layers.buildingId)).toEqual(
      Array.from(file.layers.buildingId),
    );
    expect(Array.from(decoded.layers.elevation)).toEqual(
      Array.from(file.layers.elevation),
    );
  });
});
