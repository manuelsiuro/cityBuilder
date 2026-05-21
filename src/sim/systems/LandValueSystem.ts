import type { CityData } from "../CityData";
import { Biome, TerrainType, Zone } from "../layers";
import { BIOME_LAND_VALUE_MOD, BIOME_POLLUTION_MOD } from "../BiomeMap";

const BASE_VALUE = 90;
const WATER_BONUS = 42;
const WATER_RANGE = 3;
const POLLUTION_RANGE = 4;

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
      // Heavy traffic depresses desirability.
      const congestion = Math.floor(city.trafficLoad[i] / 4);
      const biomeMod = BIOME_LAND_VALUE_MOD[city.biome[i] as Biome];
      const v = BASE_VALUE + this.waterBonus[i] + biomeMod - city.pollution[i] - congestion;
      city.landValue[i] = Math.max(0, Math.min(255, v));
    }
  }

  private emitPollution(city: CityData, cx: number, cy: number, level: number): void {
    const { grid } = city;
    const strength = level * 26;
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
