import { describe, it, expect } from "vitest";
import { CityData } from "../src/sim/CityData";
import { Dirty } from "../src/sim/layers";

describe("CityData", () => {
  it("allocates every layer at grid size", () => {
    const city = new CityData(32, 24);
    expect(city.grid.size).toBe(768);
    expect(city.elevation).toHaveLength(768);
    expect(city.zone).toHaveLength(768);
    expect(city.road).toHaveLength(768);
    expect(city.powered).toHaveLength(768);
  });

  it("tracks dirty flags independently", () => {
    const city = new CityData(8, 8);
    expect(city.isDirty(Dirty.Power)).toBe(false);

    city.markDirty(Dirty.Power);
    city.markDirty(Dirty.Water);
    expect(city.isDirty(Dirty.Power)).toBe(true);
    expect(city.isDirty(Dirty.Water)).toBe(true);
    expect(city.isDirty(Dirty.Road)).toBe(false);

    city.clearDirty(Dirty.Power);
    expect(city.isDirty(Dirty.Power)).toBe(false);
    expect(city.isDirty(Dirty.Water)).toBe(true);
  });
});
