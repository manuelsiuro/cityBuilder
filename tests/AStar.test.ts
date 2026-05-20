import { describe, it, expect } from "vitest";
import { CityData } from "../src/sim/CityData";
import { findRoadPath } from "../src/sim/pathfinding/AStar";

describe("findRoadPath", () => {
  it("finds a path along a connected road", () => {
    const city = new CityData(16, 16);
    const idx = (x: number, y: number) => city.grid.index(x, y);
    for (let x = 2; x <= 10; x++) city.road[idx(x, 5)] = 1;

    const path = findRoadPath(city, idx(2, 5), idx(10, 5));
    expect(path).not.toBeNull();
    expect(path![0]).toBe(idx(2, 5));
    expect(path!.at(-1)).toBe(idx(10, 5));
  });

  it("returns a 4-connected sequence of road tiles", () => {
    const city = new CityData(16, 16);
    const idx = (x: number, y: number) => city.grid.index(x, y);
    for (let x = 2; x <= 8; x++) city.road[idx(x, 4)] = 1;
    for (let y = 4; y <= 9; y++) city.road[idx(8, y)] = 1;

    const path = findRoadPath(city, idx(2, 4), idx(8, 9))!;
    for (let k = 1; k < path.length; k++) {
      const a = path[k - 1];
      const b = path[k];
      const manhattan =
        Math.abs(city.grid.x(a) - city.grid.x(b)) +
        Math.abs(city.grid.y(a) - city.grid.y(b));
      expect(manhattan).toBe(1);
      expect(city.road[b]).toBe(1);
    }
  });

  it("returns null between disconnected roads", () => {
    const city = new CityData(16, 16);
    const idx = (x: number, y: number) => city.grid.index(x, y);
    city.road[idx(1, 1)] = 1;
    city.road[idx(2, 1)] = 1;
    city.road[idx(10, 10)] = 1;
    city.road[idx(11, 10)] = 1;

    expect(findRoadPath(city, idx(1, 1), idx(10, 10))).toBeNull();
  });
});
