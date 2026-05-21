import { describe, it, expect } from "vitest";
import { World } from "../src/sim/World";
import { TerrainType } from "../src/sim/layers";

/** Force the tiles a test builds on to dry land, independent of the seed. */
function clearLand(world: World, coords: [number, number][]): void {
  for (const [x, y] of coords) {
    world.city.terrainType[world.city.grid.index(x, y)] = TerrainType.Grass;
  }
}

describe("World command notices", () => {
  it("emits a warn notice when a command is rejected for funds", () => {
    const world = new World(1);
    clearLand(world, [[3, 3]]);
    world.city.funds = 0;
    const seen: { level: string; message: string }[] = [];
    world.events.on("notice", (n) => seen.push(n));

    world.commands.push({ type: "buildRoad", x: 3, y: 3 });
    world.tick(100);

    expect(seen).toHaveLength(1);
    expect(seen[0]).toEqual({ level: "warn", message: "Not enough funds" });
  });

  it("throttles a repeated notice within the cooldown window", () => {
    const world = new World(1);
    clearLand(world, [[3, 3], [4, 4]]);
    world.city.funds = 0;
    let count = 0;
    world.events.on("notice", () => count++);

    // Two rejected commands a few ticks apart — only the first should toast.
    world.commands.push({ type: "buildRoad", x: 3, y: 3 });
    world.tick(100);
    world.commands.push({ type: "buildRoad", x: 4, y: 4 });
    world.tick(100);

    expect(count).toBe(1);
  });

  it("stays silent when commands succeed", () => {
    const world = new World(1);
    clearLand(world, [[3, 3]]);
    let count = 0;
    world.events.on("notice", () => count++);

    world.commands.push({ type: "buildRoad", x: 3, y: 3 });
    world.tick(100);

    expect(count).toBe(0);
  });
});
