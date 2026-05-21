# Incidents & Disasters

How to add a random-event mechanic — fires breaking out, crime, blackouts —
where buildings are damaged and a service must respond. **No incident system
exists yet**; this is a greenfield addition built from the existing system
patterns.

An incident has four parts: a **trigger** (when/where it starts), **state**
(tracking it while active), **damage** (what it does), and **resolution** (how it
ends). Plus a save-schema decision.

## 1. Trigger — a new system using the shared RNG

Create `src/sim/systems/IncidentSystem.ts`. It must use the **deterministic
RNG** — `World`'s shared `Random` instance, passed into the constructor. Never
`Math.random()`; the simulation must replay identically from a seed.

```ts
export class IncidentSystem {
  constructor(
    private readonly random: Random,
    private readonly events: GameEventBus,
  ) {}

  update(city: CityData, tick: number): void {
    // Per-tile fire risk, lowered by fire-station coverage (see coverage-systems.md)
    for (let i = 0; i < city.grid.size; i++) {
      if (city.buildLevel[i] === 0) continue;            // only built tiles burn
      let risk = BASE_RISK;
      if (city.zone[i] === Zone.Industrial) risk *= 2;   // industry is riskier
      risk *= 1 - city.fireCoverage[i] / 255;            // coverage mitigates
      if (this.random.chance(risk)) this.startFire(city, i);
    }
  }
}
```

`Random` API: `next()` 0..1, `int(max)`, `range(min,max)`, `chance(p)`,
`pick(arr)`. Risk per tile per tick should be tiny (e.g. `1e-5`) — there are
~16k tiles at 10 ticks/s.

Run it from `World.tick()`. A rare check can run every tick or every
`SLOW_TICKS` — match the cadence to how often incidents should appear.

## 2. State — persistent vs computed

This is the key save-file decision (see `SKILL.md` §4):

- An incident that **must survive save/load** (a fire still burning when the
  player saves) needs **persistent state** → a new layer in `CityData` *and* in
  `src/save/schema.ts`. That means: bump `CURRENT_VERSION`, add the field to
  `SaveFileV1`'s `layers`, add a `v1→v2` step in `migrations.ts` (default the new
  layer to zeros for old saves), and wire it in `SaveSystem.ts` +
  `World.restore()`.
- An incident that is **instantaneous** (damage applied immediately, nothing
  lingers) needs **no persistent state** and no schema change.

Prefer instantaneous unless the design needs fires to burn over time. If they do
burn over time, a small `Uint8Array fireState` layer (0 = none, 1..N = burn
intensity) is the cleanest persistent representation, decremented each tick by
the responding service.

## 3. Damage — mutate the source-of-truth layers

Damage is just mutation of persisted layers, then a dirty flag + event:

```ts
private startFire(city: CityData, i: number): void {
  city.buildLevel[i] = Math.max(0, city.buildLevel[i] - 1);  // knock the building down a level
  if (city.buildLevel[i] === 0) city.buildingId[i] = BUILDING.None;
  city.markDirty(Dirty.Zone);                                // renderer rebuilds buildings
  this.events.emit("incident:fire", { x: city.grid.x(i), y: city.grid.y(i) });
}
```

Severe damage = reduce `buildLevel`, or clear the tile entirely (like the
`bulldoze` command does). Always mark the matching `Dirty` flag so the renderer
rebuilds, and emit an event.

## 4. Events & player feedback — `src/sim/events.ts`

Add to `GameEventMap`, e.g. `"incident:fire": { x: number; y: number }`. The UI
subscribes and surfaces it:

- `UIApp.notify(...)` already shows transient HUD messages (used for budget
  deficits) — call it for an "A fire broke out!" toast.
- The renderer can subscribe to spawn a fire effect (particles / an emissive
  marker) at the tile and clear it on resolution.

## 5. Resolution

How an incident ends:

- **Instant** — damage applied once, done. Simplest.
- **Timed** — a persistent `fireState` layer counts down each tick; reaches 0 →
  resolved event.
- **Service-dependent** — the fire burns (and may spread to neighbours) until a
  service vehicle reaches it. This couples to `service-vehicles.md`: the truck's
  arrival sets `fireState[i] = 0`. Spreading = on each tick, a burning tile has a
  chance to ignite a `forEachNeighbor4` neighbour — the same flood pattern as
  `PowerSystem`, but probabilistic and outward over time.

## Determinism & tests

- Construct `IncidentSystem` with `world.random`; the RNG state is already saved
  (`rngState` in the schema) so incidents replay identically.
- `tests/IncidentSystem.test.ts`: seed a `Random`, build a `CityData` with known
  buildings, run many ticks, assert incidents occur at the expected rate and that
  full fire coverage suppresses them. Deterministic seeds make this exact.

## Checklist

- [ ] `IncidentSystem` using `world.random` (never `Math.random`)
- [ ] constructed in `World`, called in `tick()`
- [ ] damage mutates persisted layers + marks a `Dirty` flag
- [ ] event in `events.ts`; UI `notify` + optional renderer effect
- [ ] **save decision**: instantaneous → no schema change; lingering → schema
      bump + migration (`game-save-system` skill covers the mechanics)
- [ ] deterministic test with a fixed seed
