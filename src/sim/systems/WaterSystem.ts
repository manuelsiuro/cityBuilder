import type { CityData } from "../CityData";
import type { GameEventBus } from "../events";
import { Dirty, Zone } from "../layers";
import { buildingDef, isWaterSource } from "../buildings";

/**
 * Propagates water. Pumps are sources; it floods 4-connected through the
 * underground pipe network, then wets zoned land and buildings adjacent to a
 * watered pipe. Early-outs unless the `Water` dirty flag is set.
 */
export class WaterSystem {
  private readonly stack: number[] = [];

  constructor(private readonly events: GameEventBus) {}

  update(city: CityData): void {
    if (!city.isDirty(Dirty.Water)) return;
    const { grid } = city;

    city.watered.fill(0);
    const stack = this.stack;
    stack.length = 0;

    let supply = 0;
    for (let i = 0; i < grid.size; i++) {
      if (isWaterSource(city.buildingId[i])) {
        supply += buildingDef(city.buildingId[i]).waterOutput;
        if (city.watered[i] === 0) {
          city.watered[i] = 1;
          stack.push(i);
        }
      }
    }

    // Flood the pipe network from the pumps.
    while (stack.length > 0) {
      const i = stack.pop()!;
      grid.forEachNeighbor4(grid.x(i), grid.y(i), (_nx, _ny, ni) => {
        if (city.watered[ni] === 0 && city.pipe[ni] === 1) {
          city.watered[ni] = 1;
          stack.push(ni);
        }
      });
    }

    // Wet consumer tiles next to a watered pipe (water reaches one tile out).
    const reach: number[] = [];
    for (let i = 0; i < grid.size; i++) {
      if (city.watered[i] === 1 || !consumes(city, i)) continue;
      let wet = false;
      grid.forEachNeighbor4(grid.x(i), grid.y(i), (_nx, _ny, ni) => {
        if (city.watered[ni] === 1 && city.pipe[ni] === 1) wet = true;
      });
      if (wet) reach.push(i);
    }
    for (const i of reach) city.watered[i] = 1;

    let demand = 0;
    for (let i = 0; i < grid.size; i++) {
      if (consumes(city, i)) demand++;
    }

    city.waterSupply = supply;
    city.waterDemand = demand;
    city.clearDirty(Dirty.Water);
    this.events.emit("water:changed", undefined);
  }
}

/** A tile draws water: zoned land, or a building that is not itself a source. */
function consumes(city: CityData, i: number): boolean {
  if (city.zone[i] !== Zone.None) return true;
  return city.buildingId[i] !== 0 && !isWaterSource(city.buildingId[i]);
}
