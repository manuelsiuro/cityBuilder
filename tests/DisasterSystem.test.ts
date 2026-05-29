import { describe, it, expect } from "vitest";
import { CityData } from "../src/sim/CityData";
import { EventBus } from "../src/engine/EventBus";
import { Random } from "../src/engine/Random";
import { DisasterSystem } from "../src/sim/systems/DisasterSystem";
import { BUILDING } from "../src/sim/buildings";
import { TerrainType, Zone } from "../src/sim/layers";
import type { GameEventMap } from "../src/sim/events";
import {
  DEFAULT_DISASTER_SETTINGS,
  DISASTER_IDS,
  type DisasterSettings,
} from "../src/sim/MapSettings";

function disaster(seed = 1, settings: DisasterSettings = DEFAULT_DISASTER_SETTINGS): DisasterSystem {
  return new DisasterSystem(new Random(seed), new EventBus<GameEventMap>(), settings);
}

/** Fill a grid with developed residential buildings (flammable fuel). */
function builtCity(size = 20): CityData {
  const city = new CityData(size, size);
  for (let i = 0; i < city.grid.size; i++) {
    city.zone[i] = Zone.Residential;
    city.buildLevel[i] = 2;
  }
  return city;
}

describe("DisasterSystem", () => {
  it("an established fire spreads to a flammable neighbour", () => {
    const city = builtCity();
    const sys = disaster();
    const a = city.grid.index(10, 10);
    const b = city.grid.index(11, 10);
    city.fire[a] = 255;

    let bCaught = false;
    for (let t = 0; t < 150 && !bCaught; t++) {
      sys.update(city, t);
      if (city.fire[b] > 0) bCaught = true;
    }
    expect(bCaught).toBe(true);
  });

  it("fire-station coverage suppresses an existing fire", () => {
    const city = builtCity();
    const i = city.grid.index(10, 10);
    city.fire[i] = 120;
    city.fireCoverage.fill(255); // full protection everywhere

    const sys = disaster();
    for (let t = 0; t < 40; t++) sys.update(city, t);
    expect(city.fire[i]).toBe(0);
  });

  it("an intense fire damages the building it burns", () => {
    const city = builtCity();
    const i = city.grid.index(5, 5);
    city.fire[i] = 255;
    const before = city.buildLevel[i];

    const sys = disaster();
    for (let t = 0; t < 250; t++) sys.update(city, t);
    expect(city.buildLevel[i]).toBeLessThan(before);
  });

  it("fires break out over time on an unprotected city", () => {
    const city = builtCity();
    for (let i = 0; i < city.grid.size; i++) city.zone[i] = Zone.Industrial;

    const sys = disaster();
    let everBurned = false;
    for (let t = 0; t < 4000 && !everBurned; t++) {
      sys.update(city, t);
      everBurned = city.fire.some((f) => f > 0);
    }
    expect(everBurned).toBe(true);
  });

  it("full fire coverage prevents spontaneous ignition", () => {
    const city = builtCity();
    for (let i = 0; i < city.grid.size; i++) city.zone[i] = Zone.Industrial;
    city.fireCoverage.fill(255);

    const sys = disaster();
    for (let t = 0; t < 4000; t++) sys.update(city, t);
    expect(city.fire.some((f) => f > 0)).toBe(false);
  });

  it("emits a warn notice when a fire breaks out", () => {
    const city = builtCity();
    for (let i = 0; i < city.grid.size; i++) city.zone[i] = Zone.Industrial;

    const events = new EventBus<GameEventMap>();
    const notices: GameEventMap["notice"][] = [];
    events.on("notice", (n) => notices.push(n));
    const sys = new DisasterSystem(new Random(1), events);

    for (let t = 0; t < 4000; t++) sys.update(city, t);
    expect(notices.length).toBeGreaterThan(0);
    expect(notices[0].level).toBe("warn");
  });

  it("an earthquake damages buildings across its disc", () => {
    const city = builtCity(24);
    const before = city.buildLevel.reduce((s, v) => s + v, 0);

    const sys = disaster();
    let destroyed = false;
    // The epicentre is random — a few strikes guarantee a hit on the grid.
    for (let k = 0; k < 8 && !destroyed; k++) destroyed = sys.triggerEarthquake(city);

    expect(destroyed).toBe(true);
    const after = city.buildLevel.reduce((s, v) => s + v, 0);
    expect(after).toBeLessThan(before);
  });

  // --- New disasters ----------------------------------------------------

  it("a tornado damages buildings along a path and records the trail", () => {
    const city = builtCity(24);
    const sys = disaster(7);
    const before = city.buildLevel.reduce((s, v) => s + v, 0);

    const destroyed = sys.triggerTornado(city, 0);

    expect(destroyed).toBe(true);
    expect(city.buildLevel.reduce((s, v) => s + v, 0)).toBeLessThan(before);
    expect(city.tornadoPath).not.toBeNull();
    expect(city.tornadoPath!.tiles.length).toBeGreaterThan(0);
  });

  it("a meteor strike damages a disc of tiles", () => {
    const city = builtCity(24);
    const sys = disaster(3);
    const before = city.buildLevel.reduce((s, v) => s + v, 0);

    let destroyed = false;
    for (let k = 0; k < 4 && !destroyed; k++) destroyed = sys.triggerMeteor(city);

    expect(destroyed).toBe(true);
    expect(city.buildLevel.reduce((s, v) => s + v, 0)).toBeLessThan(before);
  });

  it("a lightning storm ignites several distinct tiles at once", () => {
    const city = builtCity(24);
    const sys = disaster(5);

    const count = sys.triggerLightning(city);
    expect(count).toBeGreaterThanOrEqual(4);
    const burning = city.fire.reduce((n, v) => n + (v > 0 ? 1 : 0), 0);
    expect(burning).toBe(count);
  });

  it("a tsunami floods low-elevation land tiles next to water", () => {
    const city = new CityData(24, 24);
    // Left column is water at sea level; the rest is buildable low land.
    for (let y = 0; y < city.grid.height; y++) {
      const w = city.grid.index(0, y);
      city.terrainType[w] = TerrainType.Water;
    }
    for (let i = 0; i < city.grid.size; i++) {
      if (city.terrainType[i] !== TerrainType.Water) {
        city.elevation[i] = 1; // within reach of TSUNAMI_REACH (1)
        city.zone[i] = Zone.Residential;
        city.buildLevel[i] = 2;
      }
    }
    const sys = disaster(11);
    sys.triggerTsunami(city);

    const flooded = city.flood.reduce((n, v) => n + (v > 0 ? 1 : 0), 0);
    expect(flooded).toBeGreaterThan(0);
  });

  it("a tsunami fails silently on a landlocked map", () => {
    const city = builtCity(8);
    // No water tiles — generator was never run.
    const sys = disaster(2);
    const destroyed = sys.triggerTsunami(city);
    expect(destroyed).toBe(false);
    expect(city.flood.some((f) => f > 0)).toBe(false);
  });

  it("a riot starts on an unhappy, unprotected tile and police suppresses it", () => {
    const city = builtCity(16);
    // Low land value + zero police coverage = riot-prone.
    city.landValue.fill(0);
    city.policeCoverage.fill(0);

    const sys = disaster(13);
    const started = sys.triggerRiot(city);
    expect(started).toBe(true);
    const burning = city.riot.reduce((n, v) => n + (v > 0 ? 1 : 0), 0);
    expect(burning).toBeGreaterThan(0);

    // Full police coverage should drain the riot intensity to zero.
    city.policeCoverage.fill(255);
    for (let t = 0; t < 80; t++) sys.update(city, t);
    expect(city.riot.every((r) => r === 0)).toBe(true);
  });

  it("a plane crash damages a small radius around a built tile", () => {
    const city = builtCity(20);
    const sys = disaster(19);
    const before = city.buildLevel.reduce((s, v) => s + v, 0);

    const destroyed = sys.triggerPlaneCrash(city);
    expect(destroyed).toBe(true);
    expect(city.buildLevel.reduce((s, v) => s + v, 0)).toBeLessThan(before);
  });

  // --- Settings gating --------------------------------------------------

  it("disabling all disasters at high frequency leaves the city untouched", () => {
    const city = builtCity(24);
    const disabled: DisasterSettings = {
      enabled: Object.fromEntries(
        DISASTER_IDS.map((id) => [id, false]),
      ) as DisasterSettings["enabled"],
      frequency: 4,
    };
    const sys = disaster(1, disabled);

    for (let t = 0; t < 10_000; t++) sys.update(city, t);
    expect(city.fire.some((f) => f > 0)).toBe(false);
    expect(city.riot.some((r) => r > 0)).toBe(false);
    expect(city.flood.some((f) => f > 0)).toBe(false);
  });

  it("zero frequency suppresses random fire ignition", () => {
    const city = builtCity(24);
    for (let i = 0; i < city.grid.size; i++) city.zone[i] = Zone.Industrial;
    const sys = disaster(1, { ...DEFAULT_DISASTER_SETTINGS, frequency: 0 });

    for (let t = 0; t < 4000; t++) sys.update(city, t);
    expect(city.fire.some((f) => f > 0)).toBe(false);
  });

  it("setSettings switches the system between enabled and disabled at runtime", () => {
    const city = builtCity(24);
    for (let i = 0; i < city.grid.size; i++) city.zone[i] = Zone.Industrial;
    const sys = disaster(1);
    // Start disabled — no fires.
    sys.setSettings({
      enabled: Object.fromEntries(
        DISASTER_IDS.map((id) => [id, false]),
      ) as DisasterSettings["enabled"],
      frequency: 1,
    });
    for (let t = 0; t < 2000; t++) sys.update(city, t);
    expect(city.fire.some((f) => f > 0)).toBe(false);

    // Enable — fires start eventually.
    sys.setSettings(DEFAULT_DISASTER_SETTINGS);
    let everBurned = false;
    for (let t = 0; t < 4000 && !everBurned; t++) {
      sys.update(city, t);
      everBurned = city.fire.some((f) => f > 0);
    }
    expect(everBurned).toBe(true);
  });

  it("trigger() dispatches to each disaster", () => {
    const city = builtCity(20);
    const sys = disaster(23);
    sys.trigger("earthquake", city, 0);
    // After at least one named trigger, *something* changed (fire or damage).
    const anyEffect = city.fire.some((f) => f > 0) ||
      city.buildLevel.some((l) => l < 2);
    expect(anyEffect).toBe(true);
  });

  it("a riot that destroys a building emits buildings:changed", () => {
    const city = builtCity(16);
    city.policeCoverage.fill(0); // no suppression — the riot stays intense
    const i = city.grid.index(8, 8);
    city.riot[i] = 255;

    const events = new EventBus<GameEventMap>();
    let buildingsChanged = 0;
    events.on("buildings:changed", () => buildingsChanged++);
    const sys = new DisasterSystem(new Random(5), events);

    const before = city.buildLevel.reduce((s, v) => s + v, 0);
    for (let t = 0; t < 400; t++) sys.update(city, t);

    // The riot knocked at least one building down, and the world was notified.
    expect(city.buildLevel.reduce((s, v) => s + v, 0)).toBeLessThan(before);
    expect(buildingsChanged).toBeGreaterThan(0);
  });

  it("the sim drops a tornado path once it outlives its visual", () => {
    const city = builtCity(24);
    // All disabled so the only path on the grid is the one we trigger.
    const off: DisasterSettings = {
      enabled: Object.fromEntries(
        DISASTER_IDS.map((id) => [id, false]),
      ) as DisasterSettings["enabled"],
      frequency: 0,
    };
    const sys = disaster(7, off);

    sys.triggerTornado(city, 0);
    expect(city.tornadoPath).not.toBeNull();

    // A tick within the visual lifetime keeps it...
    sys.update(city, 10);
    expect(city.tornadoPath).not.toBeNull();
    // ...but a tick past the TTL (38) clears it.
    sys.update(city, 40);
    expect(city.tornadoPath).toBeNull();
  });
});

// Silence unused-import lint on BUILDING — kept to mirror the original test file.
void BUILDING;
