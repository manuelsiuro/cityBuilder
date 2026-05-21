/**
 * Application state machine: `boot → mainMenu → playing`, plus the read-only
 * `sandbox` and `traffic-sandbox` states.
 *
 * Each state can hook the two clocks: `onSimTick` (fixed timestep) and
 * `onRenderFrame` (variable). `enter`/`exit` bracket the state's lifetime.
 */
export interface GameStateHandler {
  readonly name: string;
  enter?(): void;
  exit?(): void;
  onSimTick?(tickMs: number): void;
  onRenderFrame?(dtMs: number, alpha: number): void;
}

export class StateMachine {
  private current?: GameStateHandler;

  transitionTo(next: GameStateHandler): void {
    this.current?.exit?.();
    this.current = next;
    this.current.enter?.();
  }

  onSimTick(tickMs: number): void {
    this.current?.onSimTick?.(tickMs);
  }

  onRenderFrame(dtMs: number, alpha: number): void {
    this.current?.onRenderFrame?.(dtMs, alpha);
  }

  get currentName(): string {
    return this.current?.name ?? "none";
  }
}
