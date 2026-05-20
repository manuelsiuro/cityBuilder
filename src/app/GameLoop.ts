/** Fixed simulation timestep — 10 ticks per second at 1× speed. */
export const SIM_TICK_MS = 100;

/** Catch-up cap: never run more than this many sim ticks in one render frame. */
export const MAX_TICKS_PER_FRAME = 5;

/** Wall-clock dt is clamped to this so a stalled tab can't flood the sim. */
const MAX_FRAME_MS = 50;

export interface GameLoopCallbacks {
  /** Run one fixed simulation step. `tickMs` is always `SIM_TICK_MS`. */
  onTick(tickMs: number): void;
  /**
   * Draw one frame. `alpha` (0–1) is the fraction of the next tick already
   * accumulated — use it to interpolate motion for smooth rendering.
   */
  onRender(dtMs: number, alpha: number): void;
}

/**
 * Decouples a fixed-timestep simulation from a variable-rate render frame using
 * an accumulator. `frame()` is public and time-injectable so the loop can be
 * unit-tested headlessly without `requestAnimationFrame`.
 */
export class GameLoop {
  /** 0 = paused, 1 = normal, 2/3 = fast. Scales ticks-per-frame, not tick size. */
  speedMultiplier = 1;

  private accumulator = 0;
  private lastTime = 0;
  private running = false;
  private rafId = 0;
  private fpsEMA = 0;

  constructor(private readonly cb: GameLoopCallbacks) {}

  start(): void {
    if (this.running) return;
    this.running = true;
    this.lastTime = performance.now();
    this.rafId = requestAnimationFrame(this.onRaf);
  }

  stop(): void {
    this.running = false;
    cancelAnimationFrame(this.rafId);
  }

  /** Smoothed frames-per-second, for the debug HUD. */
  get fps(): number {
    return this.fpsEMA;
  }

  private onRaf = (now: number): void => {
    if (!this.running) return;
    this.frame(now);
    this.rafId = requestAnimationFrame(this.onRaf);
  };

  /** Advance the loop to wall-clock time `now` (ms). Public for headless tests. */
  frame(now: number): void {
    let dt = now - this.lastTime;
    this.lastTime = now;
    if (dt < 0) dt = 0;
    if (dt > MAX_FRAME_MS) dt = MAX_FRAME_MS;

    const instantaneousFps = 1000 / Math.max(dt, 1);
    this.fpsEMA = this.fpsEMA === 0
      ? instantaneousFps
      : this.fpsEMA * 0.9 + instantaneousFps * 0.1;

    this.accumulator += dt * this.speedMultiplier;

    let ticks = 0;
    while (this.accumulator >= SIM_TICK_MS && ticks < MAX_TICKS_PER_FRAME) {
      this.cb.onTick(SIM_TICK_MS);
      this.accumulator -= SIM_TICK_MS;
      ticks++;
    }
    // Hit the catch-up cap: drop the backlog rather than spiral.
    if (ticks === MAX_TICKS_PER_FRAME && this.accumulator >= SIM_TICK_MS) {
      this.accumulator = 0;
    }

    const alpha = this.accumulator / SIM_TICK_MS;
    this.cb.onRender(dt, alpha);
  }
}
