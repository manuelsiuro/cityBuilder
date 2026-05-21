# Build Phases — City Builder

Source of truth for current progress. Tick each item as it lands. A phase is
**done** when its Verify line passes, `npm run typecheck` is clean, and `npm test`
is green.

Full plan: `make-a-game-for-cryptic-owl.md` (in the Claude plans dir).
Architecture: `ARCHITECTURE.md` (next to this file).

---

## Phase 0 — Skeleton & loop  ✅ done

- [x] `docs/plan/` created (PHASES.md, ARCHITECTURE.md)
- [x] `engine/EventBus.ts` — typed pub/sub (generic)
- [x] `engine/CommandQueue.ts` — generic intent queue
- [x] `app/GameLoop.ts` — fixed-timestep accumulator (10 Hz sim, variable render)
- [x] `app/AppState.ts` — state machine (boot → playing)
- [x] `app/ServiceContext.ts` — service bundle
- [x] `app/App.ts` — wires loop + states + renderer + world
- [x] `sim/World.ts` — `tick()` entry point
- [x] `sim/Tick.ts` — sim calendar (tick → date)
- [x] `render/WorldRenderer.ts` — minimal Three.js shell (ortho iso view)
- [x] `main.ts` boots `App`; hello-world scenes deleted
- [x] Vitest wired; headless tests for loop / EventBus / CommandQueue
- [x] **Verify:** stable 10 Hz tick + steady 60 fps in debug HUD; 20 tests green

> Deferred to Phase 1 (no Phase 0 use): `engine/Grid.ts`, `engine/Random.ts`, `engine/Clock.ts`.

## Phase 1 — Grid, terrain, camera  ✅ done

- [x] `sim/CityData.ts` struct-of-arrays + `sim/layers.ts`
- [x] `engine/Grid.ts`, `engine/Random.ts`
- [x] `sim/TerrainGen.ts` — smooth island terrain generator
- [x] `render/TerrainMesh.ts` stepped elevation tiers + cliff walls
- [x] `render/IsoCamera.ts` rotate/pan/zoom
- [x] `render/Picker.ts` screen → tile + hover highlight
- [x] `input/Input.ts` + `input/gestures.ts` (pinch / two-finger rotate)
- [x] **Verify:** iso terrain renders, camera pan/zoom/rotate works, tile pick + highlight; 38 tests green

## Phase 2 — Build tools & roads  ✅ done

- [x] `input/ToolController.ts` (4-connected line paint), `Command` union + queue drain in `World`
- [x] `sim/commands.ts` + `sim/events.ts` (GameEventBus)
- [x] `road` layer + `render/RoadInstances.ts` (instanced asphalt + auto-tiled markings)
- [x] `sim/systems/RoadSystem.ts` + `sim/pathfinding/RoadGraph.ts` (flood-fill networks)
- [x] `ui/UIApp.ts` (PixiJS HUD) + `ui/components/ToolPalette.ts`
- [x] **Verify:** drag-paint roads form one connected network; 53 tests green

## Phase 3 — Zoning & utilities  ✅ done

- [x] zone painting (R/C/I tools), `sim/buildings.ts` archetype registry
- [x] `sim/systems/PowerSystem.ts` flood-fill + plants + `powerLine`
- [x] `sim/systems/WaterSystem.ts` flood-fill + pumps + underground `pipe`
- [x] `render/TileOverlay.ts` (zone tint + coverage), `render/UtilityRenderer.ts`
- [x] `ui/components/OverlayButton.ts` — Off/Power/Water toggle
- [x] **Verify:** power flood-fill shows connected network green in overlay; 63 tests green

## Phase 4 — Development & population  ✅ done

- [x] `sim/development.ts` tuning + `RCISystem`, `DevelopmentSystem`, `LandValueSystem`, `PopulationSystem`
- [x] slow-cadence system pipeline in `World` (once per in-game day)
- [x] `render/BuildingInstances.ts` + `render/meshlib/buildingFactory.ts` (procedural low-poly)
- [x] `ui/components/RciWidget.ts` demand gauge
- [x] **Verify:** serviced zones grew varied buildings, population reached 288; 75 tests green

## Phase 5 — Economy & traffic  ✅ done

- [x] `BudgetSystem` (monthly taxes + maintenance ledger) + `ui/components/BudgetBar.ts`
- [x] construction costs in `commands.ts` (affordability gating)
- [x] `sim/pathfinding/AStar.ts` + `TrafficSystem` (pooled car agents, congestion)
- [x] `render/CarRenderer.ts` — instanced cars, alpha-interpolated
- [x] congestion → land-value penalty in `LandValueSystem`
- [x] **Verify:** 101 cars driving, monthly budget ledger live; 84 tests green

## Phase 6 — Persistence & polish  ✅ done

- [x] `save/` SaveSystem + IndexedDB wrapper + schema + migrations
- [x] `World.restore()` / `World.reset()` — load & new-city
- [x] `ui/components/SystemBar.ts` (New/Save/Load), pause banner
- [x] `ui/components/Minimap.ts`, `ui/components/Notifications.ts`
- [x] responsive palette scaling, `engine/Sfx.ts` (synthesized audio)
- [x] **Verify:** Save → New → Load restored the city exactly (260 roads); 89 tests green

---

## ✅ All phases complete — playable SimCity-style vertical slice.

---

## Phase 7 — Review-driven improvements  ✅ done

Follows `docs/plan/REVIEW-IMPROVEMENTS.md`.

- [x] **Cleanup:** shared `hashTile` in `render/constants.ts`; removed the
  per-rebuild `console.log` in `RoadSystem`.
- [x] **Action feedback:** `applyCommand` returns `CmdResult`; `World` emits
  throttled `notice` events → HUD toasts. New `TileInspector` panel for the
  Inspect tool. Tool tooltips + keyboard shortcuts in `ToolPalette`.
- [x] **Traffic:** gridlocked cars get one A* re-route before retiring; spawn
  budget scales with fleet size; tuning constants documented.
- [x] **City services:** `PoliceStation` / `FireStation` / `Park` placed
  structures, `CoverageSystem` computes police/fire/park coverage layers,
  land value rises with police & park reach, Police/Fire map overlays.
- [x] **Disasters:** transient `fire` layer + `DisasterSystem` (deterministic
  ignition, spread, building damage, coverage suppression) + `FireRenderer`.
- [x] **Verify:** `npm run typecheck` clean; `npm test` green (156 tests).
