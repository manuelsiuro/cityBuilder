import { describe, it, expect, vi } from "vitest";
import { CityData } from "../src/sim/CityData";
import { EventBus } from "../src/engine/EventBus";
import { RoadGraph } from "../src/sim/pathfinding/RoadGraph";
import { RoadSystem } from "../src/sim/systems/RoadSystem";
import { Dirty } from "../src/sim/layers";
import type { GameEventMap } from "../src/sim/events";

describe("RoadSystem", () => {
  it("rebuilds the graph and emits when the road layer is dirty", () => {
    const city = new CityData(16, 16);
    city.road[city.grid.index(2, 2)] = 1;
    city.markDirty(Dirty.Road);

    const graph = new RoadGraph();
    const events = new EventBus<GameEventMap>();
    const changed = vi.fn();
    events.on("roads:changed", changed);

    new RoadSystem(graph, events).update(city);

    expect(graph.roadTileCount).toBe(1);
    expect(changed).toHaveBeenCalledOnce();
    expect(city.isDirty(Dirty.Road)).toBe(false);
  });

  it("early-outs when the road layer is clean", () => {
    const city = new CityData(16, 16);
    const events = new EventBus<GameEventMap>();
    const changed = vi.fn();
    events.on("roads:changed", changed);

    new RoadSystem(new RoadGraph(), events).update(city);
    expect(changed).not.toHaveBeenCalled();
  });
});
