import type { Random } from "../../engine/Random";
import type { CityData } from "../CityData";
import type { GameEventBus } from "../events";
import { Zone } from "../layers";

/** Discrete incidents need a service vehicle dispatched to resolve them. */
export type IncidentKind = "crime" | "medical";
/** open → a vehicle is assigned → resolved (then dropped) — or it expires. */
export type IncidentState = "open" | "assigned" | "resolved";

export interface Incident {
  kind: IncidentKind;
  /** Tile index the incident sits on. */
  tile: number;
  /** Current strength, 0..255 — grows while the incident waits unattended. */
  severity: number;
  state: IncidentState;
  /** Ticks since the incident was raised. */
  age: number;
}

/** Per-eligible-tile chance per tick that a crime is reported. */
const CRIME_RISK = 0.00002;
/** Per-eligible-tile chance per tick of a medical emergency. */
const MEDICAL_RISK = 0.000012;
/** Medical risk multiplier when the city is ablaze (scaled by fire count). */
const FIRE_MEDICAL_MULT = 4;
/** Fire-tile count at which the medical multiplier saturates. */
const FIRE_SATURATION = 20;
/** Severity a fresh incident starts at. */
const CRIME_SEVERITY = 110;
const MEDICAL_SEVERITY = 130;
/** Severity gained per tick while an incident waits, open and unassigned. */
const SEVERITY_GROWTH = 0.4;
const MAX_SEVERITY = 240;
/** Ticks an unresolved incident lingers before it lapses on its own. */
const EXPIRE_AT = 1500;
/** Hard cap on simultaneous incidents — keeps the sim bounded. */
const MAX_INCIDENTS = 64;
/** Tiles a crime incident bleeds its land-value penalty across. */
const CRIME_STAMP_RADIUS = 2;
/** Minimum ticks between incident toasts of the same kind. */
const NOTICE_COOLDOWN = 90;

/**
 * Raises and ages the discrete point incidents that city services respond to —
 * crime (police) and medical emergencies (ambulances). Crime is reported in
 * populated, poorly-policed, low-value neighbourhoods; medical emergencies
 * track population and spike while the city burns. Open crime stamps a
 * land-value penalty into `city.crime`; the `DispatchSystem` resolves
 * incidents by sending vehicles. Incidents are transient — never saved.
 *
 * Deterministic — all randomness draws from `World`'s shared `Random`.
 */
export class IncidentSystem {
  private readonly _incidents: Incident[] = [];
  private lastNotice: Record<IncidentKind, number> = { crime: -Infinity, medical: -Infinity };
  /** Whether `city.crime` held any stamp last tick — drives a final clear. */
  private crimeStamped = false;

  constructor(
    private readonly random: Random,
    private readonly events: GameEventBus,
  ) {}

  /** Live incident list — read by the dispatch system and the renderer. */
  get incidents(): readonly Incident[] {
    return this._incidents;
  }

  /** Reset incident state — call when the city is replaced (new / load). */
  clear(): void {
    this._incidents.length = 0;
    this.lastNotice = { crime: -Infinity, medical: -Infinity };
    this.crimeStamped = false;
  }

  update(city: CityData, tick: number): void {
    const { grid } = city;

    // 1. Age incidents; grow unattended ones; drop resolved and lapsed ones.
    for (let k = this._incidents.length - 1; k >= 0; k--) {
      const inc = this._incidents[k];
      inc.age++;
      if (inc.state === "resolved") {
        this._incidents.splice(k, 1);
        continue;
      }
      if (inc.state === "open") {
        inc.severity = Math.min(MAX_SEVERITY, inc.severity + SEVERITY_GROWTH);
      }
      // Only an unattended incident lapses — once a vehicle is assigned, let
      // the crew finish the job.
      if (inc.age > EXPIRE_AT && inc.state === "open") {
        this._incidents.splice(k, 1);
        this.notify(
          inc.kind,
          tick,
          inc.kind === "crime"
            ? "A crime went unanswered."
            : "A medical emergency went unanswered.",
        );
      }
    }

    // 2. Count active fires — medical emergencies spike during disasters.
    let fires = 0;
    for (let i = 0; i < grid.size; i++) {
      if (city.fire[i] > 0) fires++;
    }
    const medicalMult =
      1 + (Math.min(fires, FIRE_SATURATION) / FIRE_SATURATION) * (FIRE_MEDICAL_MULT - 1);

    // 3. Raise new incidents on eligible tiles.
    if (this._incidents.length < MAX_INCIDENTS) {
      for (let i = 0; i < grid.size; i++) {
        if (city.buildLevel[i] === 0) continue;
        const zone = city.zone[i];
        if (zone !== Zone.Residential && zone !== Zone.Commercial) continue;
        if (this.occupied(i)) continue;

        // Crime: worse where policing is thin and land value is low.
        const exposure = 1 - city.policeCoverage[i] / 255;
        const decay = Math.max(0, 1.4 - city.landValue[i] / 255);
        if (this.random.chance(CRIME_RISK * exposure * decay)) {
          this.raise("crime", i, CRIME_SEVERITY, tick);
          continue;
        }
        // Medical: residential households, amplified while fires rage.
        if (zone === Zone.Residential && this.random.chance(MEDICAL_RISK * medicalMult)) {
          this.raise("medical", i, MEDICAL_SEVERITY, tick);
        }
      }
    }

    // 4. Stamp the active-crime land-value penalty layer.
    this.stampCrime(city);
  }

  /** Append an incident if its tile is free and the cap allows it. */
  private raise(kind: IncidentKind, tile: number, severity: number, tick: number): void {
    if (this._incidents.length >= MAX_INCIDENTS) return;
    this._incidents.push({ kind, tile, severity, state: "open", age: 0 });
    this.notify(
      kind,
      tick,
      kind === "crime" ? "Crime reported in the city." : "A medical emergency was called in.",
    );
  }

  /** True if an unresolved incident already sits on tile `i`. */
  private occupied(i: number): boolean {
    for (const inc of this._incidents) {
      if (inc.tile === i && inc.state !== "resolved") return true;
    }
    return false;
  }

  /** Paint a decayed disc of crime pressure for every open/assigned crime. */
  private stampCrime(city: CityData): void {
    const anyCrime = this._incidents.some((inc) => inc.kind === "crime");
    if (!anyCrime && !this.crimeStamped) return;

    city.crime.fill(0);
    const { grid } = city;
    for (const inc of this._incidents) {
      if (inc.kind !== "crime") continue;
      const cx = grid.x(inc.tile);
      const cy = grid.y(inc.tile);
      for (let dy = -CRIME_STAMP_RADIUS; dy <= CRIME_STAMP_RADIUS; dy++) {
        for (let dx = -CRIME_STAMP_RADIUS; dx <= CRIME_STAMP_RADIUS; dx++) {
          const x = cx + dx;
          const y = cy + dy;
          if (!grid.inBounds(x, y)) continue;
          const dist = Math.hypot(dx, dy);
          if (dist > CRIME_STAMP_RADIUS) continue;
          const amount = inc.severity * (1 - dist / (CRIME_STAMP_RADIUS + 1));
          const j = grid.index(x, y);
          city.crime[j] = Math.min(255, Math.max(city.crime[j], amount));
        }
      }
    }
    this.crimeStamped = anyCrime;
  }

  private notify(kind: IncidentKind, tick: number, message: string): void {
    if (tick - this.lastNotice[kind] < NOTICE_COOLDOWN) return;
    this.lastNotice[kind] = tick;
    this.events.emit("notice", { level: "warn", message });
  }
}
