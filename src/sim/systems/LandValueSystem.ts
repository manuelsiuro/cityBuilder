import type { CityData } from "../CityData";
import { Biome, TerrainType, Zone } from "../layers";
import { BIOME_LAND_VALUE_MOD, BIOME_POLLUTION_MOD } from "../BiomeMap";

/** Land value (0–255 scale) of a plain inland tile with nothing nearby. */
const BASE_VALUE = 90;
/** Peak scenic bonus added to a tile right beside water. */
const WATER_BONUS = 42;
/** Tiles over which the water bonus fades linearly to zero. */
const WATER_RANGE = 3;
/** Tiles over which an industrial building's pollution spreads. */
const POLLUTION_RANGE = 4;
/** Pollution emitted at the source per industrial development level. */
const POLLUTION_PER_LEVEL = 26;
/** Traffic-load units that cost one point of land value. */
const CONGESTION_DIVISOR = 4;
/** Police-coverage units that add one point of land value (safety premium). */
const POLICE_DIVISOR = 9;
/** Park-coverage units that add one point of land value (amenity premium). */
const PARK_DIVISOR = 7;
/** Health-coverage units that add one point of land value (care premium). */
const HEALTH_DIVISOR = 10;
/** Active-crime units that cost one point of land value. */
const CRIME_DIVISOR = 5;

/**
 * Computes per-tile land value: a base value, plus a scenic bonus near water,
 * minus pollution emitted by industry. Land value caps how tall residential
 * and commercial buildings can grow. The water bonus is terrain-static so it
 * is computed once and cached.
 */
export class LandValueSystem {
  private waterBonus?: Uint8Array;

  /** Drop the cached scenic-water map — call when terrain changes (e.g. load). */
  reset(): void {
    this.waterBonus = undefined;
  }

  update(city: CityData): void {
    const { grid } = city;
    if (!this.waterBonus) this.waterBonus = this.computeWaterBonus(city);

    // Pollution: each industrial building fouls its neighbourhood.
    city.pollution.fill(0);
    for (let i = 0; i < grid.size; i++) {
      if (city.zone[i] !== Zone.Industrial || city.buildLevel[i] === 0) continue;
      this.emitPollution(city, grid.x(i), grid.y(i), city.buildLevel[i]);
    }

    for (let i = 0; i < grid.size; i++) {
      // Heavy traffic depresses desirability; nearby police and parks lift it.
      const congestion = Math.floor(city.trafficLoad[i] / CONGESTION_DIVISOR);
      const biomeMod = BIOME_LAND_VALUE_MOD[city.biome[i] as Biome];
      const services =
        Math.floor(city.policeCoverage[i] / POLICE_DIVISOR) +
        Math.floor(city.parkCoverage[i] / PARK_DIVISOR) +
        Math.floor(city.healthCoverage[i] / HEALTH_DIVISOR);
      const crime = Math.floor(city.crime[i] / CRIME_DIVISOR);
      const v =
        BASE_VALUE + this.waterBonus[i] + biomeMod + services -
        city.pollution[i] - congestion - crime;
      city.landValue[i] = Math.max(0, Math.min(255, v));
    }
  }

  private emitPollution(city: CityData, cx: number, cy: number, level: number): void {
    const { grid } = city;
    const strength = level * POLLUTION_PER_LEVEL;
    for (let dy = -POLLUTION_RANGE; dy <= POLLUTION_RANGE; dy++) {
      for (let dx = -POLLUTION_RANGE; dx <= POLLUTION_RANGE; dx++) {
        const x = cx + dx;
        const y = cy + dy;
        if (!grid.inBounds(x, y)) continue;
        const dist = Math.hypot(dx, dy);
        if (dist > POLLUTION_RANGE) continue;
        const idx = grid.index(x, y);
        const amount =
          strength *
          (1 - dist / POLLUTION_RANGE) *
          BIOME_POLLUTION_MOD[city.biome[idx] as Biome];
        city.pollution[idx] = Math.min(255, city.pollution[idx] + amount);
      }
    }
  }

  private computeWaterBonus(city: CityData): Uint8Array {
    const { grid } = city;
    const bonus = new Uint8Array(grid.size);
    for (let y = 0; y < grid.height; y++) {
      for (let x = 0; x < grid.width; x++) {
        let best = 0;
        for (let dy = -WATER_RANGE; dy <= WATER_RANGE; dy++) {
          for (let dx = -WATER_RANGE; dx <= WATER_RANGE; dx++) {
            const nx = x + dx;
            const ny = y + dy;
            if (!grid.inBounds(nx, ny)) continue;
            if (city.terrainType[grid.index(nx, ny)] !== TerrainType.Water) continue;
            const dist = Math.hypot(dx, dy);
            if (dist > WATER_RANGE) continue;
            best = Math.max(best, WATER_BONUS * (1 - dist / WATER_RANGE));
          }
        }
        bonus[grid.index(x, y)] = best;
      }
    }
    return bonus;
  }
}
