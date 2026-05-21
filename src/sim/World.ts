import { Random } from "../engine/Random";
import { CommandQueue } from "../engine/CommandQueue";
import { EventBus } from "../engine/EventBus";
import { CityData } from "./CityData";
import { generateTerrain } from "./TerrainGen";
import { DEFAULT_MAP_SETTINGS, MAP_SIZES, type MapSettings } from "./MapSettings";
import { formatDate, tickToDate, type SimDate } from "./Tick";
import { applyCommand, CmdResult, type Command } from "./commands";
import type { GameEventMap } from "./events";
import { Dirty } from "./layers";
import type { SaveFile } from "../save/schema";
import { SLOW_TICKS } from "./development";
import { RoadGraph } from "./pathfinding/RoadGraph";
import { RoadSystem } from "./systems/RoadSystem";
import { IntersectionSystem, type Intersection } from "./systems/IntersectionSystem";
import { PowerSystem } from "./systems/PowerSystem";
import { WaterSystem } from "./systems/WaterSystem";
import { CoverageSystem } from "./systems/CoverageSystem";
import { DisasterSystem } from "./systems/DisasterSystem";
import { IncidentSystem, type Incident } from "./systems/IncidentSystem";
import { DispatchSystem, type ServiceVehicle } from "./systems/DispatchSystem";
import { LandValueSystem } from "./systems/LandValueSystem";
import { PopulationSystem } from "./systems/PopulationSystem";
import { RCISystem } from "./systems/RCISystem";
import { DevelopmentSystem } from "./systems/DevelopmentSystem";
import { TrafficSystem, type Car } from "./systems/TrafficSystem";
import { BudgetSystem } from "./systems/BudgetSystem";

/**
 * Owns the city simulation: the `CityData` grid, the command queue, the event
 * bus, and the system pipeline. `tick()` is the single fixed-timestep entry
 * point driven by `GameLoop`. Renderer-free and deterministic.
 */
export class World {
  readonly random: Random;
  readonly city: CityData;

  /** Player intents — pushed by input/UI, drained at the start of each tick. */
  readonly commands = new CommandQueue<Command>();
  /** Discrete sim → outside notifications. */
  readonly events = new EventBus<GameEventMap>();
  readonly roadGraph = new RoadGraph();

  private readonly roadSystem: RoadSystem;
  private readonly intersectionSystem: IntersectionSystem;
  private readonly powerSystem: PowerSystem;
  private readonly waterSystem: WaterSystem;
  private readonly coverageSystem: CoverageSystem;
  private readonly disasterSystem: DisasterSystem;
  private readonly incidentSystem: IncidentSystem;
  private readonly dispatchSystem = new DispatchSystem();
  private readonly landValueSystem = new LandValueSystem();
  private readonly populationSystem = new PopulationSystem();
  private readonly rciSystem = new RCISystem();
  private readonly developmentSystem: DevelopmentSystem;
  private readonly trafficSystem: TrafficSystem;
  private readonly budgetSystem: BudgetSystem;
  private _tickCount = 0;
  private _seed: number;
  /** Tick a given notice message was last emitted — drives throttling. */
  private readonly noticeAt = new Map<string, number>();
  /** Map-generation parameters this world was built from. */
  settings: MapSettings;

  constructor(settings: MapSettings | number = DEFAULT_MAP_SETTINGS) {
    // Accept a bare seed for convenience (tests, sandbox); otherwise full settings.
    this.settings =
      typeof settings === "number"
        ? { ...DEFAULT_MAP_SETTINGS, seed: settings }
        : settings;
    this._seed = this.settings.seed;
    this.random = new Random(this._seed);
    const dim = MAP_SIZES[this.settings.size];
    this.city = new CityData(dim, dim);
    generateTerrain(this.city, this.random, this.settings);
    // The renderer builds terrain directly via `buildCity` — clear the flag so
    // the first tick doesn't fire a redundant `terrain:changed` rebuild.
    this.city.clearDirty(Dirty.Terrain);
    this.roadSystem = new RoadSystem(this.roadGraph, this.events);
    this.intersectionSystem = new IntersectionSystem(this.events);
    this.powerSystem = new PowerSystem(this.events);
    this.waterSystem = new WaterSystem(this.events);
    this.coverageSystem = new CoverageSystem(this.events);
    this.disasterSystem = new DisasterSystem(this.random, this.events);
    this.incidentSystem = new IncidentSystem(this.random, this.events);
    this.developmentSystem = new DevelopmentSystem(this.random, this.events);
    this.trafficSystem = new TrafficSystem(
      this.roadGraph,
      this.intersectionSystem,
      this.random,
      this.events,
    );
    this.budgetSystem = new BudgetSystem(this.events);
  }

  /** Live car agents — read by the renderer. */
  get cars(): readonly Car[] {
    return this.trafficSystem.cars;
  }

  /** Road junctions — read by the renderer to place and drive traffic lights. */
  get intersections(): readonly Intersection[] {
    return this.intersectionSystem.list;
  }

  /** Live crime / medical incidents — read by the renderer and dispatch. */
  get incidents(): readonly Incident[] {
    return this.incidentSystem.incidents;
  }

  /** Live emergency vehicles — read by the renderer. */
  get serviceVehicles(): readonly ServiceVehicle[] {
    return this.dispatchSystem.vehicles;
  }

  /** Sandbox hook: force a fixed car-fleet size regardless of population. */
  setCarTargetOverride(count: number | null): void {
    this.trafficSystem.targetOverride = count;
  }

  get seed(): number {
    return this._seed;
  }

  /** Advance the simulation by one fixed step. `tickMs` is always `SIM_TICK_MS`. */
  tick(_tickMs: number): void {
    this._tickCount++;

    // Apply queued player intents, then run the system pipeline. A drag that
    // can't be afforded surfaces one throttled toast — other rejections (e.g.
    // painting a road over an existing one) are normal and stay silent.
    let rejectedForFunds = false;
    for (const cmd of this.commands.drain()) {
      if (applyCommand(this.city, cmd) === CmdResult.NoFunds) rejectedForFunds = true;
    }
    if (rejectedForFunds) this.notice("warn", "Not enough funds");

    // Layers with no dedicated system just notify the renderer and clear.
    if (this.city.isDirty(Dirty.Zone)) {
      this.city.clearDirty(Dirty.Zone);
      this.events.emit("zones:changed", undefined);
    }
    if (this.city.isDirty(Dirty.Utility)) {
      this.city.clearDirty(Dirty.Utility);
      this.events.emit("utilities:changed", undefined);
    }
    if (this.city.isDirty(Dirty.Terrain)) {
      this.city.clearDirty(Dirty.Terrain);
      this.events.emit("terrain:changed", undefined);
    }

    this.roadSystem.update(this.city);
    this.intersectionSystem.update(this.city);
    this.powerSystem.update(this.city);
    this.waterSystem.update(this.city);
    this.coverageSystem.update(this.city);
    this.disasterSystem.update(this.city, this._tickCount);
    this.incidentSystem.update(this.city, this._tickCount);
    this.dispatchSystem.update(this.city, this.incidentSystem.incidents);
    this.trafficSystem.update(this.city, this._tickCount);

    // Slow systems run once per in-game day — too costly and too twitchy
    // to run every tick.
    if (this._tickCount % SLOW_TICKS === 0) {
      this.landValueSystem.update(this.city);
      this.populationSystem.update(this.city);
      this.rciSystem.update(this.city);
      this.developmentSystem.update(this.city);
    }
    this.budgetSystem.update(this.city, this._tickCount);
  }

  /**
   * Emit a player-facing notice, suppressing a repeat of the same message
   * within ~3 seconds (30 ticks) so a held-down drag doesn't spam the HUD.
   */
  private notice(level: "info" | "warn", message: string): void {
    const last = this.noticeAt.get(message);
    if (last !== undefined && this._tickCount - last < 30) return;
    this.noticeAt.set(message, this._tickCount);
    this.events.emit("notice", { level, message });
  }

  /**
   * Replace the city with a loaded save. Copies the persistent layers, restores
   * aggregates and RNG state, then re-runs the systems so derived layers and
   * the road graph are consistent immediately.
   */
  restore(file: SaveFile): void {
    const c = this.city;
    c.elevation.set(file.layers.elevation);
    c.terrainType.set(file.layers.terrainType);
    c.biome.set(file.layers.biome);
    c.trees.set(file.layers.trees);
    c.zone.set(file.layers.zone);
    c.buildingId.set(file.layers.buildingId);
    c.buildLevel.set(file.layers.buildLevel);
    c.buildAge.set(file.layers.buildAge);
    c.road.set(file.layers.road);
    c.powerLine.set(file.layers.powerLine);
    c.pipe.set(file.layers.pipe);

    c.funds = file.city.funds;
    c.taxRateR = file.city.taxRateR;
    c.taxRateC = file.city.taxRateC;
    c.taxRateI = file.city.taxRateI;
    this._seed = file.seed;
    this._tickCount = file.meta.simTick;
    this.random.state = file.rngState;
    this.noticeAt.clear();
    c.fire.fill(0); // fires are transient — a loaded city starts unburnt
    c.crime.fill(0); // incidents are transient too
    this.disasterSystem.clear();
    this.incidentSystem.clear();
    this.dispatchSystem.clear();

    this.refreshAfterBulkChange();
  }

  /** Discard the city and generate a fresh one from a new seed. */
  reset(seed: number): void {
    this.settings = { ...this.settings, seed };
    this._seed = seed;
    this.random.state = seed >>> 0;
    this.city.reset();
    generateTerrain(this.city, this.random, this.settings);
    this._tickCount = 0;
    this.noticeAt.clear();
    this.disasterSystem.clear();
    this.incidentSystem.clear();
    this.dispatchSystem.clear();
    this.refreshAfterBulkChange();
  }

  /**
   * Re-derive everything after the city was bulk-replaced (load / new). Re-runs
   * the systems so computed layers and the road graph are consistent, and
   * fires the events the renderer needs to rebuild.
   */
  private refreshAfterBulkChange(): void {
    const c = this.city;
    this.trafficSystem.clear();
    this.landValueSystem.reset(); // terrain changed — drop the scenic cache
    c.markDirty(
      Dirty.Road | Dirty.Power | Dirty.Water | Dirty.Zone | Dirty.Utility | Dirty.Coverage,
    );
    // The renderer rebuilds terrain directly via `rebuildAll` — drop the flag
    // so the next tick doesn't fire a redundant `terrain:changed` rebuild.
    c.clearDirty(Dirty.Terrain);

    this.roadSystem.update(c);
    this.intersectionSystem.update(c);
    this.powerSystem.update(c);
    this.waterSystem.update(c);
    this.coverageSystem.update(c);
    this.landValueSystem.update(c);
    this.populationSystem.update(c);
    this.rciSystem.update(c);
    if (c.isDirty(Dirty.Zone)) {
      c.clearDirty(Dirty.Zone);
      this.events.emit("zones:changed", undefined);
    }
    if (c.isDirty(Dirty.Utility)) {
      c.clearDirty(Dirty.Utility);
      this.events.emit("utilities:changed", undefined);
    }
  }

  get tickCount(): number {
    return this._tickCount;
  }

  get date(): SimDate {
    return tickToDate(this._tickCount);
  }

  get dateLabel(): string {
    return formatDate(this.date);
  }
}
