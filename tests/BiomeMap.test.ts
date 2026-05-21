import { describe, it, expect } from "vitest";
import { classifyBiome, biomeTreeWeight } from "../src/sim/BiomeMap";
import { Biome, TerrainType } from "../src/sim/layers";

describe("classifyBiome", () => {
  it("classifies water as Ocean", () => {
    expect(classifyBiome(TerrainType.Water, 0, 0.5, 0.5)).toBe(Biome.Ocean);
  });

  it("classifies rock by temperature", () => {
    expect(classifyBiome(TerrainType.Rock, 7, 0.2, 0.5)).toBe(Biome.Snow);
    expect(classifyBiome(TerrainType.Rock, 7, 0.8, 0.5)).toBe(Biome.Mountain);
  });

  it("classifies cold grass as tundra or snow", () => {
    expect(classifyBiome(TerrainType.Grass, 3, 0.1, 0.2)).toBe(Biome.Tundra);
    expect(classifyBiome(TerrainType.Grass, 3, 0.1, 0.7)).toBe(Biome.Snow);
  });

  it("classifies hot dry grass as desert", () => {
    expect(classifyBiome(TerrainType.Grass, 2, 0.8, 0.2)).toBe(Biome.Desert);
  });

  it("classifies wet temperate grass as forest", () => {
    expect(classifyBiome(TerrainType.Grass, 3, 0.5, 0.7)).toBe(Biome.Forest);
  });

  it("classifies temperate dry grass as plains", () => {
    expect(classifyBiome(TerrainType.Grass, 3, 0.5, 0.4)).toBe(Biome.Plains);
  });
});

describe("biomeTreeWeight", () => {
  it("gives forests the heaviest tree weight", () => {
    expect(biomeTreeWeight(Biome.Forest)).toBeGreaterThan(biomeTreeWeight(Biome.Plains));
    expect(biomeTreeWeight(Biome.Desert)).toBe(0);
    expect(biomeTreeWeight(Biome.Ocean)).toBe(0);
  });
});
