/**
 * Building archetype registry. `CityData.buildingId` stores an archetype id;
 * id 0 means no building. Phase 3 covers the two utility structures; Phase 4
 * adds the procedurally-grown residential / commercial / industrial buildings.
 */

export const BUILDING = {
  None: 0,
  PowerPlant: 1,
  WaterPump: 2,
} as const;

export interface BuildingDef {
  id: number;
  name: string;
  /** Power units supplied to the grid (0 if not a power source). */
  powerOutput: number;
  /** Water units supplied to the network (0 if not a water source). */
  waterOutput: number;
  cost: number;
  /** Render colours for the placeholder procedural box. */
  wallColor: number;
  roofColor: number;
}

const DEFS: BuildingDef[] = [
  {
    id: BUILDING.None,
    name: "Empty",
    powerOutput: 0,
    waterOutput: 0,
    cost: 0,
    wallColor: 0x000000,
    roofColor: 0x000000,
  },
  {
    id: BUILDING.PowerPlant,
    name: "Power Plant",
    powerOutput: 240,
    waterOutput: 0,
    cost: 3000,
    wallColor: 0x8a7f73,
    roofColor: 0xc94f3d,
  },
  {
    id: BUILDING.WaterPump,
    name: "Water Pump",
    powerOutput: 0,
    waterOutput: 200,
    cost: 600,
    wallColor: 0x6f93a8,
    roofColor: 0x3f6f8c,
  },
];

export function buildingDef(id: number): BuildingDef {
  return DEFS[id] ?? DEFS[0];
}

export function isPowerSource(id: number): boolean {
  return buildingDef(id).powerOutput > 0;
}

export function isWaterSource(id: number): boolean {
  return buildingDef(id).waterOutput > 0;
}
