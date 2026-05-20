import { describe, it, expect } from "vitest";
import { CityData } from "../src/sim/CityData";
import { EventBus } from "../src/engine/EventBus";
import { WaterSystem } from "../src/sim/systems/WaterSystem";
import { Dirty, Zone } from "../src/sim/layers";
import { BUILDING } from "../src/sim/buildings";
import type { GameEventMap } from "../src/sim/events";

function run(city: CityData): void {
  city.markDirty(Dirty.Water);
  new WaterSystem(new EventBus<GameEventMap>()).update(city);
}

describe("WaterSystem", () => {
  it("flood-fills water from a pump through the pipe network", () => {
    const city = new CityData(16, 16);
    const i = (x: number, y: number) => city.grid.index(x, y);

    city.buildingId[i(2, 2)] = BUILDING.WaterPump;
    city.pipe[i(3, 2)] = 1;
    city.pipe[i(4, 2)] = 1;

    run(city);

    expect(city.watered[i(2, 2)]).toBe(1);
    expect(city.watered[i(3, 2)]).toBe(1);
    expect(city.watered[i(4, 2)]).toBe(1);
  });

  it("wets zoned land one tile out from a watered pipe", () => {
    const city = new CityData(16, 16);
    const i = (x: number, y: number) => city.grid.index(x, y);

    city.buildingId[i(2, 2)] = BUILDING.WaterPump;
    city.pipe[i(3, 2)] = 1;
    city.zone[i(4, 2)] = Zone.Residential; // adjacent to watered pipe
    city.zone[i(12, 12)] = Zone.Residential; // isolated

    run(city);

    expect(city.watered[i(4, 2)]).toBe(1);
    expect(city.watered[i(12, 12)]).toBe(0);
  });

  it("does not pipe water without a pump", () => {
    const city = new CityData(16, 16);
    city.pipe[city.grid.index(5, 5)] = 1;
    run(city);
    expect(city.watered[city.grid.index(5, 5)]).toBe(0);
    expect(city.waterSupply).toBe(0);
  });
});
