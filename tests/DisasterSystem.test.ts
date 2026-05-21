import { describe, it, expect } from "vitest";
import { CityData } from "../src/sim/CityData";
import { EventBus } from "../src/engine/EventBus";
import { Random } from "../src/engine/Random";
import { DisasterSystem } from "../src/sim/systems/DisasterSystem";
import { BUILDING } from "../src/sim/buildings";
import { Zone } from "../src/sim/layers";
import type { GameEventMap } from "../src/sim/events";

function disaster(seed = 1): DisasterSystem {
  return new DisasterSystem(new Random(seed), new EventBus<GameEventMap>());
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
    expect(notices[0]).toEqual({ level: "warn", message: "A fire has broken out!" });
  });
});
