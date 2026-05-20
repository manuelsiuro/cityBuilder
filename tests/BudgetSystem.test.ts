import { describe, it, expect, vi } from "vitest";
import { CityData } from "../src/sim/CityData";
import { EventBus } from "../src/engine/EventBus";
import { BudgetSystem } from "../src/sim/systems/BudgetSystem";
import { TICKS_PER_MONTH } from "../src/sim/Tick";
import { BUILDING } from "../src/sim/buildings";
import type { GameEventMap } from "../src/sim/events";

describe("BudgetSystem", () => {
  it("does nothing mid-month", () => {
    const city = new CityData(8, 8);
    const events = new EventBus<GameEventMap>();
    const fn = vi.fn();
    events.on("budget:changed", fn);
    new BudgetSystem(events).update(city, 5);
    expect(fn).not.toHaveBeenCalled();
  });

  it("collects taxes and credits funds on a month boundary", () => {
    const city = new CityData(8, 8);
    city.population = 500;
    city.jobsCommercial = 100;
    const before = city.funds;

    const events = new EventBus<GameEventMap>();
    let report: GameEventMap["budget:changed"] | undefined;
    events.on("budget:changed", (r) => (report = r));

    new BudgetSystem(events).update(city, TICKS_PER_MONTH);

    expect(report).toBeDefined();
    expect(report!.income).toBeGreaterThan(0);
    expect(city.funds).toBe(before + report!.net);
  });

  it("charges maintenance for infrastructure", () => {
    const city = new CityData(8, 8);
    city.road[0] = 1;
    city.road[1] = 1;
    city.buildingId[2] = BUILDING.PowerPlant;

    const events = new EventBus<GameEventMap>();
    let report: GameEventMap["budget:changed"] | undefined;
    events.on("budget:changed", (r) => (report = r));

    new BudgetSystem(events).update(city, TICKS_PER_MONTH);

    expect(report!.maintenance).toBeGreaterThan(0);
  });
});
