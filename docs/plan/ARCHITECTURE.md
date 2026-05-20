# Architecture — City Builder

A SimCity-2000-style city builder. Three.js orthographic-isometric world with
procedural instanced low-poly buildings; PixiJS v8 HUD on a separate stacked canvas.

## Layering rule (enforced by import direction)

```
engine/  ──────────────► (imported by everything, imports nothing internal)
sim/     ──► engine/                    renderer-free, deterministic, headless-testable
render/  ──► sim/ (read-only), engine/
ui/      ──► sim/ (read-only), engine/
input/   ──► engine/
app/     ──► all of the above (composition root)
```

- `sim/` never imports `render/`, `ui/`, `input/`, or `three`/`pixi.js`.
- `render/` and `ui/` read `sim` state **read-only**.
- `input/` + `ui/` mutate the sim **only** through `engine/CommandQueue`.
- `sim` notifies the outside **only** through `engine/EventBus` (push-only).

## Two clocks

- **Sim:** fixed timestep `SIM_TICK_MS = 100` (10 Hz). Accumulator-driven.
- **Render:** variable `requestAnimationFrame`; `dt` clamped to 50 ms.
- `MAX_TICKS_PER_FRAME = 5` caps catch-up to avoid the spiral of death.
- Speed (1×/2×/3×, pause = 0×) scales ticks-per-frame, not tick duration.
- PixiJS UI runs its own ticker — display only, never advances the sim.

```
frame(now):
  dt = clamp(now - last, 0, 50)
  accumulator += dt * speedMultiplier
  while accumulator >= SIM_TICK_MS && ticks < MAX_TICKS_PER_FRAME:
      world.tick(SIM_TICK_MS); accumulator -= SIM_TICK_MS
  alpha = accumulator / SIM_TICK_MS          # render interpolation factor
  renderer.render(dt, alpha)
```

## City data (Phase 1+)

Struct-of-arrays. Parallel typed arrays indexed `i = y * width + x`.
Persistent layers: `elevation`, `terrainType`, `zone`, `buildingId`, `buildLevel`,
`buildAge`, `road`, `powerLine`, `pipe`.
Per-tick computed (not saved): `powered`, `watered`, `landValue`, `pollution`,
`trafficLoad`.

## System update order (per tick, after CommandQueue drain)

Power → Water → Road → Traffic → LandValue → RCI → Development → Population → Budget.
Systems coordinate via `CityData` arrays + a dirty-flag bitset so expensive
flood-fills / graph rebuilds early-out when nothing changed.

## Channels

- **outside → sim:** `input/` + `ui/` → `CommandQueue` → drained at tick start.
- **sim → outside:** systems → `EventBus` → `render/` + `ui/` subscribe.
- **within sim:** `CityData` arrays + dirty flags; systems never call each other.

## State machine

`boot → mainMenu → playing ⇄ paused`, with save/load transitions. Leaving
`playing` disposes World + renderer GPU resources.
