import { describe, it, expect } from "vitest";
import { CityData } from "../src/sim/CityData";
import { EventBus } from "../src/engine/EventBus";
import { PowerSystem } from "../src/sim/systems/PowerSystem";
import { Dirty, Zone } from "../src/sim/layers";
import { BUILDING } from "../src/sim/buildings";
import type { GameEventMap } from "../src/sim/events";

function run(city: CityData): void {
  city.markDirty(Dirty.Power);
  new PowerSystem(new EventBus<GameEventMap>()).update(city);
}

describe("PowerSystem", () => {
  it("flood-fills power from a plant through lines to zoned land", () => {
    const city = new CityData(16, 16);
    const i = (x: number, y: number) => city.grid.index(x, y);

    city.buildingId[i(2, 2)] = BUILDING.PowerPlant;
    city.powerLine[i(3, 2)] = 1;
    city.powerLine[i(4, 2)] = 1;
    city.zone[i(5, 2)] = Zone.Residential;
    city.zone[i(10, 10)] = Zone.Residential; // isolated

    run(city);

    expect(city.powered[i(2, 2)]).toBe(1);
    expect(city.powered[i(5, 2)]).toBe(1);
    expect(city.powered[i(10, 10)]).toBe(0);
  });

  it("sums plant output into the power supply", () => {
    const city = new CityData(16, 16);
    city.buildingId[city.grid.index(1, 1)] = BUILDING.PowerPlant;
    city.buildingId[city.grid.index(8, 8)] = BUILDING.PowerPlant;
    run(city);
    expect(city.powerSupply).toBe(480);
  });

  it("leaves the city unpowered with no plant", () => {
    const city = new CityData(16, 16);
    city.zone[city.grid.index(4, 4)] = Zone.Commercial;
    run(city);
    expect(city.powered[city.grid.index(4, 4)]).toBe(0);
    expect(city.powerSupply).toBe(0);
  });
});
