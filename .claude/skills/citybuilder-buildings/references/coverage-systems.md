# Coverage Areas & Simulation Systems

How to give a building an area of effect — a fire station's protection radius, a
park's happiness boost, a police station's safety range. This sits on top of the
placed-structure checklist in `SKILL.md` §2.

A coverage area is a **computed layer** filled each tick by a **simulation
system**, gated by a **dirty flag**, and usually shown through a **map overlay**.

## The pattern, end to end

### 1. Computed layer — `src/sim/CityData.ts`

Add a `Uint8Array` field next to `powered` / `watered` / `landValue`. Create it
in the constructor (`new Uint8Array(n)`) and add it to the `reset()` layer list.
Computed layers are recomputed every tick and are **not saved** — no schema
change.

```ts
/** Fire-station coverage strength per tile, 0..255. Recomputed each tick. */
readonly fireCoverage: Uint8Array;
```

### 2. Dirty flag — `src/sim/layers.ts`

Add the next bit to the `Dirty` object:

```ts
export const Dirty = {
  Terrain: 1 << 0,
  // …
  Utility: 1 << 6,
  Fire: 1 << 7,   // fire station placed/removed
} as const;
```

In `src/sim/commands.ts`, the `placeBuilding` and `bulldoze` cases must
`city.markDirty(Dirty.Fire)` when the affected building is a fire station, so
the system recomputes. (Power plants already mark `Dirty.Power | Dirty.Water |
Dirty.Utility` — follow that.)

### 3. The system — `src/sim/systems/FireCoverageSystem.ts` (new)

Model it on `PowerSystem` (dirty-gated, emits an event) and on
`LandValueSystem`'s pollution radius (square scan + Euclidean distance decay):

```ts
export class FireCoverageSystem {
  constructor(private readonly events: GameEventBus) {}

  update(city: CityData): void {
    if (!city.isDirty(Dirty.Fire)) return;          // early-out — cheap on most ticks
    const { grid } = city;
    city.fireCoverage.fill(0);                      // clear the computed layer

    for (let i = 0; i < grid.size; i++) {
      if (city.buildingId[i] !== BUILDING.FireStation) continue;
      const cx = grid.x(i), cy = grid.y(i);
      for (let dy = -RADIUS; dy <= RADIUS; dy++) {
        for (let dx = -RADIUS; dx <= RADIUS; dx++) {
          const x = cx + dx, y = cy + dy;
          if (!grid.inBounds(x, y)) continue;
          const dist = Math.hypot(dx, dy);
          if (dist > RADIUS) continue;
          const amount = STRENGTH * (1 - dist / RADIUS);   // linear falloff
          const j = grid.index(x, y);
          city.fireCoverage[j] = Math.min(255, Math.max(city.fireCoverage[j], amount));
        }
      }
    }
    city.clearDirty(Dirty.Fire);
    this.events.emit("fireCoverage:changed", undefined);
  }
}
```

Two spreading models exist in the codebase — pick the right one:

- **Radius / distance-decay** (`LandValueSystem` pollution & water bonus) — an
  effect that radiates through open space regardless of roads. Use for fire,
  police, parks, scenic value.
- **Flood-fill** (`PowerSystem`, `WaterSystem`) — an effect that only travels
  along a network (power lines, pipes, roads). Use when coverage must follow
  infrastructure. `grid.forEachNeighbor4` + a stack is the idiom.

### 4. Event — `src/sim/events.ts`

Add `"fireCoverage:changed": void` to `GameEventMap`. Systems emit after they
finish; `render`/`ui` subscribe.

### 5. Wire into the tick — `src/sim/World.ts`

Construct the system in the `World` constructor and call it in `tick()`. Coverage
recompute is cheap (dirty-gated) so it can run **every tick** alongside
`powerSystem` / `waterSystem`; it does not need the `SLOW_TICKS` block.

```ts
this.fireCoverageSystem.update(this.city);
```

Also expose anything the renderer needs (e.g. a getter), keeping `sim` free of
render imports.

### 6. Map overlay — `src/render/`

Coverage is invisible without a way to see it. The power/water overlays are the
template:

- `WorldRenderer` already owns a `networkOverlay` (`TileOverlay`) and an
  `OverlayMode` union (`"off" | "power" | "water"`). Add `"fire"` to the union
  and a `fireColor: TileColorFn` that maps `city.fireCoverage[i]` to a colour
  (null = don't tint).
- `App` subscribes to `fireCoverage:changed` → `renderer.refreshOverlay(...)`.
- Add an overlay toggle button in the `ui/` overlay control so the player can
  switch to the fire view.

### 7. Consume the coverage

A coverage layer only matters if something reads it. `DevelopmentSystem` reads
`powered`/`watered` to decide if a tile is serviced — fire coverage is read by
the incident system (see `incidents.md`) to lower fire risk, and could also feed
`LandValueSystem` (well-protected land is worth more).

## Tests

Add `tests/FireCoverageSystem.test.ts`. Headless: build a `CityData`, place a
station, `markDirty(Dirty.Fire)`, run `update`, assert the layer is strongest at
the source, decays with distance, and is zero out of range. Mirror
`tests/PowerSystem.test.ts`.

## Checklist

- [ ] `CityData` — computed layer added to constructor + `reset()`
- [ ] `layers.ts` — new `Dirty` flag
- [ ] `commands.ts` — marks the flag on place / bulldoze
- [ ] new system file, modelled on `PowerSystem` + `LandValueSystem`
- [ ] `events.ts` — new event
- [ ] `World` — system constructed and called in `tick()`
- [ ] overlay colour fn + `OverlayMode` + UI toggle
- [ ] test file
- [ ] `npm run typecheck` + `npm test` green
