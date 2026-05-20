import { describe, it, expect } from "vitest";
import { CityData } from "../src/sim/CityData";
import { RCISystem } from "../src/sim/systems/RCISystem";

describe("RCISystem", () => {
  it("seeds industrial demand for an empty city", () => {
    const city = new CityData(8, 8);
    new RCISystem().update(city);
    expect(city.demandI).toBeGreaterThan(0);
  });

  it("raises residential demand when jobs exceed population", () => {
    const city = new CityData(8, 8);
    city.population = 10;
    city.jobsIndustrial = 100;
    new RCISystem().update(city);
    expect(city.demandR).toBeGreaterThan(0);
  });

  it("raises commercial demand when population outgrows shops", () => {
    const city = new CityData(8, 8);
    city.population = 200;
    city.jobsCommercial = 0;
    new RCISystem().update(city);
    expect(city.demandC).toBeGreaterThan(0);
  });

  it("clamps demand to ±100", () => {
    const city = new CityData(8, 8);
    city.jobsIndustrial = 100_000;
    new RCISystem().update(city);
    expect(city.demandR).toBeLessThanOrEqual(100);
    expect(city.demandR).toBeGreaterThanOrEqual(-100);
  });
});
