import type { Random } from "../../engine/Random";
import type { CityData } from "../CityData";
import type { GameEventBus } from "../events";
import type { RoadGraph } from "../pathfinding/RoadGraph";
import { findRoadPath } from "../pathfinding/AStar";

/** A single car agent. Positions are in continuous tile coordinates. */
export interface Car {
  active: boolean;
  path: number[];
  /** Float position along `path` (index + fraction). */
  pos: number;
  /** Path units (tiles) advanced per tick. */
  speed: number;
  tileX: number;
  tileY: number;
  prevTileX: number;
  prevTileY: number;
  color: number;
}

const MAX_CARS = 140;
const SPAWN_INTERVAL = 3;
const SPAWN_PER_ATTEMPT = 3;
const CAR_COLORS = [0xe7e9ec, 0xd14b3c, 0x3f6fae, 0xe0b048, 0x4a4f57, 0x6aa45a];

/**
 * Drives car agents along the road network. Cars are pooled; each tick they
 * advance along an A*-found path and stamp congestion onto `trafficLoad`, which
 * decays over time and feeds back into pathfinding and land value.
 */
export class TrafficSystem {
  readonly cars: Car[] = [];

  private roadTiles: number[] = [];
  private roadsDirty = true;

  constructor(
    private readonly roadGraph: RoadGraph,
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
        tileX: 0,
        tileY: 0,
        prevTileX: 0,
        prevTileY: 0,
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

    for (const car of this.cars) {
      if (!car.active) continue;
      car.prevTileX = car.tileX;
      car.prevTileY = car.tileY;
      car.pos += car.speed;
      if (car.pos >= car.path.length - 1) {
        car.active = false;
        continue;
      }
      this.placeCar(city, car);
      const ti = city.grid.index(Math.round(car.tileX), Math.round(car.tileY));
      load[ti] = Math.min(255, load[ti] + 5);
    }

    if (tick % SPAWN_INTERVAL === 0 && this.roadTiles.length > 2) {
      for (let s = 0; s < SPAWN_PER_ATTEMPT; s++) this.trySpawn(city);
    }
  }

  /** Set a car's continuous tile position from its float path index. */
  private placeCar(city: CityData, car: Car): void {
    const i = Math.floor(car.pos);
    const f = car.pos - i;
    const a = car.path[i];
    const b = car.path[Math.min(i + 1, car.path.length - 1)];
    const { grid } = city;
    car.tileX = grid.x(a) + (grid.x(b) - grid.x(a)) * f;
    car.tileY = grid.y(a) + (grid.y(b) - grid.y(a)) * f;
  }

  private trySpawn(city: CityData): void {
    const free = this.cars.find((c) => !c.active);
    if (!free) return;

    const tiles = this.roadTiles;
    const start = tiles[this.random.int(tiles.length)];
    const goal = tiles[this.random.int(tiles.length)];
    if (start === goal || !this.roadGraph.connected(start, goal)) return;

    const path = findRoadPath(city, start, goal);
    if (!path || path.length < 3) return;

    free.active = true;
    free.path = path;
    free.pos = 0;
    free.speed = 0.12 + this.random.next() * 0.1;
    this.placeCar(city, free);
    free.prevTileX = free.tileX;
    free.prevTileY = free.tileY;
  }
}
