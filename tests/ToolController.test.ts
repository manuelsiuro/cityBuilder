import { describe, it, expect } from "vitest";
import { CommandQueue } from "../src/engine/CommandQueue";
import { Grid } from "../src/engine/Grid";
import { ToolController } from "../src/input/ToolController";
import type { Command } from "../src/sim/commands";

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
    expect(q.drain()).toEqual([{ type: "bulldoze", x: 3, y: 3 }]);
  });
});
