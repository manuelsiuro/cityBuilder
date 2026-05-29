import type { EventBus } from "../engine/EventBus";
import type { BudgetReport } from "./systems/BudgetSystem";

/**
 * Discrete events the simulation pushes to the outside world. `render/` and
 * `ui/` subscribe; the sim never reads back. Grows as later phases add systems.
 */
export type GameEventMap = {
  /** Road layer changed — renderer rebuilds road instances. */
  "roads:changed": void;
  /** Road junctions re-enumerated — renderer rebuilds traffic lights. */
  "intersections:changed": void;
  /** Zone layer changed — renderer rebuilds the zone overlay. */
  "zones:changed": void;
  /** Power lines, pipes, or structures changed — renderer rebuilds utilities. */
  "utilities:changed": void;
  /** Power flood-fill recomputed — renderer refreshes the power overlay. */
  "power:changed": void;
  /** Water flood-fill recomputed — renderer refreshes the water overlay. */
  "water:changed": void;
  /** A zoned tile developed, levelled up, or declined — rebuild buildings. */
  "buildings:changed": void;
  /** A terrain tile's elevation changed — renderer rebuilds the terrain mesh. */
  "terrain:changed": void;
  /** A new month closed — carries the budget ledger for the HUD. */
  "budget:changed": BudgetReport;
  /** A player-facing message — a rejected action, a warning, an event. */
  "notice": { level: "info" | "warn"; message: string };
  /** Service-building coverage recomputed — renderer refreshes the overlay. */
  "coverage:changed": void;
  /** A tornado has spawned — renderer plays the funnel animation along the path. */
  "disaster:tornado": { tiles: number[] };
  /** A meteor has impacted — renderer plays the falling rock + flash. */
  "disaster:meteor": { x: number; y: number };
  /** An earthquake has struck — renderer shakes the camera and cracks the ground. */
  "disaster:earthquake": { x: number; y: number };
  /** A tsunami has begun — renderer plays the advancing wavefront. */
  "disaster:tsunami": { fromX: number; fromY: number };
  /** A plane has crashed — renderer plays the diving plane + flash. */
  "disaster:planeCrash": { x: number; y: number };
  /** A lightning storm dropped bolts on these tiles this tick. */
  "disaster:lightning": { tiles: number[] };
};

export type GameEventBus = EventBus<GameEventMap>;
