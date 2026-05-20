import { describe, it, expect } from "vitest";
import { CityData } from "../src/sim/CityData";
import { EventBus } from "../src/engine/EventBus";
import { Random } from "../src/engine/Random";
import { DevelopmentSystem } from "../src/sim/systems/DevelopmentSystem";
import { Zone } from "../src/sim/layers";
import type { GameEventMap } from "../src/sim/events";

function makeCity(): { city: CityData; i: number } {
  const city = new CityData(16, 16);
  const i = city.grid.index(5, 5);
  city.zone[i] = Zone.Residential;
  city.landValue[i] = 130;
  city.road[city.grid.index(5, 6)] = 1; // adjacent road
  return { city, i };
}

function dev(): DevelopmentSystem {
  return new DevelopmentSystem(new Random(12345), new EventBus<GameEventMap>());
}

describe("DevelopmentSystem", () => {
  it("develops a serviced, in-demand zoned tile", () => {
    const { city, i } = makeCity();
    city.powered[i] = 1;
    city.watered[i] = 1;
    city.demandR = 80;

    const system = dev();
    for (let k = 0; k < 80; k++) system.update(city);

    expect(city.buildLevel[i]).toBeGreaterThan(0);
  });

  it("does not develop an unserviced tile", () => {
    const { city, i } = makeCity();
    city.powered[i] = 0; // no power
    city.watered[i] = 1;
    city.demandR = 80;

    const system = dev();
    for (let k = 0; k < 80; k++) system.update(city);

    expect(city.buildLevel[i]).toBe(0);
  });

  it("does not develop a tile with no road access", () => {
    const { city, i } = makeCity();
    city.road[city.grid.index(5, 6)] = 0; // remove the road
    city.powered[i] = 1;
    city.watered[i] = 1;
    city.demandR = 80;

    const system = dev();
    for (let k = 0; k < 80; k++) system.update(city);

    expect(city.buildLevel[i]).toBe(0);
  });

  it("declines a building that loses its services", () => {
    const { city, i } = makeCity();
    city.buildLevel[i] = 2;
    city.powered[i] = 0; // service lost
    city.watered[i] = 0;
    city.demandR = 50;

    const system = dev();
    for (let k = 0; k < 80; k++) system.update(city);

    expect(city.buildLevel[i]).toBeLessThan(2);
  });
});
