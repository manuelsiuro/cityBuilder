# CLAUDE.md

Behavioral guidelines to reduce common LLM coding mistakes. Merge with project-specific instructions as needed.

**Tradeoff:** These guidelines bias toward caution over speed. For trivial tasks, use judgment.

## 1. Think Before Coding

**Don't assume. Don't hide confusion. Surface tradeoffs.**

Before implementing:
- State your assumptions explicitly. If uncertain, ask.
- If multiple interpretations exist, present them - don't pick silently.
- If a simpler approach exists, say so. Push back when warranted.
- If something is unclear, stop. Name what's confusing. Ask.

## 2. Simplicity First

**Minimum code that solves the problem. Nothing speculative.**

- No features beyond what was asked.
- No abstractions for single-use code.
- No "flexibility" or "configurability" that wasn't requested.
- No error handling for impossible scenarios.
- If you write 200 lines and it could be 50, rewrite it.

Ask yourself: "Would a senior engineer say this is overcomplicated?" If yes, simplify.

## 3. Surgical Changes

**Touch only what you must. Clean up only your own mess.**

When editing existing code:
- Don't "improve" adjacent code, comments, or formatting.
- Don't refactor things that aren't broken.
- Match existing style, even if you'd do it differently.
- If you notice unrelated dead code, mention it - don't delete it.

When your changes create orphans:
- Remove imports/variables/functions that YOUR changes made unused.
- Don't remove pre-existing dead code unless asked.

The test: Every changed line should trace directly to the user's request.

## 4. Goal-Driven Execution

**Define success criteria. Loop until verified.**

Transform tasks into verifiable goals:
- "Add validation" → "Write tests for invalid inputs, then make them pass"
- "Fix the bug" → "Write a test that reproduces it, then make it pass"
- "Refactor X" → "Ensure tests pass before and after"

For multi-step tasks, state a brief plan:
```
1. [Step] → verify: [check]
2. [Step] → verify: [check]
3. [Step] → verify: [check]
```

Strong success criteria let you loop independently. Weak criteria ("make it work") require constant clarification.

---

**These guidelines are working if:** fewer unnecessary changes in diffs, fewer rewrites due to overcomplication, and clarifying questions come before implementation rather than after mistakes.

---

## Project: Web-game boilerplate (Three.js + PixiJS)

**Stack:** Vite + TypeScript. `three` for 3D / WebGL scenes. `pixi.js` v8 for 2D / sprite / canvas work.

**Library selection rule:** When the user asks for 2D, sprite, canvas, or UI-overlay rendering, default to PixiJS. When they ask for a 3D scene, WebGL/WebGPU mesh work, or anything camera-and-light shaped, default to Three.js. If a single feature spans both (e.g. 2D HUD over a 3D scene), use Three.js for the world and either PixiJS in a separate canvas layer or HTML/CSS for the overlay — discuss before mixing renderers.

**Skills auto-load from `.claude/skills/`** — 10 `threejs-*`, 25 `pixijs-*`, plus `visual-feedback-loop` and `blender-mcp`. Don't restate API basics from those skills; they handle progressive disclosure.

**Game-dev agents in `.claude/agents/`:**
- `game-architect` — game loop, scene/level flow, state, save system.
- `shader-author` — GLSL / WGSL for `ShaderMaterial` and `Filter.from()`.
- `perf-profiler` — frame-rate, draw calls, GC, memory growth.
- `asset-pipeline` — GLB/PNG/atlas optimization, Blender → web workflow.

Delegate to the matching agent when a request fits its scope rather than handling it inline.

**Run:** `npm install && npm run dev` → http://localhost:5173/ · `npm test` · `npm run typecheck`

---

## Game: SimCity-style city builder

A complete SimCity-2000-style city builder (all 6 build phases done). **Reference docs:**
`docs/plan/PHASES.md` (per-phase checklist + verify results) and
`docs/plan/ARCHITECTURE.md` (full design). When extending, keep a change green:
`npm run typecheck` clean and `npm test` (89 tests) passing.

**Module layout (`src/`):**
- `engine/` — renderer-agnostic primitives (`EventBus`, `CommandQueue`, `Grid`, `Random`, `Sfx`). Imports nothing internal.
- `sim/` — the simulation: `World`, `CityData` (struct-of-arrays), `systems/` (Road, Power, Water, Traffic, RCI, Development, LandValue, Population, Budget), `pathfinding/` (`RoadGraph`, `AStar`). Renderer-free, deterministic, headless-testable.
- `render/` — Three.js world: `WorldRenderer`, terrain, instanced roads/buildings/cars, overlays. Reads `sim` **read-only**.
- `ui/` — PixiJS v8 HUD on a separate stacked canvas (`UIApp` + `components/`).
- `input/` — keyboard/pointer/touch (`Input`, `gestures`, `ToolController`).
- `save/` — IndexedDB persistence (`SaveSystem`, `schema`, `migrations`, `storage`).
- `app/` — composition root: `App`, `GameLoop`, `AppState`, `ServiceContext`.

**Layering rule (do not break):** `sim/` never imports `render/`, `ui/`, `input/`,
`three`, or `pixi.js`. `input/` + `ui/` mutate the sim **only** via `engine/CommandQueue`.
The sim notifies the outside **only** via `engine/EventBus` (push-only).

**Sim/render contract:** fixed-timestep simulation at 10 Hz (`SIM_TICK_MS = 100`)
decoupled from a variable render frame via the `GameLoop` accumulator. `CityData`
is struct-of-arrays (parallel typed arrays), not object-per-tile.

**Tests:** Vitest, headless, in `tests/`. Keep `sim/` and `engine/` covered.