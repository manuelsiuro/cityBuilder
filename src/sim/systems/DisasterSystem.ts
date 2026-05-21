import type { Random } from "../../engine/Random";
import type { CityData } from "../CityData";
import type { GameEventBus } from "../events";
import { Dirty, Zone } from "../layers";
import { BUILDING } from "../buildings";

/** Base spontaneous-ignition chance per flammable tile per tick. */
const IGNITE_RISK = 0.00002;
/** Industry is more fire-prone than other land. */
const INDUSTRIAL_RISK_MULT = 2.5;
/** Intensity a tile starts at when it catches fire. */
const IGNITE_INTENSITY = 55;
/** Intensity a burning, fuelled tile gains each tick. */
const GROWTH = 6;
/** Intensity lost each tick once a tile's fuel is gone (burnt out). */
const NO_FUEL_DECAY = 12;
/** Intensity removed each tick at full fire-station coverage. */
const SUPPRESS_MAX = 15;
/** A fire only spreads to neighbours once this established. */
const SPREAD_THRESHOLD = 120;
/** Per-neighbour chance per tick that an established fire spreads. */
const SPREAD_CHANCE = 0.05;
/** A fire only damages its building above this intensity. */
const DESTROY_THRESHOLD = 165;
/** Per-tick chance an intense fire knocks the building down a level. */
const DESTROY_CHANCE = 0.05;
/** Minimum ticks between "fire broke out" toasts. */
const NOTICE_COOLDOWN = 60;

/**
 * Random fire incidents. Each tick a flammable tile may spontaneously ignite
 * (industry is riskier; fire-station coverage suppresses it); existing fires
 * grow, spread to flammable neighbours, and damage buildings — unless fire
 * coverage holds them back. Fires are transient: they are not saved.
 *
 * Deterministic — all randomness draws from `World`'s shared `Random`.
 */
export class DisasterSystem {
  private lastNotice = -Infinity;

  constructor(
    private readonly random: Random,
    private readonly events: GameEventBus,
  ) {}

  /** Reset incident state — call when the city is replaced (new / load). */
  clear(): void {
    this.lastNotice = -Infinity;
  }

  update(city: CityData, tick: number): void {
    const { grid } = city;
    let destroyed = false;

    // 1. Burn, spread and damage. The burning set is snapshotted so a fire
    //    spread this tick does not cascade again within the same tick.
    const burning: number[] = [];
    for (let i = 0; i < grid.size; i++) {
      if (city.fire[i] > 0) burning.push(i);
    }
    for (const i of burning) {
      const fuelled = hasFuel(city, i);
      const suppress = (SUPPRESS_MAX * city.fireCoverage[i]) / 255;
      const intensity = city.fire[i] + (fuelled ? GROWTH : -NO_FUEL_DECAY) - suppress;

      if (fuelled && intensity >= DESTROY_THRESHOLD && this.random.chance(DESTROY_CHANCE)) {
        if (damage(city, i)) destroyed = true;
      }
      if (intensity >= SPREAD_THRESHOLD) {
        grid.forEachNeighbor4(grid.x(i), grid.y(i), (_x, _y, ni) => {
          if (city.fire[ni] > 0 || !hasFuel(city, ni)) return;
          const resist = city.fireCoverage[ni] / 255;
          if (this.random.chance(SPREAD_CHANCE * (1 - resist))) {
            city.fire[ni] = IGNITE_INTENSITY;
          }
        });
      }
      city.fire[i] = Math.max(0, Math.min(255, intensity));
    }

    // 2. Spontaneous ignition on flammable tiles that are not already alight.
    for (let i = 0; i < grid.size; i++) {
      if (city.fire[i] > 0 || !hasFuel(city, i)) continue;
      let risk = IGNITE_RISK;
      if (city.zone[i] === Zone.Industrial) risk *= INDUSTRIAL_RISK_MULT;
      risk *= 1 - city.fireCoverage[i] / 255;
      if (this.random.chance(risk)) {
        city.fire[i] = IGNITE_INTENSITY;
        this.notifyFire(tick);
      }
    }

    if (destroyed) {
      city.markDirty(
        Dirty.Power | Dirty.Water | Dirty.Zone |
          Dirty.Utility | Dirty.LandValue | Dirty.Coverage,
      );
      this.events.emit("buildings:changed", undefined);
      this.events.emit("utilities:changed", undefined);
    }
  }

  private notifyFire(tick: number): void {
    if (tick - this.lastNotice < NOTICE_COOLDOWN) return;
    this.lastNotice = tick;
    this.events.emit("notice", { level: "warn", message: "A fire has broken out!" });
  }
}

/** True if the tile has something that can burn — a building or trees. */
function hasFuel(city: CityData, i: number): boolean {
  return city.buildLevel[i] > 0 || city.buildingId[i] !== 0 || city.trees[i] > 0;
}

/** Knock down whatever sits on a burning tile. Returns true if it changed. */
function damage(city: CityData, i: number): boolean {
  if (city.buildLevel[i] > 0) {
    city.buildLevel[i]--;
    if (city.buildLevel[i] === 0) city.buildAge[i] = 0; // razed — zone may redevelop
    city.trees[i] = 0;
    return true;
  }
  if (city.buildingId[i] !== 0) {
    city.buildingId[i] = BUILDING.None;
    city.trees[i] = 0;
    return true;
  }
  if (city.trees[i] > 0) {
    city.trees[i] = 0; // forest consumed
    return true;
  }
  return false;
}
