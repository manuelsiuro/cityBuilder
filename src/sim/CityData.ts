import { Grid } from "../engine/Grid";
import type { DirtyFlag } from "./layers";

/**
 * The city's entire mutable state, stored struct-of-arrays: one flat typed
 * array per layer, all indexed by `grid.index(x, y)`. This is the single
 * source of truth — systems read and write it, the renderer reads it.
 *
 * Struct-of-arrays (not object-per-tile) keeps full-grid passes — power
 * flood-fill, land-value recompute — cache-friendly and makes saves trivial.
 */
export class CityData {
  readonly grid: Grid;

  // --- Persistent layers (saved) ---
  /** Elevation tier, 0..MAX_ELEVATION. */
  readonly elevation: Uint8Array;
  /** `TerrainType` value. */
  readonly terrainType: Uint8Array;
  /** `Zone` value. */
  readonly zone: Uint8Array;
  /** Building archetype id; 0 = empty. */
  readonly buildingId: Uint16Array;
  /** Development level of the building on this tile. */
  readonly buildLevel: Uint8Array;
  /** Ticks since the current building appeared. */
  readonly buildAge: Uint16Array;
  /** Road tile present (auto-tiling bitmask filled by RoadSystem). */
  readonly road: Uint8Array;
  /** Overland power line present. */
  readonly powerLine: Uint8Array;
  /** Underground water pipe present. */
  readonly pipe: Uint8Array;

  // --- Per-tick computed layers (recomputed each tick, not saved) ---
  readonly powered: Uint8Array;
  readonly watered: Uint8Array;
  readonly landValue: Uint8Array;
  readonly pollution: Uint8Array;
  readonly trafficLoad: Uint8Array;

  // --- City-wide aggregates ---
  funds = 20_000;
  /** Tax rates per zone, 0–1. */
  taxRateR = 0.09;
  taxRateC = 0.09;
  taxRateI = 0.09;
  population = 0;
  jobsCommercial = 0;
  jobsIndustrial = 0;
  /** Residential / commercial / industrial demand, each −100..100. */
  demandR = 0;
  demandC = 0;
  demandI = 0;
  powerSupply = 0;
  powerDemand = 0;
  waterSupply = 0;
  waterDemand = 0;

  /** Bitset of pending recomputation work — see `Dirty` in layers.ts. */
  private dirtyFlags = 0;

  constructor(width: number, height: number) {
    this.grid = new Grid(width, height);
    const n = this.grid.size;

    this.elevation = new Uint8Array(n);
    this.terrainType = new Uint8Array(n);
    this.zone = new Uint8Array(n);
    this.buildingId = new Uint16Array(n);
    this.buildLevel = new Uint8Array(n);
    this.buildAge = new Uint16Array(n);
    this.road = new Uint8Array(n);
    this.powerLine = new Uint8Array(n);
    this.pipe = new Uint8Array(n);

    this.powered = new Uint8Array(n);
    this.watered = new Uint8Array(n);
    this.landValue = new Uint8Array(n);
    this.pollution = new Uint8Array(n);
    this.trafficLoad = new Uint8Array(n);
  }

  /** Zero every layer and reset aggregates — used when starting a new city. */
  reset(): void {
    for (const layer of [
      this.elevation, this.terrainType, this.zone, this.buildingId,
      this.buildLevel, this.buildAge, this.road, this.powerLine, this.pipe,
      this.powered, this.watered, this.landValue, this.pollution, this.trafficLoad,
    ]) {
      layer.fill(0);
    }
    this.funds = 20_000;
    this.taxRateR = this.taxRateC = this.taxRateI = 0.09;
    this.population = 0;
    this.jobsCommercial = 0;
    this.jobsIndustrial = 0;
    this.demandR = this.demandC = this.demandI = 0;
    this.powerSupply = this.powerDemand = 0;
    this.waterSupply = this.waterDemand = 0;
    this.dirtyFlags = 0;
  }

  markDirty(flag: DirtyFlag): void {
    this.dirtyFlags |= flag;
  }

  isDirty(flag: DirtyFlag): boolean {
    return (this.dirtyFlags & flag) !== 0;
  }

  clearDirty(flag: DirtyFlag): void {
    this.dirtyFlags &= ~flag;
  }
}
