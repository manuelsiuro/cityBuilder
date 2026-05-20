import { describe, it, expect } from "vitest";
import { Grid } from "../src/engine/Grid";

describe("Grid", () => {
  const grid = new Grid(10, 6);

  it("reports its size", () => {
    expect(grid.size).toBe(60);
  });

  it("round-trips index <-> coordinates", () => {
    for (const [x, y] of [[0, 0], [9, 5], [3, 4]] as const) {
      const i = grid.index(x, y);
      expect(grid.x(i)).toBe(x);
      expect(grid.y(i)).toBe(y);
    }
  });

  it("checks bounds", () => {
    expect(grid.inBounds(0, 0)).toBe(true);
    expect(grid.inBounds(9, 5)).toBe(true);
    expect(grid.inBounds(-1, 0)).toBe(false);
    expect(grid.inBounds(10, 0)).toBe(false);
    expect(grid.inBounds(0, 6)).toBe(false);
  });

  it("visits 4 neighbours for an interior tile", () => {
    const seen: number[] = [];
    grid.forEachNeighbor4(5, 3, (_x, _y, ni) => seen.push(ni));
    expect(seen).toHaveLength(4);
  });

  it("visits 2 neighbours for a corner tile", () => {
    const seen: number[] = [];
    grid.forEachNeighbor4(0, 0, (_x, _y, ni) => seen.push(ni));
    expect(seen).toHaveLength(2);
  });
});
