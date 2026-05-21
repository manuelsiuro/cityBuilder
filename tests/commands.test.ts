import { describe, it, expect } from "vitest";
import { CityData } from "../src/sim/CityData";
import { applyCommand, CmdResult } from "../src/sim/commands";
import { Dirty, MAX_ELEVATION, TerrainType, Zone } from "../src/sim/layers";
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

  it("raises terrain, charges 10, and marks the terrain layer dirty", () => {
    const city = new CityData(8, 8);
    const i = city.grid.index(4, 4);
    city.elevation[i] = 3;
    const funds = city.funds;
    applyCommand(city, { type: "raiseTerrain", x: 4, y: 4 });
    expect(city.elevation[i]).toBe(4);
    expect(city.funds).toBe(funds - 10);
    expect(city.isDirty(Dirty.Terrain)).toBe(true);
  });

  it("lowers terrain by one tier", () => {
    const city = new CityData(8, 8);
    const i = city.grid.index(4, 4);
    city.elevation[i] = 3;
    applyCommand(city, { type: "lowerTerrain", x: 4, y: 4 });
    expect(city.elevation[i]).toBe(2);
  });

  it("does not raise terrain above the maximum tier", () => {
    const city = new CityData(8, 8);
    const i = city.grid.index(4, 4);
    city.elevation[i] = MAX_ELEVATION;
    const funds = city.funds;
    applyCommand(city, { type: "raiseTerrain", x: 4, y: 4 });
    expect(city.elevation[i]).toBe(MAX_ELEVATION);
    expect(city.funds).toBe(funds);
  });

  it("does not lower terrain below one tier above sea level", () => {
    const city = new CityData(8, 8);
    const i = city.grid.index(4, 4);
    city.elevation[i] = 1;
    const funds = city.funds;
    applyCommand(city, { type: "lowerTerrain", x: 4, y: 4 });
    expect(city.elevation[i]).toBe(1);
    expect(city.funds).toBe(funds);
  });

  it("refuses to edit terrain on a water tile", () => {
    const city = new CityData(8, 8);
    const i = city.grid.index(2, 2);
    city.terrainType[i] = TerrainType.Water;
    city.elevation[i] = 3;
    applyCommand(city, { type: "raiseTerrain", x: 2, y: 2 });
    expect(city.elevation[i]).toBe(3);
  });

  it("refuses to edit terrain on an occupied tile", () => {
    const city = new CityData(8, 8);
    const roadTile = city.grid.index(2, 2);
    const zoneTile = city.grid.index(5, 5);
    city.elevation[roadTile] = 3;
    city.elevation[zoneTile] = 3;
    city.road[roadTile] = 1;
    city.zone[zoneTile] = Zone.Residential;
    applyCommand(city, { type: "raiseTerrain", x: 2, y: 2 });
    applyCommand(city, { type: "lowerTerrain", x: 5, y: 5 });
    expect(city.elevation[roadTile]).toBe(3);
    expect(city.elevation[zoneTile]).toBe(3);
  });

  it("refuses to edit terrain without enough funds", () => {
    const city = new CityData(8, 8);
    const i = city.grid.index(4, 4);
    city.elevation[i] = 3;
    city.funds = 5;
    applyCommand(city, { type: "raiseTerrain", x: 4, y: 4 });
    expect(city.elevation[i]).toBe(3);
  });

  it("ignores commands outside the grid", () => {
    const city = new CityData(8, 8);
    expect(() => applyCommand(city, { type: "buildRoad", x: 99, y: 0 })).not.toThrow();
    expect(city.isDirty(Dirty.Road)).toBe(false);
  });

  it("reports Ok for a successful build", () => {
    const city = new CityData(8, 8);
    expect(applyCommand(city, { type: "buildRoad", x: 3, y: 3 })).toBe(CmdResult.Ok);
  });

  it("reports NoFunds when the player cannot afford a command", () => {
    const city = new CityData(8, 8);
    city.funds = 2;
    expect(applyCommand(city, { type: "buildRoad", x: 3, y: 3 })).toBe(CmdResult.NoFunds);
    expect(city.road[city.grid.index(3, 3)]).toBe(0);
  });

  it("reports Water, Occupied and Blocked rejections distinctly", () => {
    const city = new CityData(8, 8);
    city.terrainType[city.grid.index(2, 2)] = TerrainType.Water;
    expect(applyCommand(city, { type: "buildRoad", x: 2, y: 2 })).toBe(CmdResult.Water);

    applyCommand(city, { type: "buildRoad", x: 4, y: 4 });
    expect(applyCommand(city, { type: "buildRoad", x: 4, y: 4 })).toBe(CmdResult.Occupied);

    expect(applyCommand(city, { type: "bulldoze", x: 6, y: 6 })).toBe(CmdResult.Blocked);
  });

  it("places service buildings, charges their cost, and marks coverage dirty", () => {
    const city = new CityData(8, 8);
    const before = city.funds;
    applyCommand(city, { type: "placeBuilding", x: 2, y: 2, building: BUILDING.PoliceStation });
    applyCommand(city, { type: "placeBuilding", x: 4, y: 4, building: BUILDING.FireStation });
    applyCommand(city, { type: "placeBuilding", x: 6, y: 6, building: BUILDING.Park });
    expect(city.buildingId[city.grid.index(2, 2)]).toBe(BUILDING.PoliceStation);
    expect(city.buildingId[city.grid.index(4, 4)]).toBe(BUILDING.FireStation);
    expect(city.buildingId[city.grid.index(6, 6)]).toBe(BUILDING.Park);
    expect(city.funds).toBe(before - 800 - 800 - 150);
    expect(city.isDirty(Dirty.Coverage)).toBe(true);
  });

  it("refuses a service building the player cannot afford", () => {
    const city = new CityData(8, 8);
    city.funds = 100;
    expect(
      applyCommand(city, { type: "placeBuilding", x: 2, y: 2, building: BUILDING.FireStation }),
    ).toBe(CmdResult.NoFunds);
    expect(city.buildingId[city.grid.index(2, 2)]).toBe(BUILDING.None);
  });

  it("reports MaxElevation at the terrain limits", () => {
    const city = new CityData(8, 8);
    const i = city.grid.index(4, 4);
    city.elevation[i] = MAX_ELEVATION;
    expect(applyCommand(city, { type: "raiseTerrain", x: 4, y: 4 })).toBe(CmdResult.MaxElevation);
    city.elevation[i] = 1;
    expect(applyCommand(city, { type: "lowerTerrain", x: 4, y: 4 })).toBe(CmdResult.MaxElevation);
  });
});
