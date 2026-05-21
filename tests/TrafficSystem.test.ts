import { describe, it, expect } from "vitest";
import { CityData } from "../src/sim/CityData";
import { EventBus } from "../src/engine/EventBus";
import { Random } from "../src/engine/Random";
import { RoadGraph } from "../src/sim/pathfinding/RoadGraph";
import { IntersectionSystem } from "../src/sim/systems/IntersectionSystem";
import { TrafficSystem } from "../src/sim/systems/TrafficSystem";
import type { GameEventMap } from "../src/sim/events";

/** A 24×24 city with a grid of avenues — several 4-way and T-junctions. */
function gridCity(): CityData {
  const city = new CityData(24, 24);
  const idx = (x: number, y: number) => city.grid.index(x, y);
  for (const o of [4, 12, 20]) {
    for (let t = 4; t <= 20; t++) {
      city.road[idx(o, t)] = 1;
      city.road[idx(t, o)] = 1;
    }
  }
  return city;
}

/** Build a wired traffic + intersection pair and run it for `ticks`. */
function run(
  city: CityData,
  ticks: number,
  opts: { target?: number; seed?: number } = {},
): TrafficSystem {
  const events = new EventBus<GameEventMap>();
  const graph = new RoadGraph();
  graph.rebuild(city);
  const intersections = new IntersectionSystem(events);
  const traffic = new TrafficSystem(graph, intersections, new Random(opts.seed ?? 1), events);
  if (opts.target != null) traffic.targetOverride = opts.target;
  for (let t = 0; t < ticks; t++) {
    intersections.update(city);
    traffic.update(city, t);
  }
  return traffic;
}

describe("TrafficSystem", () => {
  it("spawns cars up to the forced target", () => {
    const traffic = run(gridCity(), 120, { target: 30 });
    const active = traffic.cars.filter((c) => c.active).length;
    expect(active).toBeGreaterThan(0);
    expect(active).toBeLessThanOrEqual(30);
  });

  it("scales the fleet with population and jobs", () => {
    const low = gridCity();
    low.population = 250;
    const high = gridCity();
    high.population = 1500;

    const lowCars = run(low, 200).cars.filter((c) => c.active).length;
    const highCars = run(high, 200).cars.filter((c) => c.active).length;

    expect(highCars).toBeGreaterThan(lowCars);
  });

  it("keeps cars from piling on top of each other", () => {
    const traffic = run(gridCity(), 240, { target: 45 });
    const active = traffic.cars.filter((c) => c.active);

    let minDist = Infinity;
    for (let a = 0; a < active.length; a++) {
      for (let b = a + 1; b < active.length; b++) {
        const dx = active[a].tileX - active[b].tileX;
        const dy = active[a].tileY - active[b].tileY;
        minDist = Math.min(minDist, Math.hypot(dx, dy));
      }
    }
    expect(active.length).toBeGreaterThan(5);
    expect(minDist).toBeGreaterThan(0.15);
  });

  it("retires cars once they reach their destination", () => {
    const city = gridCity();
    const events = new EventBus<GameEventMap>();
    const graph = new RoadGraph();
    graph.rebuild(city);
    const intersections = new IntersectionSystem(events);
    const traffic = new TrafficSystem(graph, intersections, new Random(1), events);
    traffic.targetOverride = 20;

    const wasActive = new Array<boolean>(traffic.cars.length).fill(false);
    let completions = 0;
    for (let t = 0; t < 400; t++) {
      intersections.update(city);
      traffic.update(city, t);
      traffic.cars.forEach((c, k) => {
        if (wasActive[k] && !c.active) completions++;
        wasActive[k] = c.active;
      });
    }
    expect(completions).toBeGreaterThan(0);
  });

  it("stamps congestion onto the traffic-load layer", () => {
    const city = gridCity();
    run(city, 120, { target: 30, seed: 2 });
    let total = 0;
    for (let i = 0; i < city.grid.size; i++) total += city.trafficLoad[i];
    expect(total).toBeGreaterThan(0);
  });

  it("spawns nothing when there are no roads", () => {
    const traffic = run(new CityData(16, 16), 60, { target: 40 });
    expect(traffic.cars.some((c) => c.active)).toBe(false);
  });

  it("re-routes a gridlocked car instead of dropping it", () => {
    const city = gridCity();
    const events = new EventBus<GameEventMap>();
    const graph = new RoadGraph();
    graph.rebuild(city);
    const intersections = new IntersectionSystem(events);
    const traffic = new TrafficSystem(graph, intersections, new Random(1), events);
    traffic.targetOverride = 5;
    for (let t = 0; t < 20; t++) {
      intersections.update(city);
      traffic.update(city, t);
    }

    const car = traffic.cars.find((c) => c.active && c.pos < c.path.length - 3);
    expect(car).toBeDefined();

    // Freeze the car so the stuck timer fires, then push it past the limit.
    car!.cruiseSpeed = 0;
    car!.speed = 0;
    car!.stuckTicks = 999;
    const oldPath = car!.path;
    traffic.update(city, 20);

    // It re-routed rather than vanishing: still active, flagged, fresh path.
    expect(car!.active).toBe(true);
    expect(car!.rerouted).toBe(true);
    expect(car!.path).not.toBe(oldPath);

    // A second gridlock with its one re-route spent retires it. Spawning is
    // disabled so the freed pool slot is not recycled before the assertion.
    traffic.targetOverride = 0;
    car!.cruiseSpeed = 0;
    car!.speed = 0;
    car!.stuckTicks = 999;
    traffic.update(city, 21);
    expect(car!.active).toBe(false);
  });
});
