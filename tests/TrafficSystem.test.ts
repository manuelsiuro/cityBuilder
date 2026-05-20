import { describe, it, expect } from "vitest";
import { CityData } from "../src/sim/CityData";
import { EventBus } from "../src/engine/EventBus";
import { Random } from "../src/engine/Random";
import { RoadGraph } from "../src/sim/pathfinding/RoadGraph";
import { TrafficSystem } from "../src/sim/systems/TrafficSystem";
import type { GameEventMap } from "../src/sim/events";

function roadCity(): CityData {
  const city = new CityData(24, 24);
  const idx = (x: number, y: number) => city.grid.index(x, y);
  for (let x = 2; x < 22; x++) city.road[idx(x, 12)] = 1;
  for (let y = 2; y < 22; y++) city.road[idx(12, y)] = 1;
  return city;
}

describe("TrafficSystem", () => {
  it("spawns cars onto a connected road network", () => {
    const city = roadCity();
    const graph = new RoadGraph();
    graph.rebuild(city);
    const traffic = new TrafficSystem(graph, new Random(1), new EventBus<GameEventMap>());

    for (let t = 0; t < 80; t++) traffic.update(city, t);

    expect(traffic.cars.some((c) => c.active)).toBe(true);
  });

  it("stamps congestion onto the traffic-load layer", () => {
    const city = roadCity();
    const graph = new RoadGraph();
    graph.rebuild(city);
    const traffic = new TrafficSystem(graph, new Random(2), new EventBus<GameEventMap>());

    for (let t = 0; t < 80; t++) traffic.update(city, t);

    let total = 0;
    for (let i = 0; i < city.grid.size; i++) total += city.trafficLoad[i];
    expect(total).toBeGreaterThan(0);
  });

  it("spawns nothing when there are no roads", () => {
    const city = new CityData(16, 16);
    const traffic = new TrafficSystem(new RoadGraph(), new Random(3), new EventBus<GameEventMap>());
    for (let t = 0; t < 40; t++) traffic.update(city, t);
    expect(traffic.cars.some((c) => c.active)).toBe(false);
  });
});
