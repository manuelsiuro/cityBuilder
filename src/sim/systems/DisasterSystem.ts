import type { Random } from "../../engine/Random";
import type { CityData } from "../CityData";
import type { GameEventBus } from "../events";
import { Dirty, TerrainType, Zone } from "../layers";
import { BUILDING } from "../buildings";
import {
  DEFAULT_DISASTER_SETTINGS,
  type DisasterId,
  type DisasterSettings,
} from "../MapSettings";

// --- Fire ------------------------------------------------------------------
/** Base spontaneous-ignition chance per flammable tile per tick. */
const IGNITE_RISK = 0.00002;
/** Industry is more fire-prone than other land. */
const INDUSTRIAL_RISK_MULT = 2.5;
/** Intensity a tile starts at when it catches fire. */
const IGNITE_INTENSITY = 55;
/** Intensity a burning, fuelled tile gains each tick. */
const GROWTH = 6;
/** Intensity lost each tick once a tile's fuel is gone (burnt out). */
const NO_FUEL_DECAY = 12;
/** Intensity removed each tick at full fire-station coverage. */
const SUPPRESS_MAX = 15;
/** A fire only spreads to neighbours once this established. */
const SPREAD_THRESHOLD = 120;
/** Per-neighbour chance per tick that an established fire spreads. */
const SPREAD_CHANCE = 0.05;
/** A fire only damages its building above this intensity. */
const DESTROY_THRESHOLD = 165;
/** Per-tick chance an intense fire knocks the building down a level. */
const DESTROY_CHANCE = 0.05;
/** Minimum ticks between "fire broke out" toasts. */
const NOTICE_COOLDOWN = 60;
/** Chance an igniting industrial tile erupts into an explosion instead. */
const EXPLOSION_CHANCE = 0.18;
/** Intensity an industrial explosion starts at — far past a normal ignition. */
const EXPLOSION_INTENSITY = 175;

// --- Earthquake ------------------------------------------------------------
/** Per-tick chance an earthquake strikes the city. Deliberately very rare. */
const EARTHQUAKE_CHANCE = 0.000004;
/** Radius of an earthquake's damage disc, in tiles. */
const QUAKE_RADIUS = 5;
/** Peak chance per tile that the quake knocks a building down a level. */
const QUAKE_DAMAGE_CHANCE = 0.55;
/** Peak chance per tile that the quake sparks a fire. */
const QUAKE_FIRE_CHANCE = 0.16;

// --- Tornado ---------------------------------------------------------------
const TORNADO_CHANCE = 0.000002;
const TORNADO_MIN_LEN = 20;
const TORNADO_MAX_LEN = 40;
/** Half-width of the damaged swath either side of the path centreline. */
const TORNADO_HALFWIDTH = 1;
const TORNADO_DAMAGE_CHANCE = 0.55;
const TORNADO_FIRE_CHANCE = 0.1;
/**
 * Ticks a recorded tornado path lives before the sim drops it. Must cover the
 * renderer's full travel + linger animation (TornadoRenderer: 30 + 8 ticks).
 */
const TORNADO_PATH_TTL = 38;

// --- Meteor ----------------------------------------------------------------
const METEOR_CHANCE = 0.0000015;
const METEOR_RADIUS = 2;
const METEOR_DAMAGE_CHANCE = 0.95;
const METEOR_FIRE_CHANCE = 0.7;

// --- Lightning -------------------------------------------------------------
const LIGHTNING_CHANCE = 0.000005;
const LIGHTNING_MIN_STRIKES = 4;
const LIGHTNING_MAX_STRIKES = 10;

// --- Tsunami ---------------------------------------------------------------
const TSUNAMI_CHANCE = 0.000001;
/** Flood reaches up to this many elevation tiers above sea level. */
const TSUNAMI_REACH = 1;
const TSUNAMI_DAMAGE_CHANCE = 0.4;
const FLOOD_DECAY = 4;

// --- Riot ------------------------------------------------------------------
const RIOT_SPAWN_CHANCE = 0.000001;
const RIOT_INTENSITY = 200;
const RIOT_GROWTH = 6;
const RIOT_DECAY = 4;
const RIOT_SUPPRESS_MAX = 14;
const RIOT_SPREAD_THRESHOLD = 130;
const RIOT_SPREAD_CHANCE = 0.04;
const RIOT_DESTROY_THRESHOLD = 150;
const RIOT_DESTROY_CHANCE = 0.025;

// --- Plane crash -----------------------------------------------------------
const PLANE_CRASH_CHANCE = 0.000001;
const PLANE_RADIUS = 1;
const PLANE_DAMAGE_CHANCE = 1.0;
const PLANE_FIRE_CHANCE = 0.8;

const DAMAGE_DIRTY =
  Dirty.Power | Dirty.Water | Dirty.Zone |
  Dirty.Utility | Dirty.LandValue | Dirty.Coverage;

/**
 * Random disasters — fires, earthquakes, tornadoes, meteors, lightning storms,
 * tsunamis, riots, and plane crashes. Each disaster can be toggled off or have
 * its base rate scaled by `DisasterSettings`. All public `triggerX` methods
 * are safe to call directly from the UI's god-mode panel via the
 * `trigger-disaster` command.
 *
 * Deterministic — all randomness draws from `World`'s shared `Random`.
 */
export class DisasterSystem {
  private lastNotice = -Infinity;
  private settings: DisasterSettings;

  constructor(
    private readonly random: Random,
    private readonly events: GameEventBus,
    settings: DisasterSettings = DEFAULT_DISASTER_SETTINGS,
  ) {
    this.settings = settings;
  }

  /** Reset incident state — call when the city is replaced (new / load). */
  clear(): void {
    this.lastNotice = -Infinity;
  }

  setSettings(settings: DisasterSettings): void {
    this.settings = settings;
  }

  getSettings(): DisasterSettings {
    return this.settings;
  }

  update(city: CityData, tick: number): void {
    const { grid } = city;
    const freq = Math.max(0, this.settings.frequency);
    const on = this.settings.enabled;
    let destroyed = false;

    // Drop an expired tornado path once its visual has run its course. Owning
    // this here keeps the renderer a read-only consumer of sim state.
    if (city.tornadoPath && tick - city.tornadoPath.spawnedAt > TORNADO_PATH_TTL) {
      city.tornadoPath = null;
    }

    // 0a. Rare random disasters. Each obeys its own enabled flag.
    if (on.earthquake && this.random.chance(EARTHQUAKE_CHANCE * freq)) {
      if (this.triggerEarthquake(city)) destroyed = true;
    }
    if (on.tornado && this.random.chance(TORNADO_CHANCE * freq)) {
      if (this.triggerTornado(city, tick)) destroyed = true;
    }
    if (on.meteor && this.random.chance(METEOR_CHANCE * freq)) {
      if (this.triggerMeteor(city)) destroyed = true;
    }
    if (on.lightning && this.random.chance(LIGHTNING_CHANCE * freq)) {
      this.triggerLightning(city);
    }
    if (on.tsunami && this.random.chance(TSUNAMI_CHANCE * freq)) {
      if (this.triggerTsunami(city)) destroyed = true;
    }
    if (on.planeCrash && this.random.chance(PLANE_CRASH_CHANCE * freq)) {
      if (this.triggerPlaneCrash(city)) destroyed = true;
    }

    // 1. Burn, spread and damage. The burning set is snapshotted so a fire
    //    spread this tick does not cascade again within the same tick.
    const burning: number[] = [];
    for (let i = 0; i < grid.size; i++) {
      if (city.fire[i] > 0) burning.push(i);
    }
    for (const i of burning) {
      const fuelled = hasFuel(city, i);
      const suppress = (SUPPRESS_MAX * city.fireCoverage[i]) / 255;
      const intensity = city.fire[i] + (fuelled ? GROWTH : -NO_FUEL_DECAY) - suppress;

      if (fuelled && intensity >= DESTROY_THRESHOLD && this.random.chance(DESTROY_CHANCE)) {
        if (damage(city, i)) destroyed = true;
      }
      if (intensity >= SPREAD_THRESHOLD) {
        grid.forEachNeighbor4(grid.x(i), grid.y(i), (_x, _y, ni) => {
          if (city.fire[ni] > 0 || !hasFuel(city, ni)) return;
          const resist = city.fireCoverage[ni] / 255;
          if (this.random.chance(SPREAD_CHANCE * (1 - resist))) {
            city.fire[ni] = IGNITE_INTENSITY;
          }
        });
      }
      city.fire[i] = Math.max(0, Math.min(255, intensity));
    }

    // 2. Spontaneous ignition on flammable tiles that are not already alight.
    if (on.fire) {
      for (let i = 0; i < grid.size; i++) {
        if (city.fire[i] > 0 || !hasFuel(city, i)) continue;
        let risk = IGNITE_RISK * freq;
        if (city.zone[i] === Zone.Industrial) risk *= INDUSTRIAL_RISK_MULT;
        risk *= 1 - city.fireCoverage[i] / 255;
        if (this.random.chance(risk)) {
          // An industrial ignition can erupt — a fierce blaze that flings fire
          // straight to its neighbours.
          if (city.zone[i] === Zone.Industrial && this.random.chance(EXPLOSION_CHANCE)) {
            city.fire[i] = EXPLOSION_INTENSITY;
            grid.forEachNeighbor4(grid.x(i), grid.y(i), (_x, _y, ni) => {
              if (city.fire[ni] === 0 && hasFuel(city, ni)) city.fire[ni] = IGNITE_INTENSITY;
            });
            this.notify(tick, "An industrial explosion has erupted!");
          } else {
            city.fire[i] = IGNITE_INTENSITY;
            this.notify(tick, "A fire has broken out!");
          }
        }
      }
    }

    // 3. Floods recede a little each tick.
    for (let i = 0; i < grid.size; i++) {
      if (city.flood[i] > 0) {
        city.flood[i] = Math.max(0, city.flood[i] - FLOOD_DECAY);
      }
    }

    // 4. Riots — spread, damage, decay. Mirrors fire but suppressed by police.
    if (on.riot) {
      if (this.updateRiots(city, tick)) destroyed = true;
      if (this.maybeIgniteRiot(city, tick, freq)) {
        // notice already emitted by helper
      }
    } else {
      // Even with riots disabled, existing riot intensity must decay so a
      // mid-game disable doesn't leave permanent markers.
      for (let i = 0; i < grid.size; i++) {
        if (city.riot[i] > 0) city.riot[i] = Math.max(0, city.riot[i] - RIOT_DECAY);
      }
    }

    if (destroyed) {
      city.markDirty(DAMAGE_DIRTY);
      this.events.emit("buildings:changed", undefined);
      this.events.emit("utilities:changed", undefined);
    }
  }

  // --- Earthquake ----------------------------------------------------------

  /**
   * Strike the city with an earthquake: pick an epicentre, then damage
   * buildings and spark fires across a disc that falls off with distance.
   */
  triggerEarthquake(city: CityData): boolean {
    const { grid } = city;
    const cx = this.random.int(grid.width);
    const cy = this.random.int(grid.height);
    const destroyed = this.radialStrike(
      city, cx, cy, QUAKE_RADIUS, QUAKE_DAMAGE_CHANCE, QUAKE_FIRE_CHANCE,
    );
    this.events.emit("disaster:earthquake", { x: cx, y: cy });
    this.events.emit("notice", { level: "warn", message: "An earthquake has struck the city!" });
    if (destroyed) city.markDirty(DAMAGE_DIRTY);
    return destroyed;
  }

  // --- Tornado -------------------------------------------------------------

  /**
   * Spawn a tornado at the map edge and walk it across the city, damaging a
   * 3-tile-wide swath. Returns true if any building was knocked down.
   */
  triggerTornado(city: CityData, tick: number): boolean {
    const { grid } = city;
    const len = TORNADO_MIN_LEN +
      this.random.int(TORNADO_MAX_LEN - TORNADO_MIN_LEN + 1);

    // Pick a random edge tile, then a heading roughly toward the opposite side.
    const edge = this.random.int(4);
    let x: number, y: number, dx: number, dy: number;
    if (edge === 0) { // top → walk down
      x = this.random.int(grid.width); y = 0; dx = this.random.range(-0.5, 0.5); dy = 1;
    } else if (edge === 1) { // bottom → walk up
      x = this.random.int(grid.width); y = grid.height - 1; dx = this.random.range(-0.5, 0.5); dy = -1;
    } else if (edge === 2) { // left → walk right
      x = 0; y = this.random.int(grid.height); dx = 1; dy = this.random.range(-0.5, 0.5);
    } else { // right → walk left
      x = grid.width - 1; y = this.random.int(grid.height); dx = -1; dy = this.random.range(-0.5, 0.5);
    }
    // Normalise the step to unit length.
    const mag = Math.hypot(dx, dy);
    dx /= mag; dy /= mag;

    const path: number[] = [];
    let destroyed = false;
    let fx = x, fy = y;
    for (let step = 0; step < len; step++) {
      const cx = Math.round(fx);
      const cy = Math.round(fy);
      if (!grid.inBounds(cx, cy)) break;
      path.push(grid.index(cx, cy));
      for (let oy = -TORNADO_HALFWIDTH; oy <= TORNADO_HALFWIDTH; oy++) {
        for (let ox = -TORNADO_HALFWIDTH; ox <= TORNADO_HALFWIDTH; ox++) {
          const tx = cx + ox, ty = cy + oy;
          if (!grid.inBounds(tx, ty)) continue;
          const i = grid.index(tx, ty);
          if (this.random.chance(TORNADO_DAMAGE_CHANCE)) {
            if (damage(city, i)) destroyed = true;
          }
          if (city.fire[i] === 0 && hasFuel(city, i) &&
              this.random.chance(TORNADO_FIRE_CHANCE)) {
            city.fire[i] = IGNITE_INTENSITY;
          }
        }
      }
      fx += dx; fy += dy;
    }
    city.tornadoPath = { tiles: path, spawnedAt: tick };
    this.events.emit("disaster:tornado", { tiles: path });
    this.events.emit("notice", { level: "warn", message: "A tornado is tearing through the city!" });
    if (destroyed) city.markDirty(DAMAGE_DIRTY);
    return destroyed;
  }

  // --- Meteor --------------------------------------------------------------

  triggerMeteor(city: CityData): boolean {
    const { grid } = city;
    const cx = this.random.int(grid.width);
    const cy = this.random.int(grid.height);
    const destroyed = this.radialStrike(
      city, cx, cy, METEOR_RADIUS, METEOR_DAMAGE_CHANCE, METEOR_FIRE_CHANCE,
    );
    this.events.emit("disaster:meteor", { x: cx, y: cy });
    this.events.emit("notice", { level: "warn", message: "A meteor has struck the city!" });
    if (destroyed) city.markDirty(DAMAGE_DIRTY);
    return destroyed;
  }

  // --- Lightning -----------------------------------------------------------

  triggerLightning(city: CityData): number {
    const { grid } = city;
    const count = LIGHTNING_MIN_STRIKES +
      this.random.int(LIGHTNING_MAX_STRIKES - LIGHTNING_MIN_STRIKES + 1);
    const struck: number[] = [];
    for (let attempts = 0; attempts < count * 8 && struck.length < count; attempts++) {
      const i = this.random.int(grid.size);
      if (city.fire[i] === 0 && hasFuel(city, i)) {
        city.fire[i] = IGNITE_INTENSITY;
        struck.push(i);
      }
    }
    this.events.emit("disaster:lightning", { tiles: struck });
    this.events.emit("notice", { level: "warn", message: "A lightning storm is striking the city!" });
    return struck.length;
  }

  // --- Tsunami -------------------------------------------------------------

  triggerTsunami(city: CityData): boolean {
    const { grid } = city;
    // Find a random water-edge tile (water adjacent to land).
    let originIdx = -1;
    for (let attempt = 0; attempt < 200; attempt++) {
      const i = this.random.int(grid.size);
      if (city.terrainType[i] !== TerrainType.Water) continue;
      let hasLandNeighbor = false;
      grid.forEachNeighbor4(grid.x(i), grid.y(i), (_x, _y, ni) => {
        if (city.terrainType[ni] !== TerrainType.Water) hasLandNeighbor = true;
      });
      if (hasLandNeighbor) { originIdx = i; break; }
    }
    if (originIdx === -1) {
      // Map has no coast — tsunami fails silently.
      return false;
    }
    const ox = grid.x(originIdx);
    const oy = grid.y(originIdx);

    // BFS flood from the origin into low-elevation land tiles.
    const queue: number[] = [originIdx];
    const visited = new Uint8Array(grid.size);
    visited[originIdx] = 1;
    let destroyed = false;
    while (queue.length > 0) {
      const i = queue.shift()!;
      const isLand = city.terrainType[i] !== TerrainType.Water;
      if (isLand) {
        city.flood[i] = 255;
        if (this.random.chance(TSUNAMI_DAMAGE_CHANCE)) {
          if (damage(city, i)) destroyed = true;
        }
      }
      grid.forEachNeighbor4(grid.x(i), grid.y(i), (_x, _y, ni) => {
        if (visited[ni]) return;
        // Spread through water freely; only spread to land below the reach line.
        const nIsLand = city.terrainType[ni] !== TerrainType.Water;
        if (nIsLand && city.elevation[ni] > TSUNAMI_REACH) return;
        visited[ni] = 1;
        queue.push(ni);
      });
    }
    this.events.emit("disaster:tsunami", { fromX: ox, fromY: oy });
    this.events.emit("notice", { level: "warn", message: "A tsunami has hit the coast!" });
    if (destroyed) city.markDirty(DAMAGE_DIRTY);
    return destroyed;
  }

  // --- Riot ----------------------------------------------------------------

  /** Grow, spread, suppress, and damage existing riots. Returns true if any
   *  building was knocked down so the caller can mark the world dirty. */
  private updateRiots(city: CityData, _tick: number): boolean {
    const { grid } = city;
    let destroyed = false;
    const active: number[] = [];
    for (let i = 0; i < grid.size; i++) {
      if (city.riot[i] > 0) active.push(i);
    }
    for (const i of active) {
      const suppress = (RIOT_SUPPRESS_MAX * city.policeCoverage[i]) / 255;
      const intensity = city.riot[i] + RIOT_GROWTH - RIOT_DECAY - suppress;
      if (intensity >= RIOT_DESTROY_THRESHOLD && this.random.chance(RIOT_DESTROY_CHANCE)) {
        if (damage(city, i)) destroyed = true;
      }
      if (intensity >= RIOT_SPREAD_THRESHOLD) {
        grid.forEachNeighbor4(grid.x(i), grid.y(i), (_x, _y, ni) => {
          if (city.riot[ni] > 0) return;
          if (city.zone[ni] === Zone.None && city.buildingId[ni] === 0) return;
          const resist = city.policeCoverage[ni] / 255;
          if (this.random.chance(RIOT_SPREAD_CHANCE * (1 - resist))) {
            city.riot[ni] = Math.floor(RIOT_INTENSITY * 0.6);
          }
        });
      }
      city.riot[i] = Math.max(0, Math.min(255, intensity));
    }
    return destroyed;
  }

  /** Spontaneously spawn a riot on a low-coverage, occupied tile. */
  private maybeIgniteRiot(city: CityData, tick: number, freq: number): boolean {
    const { grid } = city;
    let started = false;
    for (let i = 0; i < grid.size; i++) {
      if (city.riot[i] > 0) continue;
      if (city.buildingId[i] === 0 && city.zone[i] === Zone.None) continue;
      // Riots favour low-happiness commercial / residential ground —
      // approximate via low land value + light police coverage.
      const unhappy = 1 - city.landValue[i] / 255;
      const exposure = 1 - city.policeCoverage[i] / 255;
      const risk = RIOT_SPAWN_CHANCE * freq * unhappy * exposure;
      if (this.random.chance(risk)) {
        this.triggerRiotAt(city, grid.x(i), grid.y(i));
        this.notify(tick, "A riot has broken out!");
        started = true;
        return started;
      }
    }
    return started;
  }

  /** Public hook — start a riot at a specific tile. */
  triggerRiotAt(city: CityData, x: number, y: number): boolean {
    if (!city.grid.inBounds(x, y)) return false;
    const i = city.grid.index(x, y);
    city.riot[i] = RIOT_INTENSITY;
    return true;
  }

  /** Public hook — start a riot at a random eligible tile. */
  triggerRiot(city: CityData): boolean {
    const { grid } = city;
    let best = -1;
    let bestScore = -1;
    for (let attempt = 0; attempt < 64; attempt++) {
      const i = this.random.int(grid.size);
      if (city.buildingId[i] === 0 && city.zone[i] === Zone.None) continue;
      const score = (255 - city.landValue[i]) + (255 - city.policeCoverage[i]);
      if (score > bestScore) { bestScore = score; best = i; }
    }
    if (best === -1) return false;
    city.riot[best] = RIOT_INTENSITY;
    this.events.emit("notice", { level: "warn", message: "A riot has broken out!" });
    return true;
  }

  // --- Plane crash ---------------------------------------------------------

  triggerPlaneCrash(city: CityData): boolean {
    const { grid } = city;
    // Prefer an inhabited tile so the disaster has a visible bite.
    let target = -1;
    for (let attempt = 0; attempt < 64; attempt++) {
      const i = this.random.int(grid.size);
      if (city.terrainType[i] === TerrainType.Water) continue;
      if (city.zone[i] !== Zone.None || city.buildingId[i] !== 0) { target = i; break; }
      if (target === -1) target = i;
    }
    if (target === -1) target = this.random.int(grid.size);
    const cx = grid.x(target);
    const cy = grid.y(target);
    const destroyed = this.radialStrike(
      city, cx, cy, PLANE_RADIUS, PLANE_DAMAGE_CHANCE, PLANE_FIRE_CHANCE,
    );
    this.events.emit("disaster:planeCrash", { x: cx, y: cy });
    this.events.emit("notice", { level: "warn", message: "A plane has crashed in the city!" });
    if (destroyed) city.markDirty(DAMAGE_DIRTY);
    return destroyed;
  }

  // --- Helpers -------------------------------------------------------------

  /** Damage + ignite a disc of tiles falling off with distance. */
  private radialStrike(
    city: CityData,
    cx: number,
    cy: number,
    radius: number,
    damageChance: number,
    fireChance: number,
  ): boolean {
    const { grid } = city;
    let destroyed = false;
    for (let dy = -radius; dy <= radius; dy++) {
      for (let dx = -radius; dx <= radius; dx++) {
        const x = cx + dx, y = cy + dy;
        if (!grid.inBounds(x, y)) continue;
        const dist = Math.hypot(dx, dy);
        if (dist > radius) continue;
        const falloff = 1 - dist / (radius + 1);
        const i = grid.index(x, y);
        if (this.random.chance(damageChance * falloff)) {
          if (damage(city, i)) destroyed = true;
        }
        if (city.fire[i] === 0 && hasFuel(city, i) &&
          this.random.chance(fireChance * falloff)) {
          city.fire[i] = IGNITE_INTENSITY;
        }
      }
    }
    return destroyed;
  }

  /** Dispatch table for the trigger-disaster command. */
  trigger(id: DisasterId, city: CityData, tick: number): void {
    switch (id) {
      case "fire": {
        // Light a random flammable tile.
        const { grid } = city;
        for (let attempt = 0; attempt < 64; attempt++) {
          const i = this.random.int(grid.size);
          if (city.fire[i] === 0 && hasFuel(city, i)) {
            city.fire[i] = IGNITE_INTENSITY;
            this.events.emit("notice", { level: "warn", message: "A fire has broken out!" });
            return;
          }
        }
        return;
      }
      case "earthquake": this.triggerEarthquake(city); return;
      case "tornado": this.triggerTornado(city, tick); return;
      case "meteor": this.triggerMeteor(city); return;
      case "lightning": this.triggerLightning(city); return;
      case "tsunami": this.triggerTsunami(city); return;
      case "riot": this.triggerRiot(city); return;
      case "planeCrash": this.triggerPlaneCrash(city); return;
    }
  }

  private notify(tick: number, message: string): void {
    if (tick - this.lastNotice < NOTICE_COOLDOWN) return;
    this.lastNotice = tick;
    this.events.emit("notice", { level: "warn", message });
  }
}

/** True if the tile has something that can burn — a building or trees. */
function hasFuel(city: CityData, i: number): boolean {
  return city.buildLevel[i] > 0 || city.buildingId[i] !== 0 || city.trees[i] > 0;
}

/** Knock down whatever sits on a burning tile. Returns true if it changed. */
function damage(city: CityData, i: number): boolean {
  if (city.buildLevel[i] > 0) {
    city.buildLevel[i]--;
    if (city.buildLevel[i] === 0) city.buildAge[i] = 0; // razed — zone may redevelop
    city.trees[i] = 0;
    return true;
  }
  if (city.buildingId[i] !== 0) {
    city.buildingId[i] = BUILDING.None;
    city.trees[i] = 0;
    return true;
  }
  if (city.trees[i] > 0) {
    city.trees[i] = 0; // forest consumed
    return true;
  }
  return false;
}
