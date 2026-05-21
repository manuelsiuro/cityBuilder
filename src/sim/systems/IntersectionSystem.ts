import type { CityData } from "../CityData";
import type { GameEventBus } from "../events";

/** Green phase length, in sim ticks (10 ticks = 1 second). */
const GREEN_TICKS = 70;
/** Yellow phase length, in sim ticks. */
const YELLOW_TICKS = 10;
/** Full two-axis signal cycle: axis 0 runs, then axis 1. */
export const LIGHT_CYCLE = 2 * (GREEN_TICKS + YELLOW_TICKS);

/** Signal state for one approach axis. */
export type LightState = "green" | "yellow" | "red";

/** Axis a travel direction belongs to: 0 = north/south, 1 = east/west. */
export function dirAxis(dir: number): 0 | 1 {
  return dir === 0 || dir === 2 ? 0 : 1;
}

/** A road tile where three or more arms meet. */
export interface Intersection {
  tile: number;
  /** `light` = signalled 4-way crossroads; `yield` = give-way T-junction. */
  kind: "light" | "yield";
  /** Per-intersection phase offset so signals don't all flip in lockstep. */
  offset: number;
}

/**
 * Signal colour for `axis` at `inter` on simulation `tick`. Pure function of
 * the tick — no per-tick state — so signals need no saving and stay
 * deterministic across save/load.
 */
export function lightState(inter: Intersection, tick: number, axis: 0 | 1): LightState {
  const t = (((tick + inter.offset) % LIGHT_CYCLE) + LIGHT_CYCLE) % LIGHT_CYCLE;
  const half = GREEN_TICKS + YELLOW_TICKS;
  const running = t < half ? 0 : 1;
  if (axis !== running) return "red";
  const phase = running === 0 ? t : t - half;
  return phase < GREEN_TICKS ? "green" : "yellow";
}

/**
 * Classifies road junctions and exposes their traffic-signal state. Re-scans
 * the road layer whenever roads change: a tile with four road arms becomes a
 * signalled crossroads, a tile with three becomes a give-way T-junction.
 */
export class IntersectionSystem {
  private _list: Intersection[] = [];
  private tileToIndex = new Int32Array(0);
  private dirty = true;

  constructor(private readonly events: GameEventBus) {
    events.on("roads:changed", () => {
      this.dirty = true;
    });
  }

  get list(): readonly Intersection[] {
    return this._list;
  }

  /** Intersection covering `tile`, or undefined if it is not a junction. */
  at(tile: number): Intersection | undefined {
    if (tile < 0 || tile >= this.tileToIndex.length) return undefined;
    const idx = this.tileToIndex[tile];
    return idx >= 0 ? this._list[idx] : undefined;
  }

  /** Re-enumerate junctions if the road layer changed since the last call. */
  update(city: CityData): void {
    if (!this.dirty) return;
    this.dirty = false;
    this.rebuild(city);
    this.events.emit("intersections:changed", undefined);
  }

  private rebuild(city: CityData): void {
    const { grid, road } = city;
    if (this.tileToIndex.length !== grid.size) {
      this.tileToIndex = new Int32Array(grid.size);
    }
    this.tileToIndex.fill(-1);
    this._list = [];

    for (let i = 0; i < grid.size; i++) {
      if (!road[i]) continue;
      let degree = 0;
      grid.forEachNeighbor4(grid.x(i), grid.y(i), (_x, _y, ni) => {
        if (road[ni]) degree++;
      });
      if (degree < 3) continue;

      const x = grid.x(i);
      const y = grid.y(i);
      this.tileToIndex[i] = this._list.length;
      this._list.push({
        tile: i,
        kind: degree === 4 ? "light" : "yield",
        // Hash the tile coords (coprime multipliers 13 / 7) into a phase
        // offset so neighbouring signals fall out of lockstep — a crude
        // "green wave" that keeps a grid of lights from all flipping together.
        offset: (x * 13 + y * 7) % LIGHT_CYCLE,
      });
    }
  }
}
