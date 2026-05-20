import type { CityData } from "../CityData";
import type { GameEventBus } from "../events";
import type { RoadGraph } from "../pathfinding/RoadGraph";
import { Dirty } from "../layers";

/**
 * Keeps the `RoadGraph` in sync with the road layer. Cheap on most ticks — it
 * early-outs unless the `Road` dirty flag is set.
 */
export class RoadSystem {
  constructor(
    private readonly graph: RoadGraph,
    private readonly events: GameEventBus,
  ) {}

  update(city: CityData): void {
    if (!city.isDirty(Dirty.Road)) return;

    this.graph.rebuild(city);
    city.clearDirty(Dirty.Road);
    this.events.emit("roads:changed", undefined);

    console.log(
      `[roads] ${this.graph.roadTileCount} tiles in ${this.graph.networkCount} network(s)`,
    );
  }
}
