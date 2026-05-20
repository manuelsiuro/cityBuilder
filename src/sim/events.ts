import type { EventBus } from "../engine/EventBus";
import type { BudgetReport } from "./systems/BudgetSystem";

/**
 * Discrete events the simulation pushes to the outside world. `render/` and
 * `ui/` subscribe; the sim never reads back. Grows as later phases add systems.
 */
export type GameEventMap = {
  /** Road layer changed — renderer rebuilds road instances. */
  "roads:changed": void;
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
  /** A new month closed — carries the budget ledger for the HUD. */
  "budget:changed": BudgetReport;
};

export type GameEventBus = EventBus<GameEventMap>;
