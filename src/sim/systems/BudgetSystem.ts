import type { CityData } from "../CityData";
import type { GameEventBus } from "../events";
import { isMonthStart } from "../Tick";
import { BUILDING } from "../buildings";

/** Monthly budget ledger, emitted on `budget:changed`. */
export interface BudgetReport {
  funds: number;
  income: number;
  maintenance: number;
  net: number;
}

/** Per-tile / per-structure monthly upkeep. */
const UPKEEP = {
  road: 1,
  powerLine: 1,
  pipe: 1,
  powerPlant: 100,
  waterPump: 30,
  policeStation: 60,
  fireStation: 60,
  park: 10,
} as const;

/**
 * Collects taxes and pays maintenance once per in-game month. Tax income scales
 * with population and jobs; maintenance scales with infrastructure. The net is
 * applied to `funds` and the ledger is broadcast for the budget HUD.
 */
export class BudgetSystem {
  constructor(private readonly events: GameEventBus) {}

  update(city: CityData, tick: number): void {
    if (!isMonthStart(tick)) return;

    const income = Math.round(
      city.population * city.taxRateR * 8 +
        city.jobsCommercial * city.taxRateC * 12 +
        city.jobsIndustrial * city.taxRateI * 10,
    );

    let maintenance = 0;
    for (let i = 0; i < city.grid.size; i++) {
      if (city.road[i]) maintenance += UPKEEP.road;
      if (city.powerLine[i]) maintenance += UPKEEP.powerLine;
      if (city.pipe[i]) maintenance += UPKEEP.pipe;
      if (city.buildingId[i] === BUILDING.PowerPlant) maintenance += UPKEEP.powerPlant;
      else if (city.buildingId[i] === BUILDING.WaterPump) maintenance += UPKEEP.waterPump;
      else if (city.buildingId[i] === BUILDING.PoliceStation) maintenance += UPKEEP.policeStation;
      else if (city.buildingId[i] === BUILDING.FireStation) maintenance += UPKEEP.fireStation;
      else if (city.buildingId[i] === BUILDING.Park) maintenance += UPKEEP.park;
    }

    const net = income - maintenance;
    city.funds += net;

    this.events.emit("budget:changed", {
      funds: city.funds,
      income,
      maintenance,
      net,
    });
  }
}
