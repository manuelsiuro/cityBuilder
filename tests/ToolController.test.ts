import { describe, it, expect } from "vitest";
import { CommandQueue } from "../src/engine/CommandQueue";
import { Grid } from "../src/engine/Grid";
import { ToolController } from "../src/input/ToolController";
import type { Command } from "../src/sim/commands";
import { Zone } from "../src/sim/layers";

const grid = new Grid(32, 32);

function setup(): { tc: ToolController; q: CommandQueue<Command> } {
  const q = new CommandQueue<Command>();
  return { tc: new ToolController(q), q };
}

describe("ToolController", () => {
  it("emits nothing for the inspect tool", () => {
    const { tc, q } = setup();
    tc.beginStroke();
    tc.paint(5, 5, grid);
    expect(q.size).toBe(0);
  });

  it("fills the gap between successive painted tiles", () => {
    const { tc, q } = setup();
    tc.activeTool = "road";
    tc.beginStroke();
    tc.paint(2, 4, grid);
    tc.paint(6, 4, grid); // jumped 4 tiles

    const painted = new Set(q.drain().map((c) => `${c.x},${c.y}`));
    for (const x of [2, 3, 4, 5, 6]) {
      expect(painted.has(`${x},4`)).toBe(true);
    }
  });

  it("does not bridge across separate strokes", () => {
    const { tc, q } = setup();
    tc.activeTool = "road";
    tc.beginStroke();
    tc.paint(1, 1, grid);
    tc.beginStroke(); // new stroke
    tc.paint(20, 20, grid);

    const painted = q.drain().map((c) => `${c.x},${c.y}`);
    expect(painted).toEqual(["1,1", "20,20"]);
  });

  it("produces a 4-connected path for a diagonal drag", () => {
    const { tc, q } = setup();
    tc.activeTool = "road";
    tc.beginStroke();
    tc.paint(2, 2, grid);
    tc.paint(9, 6, grid); // diagonal jump

    const path = q.drain();
    for (let k = 1; k < path.length; k++) {
      const manhattan =
        Math.abs(path[k].x - path[k - 1].x) + Math.abs(path[k].y - path[k - 1].y);
      expect(manhattan).toBe(1); // each step moves one tile orthogonally
    }
  });

  it("issues bulldoze commands for the bulldoze tool", () => {
    const { tc, q } = setup();
    tc.activeTool = "bulldoze";
    tc.beginStroke();
    tc.paint(3, 3, grid);
    tc.commitStroke(grid); // bulldoze is a rect tool — emits on commit
    expect(q.drain()).toEqual([{ type: "bulldoze", x: 3, y: 3 }]);
  });

  it("commitStroke is a harmless no-op for line tools", () => {
    const { tc, q } = setup();
    tc.activeTool = "road";
    tc.beginStroke();
    tc.paint(1, 1, grid);
    tc.paint(3, 1, grid);
    tc.commitStroke(grid);
    expect(q.drain().map((c) => `${c.x},${c.y}`)).toEqual(["1,1", "2,1", "3,1"]);
  });
});

describe("ToolController rectangle tools", () => {
  it("emits nothing during the drag, before commit", () => {
    const { tc, q } = setup();
    tc.activeTool = "zoneR";
    tc.beginStroke();
    tc.paint(2, 2, grid);
    tc.paint(5, 4, grid);
    expect(q.size).toBe(0);
  });

  it("fills the whole rectangle on commit", () => {
    const { tc, q } = setup();
    tc.activeTool = "zoneR";
    tc.beginStroke();
    tc.paint(2, 2, grid);
    tc.paint(5, 4, grid);
    tc.commitStroke(grid);

    const painted = new Set(q.drain().map((c) => `${c.x},${c.y}`));
    expect(painted.size).toBe(12); // 4 wide × 3 tall
    for (let y = 2; y <= 4; y++) {
      for (let x = 2; x <= 5; x++) {
        expect(painted.has(`${x},${y}`)).toBe(true);
      }
    }
  });

  it("normalizes an inverted drag to the same rectangle", () => {
    const { tc, q } = setup();
    tc.activeTool = "bulldoze";
    tc.beginStroke();
    tc.paint(5, 4, grid); // anchor at the far corner
    tc.paint(2, 2, grid);
    tc.commitStroke(grid);

    const painted = new Set(q.drain().map((c) => `${c.x},${c.y}`));
    expect(painted.size).toBe(12);
    expect(painted.has("2,2")).toBe(true);
    expect(painted.has("5,4")).toBe(true);
  });

  it("treats a tap (no drag) as a single tile", () => {
    const { tc, q } = setup();
    tc.activeTool = "zoneR";
    tc.beginStroke();
    tc.paint(3, 3, grid);
    tc.commitStroke(grid);
    expect(q.drain()).toEqual([{ type: "zone", x: 3, y: 3, zone: Zone.Residential }]);
  });

  it("clamps the rectangle to the grid bounds", () => {
    const { tc, q } = setup();
    tc.activeTool = "raiseTerrain";
    tc.beginStroke();
    tc.paint(30, 30, grid);
    tc.paint(40, 40, grid); // off the 32×32 grid
    tc.commitStroke(grid);

    const painted = new Set(q.drain().map((c) => `${c.x},${c.y}`));
    expect(painted).toEqual(new Set(["30,30", "31,30", "30,31", "31,31"]));
  });
});
