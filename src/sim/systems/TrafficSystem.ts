import type { Random } from "../../engine/Random";
import type { CityData } from "../CityData";
import type { GameEventBus } from "../events";
import type { RoadGraph } from "../pathfinding/RoadGraph";
import { findRoadPath } from "../pathfinding/AStar";
import { TrafficGrid, DIR_DX, DIR_DY, stepDir } from "../traffic/TrafficGrid";
import {
  IntersectionSystem,
  dirAxis,
  lightState,
  type Intersection,
} from "./IntersectionSystem";

/** A single car agent. Positions are in continuous tile coordinates. */
export interface Car {
  active: boolean;
  /** Road-tile indices from origin to destination. */
  path: number[];
  /** Float position along `path` (index + fraction). */
  pos: number;
  /** Current speed, in path units (tiles) per tick. 0 = stopped. */
  speed: number;
  /** Desired cruising speed. */
  cruiseSpeed: number;
  /** Travel-direction code (0..3) of the current path segment. */
  dir: number;
  /** Continuous tile X, including the right-hand lane offset. */
  tileX: number;
  tileY: number;
  prevTileX: number;
  prevTileY: number;
  /** Consecutive ticks spent essentially stopped — recycles gridlocked cars. */
  stuckTicks: number;
  color: number;
}

const MAX_CARS = 140;
const CAR_COLORS = [0xe7e9ec, 0xd14b3c, 0x3f6fae, 0xe0b048, 0x4a4f57, 0x6aa45a];

/** Acceleration ceiling, tiles/tick². */
const ACCEL = 0.012;
/** Braking ceiling, tiles/tick². The kinematic stop curve uses this same value. */
const DECEL = 0.03;
/** Minimum centre-to-centre gap a car keeps behind its leader, in tiles. */
const HEADWAY = 0.6;
/** Right-hand lane shift off the road centreline, in tiles. */
const LANE_OFFSET = 0.2;
/** Path edges scanned ahead when looking for a leading car. */
const LEADER_SCAN = 3;
/** Path tiles scanned ahead when looking for the next intersection. */
const INTER_LOOKAHEAD = 6;
/** Gap kept between the stop line and the intersection-tile boundary. */
const STOP_GAP = 0.12;
/** Distance to the stop line within which a car commits to entering. */
const CLAIM_DIST = 1.2;
/** Max spawn attempts per tick — bounds A* cost as a city grows. */
const SPAWN_BUDGET = 2;
/** Cars on the road per unit of (population + jobs). */
const CARS_PER_CAPITA = 0.02;
/** Ticks at near-zero speed after which a car gives up and frees its slot. */
const STUCK_LIMIT = 220;

/** Smoothstep easing, used to blend the lane offset across path nodes. */
function smoothstep(t: number): number {
  return t * t * (3 - 2 * t);
}

/**
 * Drives car agents along the road network. Cars are pooled. Each tick the
 * system snapshots positions into a `TrafficGrid`, then advances every car with
 * a car-following + accel/decel model so they queue instead of piling up.
 * Intersections admit one car at a time, gated by traffic signals at 4-way
 * crossroads and give-way rules at T-junctions. Two-way traffic comes from a
 * right-hand offset off the road centreline, and the fleet size tracks the
 * city's population and jobs.
 */
export class TrafficSystem {
  readonly cars: Car[] = [];

  /** Sandbox hook: when set, forces the fleet size regardless of population. */
  targetOverride: number | null = null;

  private readonly grid = new TrafficGrid();
  private roadTiles: number[] = [];
  private roadsDirty = true;

  constructor(
    private readonly roadGraph: RoadGraph,
    private readonly intersections: IntersectionSystem,
    private readonly random: Random,
    events: GameEventBus,
  ) {
    events.on("roads:changed", () => {
      this.roadsDirty = true;
    });
    for (let k = 0; k < MAX_CARS; k++) {
      this.cars.push({
        active: false,
        path: [],
        pos: 0,
        speed: 0,
        cruiseSpeed: 0,
        dir: 0,
        tileX: 0,
        tileY: 0,
        prevTileX: 0,
        prevTileY: 0,
        stuckTicks: 0,
        color: CAR_COLORS[k % CAR_COLORS.length],
      });
    }
  }

  /** Deactivate every car — used when the city is reset or loaded. */
  clear(): void {
    for (const car of this.cars) car.active = false;
  }

  update(city: CityData, tick: number): void {
    if (this.roadsDirty) {
      this.roadTiles = [];
      for (let i = 0; i < city.grid.size; i++) {
        if (city.road[i]) this.roadTiles.push(i);
      }
      this.roadsDirty = false;
    }

    // Congestion fades over time.
    const load = city.trafficLoad;
    for (let i = 0; i < load.length; i++) {
      if (load[i] > 0) load[i]--;
    }

    this.buildGrid(city);

    // Cars resolve in fixed pool order against the start-of-tick snapshot, so
    // follow gaps are deterministic.
    for (let k = 0; k < this.cars.length; k++) {
      const car = this.cars[k];
      if (car.active) this.advance(city, car, k, tick);
    }

    this.spawnToTarget(city);
  }

  /** Snapshot every active car into the spatial grid. */
  private buildGrid(city: CityData): void {
    const { grid } = city;
    this.grid.clear();
    for (let k = 0; k < this.cars.length; k++) {
      const car = this.cars[k];
      if (!car.active) continue;
      const len = car.path.length;
      const i = Math.min(Math.floor(car.pos), len - 2);
      const f = car.pos - i;
      const a = car.path[i];
      const b = car.path[i + 1];
      const dir = stepDir(grid.x(a), grid.y(a), grid.x(b), grid.y(b));
      this.grid.addEdge(a, dir, k, f);

      const round = Math.max(0, Math.min(Math.round(car.pos), len - 1));
      this.grid.addTile(car.path[round], k);
    }
  }

  /** Path index of the next intersection tile ahead of segment `i`, or -1. */
  private nextInterIndex(car: Car, i: number): number {
    const path = car.path;
    const len = path.length;
    for (let s = 1; s <= INTER_LOOKAHEAD; s++) {
      const idx = i + s;
      if (idx > len - 1) break;
      if (this.intersections.at(path[idx])) return idx;
    }
    return -1;
  }

  /** Advance one car: gather constraints, update speed, move, and place it. */
  private advance(city: CityData, car: Car, self: number, tick: number): void {
    car.prevTileX = car.tileX;
    car.prevTileY = car.tileY;

    const { grid } = city;
    const path = car.path;
    const len = path.length;
    const i = Math.min(Math.floor(car.pos), len - 2);
    car.dir = stepDir(
      grid.x(path[i]),
      grid.y(path[i]),
      grid.x(path[i + 1]),
      grid.y(path[i + 1]),
    );

    // Stop distance is the slack (in path units) before the nearest hazard.
    let stopDist = Infinity;
    const lead = this.leaderGap(city, car, self, i);
    if (lead < Infinity) stopDist = Math.min(stopDist, lead - HEADWAY);
    const inter = this.intersectionStop(city, car, self, i, tick, lead);
    if (inter < Infinity) stopDist = Math.min(stopDist, inter);

    // Kinematic braking curve: a car can always stop within `stopDist`.
    const safe = Math.sqrt(2 * DECEL * Math.max(0, stopDist));
    let speed = Math.min(car.cruiseSpeed, safe);
    if (speed > car.speed + ACCEL) speed = car.speed + ACCEL;
    else if (speed < car.speed - DECEL) speed = car.speed - DECEL;
    car.speed = Math.max(0, speed);
    car.pos += car.speed;

    car.stuckTicks = car.speed < 0.005 ? car.stuckTicks + 1 : 0;

    if (car.pos >= len - 1) {
      car.active = false; // reached destination
      return;
    }
    if (car.stuckTicks > STUCK_LIMIT) {
      car.active = false; // gridlocked — free the pool slot
      return;
    }

    this.placeCar(city, car);
    const ti = grid.index(
      Math.max(0, Math.min(grid.width - 1, Math.round(car.tileX))),
      Math.max(0, Math.min(grid.height - 1, Math.round(car.tileY))),
    );
    city.trafficLoad[ti] = Math.min(255, city.trafficLoad[ti] + 5);
  }

  /**
   * Path-unit distance to the nearest car ahead in the same lane, or Infinity.
   * Scans the car's current directed edge then the next few edges of its path.
   */
  private leaderGap(city: CityData, car: Car, self: number, i: number): number {
    const { grid } = city;
    const path = car.path;
    const len = path.length;
    const f = car.pos - i;
    // Let arriving cars finish without braking for a car parked at the goal.
    if (car.pos > len - 2) return Infinity;

    let best = Infinity;
    for (let s = 0; s < LEADER_SCAN; s++) {
      const k = i + s;
      if (k > len - 2) break;
      const a = path[k];
      const b = path[k + 1];
      const dir = stepDir(grid.x(a), grid.y(a), grid.x(b), grid.y(b));
      const list = this.grid.edge(a, dir);
      if (!list) continue;
      const base = k - i - f; // path-unit distance from the car to this edge's start
      for (const e of list) {
        if (e.car === self) continue;
        if (s === 0) {
          const ahead = e.f > f || (e.f === f && e.car < self);
          if (!ahead) continue;
        }
        const gap = base + e.f;
        if (gap >= 0 && gap < best) best = gap;
      }
      if (best < Infinity) break; // later edges are strictly farther
    }
    return best;
  }

  /**
   * Path-unit slack before the next intersection a car must halt at, or
   * Infinity if it may proceed: it is already inside the junction, a leader
   * ahead owns the approach, or the junction admits it this tick.
   */
  private intersectionStop(
    city: CityData,
    car: Car,
    self: number,
    i: number,
    tick: number,
    lead: number,
  ): number {
    const { grid } = city;
    const path = car.path;

    const j = this.nextInterIndex(car, i);
    if (j < 0) return Infinity;
    if (Math.round(car.pos) >= j) return Infinity; // already inside the junction

    const dist = j - 0.5 - STOP_GAP - car.pos;
    if (dist > CLAIM_DIST) return Infinity; // too far to decide yet
    // A leader between the car and the stop line owns the approach; following
    // it keeps this car back, so the junction is that leader's concern. Once
    // the car is itself committed (dist <= 0) it must re-clear the junction.
    if (lead < dist) return Infinity;

    const approachDir = stepDir(
      grid.x(path[j - 1]),
      grid.y(path[j - 1]),
      grid.x(path[j]),
      grid.y(path[j]),
    );
    if (this.mayEnter(city, car, self, j, this.intersections.at(path[j])!, approachDir, tick)) {
      return Infinity;
    }
    return dist;
  }

  /**
   * Decide whether `car` may enter intersection tile `path[j]` this tick.
   * Flow is metered by the signal (4-way) or give-way rule (T-junction); cars
   * on a green phase stream through, queueing on each other via car-following.
   */
  private mayEnter(
    city: CityData,
    car: Car,
    self: number,
    j: number,
    inter: Intersection,
    approachDir: number,
    tick: number,
  ): boolean {
    const { grid } = city;
    const path = car.path;
    const T = inter.tile;

    // Don't block the box: the tile beyond must not hold a stalled car.
    if (j + 1 <= path.length - 1) {
      const exit = this.grid.tileCars(path[j + 1]);
      if (exit) {
        for (const c of exit) {
          if (c !== self && this.cars[c].speed < 0.03) return false;
        }
      }
    }

    if (inter.kind === "light") {
      return lightState(inter, tick, dirAxis(approachDir)) === "green";
    }

    // T-junction: give way to a car approaching from the right that is closer
    // to the junction. The distance + pool-index tie-break guarantees progress.
    const rightDir = (approachDir + 1) % 4;
    const rx = grid.x(T) + DIR_DX[rightDir];
    const ry = grid.y(T) + DIR_DY[rightDir];
    if (!grid.inBounds(rx, ry)) return true;
    const rTile = grid.index(rx, ry);
    if (!city.road[rTile]) return true;

    const intoDir = (rightDir + 2) % 4; // direction from the right tile toward T
    const list = this.grid.edge(rTile, intoDir);
    if (!list) return true;

    const myCentreDist = j - car.pos;
    for (const e of list) {
      if (e.car === self) continue;
      const otherDist = 1 - e.f; // that car's distance to the junction centre
      const moving = this.cars[e.car].speed > 0.005 || otherDist < 0.7;
      if (!moving) continue;
      if (otherDist < myCentreDist) return false;
      if (Math.abs(otherDist - myCentreDist) < 1e-6 && e.car < self) return false;
    }
    return true;
  }

  /** Place a car from its float path index, applying the right-hand lane offset. */
  private placeCar(city: CityData, car: Car): void {
    const { grid } = city;
    const path = car.path;
    const len = path.length;
    const i = Math.min(Math.floor(car.pos), len - 2);
    const f = car.pos - i;

    const ax = grid.x(path[i]);
    const ay = grid.y(path[i]);
    const bx = grid.x(path[i + 1]);
    const by = grid.y(path[i + 1]);
    const baseX = ax + (bx - ax) * f;
    const baseY = ay + (by - ay) * f;

    // Blend the offset between the two path nodes so turns trace a smooth arc.
    const o0 = this.nodeOffset(grid, path, i);
    const o1 = this.nodeOffset(grid, path, i + 1);
    const s = smoothstep(f);
    const ox = o0.x + (o1.x - o0.x) * s;
    const oy = o0.y + (o1.y - o0.y) * s;

    car.tileX = baseX + ox * LANE_OFFSET;
    car.tileY = baseY + oy * LANE_OFFSET;
  }

  /**
   * Unit right-hand offset direction at path node `n` — the bisector of the
   * segments entering and leaving it, so adjacent segments agree at the node.
   */
  private nodeOffset(
    grid: CityData["grid"],
    path: number[],
    n: number,
  ): { x: number; y: number } {
    const last = path.length - 2;
    const pin = n - 1 >= 0 && n - 1 <= last ? this.segPerp(grid, path, n - 1) : null;
    const pout = n >= 0 && n <= last ? this.segPerp(grid, path, n) : null;

    let vx: number;
    let vy: number;
    if (pin && pout) {
      vx = pin.x + pout.x;
      vy = pin.y + pout.y;
    } else if (pin) {
      vx = pin.x;
      vy = pin.y;
    } else {
      vx = pout!.x;
      vy = pout!.y;
    }
    const m = Math.hypot(vx, vy);
    if (m < 1e-4) return pout ?? pin ?? { x: 0, y: 0 }; // U-turn fallback
    return { x: vx / m, y: vy / m };
  }

  /** Right-hand perpendicular of path segment `seg` (start tile → next tile). */
  private segPerp(
    grid: CityData["grid"],
    path: number[],
    seg: number,
  ): { x: number; y: number } {
    const a = path[seg];
    const b = path[seg + 1];
    const dx = grid.x(b) - grid.x(a);
    const dy = grid.y(b) - grid.y(a);
    return { x: -dy, y: dx };
  }

  /** Spawn cars until the active fleet meets the population-derived target. */
  private spawnToTarget(city: CityData): void {
    let active = 0;
    for (const c of this.cars) if (c.active) active++;

    const target = this.carTarget(city);
    let budget = SPAWN_BUDGET;
    while (active < target && budget-- > 0) {
      if (!this.trySpawn(city)) break;
      active++;
    }
  }

  /** Desired active-car count for the current city. */
  private carTarget(city: CityData): number {
    if (this.targetOverride != null) {
      return Math.max(0, Math.min(MAX_CARS, this.targetOverride));
    }
    const demand = city.population + city.jobsCommercial + city.jobsIndustrial;
    return Math.min(MAX_CARS, Math.floor(demand * CARS_PER_CAPITA));
  }

  private trySpawn(city: CityData): boolean {
    const free = this.cars.find((c) => !c.active);
    if (!free || this.roadTiles.length < 3) return false;

    const tiles = this.roadTiles;
    const start = tiles[this.random.int(tiles.length)];
    const goal = tiles[this.random.int(tiles.length)];
    if (start === goal || !this.roadGraph.connected(start, goal)) return false;
    // Never drop a car on top of another.
    if (this.grid.tileCars(start)) return false;

    const path = findRoadPath(city, start, goal);
    if (!path || path.length < 3) return false;

    const { grid } = city;
    free.active = true;
    free.path = path;
    free.pos = 0;
    free.cruiseSpeed = 0.12 + this.random.next() * 0.1;
    free.speed = 0; // accelerate away from rest
    free.stuckTicks = 0;
    free.dir = stepDir(grid.x(path[0]), grid.y(path[0]), grid.x(path[1]), grid.y(path[1]));
    this.placeCar(city, free);
    free.prevTileX = free.tileX;
    free.prevTileY = free.tileY;
    return true;
  }
}
