import type { World } from "../sim/World";
import type { WorldRenderer } from "../render/WorldRenderer";
import type { GameLoop } from "./GameLoop";
import type { StateMachine } from "./AppState";

/**
 * Bundle of long-lived services shared across application states. Built once by
 * `App` and handed to each state so states stay thin and decoupled.
 */
export interface ServiceContext {
  /** The active city. Replaced when a new game starts or a save is loaded. */
  world: World;
  readonly renderer: WorldRenderer;
  readonly loop: GameLoop;
  readonly states: StateMachine;
}
