import { describe, it, expect } from "vitest";
import { GameLoop } from "../src/app/GameLoop";

/** Drive a loop across `frames` synthetic frames of `frameMs` each. */
function run(loop: GameLoop, frames: number, frameMs: number): void {
  let now = 0;
  loop.frame(now); // establish the time baseline
  for (let i = 0; i < frames; i++) {
    now += frameMs;
    loop.frame(now);
  }
}

describe("GameLoop", () => {
  it("runs a fixed 10 ticks per simulated second at 1x speed", () => {
    let ticks = 0;
    const loop = new GameLoop({ onTick: () => ticks++, onRender: () => {} });
    // 100 frames of 16 ms = 1600 ms of sim time -> 16 ticks of 100 ms.
    run(loop, 100, 16);
    expect(ticks).toBe(16);
  });

  it("scales ticks with the speed multiplier", () => {
    let ticks = 0;
    const loop = new GameLoop({ onTick: () => ticks++, onRender: () => {} });
    loop.speedMultiplier = 2;
    run(loop, 100, 16); // 1600 ms wall -> 3200 ms sim -> 32 ticks
    expect(ticks).toBe(32);
  });

  it("does not spiral after a long stall (clamps frame dt)", () => {
    let ticks = 0;
    const loop = new GameLoop({ onTick: () => ticks++, onRender: () => {} });
    loop.frame(0);
    loop.frame(100_000); // 100 s jump, clamped to 50 ms -> < one tick
    expect(ticks).toBe(0);
  });

  it("caps catch-up at MAX_TICKS_PER_FRAME and drops the backlog", () => {
    let ticks = 0;
    const loop = new GameLoop({ onTick: () => ticks++, onRender: () => {} });
    loop.speedMultiplier = 20; // 50 ms clamp x20 = 1000 ms of sim in one frame
    loop.frame(0);
    loop.frame(60); // dt clamped to 50 -> would be 10 ticks, capped at 5
    expect(ticks).toBe(5);
  });

  it("passes a render alpha in the 0..1 range", () => {
    let lastAlpha = -1;
    const loop = new GameLoop({
      onTick: () => {},
      onRender: (_dt, alpha) => {
        lastAlpha = alpha;
      },
    });
    run(loop, 10, 16);
    expect(lastAlpha).toBeGreaterThanOrEqual(0);
    expect(lastAlpha).toBeLessThan(1);
  });
});
