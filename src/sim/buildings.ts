/**
 * Building archetype registry. `CityData.buildingId` stores an archetype id;
 * id 0 means no building. Phase 3 covers the two utility structures; Phase 4
 * adds the procedurally-grown residential / commercial / industrial buildings.
 * The service structures (police, fire, park) project a coverage area.
 */

export const BUILDING = {
  None: 0,
  PowerPlant: 1,
  WaterPump: 2,
  PoliceStation: 3,
  FireStation: 4,
  Park: 5,
} as const;

/** Coverage area a service building projects, or "none" for plain structures. */
export type ServiceType = "none" | "police" | "fire" | "park";

export interface BuildingDef {
  id: number;
  name: string;
  /** Power units supplied to the grid (0 if not a power source). */
  powerOutput: number;
  /** Water units supplied to the network (0 if not a water source). */
  waterOutput: number;
  cost: number;
  /** Coverage this building projects (see `CoverageSystem`). */
  serviceType: ServiceType;
  /** Coverage radius in tiles (0 if it projects none). */
  serviceRange: number;
  /** Peak coverage strength at the building's tile, 0..255. */
  serviceStrength: number;
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
    serviceType: "none",
    serviceRange: 0,
    serviceStrength: 0,
    wallColor: 0x000000,
    roofColor: 0x000000,
  },
  {
    id: BUILDING.PowerPlant,
    name: "Power Plant",
    powerOutput: 240,
    waterOutput: 0,
    cost: 3000,
    serviceType: "none",
    serviceRange: 0,
    serviceStrength: 0,
    wallColor: 0x8a7f73,
    roofColor: 0xc94f3d,
  },
  {
    id: BUILDING.WaterPump,
    name: "Water Pump",
    powerOutput: 0,
    waterOutput: 200,
    cost: 600,
    serviceType: "none",
    serviceRange: 0,
    serviceStrength: 0,
    wallColor: 0x6f93a8,
    roofColor: 0x3f6f8c,
  },
  {
    id: BUILDING.PoliceStation,
    name: "Police Station",
    powerOutput: 0,
    waterOutput: 0,
    cost: 800,
    serviceType: "police",
    serviceRange: 8,
    serviceStrength: 210,
    wallColor: 0x3f4a5c,
    roofColor: 0x2b3445,
  },
  {
    id: BUILDING.FireStation,
    name: "Fire Station",
    powerOutput: 0,
    waterOutput: 0,
    cost: 800,
    serviceType: "fire",
    serviceRange: 7,
    serviceStrength: 235,
    wallColor: 0xb1402f,
    roofColor: 0x7c2a20,
  },
  {
    id: BUILDING.Park,
    name: "Park",
    powerOutput: 0,
    waterOutput: 0,
    cost: 150,
    serviceType: "park",
    serviceRange: 4,
    serviceStrength: 150,
    wallColor: 0x4c8a3f,
    roofColor: 0x3a6b30,
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

/** Coverage type a building projects ("none" for plain or empty tiles). */
export function serviceType(id: number): ServiceType {
  return buildingDef(id).serviceType;
}
