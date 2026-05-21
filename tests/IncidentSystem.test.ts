import { describe, it, expect } from "vitest";
import { CityData } from "../src/sim/CityData";
import { EventBus } from "../src/engine/EventBus";
import { Random } from "../src/engine/Random";
import { IncidentSystem } from "../src/sim/systems/IncidentSystem";
import { Zone } from "../src/sim/layers";
import type { GameEventMap } from "../src/sim/events";

function incidents(seed = 1): IncidentSystem {
  return new IncidentSystem(new Random(seed), new EventBus<GameEventMap>());
}

/** A grid fully developed with residential households. */
function builtCity(size = 20): CityData {
  const city = new CityData(size, size);
  for (let i = 0; i < city.grid.size; i++) {
    city.zone[i] = Zone.Residential;
    city.buildLevel[i] = 2;
  }
  return city;
}

/** Run `ticks` updates of a system over a city. */
function run(sys: IncidentSystem, city: CityData, ticks: number): void {
  for (let t = 0; t < ticks; t++) sys.update(city, t);
}

describe("IncidentSystem", () => {
  it("raises crime incidents in a populated, unpoliced city", () => {
    const city = builtCity();
    const sys = incidents();
    run(sys, city, 3000);
    expect(sys.incidents.some((inc) => inc.kind === "crime")).toBe(true);
  });

  it("raises medical emergencies in residential areas", () => {
    const city = builtCity();
    const sys = incidents();
    run(sys, city, 4000);
    expect(sys.incidents.some((inc) => inc.kind === "medical")).toBe(true);
  });

  it("stamps a land-value penalty into the crime layer around a crime", () => {
    const city = builtCity();
    const sys = incidents();
    run(sys, city, 3000);
    const crime = sys.incidents.find((inc) => inc.kind === "crime");
    expect(crime).toBeDefined();
    expect(city.crime[crime!.tile]).toBeGreaterThan(0);
  });

  it("full police coverage suppresses crime", () => {
    const city = builtCity();
    city.policeCoverage.fill(255);
    const sys = incidents();
    run(sys, city, 3000);
    expect(sys.incidents.some((inc) => inc.kind === "crime")).toBe(false);
  });

  it("drops incidents once they are resolved", () => {
    const city = builtCity();
    const sys = incidents();
    run(sys, city, 3000);
    expect(sys.incidents.length).toBeGreaterThan(0);
    for (const inc of sys.incidents) inc.state = "resolved";
    sys.update(city, 3001);
    expect(sys.incidents.length).toBe(0);
  });

  it("drops every incident on clear()", () => {
    const city = builtCity();
    const sys = incidents();
    run(sys, city, 3000);
    expect(sys.incidents.length).toBeGreaterThan(0);
    sys.clear();
    expect(sys.incidents.length).toBe(0);
  });
});
