import type { CityData } from "./CityData";
import { Dirty, MAX_ELEVATION, TerrainType, Zone } from "./layers";
import { BUILDING, buildingDef } from "./buildings";
import type { DisasterId } from "./MapSettings";

const CARDINALS: ReadonlyArray<readonly [number, number]> = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
];

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
  | { type: "bulldoze"; x: number; y: number }
  | { type: "raiseTerrain"; x: number; y: number }
  | { type: "lowerTerrain"; x: number; y: number }
  /**
   * God-mode: fire a named disaster on the next tick. `x`/`y` are optional
   * hints used by disasters that take a target (currently advisory only — the
   * disaster system picks a sensible target if absent).
   */
  | { type: "triggerDisaster"; id: DisasterId; x?: number; y?: number };

/** Up-front construction cost per command. */
export const COST = {
  buildRoad: 8,
  buildPowerLine: 6,
  buildPipe: 7,
  zone: 4,
  raiseTerrain: 10,
  lowerTerrain: 10,
} as const;

/**
 * Outcome of applying a command. `Ok` means the city changed; every other
 * value is a rejection reason `World` may surface to the player.
 */
export const CmdResult = {
  Ok: 0,
  /** The player could not afford it. */
  NoFunds: 1,
  /** A road / building / zone already occupies the tile. */
  Occupied: 2,
  /** The tile is water and cannot be built on. */
  Water: 3,
  /** Nothing actionable here (e.g. bulldoze on empty land, zone at its limit). */
  Blocked: 4,
  /** Terrain is already at its highest / lowest tier. */
  MaxElevation: 5,
  /** A road can't sit next to another road that differs by more than one tier. */
  TooSteep: 6,
} as const;

export type CommandResult = (typeof CmdResult)[keyof typeof CmdResult];

/**
 * Apply one command to the city. Mutation happens only here, only at tick
 * start. Returns `CmdResult.Ok` on success or a rejection reason otherwise.
 */
export function applyCommand(city: CityData, cmd: Command): CommandResult {
  // Trigger-disaster commands are handled by `World` directly (they need the
  // DisasterSystem instance and the current tick) — never via this function.
  if (cmd.type === "triggerDisaster") return CmdResult.Ok;
  if (!city.grid.inBounds(cmd.x, cmd.y)) return CmdResult.Blocked;
  const i = city.grid.index(cmd.x, cmd.y);
  const isWater = city.terrainType[i] === TerrainType.Water;

  switch (cmd.type) {
    case "buildRoad": {
      if (isWater) return CmdResult.Water;
      if (city.road[i]) return CmdResult.Occupied;
      if (city.funds < COST.buildRoad) return CmdResult.NoFunds;
      // Reject placements that would create a >1-tier elevation step against
      // an adjacent road, so road slopes never exceed atan(ELEV_STEP) ≈ 23°.
      const ownE = city.elevation[i];
      for (const [dx, dy] of CARDINALS) {
        const nx = cmd.x + dx;
        const ny = cmd.y + dy;
        if (!city.grid.inBounds(nx, ny)) continue;
        const ni = city.grid.index(nx, ny);
        if (city.road[ni] === 0) continue;
        if (Math.abs(city.elevation[ni] - ownE) > 1) return CmdResult.TooSteep;
      }
      city.funds -= COST.buildRoad;
      city.road[i] = 1;
      city.trees[i] = 0; // construction clears the tile's trees
      city.markDirty(Dirty.Road);
      return CmdResult.Ok;
    }

    case "buildPowerLine":
      if (isWater) return CmdResult.Water;
      if (city.powerLine[i]) return CmdResult.Occupied;
      if (city.funds < COST.buildPowerLine) return CmdResult.NoFunds;
      city.funds -= COST.buildPowerLine;
      city.powerLine[i] = 1;
      city.markDirty(Dirty.Power | Dirty.Utility);
      return CmdResult.Ok;

    case "buildPipe":
      if (isWater) return CmdResult.Water;
      if (city.pipe[i]) return CmdResult.Occupied;
      if (city.funds < COST.buildPipe) return CmdResult.NoFunds;
      city.funds -= COST.buildPipe;
      city.pipe[i] = 1;
      city.markDirty(Dirty.Water | Dirty.Utility);
      return CmdResult.Ok;

    case "zone":
      if (isWater) return CmdResult.Water;
      if (city.road[i] || city.buildingId[i]) return CmdResult.Occupied;
      if (city.zone[i] === cmd.zone) return CmdResult.Blocked;
      if (city.funds < COST.zone) return CmdResult.NoFunds;
      city.funds -= COST.zone;
      city.zone[i] = cmd.zone;
      city.trees[i] = 0; // zoning clears the tile's trees
      city.markDirty(Dirty.Zone | Dirty.Power | Dirty.Water | Dirty.LandValue);
      return CmdResult.Ok;

    case "placeBuilding": {
      if (isWater) return CmdResult.Water;
      if (city.road[i] || city.buildingId[i]) return CmdResult.Occupied;
      const cost = buildingDef(cmd.building).cost;
      if (city.funds < cost) return CmdResult.NoFunds;
      city.funds -= cost;
      city.buildingId[i] = cmd.building;
      city.zone[i] = Zone.None;
      city.buildLevel[i] = 0;
      city.trees[i] = 0; // construction clears the tile's trees
      city.markDirty(Dirty.Power | Dirty.Water | Dirty.Utility | Dirty.LandValue | Dirty.Coverage);
      return CmdResult.Ok;
    }

    case "bulldoze":
      if (!city.road[i] && !city.powerLine[i] && !city.pipe[i] &&
          !city.buildingId[i] && city.zone[i] === Zone.None && !city.trees[i]) {
        return CmdResult.Blocked;
      }
      city.road[i] = 0;
      city.powerLine[i] = 0;
      city.pipe[i] = 0;
      city.buildingId[i] = BUILDING.None;
      city.zone[i] = Zone.None;
      city.buildLevel[i] = 0;
      city.trees[i] = 0; // bulldozing also clears forest
      city.markDirty(
        Dirty.Road | Dirty.Power | Dirty.Water | Dirty.Zone |
          Dirty.Utility | Dirty.LandValue | Dirty.Coverage,
      );
      return CmdResult.Ok;

    case "raiseTerrain":
      if (isWater) return CmdResult.Water;
      if (isTileOccupied(city, i)) return CmdResult.Occupied;
      if (city.elevation[i] >= MAX_ELEVATION) return CmdResult.MaxElevation;
      if (city.funds < COST.raiseTerrain) return CmdResult.NoFunds;
      city.funds -= COST.raiseTerrain;
      city.elevation[i]++;
      city.markDirty(Dirty.Terrain);
      return CmdResult.Ok;

    case "lowerTerrain":
      if (isWater) return CmdResult.Water;
      if (isTileOccupied(city, i)) return CmdResult.Occupied;
      // Keep land one tier above sea level so it never sinks to the waterline.
      if (city.elevation[i] <= 1) return CmdResult.MaxElevation;
      if (city.funds < COST.lowerTerrain) return CmdResult.NoFunds;
      city.funds -= COST.lowerTerrain;
      city.elevation[i]--;
      city.markDirty(Dirty.Terrain);
      return CmdResult.Ok;
  }
}

/** True if anything is built or zoned on tile `i` — blocks terrain editing. */
function isTileOccupied(city: CityData, i: number): boolean {
  return (
    city.road[i] !== 0 ||
    city.powerLine[i] !== 0 ||
    city.pipe[i] !== 0 ||
    city.buildingId[i] !== 0 ||
    city.zone[i] !== Zone.None
  );
}
