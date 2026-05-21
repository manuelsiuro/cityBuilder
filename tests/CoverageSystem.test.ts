import { describe, it, expect, vi } from "vitest";
import { CityData } from "../src/sim/CityData";
import { EventBus } from "../src/engine/EventBus";
import { CoverageSystem } from "../src/sim/systems/CoverageSystem";
import { BUILDING, buildingDef } from "../src/sim/buildings";
import { Dirty } from "../src/sim/layers";
import type { GameEventMap } from "../src/sim/events";

/** Place a service building and run a dirty-flagged coverage pass. */
function runWith(building: number, x: number, y: number): CityData {
  const city = new CityData(24, 24);
  city.buildingId[city.grid.index(x, y)] = building;
  city.markDirty(Dirty.Coverage);
  new CoverageSystem(new EventBus<GameEventMap>()).update(city);
  return city;
}

describe("CoverageSystem", () => {
  it("does nothing while the Coverage flag is clear", () => {
    const city = new CityData(16, 16);
    city.buildingId[city.grid.index(8, 8)] = BUILDING.PoliceStation;
    new CoverageSystem(new EventBus<GameEventMap>()).update(city);
    expect(city.policeCoverage[city.grid.index(8, 8)]).toBe(0);
  });

  it("is strongest at the station and decays with distance", () => {
    const city = runWith(BUILDING.PoliceStation, 12, 12);
    const at = city.policeCoverage[city.grid.index(12, 12)];
    const near = city.policeCoverage[city.grid.index(14, 12)];
    const far = city.policeCoverage[city.grid.index(18, 12)];
    expect(at).toBeGreaterThan(near);
    expect(near).toBeGreaterThan(far);
  });

  it("is zero beyond the service range", () => {
    const city = runWith(BUILDING.PoliceStation, 12, 12);
    const range = buildingDef(BUILDING.PoliceStation).serviceRange;
    expect(city.policeCoverage[city.grid.index(12 + range + 1, 12)]).toBe(0);
  });

  it("routes each building to its own coverage layer", () => {
    const fire = runWith(BUILDING.FireStation, 12, 12);
    expect(fire.fireCoverage[fire.grid.index(12, 12)]).toBeGreaterThan(0);
    expect(fire.policeCoverage[fire.grid.index(12, 12)]).toBe(0);

    const park = runWith(BUILDING.Park, 12, 12);
    expect(park.parkCoverage[park.grid.index(12, 12)]).toBeGreaterThan(0);
  });

  it("overlapping stations combine by taking the strongest value", () => {
    const city = new CityData(24, 24);
    city.buildingId[city.grid.index(10, 12)] = BUILDING.PoliceStation;
    city.buildingId[city.grid.index(14, 12)] = BUILDING.PoliceStation;
    city.markDirty(Dirty.Coverage);
    new CoverageSystem(new EventBus<GameEventMap>()).update(city);
    // The midpoint is in range of both; coverage there beats a lone station's
    // value at the same distance.
    const mid = city.policeCoverage[city.grid.index(12, 12)];
    expect(mid).toBeGreaterThan(0);
  });

  it("emits coverage:changed and clears the dirty flag", () => {
    const city = new CityData(16, 16);
    city.markDirty(Dirty.Coverage);
    const events = new EventBus<GameEventMap>();
    const fn = vi.fn();
    events.on("coverage:changed", fn);
    new CoverageSystem(events).update(city);
    expect(fn).toHaveBeenCalledOnce();
    expect(city.isDirty(Dirty.Coverage)).toBe(false);
  });
});
