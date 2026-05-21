# City Builder — Review-Driven Improvements

## Context

A full review of the city-builder (sim / render / ui / input) found the engine
is well-built — clean layering, deterministic sim, good instancing, no leaks.
The genuine weaknesses are not architecture but **feel and depth**:

1. **No action feedback.** `applyCommand` (`src/sim/commands.ts`) silently
   `return`s on every failure — no funds, occupied tile, water. The player gets
   zero signal why an action didn't happen. Clicking a tile shows nothing.
   Tool labels ("Res", "Wire", "Pump") have no tooltips and no shortcuts.
2. **Shallow simulation** for a SimCity-style game — no city services,
   no disasters; land value has few drivers.
3. **Small real code debt** — a tile-hash function copy-pasted into 4 render
   files, a `console.log` in the per-rebuild path, silently-vanishing cars.

This plan addresses all four agreed tracks. Tracks 1–3 are low-risk quick
wins; Track 4 (depth) is large and phased. Recommended execution order is
2 → 1 → 3 → 4.

Keep every change green: `npm run typecheck` clean, `npm test` passing.

---

## Track 2 — Code cleanup (do first; small, low-risk)

- **Dedupe tile hash.** `BuildingInstances.ts:127`, `RoadInstances.ts:195`,
  `TerrainMesh.ts:96`, `TreeRenderer.ts:70` hold an identical `hash(x,y)`.
  Add `hashTile(x, y)` to `src/render/constants.ts` and import it in all four.
  Keep the *current* effective constants (`Math.imul(y, 19349663)`) so
  rendered cities look identical — the `19349663 || 668265263` in the existing
  copies always evaluates to `19349663`; do not "fix" it or every city's
  building variants/colours/tree scatter shift.
- **Remove the production log.** Delete the `console.log` at
  `src/sim/systems/RoadSystem.ts:23` (runs on every road-graph rebuild).
- **(Minor) `finalizeInstanced(mesh, count)` helper** — `UtilityRenderer.ts`
  already has this pattern; export it from `constants.ts` and reuse in
  `BuildingInstances`, `RoadInstances`, `TreeRenderer`. Optional; skip if it
  causes churn.

**Verify:** `npm run typecheck` + `npm test` green; cities render unchanged.

---

## Track 1 — Action feedback & UX

### 1a. Rejection feedback (the biggest feel win)
- Change `applyCommand` (`src/sim/commands.ts`) to return a result enum
  (`Ok | NoFunds | Occupied | Water | Blocked | MaxElevation`) instead of
  `void`. Tests in `tests/commands.test.ts` still pass (return value is
  additive).
- Add a `"notice"` event to `GameEventMap` (`src/sim/events.ts`):
  `{ level: "info" | "warn"; message: string }`.
- In `World.tick()` (`src/sim/World.ts:107`), after draining commands, if any
  were rejected emit **one** throttled notice for the meaningful reasons only —
  primarily `NoFunds` → `"Not enough funds"`. Painting a road over an existing
  road (`Occupied`/`Blocked`) is normal and must stay silent. Throttle by
  suppressing a repeat of the same message within ~30 ticks (3 s) so a drag
  doesn't spam.
- In `App` (`src/app/App.ts`), subscribe to `world.events.on("notice", ...)`
  and forward to the existing `ui.notify(...)` toast feed.

### 1b. Tile inspector
- The `inspect` tool already exists as the default but does nothing on tap.
- New component `src/ui/components/TileInspector.ts` — a small panel showing
  the tapped tile's facts: terrain/biome, zone, building + level, road,
  powered/watered, land value, pollution.
- In `App`, when `toolController.activeTool === "inspect"` and a tap lands on
  the world, use the existing `Picker` to get the tile, read `world.city`
  arrays into a plain struct, and call `ui` to show the panel. UI stays
  read-only — App does the reading and passes data in.

### 1c. Tool tooltips
- Add a small hover path: `Input` emits a `hover` event on pointer move while
  not pressed; `UIApp` routes it to `ToolPalette` for hit-testing.
- `ToolPalette` renders a tooltip (tool name + cost + one-line description)
  above the hovered button. Description/cost table lives next to the existing
  tool metadata in `ToolPalette.ts`.

### 1d. Keyboard shortcuts
- Add `ToolPalette.select(tool)` public method (sets active + `refresh()`).
- In `App`, on keydown map digit/letter keys to tools (e.g. `1` inspect,
  `2` road, `3` bulldoze, `R/C/I` zones, etc.), calling `ToolPalette.select`
  and setting `toolController.activeTool`. Keep existing camera keys intact.

**Verify:** placing with insufficient funds shows one toast; clicking a tile in
inspect mode shows its panel; hovering a tool shows its tooltip; number keys
switch tools. `npm test` green.

---

## Track 3 — Traffic & balance

- **Stuck-car recovery.** `TrafficSystem.ts` currently de-spawns a car after
  `STUCK_LIMIT` (220) ticks of near-zero speed — trips vanish invisibly.
  Instead: on hitting the limit, attempt **one** A* re-route from the car's
  current tile to its destination; reset the stuck counter on success. Only
  retire the car if the re-route also fails (truly unreachable). No player
  notification — gridlock is already visible.
- **Spawn-budget scaling.** `SPAWN_BUDGET = 2` cars/tick can starve a growing
  city. Scale it modestly with target fleet size (e.g. `max(2, target/40)`)
  so the fleet reaches its target without a visible trickle.
- **Document the tuning constants.** Add explanatory comments to the magic
  numbers in `TrafficSystem.ts` (ACCEL, DECEL, HEADWAY, CARS_PER_CAPITA…),
  `IntersectionSystem.ts` (GREEN/YELLOW ticks, the `x*13+y*7` phase offset),
  and `LandValueSystem.ts` (BASE_VALUE, WATER_BONUS…). Comments only — do
  **not** retune values that have no identified problem.

**Verify:** add a `TrafficSystem` test that a car in a temporarily-blocked
route re-routes instead of disappearing; `npm test` green.

---

## Track 4 — Gameplay depth: city services & disasters (large, phased)

Follows the `citybuilder-buildings` skill. Each phase is independently
shippable and ends green.

### Phase 4A — Coverage system + Police / Fire / Park
- **Buildings:** extend `src/sim/buildings.ts` `BUILDING` + `DEFS` with
  `PoliceStation` (id 3), `FireStation` (id 4), `Park` (id 5). Add
  `serviceType`, `serviceRange`, `serviceStrength`, and a monthly `upkeep`
  field to `BuildingDef`.
- **Computed layers:** add `policeCover`, `fireCover`, `parkCover`
  `Uint8Array`s to `CityData` (per-tick computed, not saved — like
  `landValue`). Update `reset()`.
- **`src/sim/systems/CoverageSystem.ts`** — for each service building, stamp a
  distance-falloff disc into its coverage layer. Runs on the slow cadence with
  the other land-value-tier systems in `World`.
- **Land-value integration:** in `LandValueSystem`, add police + park coverage
  as positive contributors and absence-of-police as a small penalty. Keep RCI
  demand untouched — services flow into land value, which already drives
  building level. This keeps the feature cohesive, not sprawling.
- **Tools / UI:** add `police`, `fire`, `park` point-tools to
  `ToolController` (`POINT_TOOLS`), toolbar buttons + icons in `ToolPalette`,
  and coverage modes in `OverlayButton` (Police / Fire).
- **Budget:** add the three buildings' `upkeep` to `BudgetSystem`'s
  maintenance ledger.
- **Render:** procedural low-poly geometry for the three buildings in
  `buildingFactory.ts`; they render through `UtilityRenderer`/
  `BuildingInstances` (place-building path). Add them to `SandboxGallery`.
- **Save:** `buildingId` is already persisted — police/fire/park save for
  free. Coverage layers are computed, so no schema change.
- **Tests:** `CoverageSystem.test.ts` (falloff, overlap), `commands.test.ts`
  additions (place/afford/bulldoze the new buildings), `BudgetSystem` upkeep.

**Verify:** placing a police station raises land value within its radius
(visible in the land-value/coverage overlay); upkeep appears in the monthly
ledger; save→load round-trips the buildings.

### Phase 4B — Disasters (fire)
- **`fire` layer** — transient `Uint8Array` intensity in `CityData` (not
  saved; fires don't survive a reload).
- **`src/sim/systems/DisasterSystem.ts`** — random ignition on the slow
  cadence, weighted toward industrial buildings and tiles with low `fireCover`;
  fire spreads to adjacent flammable tiles (buildings, trees); `fireCover`
  reduces ignition odds and suppresses intensity each tick. A tile that burns
  out has its building destroyed (clear `buildingId`/`buildLevel`).
- Emit a `"notice"` (`warn`) on ignition — reuses the Track 1 event.
- **Render:** `src/render/FireRenderer.ts` — instanced emissive quads/icos at
  burning tiles, intensity-scaled.
- **Tests:** `DisasterSystem.test.ts` — deterministic with a fixed seed:
  ignition fires, spread reaches a neighbour, fire-station coverage suppresses
  and prevents spread.

**Verify:** in-game, an unprotected industrial district can catch fire and
spread; a nearby fire station contains it; a toast announces the fire.

---

## Critical files

| Area | Files |
|------|-------|
| Cleanup | `render/constants.ts`, `render/{BuildingInstances,RoadInstances,TerrainMesh,TreeRenderer}.ts`, `sim/systems/RoadSystem.ts` |
| Feedback | `sim/commands.ts`, `sim/events.ts`, `sim/World.ts`, `app/App.ts`, `ui/components/TileInspector.ts` (new), `ui/components/ToolPalette.ts`, `ui/UIApp.ts`, `input/Input.ts` |
| Traffic | `sim/systems/TrafficSystem.ts`, `sim/systems/IntersectionSystem.ts`, `sim/systems/LandValueSystem.ts` |
| Depth | `sim/buildings.ts`, `sim/CityData.ts`, `sim/systems/CoverageSystem.ts` (new), `sim/systems/DisasterSystem.ts` (new), `sim/systems/{LandValue,Budget}System.ts`, `input/ToolController.ts`, `ui/components/{ToolPalette,OverlayButton}.ts`, `render/meshlib/buildingFactory.ts`, `render/FireRenderer.ts` (new), `render/WorldRenderer.ts` |

## End-to-end verification

1. `npm run typecheck` — clean.
2. `npm test` — all existing 89 tests pass plus new ones
   (`CoverageSystem`, `DisasterSystem`, traffic re-route, command results).
3. `npm run dev` → http://localhost:5173/ — manual pass:
   - Build with too little money → single "Not enough funds" toast.
   - Inspect tool → click tile → info panel.
   - Hover tools → tooltips; number keys switch tools.
   - Place police/fire/park → land-value overlay reacts, upkeep in ledger.
   - Let an unprotected industrial zone burn; confirm a fire station contains it.
   - Save → New → Load restores buildings.
