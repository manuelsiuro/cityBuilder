import { describe, it, expect } from "vitest";
import { CityData } from "../src/sim/CityData";
import { RoadGraph } from "../src/sim/pathfinding/RoadGraph";

function lay(city: CityData, tiles: [number, number][]): void {
  for (const [x, y] of tiles) city.road[city.grid.index(x, y)] = 1;
}

describe("RoadGraph", () => {
  it("groups a connected line into one network", () => {
    const city = new CityData(16, 16);
    lay(city, [[1, 2], [2, 2], [3, 2], [4, 2]]);
    const graph = new RoadGraph();
    graph.rebuild(city);

    expect(graph.roadTileCount).toBe(4);
    expect(graph.networkCount).toBe(1);
    expect(graph.connected(city.grid.index(1, 2), city.grid.index(4, 2))).toBe(true);
  });

  it("separates disconnected roads into distinct networks", () => {
    const city = new CityData(16, 16);
    lay(city, [[1, 1], [2, 1]]);
    lay(city, [[10, 10], [10, 11]]);
    const graph = new RoadGraph();
    graph.rebuild(city);

    expect(graph.networkCount).toBe(2);
    expect(graph.connected(city.grid.index(1, 1), city.grid.index(10, 10))).toBe(false);
  });

  it("reports no networks for an empty city", () => {
    const city = new CityData(8, 8);
    const graph = new RoadGraph();
    graph.rebuild(city);
    expect(graph.roadTileCount).toBe(0);
    expect(graph.networkCount).toBe(0);
  });

  it("merges two roads once a tile bridges them", () => {
    const city = new CityData(16, 16);
    lay(city, [[1, 1], [2, 1]]);
    lay(city, [[4, 1], [5, 1]]);
    const graph = new RoadGraph();
    graph.rebuild(city);
    expect(graph.networkCount).toBe(2);

    lay(city, [[3, 1]]); // bridge tile
    graph.rebuild(city);
    expect(graph.networkCount).toBe(1);
  });
});
