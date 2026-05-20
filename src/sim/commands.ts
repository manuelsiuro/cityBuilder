import type { CityData } from "./CityData";
import { Dirty, TerrainType, Zone } from "./layers";
import { BUILDING, buildingDef } from "./buildings";

/**
 * Player intents. The single `outside → sim` vocabulary: `input/` and `ui/`
 * push these onto `World.commands`; `World.tick()` drains and applies them at
 * a deterministic point.
 */
export type Command =
  | { type: "buildRoad"; x: number; y: number }
  | { type: "buildPowerLine"; x: number; y: number }
  | { type: "buildPipe"; x: number; y: number }
  | { type: "zone"; x: number; y: number; zone: Zone }
  | { type: "placeBuilding"; x: number; y: number; building: number }
  | { type: "bulldoze"; x: number; y: number };

/** Up-front construction cost per command. */
const COST = {
  buildRoad: 8,
  buildPowerLine: 6,
  buildPipe: 7,
  zone: 4,
} as const;

/** Apply one command to the city. Mutation happens only here, only at tick start. */
export function applyCommand(city: CityData, cmd: Command): void {
  if (!city.grid.inBounds(cmd.x, cmd.y)) return;
  const i = city.grid.index(cmd.x, cmd.y);
  const isWater = city.terrainType[i] === TerrainType.Water;

  switch (cmd.type) {
    case "buildRoad":
      if (isWater || city.road[i] || city.funds < COST.buildRoad) return;
      city.funds -= COST.buildRoad;
      city.road[i] = 1;
      city.markDirty(Dirty.Road);
      break;

    case "buildPowerLine":
      if (isWater || city.powerLine[i] || city.funds < COST.buildPowerLine) return;
      city.funds -= COST.buildPowerLine;
      city.powerLine[i] = 1;
      city.markDirty(Dirty.Power | Dirty.Utility);
      break;

    case "buildPipe":
      if (isWater || city.pipe[i] || city.funds < COST.buildPipe) return;
      city.funds -= COST.buildPipe;
      city.pipe[i] = 1;
      city.markDirty(Dirty.Water | Dirty.Utility);
      break;

    case "zone":
      if (isWater || city.road[i] || city.buildingId[i]) return;
      if (city.zone[i] === cmd.zone || city.funds < COST.zone) return;
      city.funds -= COST.zone;
      city.zone[i] = cmd.zone;
      city.markDirty(Dirty.Zone | Dirty.Power | Dirty.Water | Dirty.LandValue);
      break;

    case "placeBuilding": {
      if (isWater || city.road[i] || city.buildingId[i]) return;
      const cost = buildingDef(cmd.building).cost;
      if (city.funds < cost) return;
      city.funds -= cost;
      city.buildingId[i] = cmd.building;
      city.zone[i] = Zone.None;
      city.buildLevel[i] = 0;
      city.markDirty(Dirty.Power | Dirty.Water | Dirty.Utility);
      break;
    }

    case "bulldoze":
      if (!city.road[i] && !city.powerLine[i] && !city.pipe[i] &&
          !city.buildingId[i] && city.zone[i] === Zone.None) {
        return;
      }
      city.road[i] = 0;
      city.powerLine[i] = 0;
      city.pipe[i] = 0;
      city.buildingId[i] = BUILDING.None;
      city.zone[i] = Zone.None;
      city.buildLevel[i] = 0;
      city.markDirty(
        Dirty.Road | Dirty.Power | Dirty.Water | Dirty.Zone | Dirty.Utility | Dirty.LandValue,
      );
      break;
  }
}
