import type { Random } from "../../engine/Random";
import type { CityData } from "../CityData";
import type { GameEventBus } from "../events";
import { Zone } from "../layers";
import { growthChance, levelCapFor, MAX_BUILD_LEVEL } from "../development";

/**
 * Grows, levels up, and declines buildings on zoned land. A tile develops when
 * it is serviced (power + water + road access) and its zone is in demand; it
 * declines when service is lost or demand turns sharply negative.
 */
export class DevelopmentSystem {
  constructor(
    private readonly random: Random,
    private readonly events: GameEventBus,
  ) {}

  update(city: CityData): void {
    const { grid } = city;
    let changed = false;

    for (let i = 0; i < grid.size; i++) {
      const zone = city.zone[i];
      if (zone === Zone.None || city.buildingId[i] !== 0) continue;

      const serviced =
        city.powered[i] === 1 && city.watered[i] === 1 && this.nearRoad(city, i);
      const demand = demandFor(city, zone);
      const level = city.buildLevel[i];

      if (serviced && demand > 0) {
        if (level === 0) {
          if (this.random.chance(growthChance(demand))) {
            city.buildLevel[i] = 1;
            changed = true;
          }
        } else if (level < this.levelCap(city, i, zone) && demand > 20) {
          if (this.random.chance(growthChance(demand) * 0.5)) {
            city.buildLevel[i] = level + 1;
            changed = true;
          }
        }
      } else if (level > 0 && (!serviced || demand < -25)) {
        if (this.random.chance(0.15)) {
          city.buildLevel[i] = level - 1;
          changed = true;
        }
      }
    }

    if (changed) this.events.emit("buildings:changed", undefined);
  }

  /** Industry grows freely; residential / commercial are capped by land value. */
  private levelCap(city: CityData, i: number, zone: Zone): number {
    if (zone === Zone.Industrial) return MAX_BUILD_LEVEL;
    return levelCapFor(city.landValue[i]);
  }

  /** True if any tile in the 3×3 neighbourhood carries a road. */
  private nearRoad(city: CityData, i: number): boolean {
    const { grid } = city;
    const cx = grid.x(i);
    const cy = grid.y(i);
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        const x = cx + dx;
        const y = cy + dy;
        if (grid.inBounds(x, y) && city.road[grid.index(x, y)] === 1) return true;
      }
    }
    return false;
  }
}

function demandFor(city: CityData, zone: Zone): number {
  switch (zone) {
    case Zone.Residential:
      return city.demandR;
    case Zone.Commercial:
      return city.demandC;
    case Zone.Industrial:
      return city.demandI;
    default:
      return 0;
  }
}
