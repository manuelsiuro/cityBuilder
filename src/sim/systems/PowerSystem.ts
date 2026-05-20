import type { CityData } from "../CityData";
import type { GameEventBus } from "../events";
import { Dirty, Zone } from "../layers";
import { buildingDef, isPowerSource } from "../buildings";

/**
 * Propagates electricity. Power plants are sources; it floods 4-connected
 * through power lines, buildings and zoned land, marking the `powered` layer.
 * Early-outs unless the `Power` dirty flag is set.
 */
export class PowerSystem {
  private readonly stack: number[] = [];

  constructor(private readonly events: GameEventBus) {}

  update(city: CityData): void {
    if (!city.isDirty(Dirty.Power)) return;
    const { grid } = city;

    city.powered.fill(0);
    const stack = this.stack;
    stack.length = 0;

    let supply = 0;
    for (let i = 0; i < grid.size; i++) {
      if (isPowerSource(city.buildingId[i])) {
        supply += buildingDef(city.buildingId[i]).powerOutput;
        if (city.powered[i] === 0) {
          city.powered[i] = 1;
          stack.push(i);
        }
      }
    }

    while (stack.length > 0) {
      const i = stack.pop()!;
      grid.forEachNeighbor4(grid.x(i), grid.y(i), (_nx, _ny, ni) => {
        if (city.powered[ni] === 0 && conducts(city, ni)) {
          city.powered[ni] = 1;
          stack.push(ni);
        }
      });
    }

    let demand = 0;
    for (let i = 0; i < grid.size; i++) {
      if (consumes(city, i)) demand++;
    }

    city.powerSupply = supply;
    city.powerDemand = demand;
    city.clearDirty(Dirty.Power);
    this.events.emit("power:changed", undefined);
  }
}

/** A tile carries power through it: power line, any building, or zoned land. */
function conducts(city: CityData, i: number): boolean {
  return city.powerLine[i] === 1 || city.buildingId[i] !== 0 || city.zone[i] !== Zone.None;
}

/** A tile draws power: zoned land, or a building that is not itself a source. */
function consumes(city: CityData, i: number): boolean {
  if (city.zone[i] !== Zone.None) return true;
  return city.buildingId[i] !== 0 && !isPowerSource(city.buildingId[i]);
}
