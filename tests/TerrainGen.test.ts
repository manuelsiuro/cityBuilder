import { describe, it, expect } from "vitest";
import { CityData } from "../src/sim/CityData";
import { Random } from "../src/engine/Random";
import { generateTerrain } from "../src/sim/TerrainGen";
import { MAX_ELEVATION, TerrainType, Biome, Dirty } from "../src/sim/layers";
import { DEFAULT_MAP_SETTINGS, type MapSettings } from "../src/sim/MapSettings";

function settings(overrides: Partial<MapSettings> = {}): MapSettings {
  return { ...DEFAULT_MAP_SETTINGS, ...overrides };
}

function generate(seed: number, overrides: Partial<MapSettings> = {}): CityData {
  const city = new CityData(64, 64);
  generateTerrain(city, new Random(seed), settings(overrides));
  return city;
}

function countWater(city: CityData): number {
  let water = 0;
  for (let i = 0; i < city.grid.size; i++) {
    if (city.terrainType[i] === TerrainType.Water) water++;
  }
  return water;
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

  it("assigns only valid biomes", () => {
    const city = generate(2);
    const valid = new Set(Object.values(Biome).filter((v) => typeof v === "number"));
    for (let i = 0; i < city.grid.size; i++) {
      expect(valid.has(city.biome[i])).toBe(true);
    }
  });

  it("classifies every water tile as the Ocean biome", () => {
    const city = generate(4);
    for (let i = 0; i < city.grid.size; i++) {
      if (city.terrainType[i] === TerrainType.Water) {
        expect(city.biome[i]).toBe(Biome.Ocean);
      }
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
    expect(Array.from(a.biome)).toEqual(Array.from(b.biome));
    expect(Array.from(a.trees)).toEqual(Array.from(b.trees));
  });

  it("raises the Terrain dirty flag", () => {
    const city = generate(5);
    expect(city.isDirty(Dirty.Terrain)).toBe(true);
  });

  it("produces some land and some water", () => {
    const city = generate(7);
    const water = countWater(city);
    expect(water).toBeGreaterThan(0);
    expect(water).toBeLessThan(city.grid.size);
  });

  it("makes more water as the water setting rises", () => {
    const dry = countWater(generate(11, { water: 0.15 }));
    const wet = countWater(generate(11, { water: 0.6 }));
    expect(wet).toBeGreaterThan(dry);
  });

  it("places no trees when tree density is zero", () => {
    const city = generate(13, { treeDensity: 0 });
    for (let i = 0; i < city.grid.size; i++) expect(city.trees[i]).toBe(0);
  });

  it("places some trees when tree density is high", () => {
    const city = generate(13, { treeDensity: 1 });
    let trees = 0;
    for (let i = 0; i < city.grid.size; i++) if (city.trees[i] > 0) trees++;
    expect(trees).toBeGreaterThan(0);
  });

  it("makes a flat map all grassland at elevation 0", () => {
    const city = generate(7, { flat: true });
    for (let i = 0; i < city.grid.size; i++) {
      expect(city.elevation[i]).toBe(0);
      expect(city.terrainType[i]).toBe(TerrainType.Grass);
      expect(city.biome[i]).toBe(Biome.Plains);
    }
    expect(countWater(city)).toBe(0);
  });

  it("still scatters trees by density on a flat map", () => {
    const bare = generate(13, { flat: true, treeDensity: 0 });
    for (let i = 0; i < bare.grid.size; i++) expect(bare.trees[i]).toBe(0);

    const wooded = generate(13, { flat: true, treeDensity: 1 });
    let trees = 0;
    for (let i = 0; i < wooded.grid.size; i++) if (wooded.trees[i] > 0) trees++;
    expect(trees).toBeGreaterThan(0);
  });
});
