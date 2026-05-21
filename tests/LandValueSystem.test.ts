import { describe, it, expect } from "vitest";
import { CityData } from "../src/sim/CityData";
import { LandValueSystem } from "../src/sim/systems/LandValueSystem";
import { Zone } from "../src/sim/layers";

describe("LandValueSystem", () => {
  it("gives every tile a baseline land value", () => {
    const city = new CityData(16, 16);
    new LandValueSystem().update(city);
    expect(city.landValue[city.grid.index(8, 8)]).toBeGreaterThan(0);
  });

  it("lowers land value near an industrial building", () => {
    const city = new CityData(24, 24);
    const factory = city.grid.index(12, 12);
    city.zone[factory] = Zone.Industrial;
    city.buildLevel[factory] = 3;

    new LandValueSystem().update(city);

    const near = city.landValue[city.grid.index(13, 12)];
    const far = city.landValue[city.grid.index(2, 2)];
    expect(near).toBeLessThan(far);
    expect(city.pollution[city.grid.index(13, 12)]).toBeGreaterThan(0);
  });

  it("raises land value where hospital health coverage reaches", () => {
    const i = (c: CityData) => c.grid.index(12, 12);
    const bare = new CityData(24, 24);
    new LandValueSystem().update(bare);
    const baseline = bare.landValue[i(bare)];

    const covered = new CityData(24, 24);
    covered.healthCoverage[i(covered)] = 200;
    new LandValueSystem().update(covered);

    expect(covered.landValue[i(covered)]).toBeGreaterThan(baseline);
  });

  it("lowers land value where active crime is present", () => {
    const i = (c: CityData) => c.grid.index(12, 12);
    const bare = new CityData(24, 24);
    new LandValueSystem().update(bare);
    const baseline = bare.landValue[i(bare)];

    const unsafe = new CityData(24, 24);
    unsafe.crime[i(unsafe)] = 180;
    new LandValueSystem().update(unsafe);

    expect(unsafe.landValue[i(unsafe)]).toBeLessThan(baseline);
  });
});
