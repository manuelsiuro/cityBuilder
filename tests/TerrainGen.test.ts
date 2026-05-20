import { describe, it, expect } from "vitest";
import { CityData } from "../src/sim/CityData";
import { Random } from "../src/engine/Random";
import { generateTerrain } from "../src/sim/TerrainGen";
import { MAX_ELEVATION, TerrainType, Dirty } from "../src/sim/layers";

function generate(seed: number): CityData {
  const city = new CityData(64, 64);
  generateTerrain(city, new Random(seed));
  return city;
}

describe("generateTerrain", () => {
  it("keeps every elevation within [0, MAX_ELEVATION]", () => {
    const city = generate(1);
    for (let i = 0; i < city.grid.size; i++) {
      expect(city.elevation[i]).toBeGreaterThanOrEqual(0);
      expect(city.elevation[i]).toBeLessThanOrEqual(MAX_ELEVATION);
    }
  });

  it("assigns only valid terrain types", () => {
    const city = generate(2);
    const valid = new Set([TerrainType.Grass, TerrainType.Water, TerrainType.Rock]);
    for (let i = 0; i < city.grid.size; i++) {
      expect(valid.has(city.terrainType[i])).toBe(true);
    }
  });

  it("flattens water tiles to elevation 0", () => {
    const city = generate(3);
    for (let i = 0; i < city.grid.size; i++) {
      if (city.terrainType[i] === TerrainType.Water) {
        expect(city.elevation[i]).toBe(0);
      }
    }
  });

  it("is deterministic for a given seed", () => {
    const a = generate(99);
    const b = generate(99);
    expect(Array.from(a.elevation)).toEqual(Array.from(b.elevation));
    expect(Array.from(a.terrainType)).toEqual(Array.from(b.terrainType));
  });

  it("raises the Terrain dirty flag", () => {
    const city = generate(5);
    expect(city.isDirty(Dirty.Terrain)).toBe(true);
  });

  it("produces some land and some water", () => {
    const city = generate(7);
    let water = 0;
    let land = 0;
    for (let i = 0; i < city.grid.size; i++) {
      if (city.terrainType[i] === TerrainType.Water) water++;
      else land++;
    }
    expect(water).toBeGreaterThan(0);
    expect(land).toBeGreaterThan(0);
  });
});
