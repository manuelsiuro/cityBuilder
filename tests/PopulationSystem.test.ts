import { describe, it, expect } from "vitest";
import { CityData } from "../src/sim/CityData";
import { PopulationSystem } from "../src/sim/systems/PopulationSystem";
import { Zone } from "../src/sim/layers";

describe("PopulationSystem", () => {
  it("tallies residents and jobs from developed buildings", () => {
    const city = new CityData(16, 16);
    const i = (x: number, y: number) => city.grid.index(x, y);

    city.zone[i(1, 1)] = Zone.Residential;
    city.buildLevel[i(1, 1)] = 2; // 24 residents
    city.zone[i(2, 1)] = Zone.Commercial;
    city.buildLevel[i(2, 1)] = 1; // 8 jobs
    city.zone[i(3, 1)] = Zone.Industrial;
    city.buildLevel[i(3, 1)] = 3; // 30 jobs

    new PopulationSystem().update(city);

    expect(city.population).toBe(24);
    expect(city.jobsCommercial).toBe(8);
    expect(city.jobsIndustrial).toBe(30);
  });

  it("ignores undeveloped zoned tiles", () => {
    const city = new CityData(8, 8);
    city.zone[city.grid.index(2, 2)] = Zone.Residential; // buildLevel 0
    new PopulationSystem().update(city);
    expect(city.population).toBe(0);
  });
});
