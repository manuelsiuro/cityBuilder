import type { CityData } from "../CityData";
import { BUILDING } from "../buildings";
import { findRoadPath } from "../pathfinding/AStar";
import type { Incident } from "./IncidentSystem";

/** The three emergency services that field a vehicle. */
export type VehicleKind = "fire" | "police" | "medical";
/** enroute → onscene (working) → returning (back to the station). */
export type VehicleState = "enroute" | "onscene" | "returning";

/** A dispatched emergency vehicle. Positions are continuous tile coordinates. */
export interface ServiceVehicle {
  active: boolean;
  kind: VehicleKind;
  state: VehicleState;
  /** Home-station building tile. */
  stationTile: number;
  /** Incident / fire tile being serviced. */
  targetTile: number;
  /** Tile indices the vehicle drives through this leg. */
  path: number[];
  /** Float position along `path` (index + fraction). */
  pos: number;
  /** Travel-direction code 0..3 (N/E/S/W). */
  dir: number;
  tileX: number;
  tileY: number;
  prevTileX: number;
  prevTileY: number;
  /** Remaining ticks of on-scene work (police / medical). */
  onSceneTicks: number;
  /** The incident handled, or null for a fire response. */
  incident: Incident | null;
}

/** Vehicle pool size — the whole city shares this fixed fleet. */
const POOL_SIZE = 24;
/** Cruising speed in tiles per tick — sirens move faster than civilian cars. */
const SPEED = 0.14;
/** Most vehicles a single station will have out at once. */
const MAX_PER_STATION = 3;
/** New dispatches considered per tick — bounds A* cost. */
const DISPATCH_PER_TICK = 2;
/** Tiles searched outward when finding a tile's nearest road access. */
const ROAD_SEARCH_RADIUS = 8;
/** Ticks a police / ambulance crew works a scene before it is resolved. */
const ONSCENE_TICKS = 50;
/** Fire intensity a truck removes from its target tile each on-scene tick. */
const FIRE_SUPPRESS = 22;
/** Fire intensity removed from each 4-neighbour of the truck's target. */
const FIRE_SUPPRESS_NEIGHBOUR = 11;

/** Maps a service building id to the vehicle kind it dispatches. */
function stationKind(buildingId: number): VehicleKind | null {
  switch (buildingId) {
    case BUILDING.FireStation:
      return "fire";
    case BUILDING.PoliceStation:
      return "police";
    case BUILDING.Hospital:
      return "medical";
    default:
      return null;
  }
}

/**
 * Sends emergency vehicles to incidents. Each tick it advances vehicles already
 * out, then assigns idle stations to unattended fires and incidents: it routes
 * a vehicle from the nearest station over the road network (A*) to the scene,
 * works it, and drives back. Fire trucks add a strong suppression bonus while
 * on-scene; police cars and ambulances resolve their incident after a fixed
 * crew time. Vehicles are transient — never saved.
 *
 * Renderer-free and deterministic: it draws no randomness, so the same sim
 * state always produces the same dispatch.
 */
export class DispatchSystem {
  private readonly _vehicles: ServiceVehicle[] = [];

  /** Live vehicles — read by the renderer. */
  get vehicles(): readonly ServiceVehicle[] {
    return this._vehicles;
  }

  /** Reset all vehicle state — call when the city is replaced (new / load). */
  clear(): void {
    this._vehicles.length = 0;
  }

  update(city: CityData, incidents: readonly Incident[]): void {
    // 1. Advance vehicles already on the road, then drop ones that got home.
    for (let k = this._vehicles.length - 1; k >= 0; k--) {
      if (!this.advanceVehicle(this._vehicles[k], city)) {
        this._vehicles.splice(k, 1);
      }
    }

    // 2. Assign idle capacity to unattended fires and incidents.
    this.assign(city, incidents);
  }

  /** Step one vehicle; returns false once it has finished and should be culled. */
  private advanceVehicle(v: ServiceVehicle, city: CityData): boolean {
    if (v.state === "onscene") {
      if (v.kind === "fire") {
        this.suppressFire(city, v.targetTile);
        if (city.fire[v.targetTile] === 0) this.startReturn(v);
      } else {
        v.onSceneTicks--;
        if (v.onSceneTicks <= 0) {
          if (v.incident) v.incident.state = "resolved";
          this.startReturn(v);
        }
      }
      return true;
    }

    // enroute / returning — drive along the path.
    const arrived = this.stepAlongPath(v, city);
    if (!arrived) return true;

    if (v.state === "returning") return false; // home — free the slot

    // Reached the scene.
    if (v.kind === "fire") {
      if (city.fire[v.targetTile] === 0) {
        this.startReturn(v); // the fire is already out
      } else {
        v.state = "onscene";
      }
    } else {
      v.state = "onscene";
      v.onSceneTicks = ONSCENE_TICKS;
    }
    return true;
  }

  /** Knock fire intensity off the truck's tile and its 4-neighbours. */
  private suppressFire(city: CityData, tile: number): void {
    const { grid } = city;
    city.fire[tile] = Math.max(0, city.fire[tile] - FIRE_SUPPRESS);
    grid.forEachNeighbor4(grid.x(tile), grid.y(tile), (_x, _y, ni) => {
      if (city.fire[ni] > 0) {
        city.fire[ni] = Math.max(0, city.fire[ni] - FIRE_SUPPRESS_NEIGHBOUR);
      }
    });
  }

  /** Flip a vehicle onto its return leg — the outbound path, reversed. */
  private startReturn(v: ServiceVehicle): void {
    v.state = "returning";
    v.path = v.path.slice().reverse();
    v.pos = 0;
  }

  /**
   * Move a vehicle forward along its path. Updates the interpolation fields and
   * returns true on the tick it reaches the path's end.
   */
  private stepAlongPath(v: ServiceVehicle, city: CityData): boolean {
    const { grid } = city;
    v.prevTileX = v.tileX;
    v.prevTileY = v.tileY;

    const end = v.path.length - 1;
    v.pos = Math.min(end, v.pos + SPEED);

    const seg = Math.min(end - 1, Math.floor(v.pos));
    const frac = end <= 0 ? 0 : v.pos - seg;
    const a = v.path[Math.max(0, seg)];
    const b = v.path[Math.min(end, seg + 1)];
    const ax = grid.x(a), ay = grid.y(a);
    const bx = grid.x(b), by = grid.y(b);
    v.tileX = ax + (bx - ax) * frac;
    v.tileY = ay + (by - ay) * frac;

    const dx = bx - ax;
    const dy = by - ay;
    if (dx > 0) v.dir = 1;
    else if (dx < 0) v.dir = 3;
    else if (dy > 0) v.dir = 2;
    else if (dy < 0) v.dir = 0;

    return v.pos >= end;
  }

  /** Match unattended fires and incidents to the nearest free station. */
  private assign(city: CityData, incidents: readonly Incident[]): void {
    let budget = DISPATCH_PER_TICK;
    if (budget <= 0) return;

    const stations = this.collectStations(city);
    if (stations.fire.length + stations.police.length + stations.medical.length === 0) {
      return;
    }

    // Fire — send a truck to the fiercest unattended blaze.
    const fireTarget = this.hottestUnattendedFire(city);
    if (budget > 0 && fireTarget >= 0) {
      if (this.dispatch(city, "fire", fireTarget, null, stations)) budget--;
    }

    // Incidents — crime to police, medical to ambulances.
    for (const inc of incidents) {
      if (budget <= 0) break;
      if (inc.state !== "open") continue;
      const kind: VehicleKind = inc.kind === "crime" ? "police" : "medical";
      if (this.dispatch(city, kind, inc.tile, inc, stations)) {
        inc.state = "assigned";
        budget--;
      }
    }
  }

  /** The hottest burning tile no fire truck is already handling, or -1. */
  private hottestUnattendedFire(city: CityData): number {
    const targeted = new Set<number>();
    for (const v of this._vehicles) {
      if (v.kind === "fire") targeted.add(v.targetTile);
    }
    let best = -1;
    let bestHeat = 0;
    for (let i = 0; i < city.grid.size; i++) {
      const heat = city.fire[i];
      if (heat > bestHeat && !targeted.has(i)) {
        best = i;
        bestHeat = heat;
      }
    }
    return best;
  }

  /** Group every service-building tile by the vehicle kind it fields. */
  private collectStations(city: CityData): Record<VehicleKind, number[]> {
    const out: Record<VehicleKind, number[]> = { fire: [], police: [], medical: [] };
    for (let i = 0; i < city.grid.size; i++) {
      const kind = stationKind(city.buildingId[i]);
      if (kind) out[kind].push(i);
    }
    return out;
  }

  /**
   * Route a vehicle of `kind` from the nearest capable station to `target`.
   * Returns true if one was dispatched.
   */
  private dispatch(
    city: CityData,
    kind: VehicleKind,
    target: number,
    incident: Incident | null,
    stations: Record<VehicleKind, number[]>,
  ): boolean {
    if (this._vehicles.length >= POOL_SIZE) return false;
    const { grid } = city;
    const targetRoad = this.nearestRoad(city, target);
    if (targetRoad < 0) return false;

    const tx = grid.x(target);
    const ty = grid.y(target);
    // Try stations nearest first, so the closest crew responds.
    const ordered = stations[kind]
      .filter((s) => this.stationLoad(s) < MAX_PER_STATION)
      .sort(
        (a, b) =>
          manhattan(grid, a, tx, ty) - manhattan(grid, b, tx, ty),
      );

    for (const station of ordered) {
      const stationRoad = this.nearestRoad(city, station);
      if (stationRoad < 0) continue;
      const road = findRoadPath(city, stationRoad, targetRoad);
      if (!road) continue;
      // Drive out of the station onto the road, and off it onto the scene.
      const path = [station, ...road, target];
      this.spawn(kind, station, target, path, incident);
      return true;
    }
    return false;
  }

  /** How many vehicles a given station already has out. */
  private stationLoad(station: number): number {
    let n = 0;
    for (const v of this._vehicles) {
      if (v.stationTile === station) n++;
    }
    return n;
  }

  /** Add an active vehicle parked at its station, ready to roll. */
  private spawn(
    kind: VehicleKind,
    stationTile: number,
    targetTile: number,
    path: number[],
    incident: Incident | null,
  ): void {
    this._vehicles.push({
      active: true,
      kind,
      state: "enroute",
      stationTile,
      targetTile,
      path,
      pos: 0,
      dir: 2,
      tileX: 0,
      tileY: 0,
      prevTileX: 0,
      prevTileY: 0,
      onSceneTicks: 0,
      incident,
    });
  }

  /**
   * Nearest road tile to `tile`, searched in widening rings. Returns the tile
   * itself if it is a road, or -1 if no road sits within the search radius.
   */
  private nearestRoad(city: CityData, tile: number): number {
    if (city.road[tile]) return tile;
    const { grid } = city;
    const cx = grid.x(tile);
    const cy = grid.y(tile);
    for (let r = 1; r <= ROAD_SEARCH_RADIUS; r++) {
      for (let dy = -r; dy <= r; dy++) {
        for (let dx = -r; dx <= r; dx++) {
          if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
          const x = cx + dx;
          const y = cy + dy;
          if (!grid.inBounds(x, y)) continue;
          const j = grid.index(x, y);
          if (city.road[j]) return j;
        }
      }
    }
    return -1;
  }
}

/** Manhattan distance from tile `i` to a point. */
function manhattan(
  grid: CityData["grid"],
  i: number,
  x: number,
  y: number,
): number {
  return Math.abs(grid.x(i) - x) + Math.abs(grid.y(i) - y);
}
