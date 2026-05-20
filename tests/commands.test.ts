import { describe, it, expect } from "vitest";
import { CityData } from "../src/sim/CityData";
import { applyCommand } from "../src/sim/commands";
import { Dirty, TerrainType, Zone } from "../src/sim/layers";
import { BUILDING } from "../src/sim/buildings";

describe("applyCommand", () => {
  it("builds a road and marks the road layer dirty", () => {
    const city = new CityData(8, 8);
    applyCommand(city, { type: "buildRoad", x: 3, y: 3 });
    expect(city.road[city.grid.index(3, 3)]).toBe(1);
    expect(city.isDirty(Dirty.Road)).toBe(true);
  });

  it("refuses to build a road on water", () => {
    const city = new CityData(8, 8);
    const i = city.grid.index(2, 2);
    city.terrainType[i] = TerrainType.Water;
    applyCommand(city, { type: "buildRoad", x: 2, y: 2 });
    expect(city.road[i]).toBe(0);
  });

  it("paints a zone and marks zone + utility layers dirty", () => {
    const city = new CityData(8, 8);
    applyCommand(city, { type: "zone", x: 4, y: 4, zone: Zone.Commercial });
    expect(city.zone[city.grid.index(4, 4)]).toBe(Zone.Commercial);
    expect(city.isDirty(Dirty.Zone)).toBe(true);
    expect(city.isDirty(Dirty.Power)).toBe(true);
  });

  it("does not zone over a road", () => {
    const city = new CityData(8, 8);
    applyCommand(city, { type: "buildRoad", x: 1, y: 1 });
    applyCommand(city, { type: "zone", x: 1, y: 1, zone: Zone.Residential });
    expect(city.zone[city.grid.index(1, 1)]).toBe(Zone.None);
  });

  it("places a building and clears any zone under it", () => {
    const city = new CityData(8, 8);
    applyCommand(city, { type: "zone", x: 5, y: 5, zone: Zone.Industrial });
    applyCommand(city, { type: "placeBuilding", x: 5, y: 5, building: BUILDING.PowerPlant });
    const i = city.grid.index(5, 5);
    expect(city.buildingId[i]).toBe(BUILDING.PowerPlant);
    expect(city.zone[i]).toBe(Zone.None);
  });

  it("builds power lines and pipes", () => {
    const city = new CityData(8, 8);
    applyCommand(city, { type: "buildPowerLine", x: 2, y: 2 });
    applyCommand(city, { type: "buildPipe", x: 3, y: 3 });
    expect(city.powerLine[city.grid.index(2, 2)]).toBe(1);
    expect(city.pipe[city.grid.index(3, 3)]).toBe(1);
  });

  it("bulldoze clears every built layer on a tile", () => {
    const city = new CityData(8, 8);
    const i = city.grid.index(4, 4);
    city.road[i] = 1;
    city.powerLine[i] = 1;
    city.pipe[i] = 1;
    city.buildingId[i] = BUILDING.WaterPump;
    applyCommand(city, { type: "bulldoze", x: 4, y: 4 });
    expect(city.road[i]).toBe(0);
    expect(city.powerLine[i]).toBe(0);
    expect(city.pipe[i]).toBe(0);
    expect(city.buildingId[i]).toBe(BUILDING.None);
  });

  it("ignores commands outside the grid", () => {
    const city = new CityData(8, 8);
    expect(() => applyCommand(city, { type: "buildRoad", x: 99, y: 0 })).not.toThrow();
    expect(city.isDirty(Dirty.Road)).toBe(false);
  });
});
