---
name: citybuilder-buildings
description: "Catalogue of everything required to add a new building or city service to this SimCity-style city builder. Use when adding a placeable structure (fire station, police station, park, hospital, school), a service with a coverage radius, a random incident/disaster mechanic, or a dispatched service vehicle (fire truck, ambulance). Covers the building registry, procedural geometry, the ?sandbox 3D-model gallery, tools, toolbar buttons/icons, budget upkeep, save-file impact, coverage systems, and tests. Triggers on: new building, fire station, service building, coverage area, incident, disaster, fire truck, place building, toolbar button, building type."
---

# CityBuilder — Adding Buildings & City Services

A checklist-driven guide to extending the city builder with new buildings. Every
touchpoint is listed so nothing is missed and `npm run typecheck` + `npm test`
stay green.

Read `docs/plan/ARCHITECTURE.md` for the big picture. The layering rule is
absolute: **`sim/` never imports `render/`, `ui/`, `input/`, `three`, or
`pixi.js`.** Buildings span all layers, so respect the boundary at every step.

## 1. Pick the building category

The codebase has two completely separate building code paths. Identify which one
you are adding before touching anything.

| Category | What it is | Examples | Identified by |
|----------|-----------|----------|---------------|
| **Zone building** | Auto-grown by `DevelopmentSystem` on zoned land | houses, towers, factories | `zone[i] != None`, `buildingId[i] == 0`, `buildLevel[i] > 0` |
| **Placed structure** | Player clicks to place it; costs money | power plant, water pump, **fire station, police, park, hospital** | `buildingId[i] > 0`, `zone[i] == None`, `buildLevel[i] == 0` |

A tile is **mutually exclusive** — it holds a zone building *or* a placed
structure, never both (`commands.ts` enforces this).

New city services (fire stations, etc.) are almost always **placed structures**.
That is the path documented below. New zone-building *looks* are a rarer,
purely-cosmetic change — see "Zone building variants" at the end.

## 2. Master checklist — a placed structure

This is the baseline: a building the player places, that costs money and upkeep.
Power plant / water pump are the reference implementations — grep for
`WaterPump` to see every site you must touch.

| # | File | Change |
|---|------|--------|
| 1 | `src/sim/buildings.ts` | Add an id to the `BUILDING` enum and **append** a `BuildingDef` to `DEFS` |
| 2 | `src/render/UtilityRenderer.ts` | Add a `xxxGeometry()` builder, an `InstancedMesh`, and a place-branch in `rebuild()` |
| 3 | `src/render/SandboxGallery.ts` | Add the model to the `?sandbox` 3D-model preview gallery |
| 4 | `src/input/ToolController.ts` | Add to the `Tool` union, to `POINT_TOOLS`, and a `toCommand()` case |
| 5 | `src/ui/components/ToolPalette.ts` | Add an entry to the `TOOLS` array |
| 6 | `src/ui/UIApp.ts` | Add the tool name to `ICON_TOOLS` |
| 7 | `public/assets/icons/<tool>.png` | Add the toolbar icon (see §4) |
| 8 | `src/sim/systems/BudgetSystem.ts` | Add an `UPKEEP` entry and a maintenance-loop branch |
| 9 | `tests/` | Cover placement cost in `commands.test.ts`; upkeep in `BudgetSystem.test.ts` |

**No change needed** in `commands.ts` (the `placeBuilding` command is generic),
`App.ts` (tool wiring is generic), or `src/save/` (see §5) — unless the building
adds a coverage area or incidents (§6, §7).

### Step 1 — register the building (`src/sim/buildings.ts`)

```ts
export const BUILDING = {
  None: 0,
  PowerPlant: 1,
  WaterPump: 2,
  FireStation: 3,   // append — ids must stay contiguous
} as const;
```

**Gotcha:** `buildingDef(id)` is `DEFS[id]` — an **array index**. New ids must be
contiguous and `DEFS` entries appended **in the same order** as the enum.

Append the matching `DEFS` entry (`id`, `name`, `cost`, `powerOutput`/
`waterOutput` — `0` for a consumer, render colours). A service building with
`powerOutput: 0` is automatically treated as a power *consumer* by `PowerSystem`
(`consumes()` returns true for any `buildingId != 0` that is not a source), so it
draws power and water like a zone building — no extra wiring.

If the building has behaviour beyond cost/upkeep (a coverage radius, a service
range), add a predicate next to `isPowerSource` / `isWaterSource`.

### Step 2 — geometry & rendering (`src/render/UtilityRenderer.ts`)

Placed structures render through `UtilityRenderer`, **not** `BuildingInstances`
(that one is only for grown zone buildings — it skips any tile with
`buildingId != 0`).

- Write a `fireStationGeometry(): THREE.BufferGeometry` using `MeshBuilder`
  (`box`/`cyl`/`ico`/`gable`, flat-shaded vertex colours — no textures). Model it
  on `plantGeometry()` / `pumpGeometry()`. Export it (the `?sandbox` gallery
  imports these).
- Add an `InstancedMesh` field; create it in the constructor sized to `max`.
- In `rebuild()`, add `else if (city.buildingId[i] === BUILDING.FireStation)` →
  `place(...)`, and a `finalize(...)` call.

Rebuild is already triggered: placing a structure marks `Dirty.Utility`, `World`
emits `utilities:changed`, and `App` calls `renderer.rebuildUtilities()`.

### Step 3 — sandbox preview (`src/render/SandboxGallery.ts`)

The `?sandbox` route renders a labelled gallery of **every 3D model in the
game** — it is the catalogue for visually checking models in isolation. A new
model must be added or it silently goes missing from that preview.

In `SandboxGallery.build()`, add an entry to the `extras` array:

```ts
{ geo: fireStationGeometry(), name: "Fire Station", lift: 0 },
```

`geo` is the exported geometry builder from step 2, `name` is the label, `lift`
is the Y offset (use `0` for ground-standing structures; vehicles use a small
lift). The gallery lays `extras` out on a grid automatically — no layout maths
needed. Import the builder at the top of the file alongside `plantGeometry` etc.

Zone-building *variants* need no gallery edit — the gallery already loops every
`zone × level × variant` and picks up a raised `BUILDING_VARIANTS` automatically.

Verify by loading `http://localhost:5173/?sandbox` (use the `visual-feedback-loop`
skill for a screenshot).

### Step 4 — the tool (`src/input/ToolController.ts`)

```ts
export type Tool = | ... | "fireStation";
const POINT_TOOLS = new Set<Tool>(["powerPlant", "waterPump", "fireStation"]);
// in toCommand():
case "fireStation":
  return { type: "placeBuilding", x, y, building: BUILDING.FireStation };
```

`POINT_TOOLS` membership means one click places one structure (a drag does not
paint a line). The generic `placeBuilding` command already validates: not on
water, road, or an occupied tile, and enough `funds`.

### Steps 5–7 — toolbar button & icon

- `ToolPalette.ts` → add `{ tool: "fireStation", label: "Fire", group: N, accent: 0x... }`
  to `TOOLS`. `group` controls visual grouping; `accent` is the active-border colour.
- `UIApp.ts` → add `"fireStation"` to `ICON_TOOLS` so the PNG is loaded.
- Icon file: `public/assets/icons/fireStation.png` (filename = tool name). If the
  PNG is missing the button still works, label-only. Generate icons with the
  `game-icon-prompt` + `local-image` skills for a cohesive HUD style.

### Step 8 — upkeep (`src/sim/systems/BudgetSystem.ts`)

Add to the `UPKEEP` object and add a branch to the per-tile maintenance loop.
Mind the existing `if / else if` chain on `buildingId`.

### Step 9 — tests

Headless Vitest. Add a placement-cost case (funds deducted, `buildingId` set,
rejected on water/road/occupied) and an upkeep case. Run `npm test` (suite must
stay fully green) and `npm run typecheck`.

## 3. Beyond the baseline

Most real services need more than placement. Each adds a self-contained layer on
top of the §2 checklist — see the reference files:

- **Coverage area** (a protection/service radius, like a fire station's reach) —
  a new computed layer, `Dirty` flag, simulation system, event, and map overlay.
  → `references/coverage-systems.md`
- **Incidents / disasters** (fires breaking out, needing response) — a new
  system using the deterministic RNG, building damage, events, HUD alerts, and a
  **save-schema decision**. → `references/incidents.md`
- **Service vehicles** (fire trucks, ambulances dispatched to incidents) — a new
  agent type extending the `TrafficSystem` / `CarRenderer` model.
  → `references/service-vehicles.md`

## 4. Save-file impact — decide deliberately

| You added… | Save change |
|------------|-------------|
| A new building id (in `buildingId`) | **None** — `buildingId` is already a persisted `Uint16Array` |
| A new *computed* layer (recomputed each tick, e.g. coverage) | **None** — computed layers are never saved |
| A new *persistent* layer (state that must survive save/load, e.g. an in-progress fire) | **Schema bump** — new field in `src/save/schema.ts`, version `+1`, a migration step in `migrations.ts`, and load/save wiring in `SaveSystem.ts` + `World.restore()` |

Default to a computed layer. Only persist state that genuinely cannot be
re-derived on load.

## 5. Gotchas

- **`buildingDef` is index-based** — keep `BUILDING` ids contiguous, append `DEFS`
  in order.
- **`sim/` purity** — no `three`/`pixi`/`render` imports in simulation code; the
  sim talks out only via `EventBus`, and `ui`/`input` talk in only via
  `CommandQueue`.
- **Determinism** — any randomness (incidents, growth) must use `World`'s shared
  `Random`; never `Math.random()`. The sim must stay headless-testable.
- **Dirty flags gate cost** — a new system should early-out unless its `Dirty`
  flag is set; mark that flag from `commands.ts` when relevant tiles change.
- **Two render paths** — `BuildingInstances` (zone buildings) vs `UtilityRenderer`
  (placed structures). Putting a structure in the wrong one makes it invisible or
  doubled.
- **Keep it green** — `npm run typecheck` clean and `npm test` (the full suite)
  passing is the definition of done; see `docs/plan/PHASES.md`.

## Zone building variants (cosmetic only)

To add a new *look* for grown R/C/I buildings, edit
`src/render/meshlib/buildingFactory.ts`: archetypes are keyed
`zone × level × variant`, with `BUILDING_VARIANTS` variants each. Add an
archetype branch in `createBuildingGeometry()`; if you raise `BUILDING_VARIANTS`,
`BuildingInstances` picks it up automatically (it sizes itself from that
constant). This needs no sim, tool, or save change — it is purely visual.
