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
});
