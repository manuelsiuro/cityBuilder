import { describe, it, expect } from "vitest";
import { TrafficGrid, DIR_N, DIR_E, DIR_S, DIR_W, stepDir } from "../src/sim/traffic/TrafficGrid";

describe("stepDir", () => {
  it("maps unit steps to direction codes", () => {
    expect(stepDir(5, 5, 5, 4)).toBe(DIR_N);
    expect(stepDir(5, 5, 6, 5)).toBe(DIR_E);
    expect(stepDir(5, 5, 5, 6)).toBe(DIR_S);
    expect(stepDir(5, 5, 4, 5)).toBe(DIR_W);
  });
});

describe("TrafficGrid", () => {
  it("returns cars registered on a directed edge", () => {
    const grid = new TrafficGrid();
    grid.addEdge(100, DIR_E, 3, 0.4);
    grid.addEdge(100, DIR_E, 7, 0.8);

    const list = grid.edge(100, DIR_E);
    expect(list?.map((e) => e.car).sort()).toEqual([3, 7]);
    // The opposing edge is a separate lane.
    expect(grid.edge(100, DIR_W)).toBeUndefined();
  });

  it("reports the cars occupying a tile", () => {
    const grid = new TrafficGrid();
    grid.addTile(42, 1);
    grid.addTile(42, 4);
    expect([...(grid.tileCars(42) ?? [])].sort()).toEqual([1, 4]);
    expect(grid.tileCars(99)).toBeUndefined();
  });

  it("clears every registration", () => {
    const grid = new TrafficGrid();
    grid.addEdge(1, DIR_S, 0, 0.5);
    grid.addTile(1, 0);
    grid.clear();
    expect(grid.edge(1, DIR_S)).toBeUndefined();
    expect(grid.tileCars(1)).toBeUndefined();
  });
});
