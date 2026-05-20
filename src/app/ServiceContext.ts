import type { World } from "../sim/World";
import type { WorldRenderer } from "../render/WorldRenderer";
import type { GameLoop } from "./GameLoop";
import type { StateMachine } from "./AppState";

/**
 * Bundle of long-lived services shared across application states. Built once by
 * `App` and handed to each state so states stay thin and decoupled.
 */
export interface ServiceContext {
  readonly world: World;
  readonly renderer: WorldRenderer;
  readonly loop: GameLoop;
  readonly states: StateMachine;
}
