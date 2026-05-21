import { World } from "../sim/World";
import {
  DEFAULT_MAP_SETTINGS,
  MAP_SIZES,
  type MapSettings,
  type MapSizeId,
} from "../sim/MapSettings";
import { WorldRenderer } from "../render/WorldRenderer";
import { SandboxGallery } from "../render/SandboxGallery";
import { buildTrafficSandbox } from "./trafficSandbox";
import { Picker } from "../render/Picker";
import { Input } from "../input/Input";
import { ToolController, type Tool } from "../input/ToolController";
import { COST } from "../sim/commands";
import { Biome, TerrainType, Zone } from "../sim/layers";
import { buildingDef } from "../sim/buildings";
import { UIApp } from "../ui/UIApp";
import { toolForKey } from "../ui/components/ToolPalette";
import type { TileInfoRow } from "../ui/components/TileInspector";
import { SaveSystem } from "../save/SaveSystem";
import { Sfx } from "../engine/Sfx";
import { RadioService } from "../radio/RadioService";
import { GameLoop } from "./GameLoop";
import { StateMachine, type GameStateHandler } from "./AppState";
import type { ServiceContext } from "./ServiceContext";
import type { SystemAction } from "../ui/components/SystemBar";

/** Keyboard pan speed, in pixel-equivalents per second. */
const KEY_PAN_SPEED = 780;

/**
 * Composition root. Builds the long-lived services, wires the two clocks of
 * `GameLoop` into the state machine, routes input to the camera / build tools,
 * and drives the debug HUD.
 */
export class App {
  private readonly ctx: ServiceContext;
  private readonly hud: HTMLElement | null;
  /** Rebuilt whenever the active world is replaced (new game / load). */
  private tools: ToolController;
  private readonly ui = new UIApp();
  private readonly save = new SaveSystem();
  private readonly sfx = new Sfx();
  private readonly radio = new RadioService();

  private input?: Input;
  private picker?: Picker;
  private hoverTile: { x: number; y: number } | null = null;
  private uiCaptured = false;
  /**
   * `?sandbox` value: `null` = normal game, `"traffic"` = live traffic
   * sandbox, anything else = the read-only model gallery.
   */
  private readonly sandboxMode = new URLSearchParams(window.location.search).get("sandbox");
  private sandboxButton?: HTMLButtonElement;

  private get sandbox(): boolean {
    return this.sandboxMode !== null;
  }

  constructor(mount: HTMLElement) {
    const world = new World(Date.now() >>> 0);
    const renderer = new WorldRenderer(mount);
    const states = new StateMachine();
    const loop = new GameLoop({
      onTick: (tickMs) => states.onSimTick(tickMs),
      onRender: (dtMs, alpha) => {
        states.onRenderFrame(dtMs, alpha);
        this.updateHud();
      },
    });

    this.ctx = { world, renderer, loop, states };
    this.tools = new ToolController(world.commands);
    this.hud = document.getElementById("debug");

    // Dev-only inspection handle for the visual feedback loop.
    if (import.meta.env.DEV) {
      (globalThis as unknown as { world: World }).world = world;
    }

    window.addEventListener("resize", this.onResize);
    window.addEventListener("keydown", this.onKeyDown);
  }

  async start(): Promise<void> {
    if (this.sandboxMode === "traffic") {
      this.startTrafficSandbox();
      return;
    }
    if (this.sandbox) {
      this.startSandbox();
      return;
    }
    const { renderer } = this.ctx;
    await this.ui.init({
      onSelectTool: (tool) => {
        this.tools.activeTool = tool;
        if (tool !== "inspect") this.ui.hideTileInfo();
        this.sfx.click();
      },
      onOverlayChange: (mode) => {
        renderer.setOverlayMode(mode, this.ctx.world.city);
        this.sfx.click();
      },
      onSystemAction: (action) => this.handleSystemAction(action),
      onNewCity: (settings) => this.beginGame(settings),
      onLoadCity: (slot) => this.loadGame(slot),
      listSlots: () => this.save.slots(),
    }, this.radio);
    this.ctx.states.transitionTo(this.createMainMenuState());
    this.ctx.loop.start();
  }

  /** Idle state shown at boot: the menu drives input; the world just renders. */
  private createMainMenuState(): GameStateHandler {
    const { renderer } = this.ctx;
    return {
      name: "mainMenu",
      onRenderFrame: () => renderer.render(),
    };
  }

  /** Start a brand-new city from the chosen map settings. */
  private beginGame(settings: MapSettings): void {
    this.enterPlaying(new World(settings));
    this.ui.notify("New city founded");
    this.sfx.confirm();
  }

  /** Load a saved city from `slot` into a correctly-sized world, then play. */
  private loadGame(slot: number): void {
    this.save
      .load(slot)
      .then((file) => {
        if (!file) {
          this.ui.notify("That save slot is empty");
          return;
        }
        const world = new World({
          ...DEFAULT_MAP_SETTINGS,
          seed: file.seed,
          size: sizeForWidth(file.width),
        });
        world.restore(file);
        this.enterPlaying(world);
        this.ui.notify("City loaded");
        this.sfx.confirm();
      })
      .catch(() => this.ui.notify("Load failed"));
  }

  /** Swap in `world`, build its scene, wire events, and enter the playing state. */
  private enterPlaying(world: World): void {
    const { renderer } = this.ctx;
    this.ctx.world = world;
    this.tools = new ToolController(world.commands);
    if (import.meta.env.DEV) {
      (globalThis as unknown as { world: World }).world = world;
    }
    renderer.buildCity(world.city);
    this.wireWorldEvents(world);
    this.ui.onGameStart(world.city.grid.width, world.city.grid.height);
    this.ctx.states.transitionTo(this.createPlayingState());
  }

  /** Wire the simulation's events to renderer rebuilds and HUD updates. */
  private wireWorldEvents(world: World): void {
    const { renderer } = this.ctx;
    const ev = world.events;
    ev.on("roads:changed", () => renderer.rebuildRoads(world.city));
    ev.on("intersections:changed", () =>
      renderer.rebuildTrafficLights(world.city, world.intersections),
    );
    ev.on("zones:changed", () => renderer.rebuildZones(world.city));
    ev.on("utilities:changed", () => renderer.rebuildUtilities(world.city));
    ev.on("power:changed", () => renderer.refreshOverlay(world.city, "power"));
    ev.on("water:changed", () => renderer.refreshOverlay(world.city, "water"));
    ev.on("buildings:changed", () => renderer.rebuildBuildings(world.city));
    ev.on("terrain:changed", () => renderer.rebuildTerrain(world.city));
    ev.on("budget:changed", (report) => {
      this.ui.setBudget(report);
      if (report.net < 0) this.ui.notify(`Monthly deficit: −$${Math.abs(report.net)}`, "warn");
    });
    ev.on("notice", ({ level, message }) => this.ui.notify(message, level));
    ev.on("coverage:changed", () => {
      renderer.refreshOverlay(world.city, "police");
      renderer.refreshOverlay(world.city, "fire");
    });
  }

  private createPlayingState(): GameStateHandler {
    const { world, renderer } = this.ctx;
    return {
      name: "playing",
      enter: () => {
        const terrain = renderer.terrainObject;
        if (!terrain) throw new Error("terrain not built before playing state");
        this.input = new Input(renderer.canvas);
        this.picker = new Picker(renderer.camera, terrain, world.city);
        this.wireInput();
      },
      onSimTick: (tickMs) => world.tick(tickMs),
      onRenderFrame: (dtMs, alpha) => {
        this.applyKeyboardPan(dtMs);
        this.ui.setDemand(world.city.demandR, world.city.demandC, world.city.demandI);
        this.ui.setFunds(world.city.funds);
        this.ui.setPaused(this.ctx.loop.speedMultiplier === 0);
        this.ui.updateMinimap(world.city, dtMs);
        renderer.updateCars(world.cars, world.city, alpha);
        renderer.updateTrafficLights(world.tickCount);
        renderer.update(dtMs);
        renderer.render();
      },
    };
  }

  /** Build the read-only model gallery and run it under a minimal state. */
  private startSandbox(): void {
    const { renderer } = this.ctx;
    const gallery = new SandboxGallery();
    const ext = gallery.build(renderer.scene);
    renderer.isoCamera.setMapExtent(ext.halfW, ext.halfH);
    renderer.isoCamera.zoomBy(0.65);
    this.addLabelToggle(gallery);
    this.ctx.states.transitionTo(this.createSandboxState());
    this.ctx.loop.start();
  }

  /** A floating button that shows or hides the gallery's model labels. */
  private addLabelToggle(gallery: SandboxGallery): void {
    const btn = document.createElement("button");
    btn.textContent = "Hide labels";
    btn.style.cssText =
      "position:fixed;top:12px;right:12px;z-index:10;padding:8px 14px;" +
      "font:600 13px ui-sans-serif,system-ui,sans-serif;color:#eef2f6;" +
      "background:#222833;border:2px solid #2c333f;border-radius:8px;cursor:pointer;";
    let visible = true;
    btn.addEventListener("click", () => {
      visible = !visible;
      gallery.setLabelsVisible(visible);
      btn.textContent = visible ? "Hide labels" : "Show labels";
    });
    document.body.appendChild(btn);
    this.sandboxButton = btn;
  }

  /** Lay the test road grid, spawn a fixed fleet, and run the live sim. */
  private startTrafficSandbox(): void {
    const { world, renderer } = this.ctx;
    buildTrafficSandbox(world.city);
    world.setCarTargetOverride(70);
    renderer.buildCity(world.city);

    const ev = world.events;
    ev.on("roads:changed", () => renderer.rebuildRoads(world.city));
    ev.on("intersections:changed", () =>
      renderer.rebuildTrafficLights(world.city, world.intersections),
    );
    renderer.isoCamera.zoomBy(0.5);

    this.ctx.states.transitionTo(this.createTrafficSandboxState());
    this.ctx.loop.start();
  }

  /** Live-simulation state for the traffic sandbox — camera-only input. */
  private createTrafficSandboxState(): GameStateHandler {
    const { world, renderer } = this.ctx;
    return {
      name: "traffic-sandbox",
      enter: () => {
        this.input = new Input(renderer.canvas);
        this.wireSandboxInput();
      },
      onSimTick: (tickMs) => world.tick(tickMs),
      onRenderFrame: (dtMs, alpha) => {
        this.applyKeyboardPan(dtMs);
        renderer.updateCars(world.cars, world.city, alpha);
        renderer.updateTrafficLights(world.tickCount);
        renderer.update(dtMs);
        renderer.render();
      },
    };
  }

  private createSandboxState(): GameStateHandler {
    const { renderer } = this.ctx;
    return {
      name: "sandbox",
      enter: () => {
        this.input = new Input(renderer.canvas);
        this.wireSandboxInput();
      },
      onRenderFrame: (dtMs) => {
        this.applyKeyboardPan(dtMs);
        renderer.update(dtMs);
        renderer.render();
      },
    };
  }

  /** Camera-only input for the gallery: pan, zoom, rotate — no tools, no UI. */
  private wireSandboxInput(): void {
    if (!this.input) return;
    const { renderer } = this.ctx;
    const ev = this.input.events;
    ev.on("drag", ({ dx, dy }) => renderer.isoCamera.panByPixels(dx, dy));
    ev.on("zoom", ({ factor }) => renderer.isoCamera.zoomBy(factor));
    ev.on("rotate", ({ dir }) => renderer.isoCamera.rotate(dir));
  }

  private wireInput(): void {
    if (!this.input) return;
    const { renderer } = this.ctx;
    const ev = this.input.events;

    ev.on("press", ({ x, y }) => {
      this.uiCaptured = this.ui.handlePress(x, y);
      if (this.uiCaptured) return;
      if (this.tools.isBuilding) {
        this.tools.beginStroke();
        this.paintAt(x, y);
      }
    });

    ev.on("release", () => {
      if (!this.uiCaptured && this.tools.isBuilding) {
        this.tools.commitStroke(this.ctx.world.city.grid);
        if (this.tools.isRectTool()) {
          renderer.clearRectHighlight();
          this.ui.clearSelectionReadout();
        }
      }
      this.uiCaptured = false;
      this.ui.handleRelease();
    });

    ev.on("drag", ({ dx, dy, x, y }) => {
      if (this.uiCaptured) {
        this.ui.handleDrag(x, y);
        return;
      }
      if (this.tools.isBuilding) {
        this.paintAt(x, y);
        if (this.tools.isRectTool()) this.updateRectPreview();
      } else {
        renderer.isoCamera.panByPixels(dx, dy);
      }
    });

    ev.on("tap", ({ x, y }) => {
      // The UI hit-tests itself — `release` fires before `tap`, so we can't
      // rely on the `uiCaptured` flag here.
      if (this.ui.handleTap(x, y)) return;
      const tile = this.pickTile(x, y);
      this.hoverTile = tile;
      renderer.setHighlight(tile);
      // Rect tools apply on press+release; a tap must not paint a second time.
      if (tile && this.tools.isBuilding && !this.tools.isRectTool()) {
        this.paintAt(x, y);
      } else if (tile && this.tools.activeTool === "inspect") {
        this.showTileDetails(tile);
      }
    });

    ev.on("hover", ({ x, y }) => {
      this.ui.handleHover(x, y);
      this.hoverTile = this.pickTile(x, y);
      renderer.setHighlight(this.hoverTile);
    });

    ev.on("zoom", ({ factor }) => renderer.isoCamera.zoomBy(factor));
    ev.on("rotate", ({ dir }) => renderer.isoCamera.rotate(dir));
  }

  /** Handle New / Save / Load from the system bar. */
  private handleSystemAction(action: SystemAction): void {
    const { world, renderer } = this.ctx;
    if (action === "new") {
      world.reset((Date.now() ^ Math.floor(Math.random() * 0xffffff)) >>> 0);
      renderer.rebuildAll(world.city);
      this.ui.notify("New city founded");
      this.sfx.confirm();
      return;
    }
    if (action === "save") {
      this.save
        .save(world, 0, "City")
        .then(() => {
          this.ui.notify("City saved");
          this.sfx.confirm();
        })
        .catch(() => this.ui.notify("Save failed"));
      return;
    }
    // load
    this.save
      .load(0)
      .then((file) => {
        if (!file) {
          this.ui.notify("No saved city found");
          return;
        }
        // A save with a different map size needs a fresh, resized world —
        // restoring in place would mismatch the typed-array layers.
        if (file.width !== world.city.grid.width) {
          this.ui.notify("Different map size — load it from the main menu");
          return;
        }
        world.restore(file);
        renderer.rebuildAll(world.city);
        this.ui.notify("City loaded");
        this.sfx.confirm();
      })
      .catch(() => this.ui.notify("Load failed"));
  }

  private paintAt(clientX: number, clientY: number): void {
    const tile = this.pickTile(clientX, clientY);
    if (tile) this.tools.paint(tile.x, tile.y, this.ctx.world.city.grid);
  }

  /** Refresh the rectangle highlight and cost readout while a rect drag is live. */
  private updateRectPreview(): void {
    const { renderer, world } = this.ctx;
    const rect = this.tools.pendingRect;
    if (!rect) {
      renderer.clearRectHighlight();
      this.ui.clearSelectionReadout();
      return;
    }
    const tiles = (rect.x1 - rect.x0 + 1) * (rect.y1 - rect.y0 + 1);
    const unit = rectUnitCost(this.tools.activeTool);
    const cost = unit === null ? null : unit * tiles;
    renderer.setRectHighlight(rect, world.city);
    this.ui.setSelectionReadout(tiles, cost, cost === null || cost <= world.city.funds);
  }

  private pickTile(clientX: number, clientY: number): { x: number; y: number } | null {
    if (!this.picker) return null;
    const rect = this.ctx.renderer.canvas.getBoundingClientRect();
    return this.picker.pick(clientX, clientY, rect);
  }

  private applyKeyboardPan(dtMs: number): void {
    if (!this.input) return;
    const axis = this.input.panAxis();
    if (axis.x === 0 && axis.y === 0) return;
    const amount = (KEY_PAN_SPEED * dtMs) / 1000;
    this.ctx.renderer.isoCamera.panByPixels(-axis.x * amount, -axis.y * amount);
  }

  private onResize = (): void => {
    this.ctx.renderer.resize();
  };

  /**
   * Keyboard: digits 1–3 set sim speed, Space toggles pause, and a letter key
   * selects each build tool (see `ToolPalette` for the mapping).
   */
  private onKeyDown = (e: KeyboardEvent): void => {
    const { loop } = this.ctx;
    switch (e.code) {
      case "Space":
        loop.speedMultiplier = loop.speedMultiplier === 0 ? 1 : 0;
        return;
      case "Digit1":
        loop.speedMultiplier = 1;
        return;
      case "Digit2":
        loop.speedMultiplier = 2;
        return;
      case "Digit3":
        loop.speedMultiplier = 3;
        return;
    }
    // Tool shortcuts — only while a city is in play, never with a modifier.
    if (this.picker && !e.ctrlKey && !e.metaKey && !e.altKey) {
      const tool = toolForKey(e.code);
      if (tool) this.ui.chooseTool(tool);
    }
  };

  /** Read a tile's facts from `CityData` and show them in the inspector panel. */
  private showTileDetails(tile: { x: number; y: number }): void {
    const c = this.ctx.world.city;
    const i = c.grid.index(tile.x, tile.y);
    const yes = 0x6fcf7f;
    const no = 0xc0606a;
    const rows: TileInfoRow[] = [
      { label: "Terrain", value: TERRAIN_NAME[c.terrainType[i]] ?? "—" },
      { label: "Biome", value: BIOME_NAME[c.biome[i]] ?? "—" },
      { label: "Elevation", value: String(c.elevation[i]) },
    ];
    if (c.buildingId[i] !== 0) {
      rows.push({ label: "Building", value: buildingDef(c.buildingId[i]).name });
    } else if (c.zone[i] !== Zone.None) {
      rows.push({ label: "Zone", value: ZONE_NAME[c.zone[i]] ?? "—" });
      rows.push({
        label: "Development",
        value: c.buildLevel[i] > 0 ? `Level ${c.buildLevel[i]}` : "Vacant",
      });
    } else {
      rows.push({ label: "Surface", value: c.road[i] ? "Road" : "Unzoned" });
    }
    rows.push(
      { label: "Power", value: c.powered[i] ? "Connected" : "None",
        accent: c.powered[i] ? yes : no },
      { label: "Water", value: c.watered[i] ? "Connected" : "None",
        accent: c.watered[i] ? yes : no },
      { label: "Land value", value: String(c.landValue[i]) },
      { label: "Pollution", value: String(c.pollution[i]),
        accent: c.pollution[i] > 80 ? no : undefined },
      { label: "Police", value: coverageLabel(c.policeCoverage[i]) },
      { label: "Fire cover", value: coverageLabel(c.fireCoverage[i]) },
    );
    this.ui.showTileInfo({ title: `Tile ${tile.x}, ${tile.y}`, rows });
  }

  private updateHud(): void {
    if (!this.hud) return;
    if (this.sandboxMode === "traffic") {
      const { loop, world } = this.ctx;
      const active = world.cars.reduce((n, c) => n + (c.active ? 1 : 0), 0);
      this.hud.textContent =
        `Traffic sandbox · ${loop.fps.toFixed(0)} fps · ${active} cars · ` +
        "drag to pan · scroll to zoom";
      return;
    }
    if (this.sandbox) {
      this.hud.textContent = "Sandbox gallery — drag to pan · scroll to zoom · rotate to spin";
      return;
    }
    const { loop, world } = this.ctx;
    const speed = loop.speedMultiplier === 0 ? "paused" : `${loop.speedMultiplier}×`;
    const tile = this.hoverTile ? ` · tile ${this.hoverTile.x},${this.hoverTile.y}` : "";
    this.hud.textContent =
      `${loop.fps.toFixed(0)} fps · ${speed} · ${this.tools.activeTool} · ` +
      `pop ${world.city.population} · ${world.dateLabel}${tile}`;
  }

  /** Tear down — releases listeners and GPU resources. */
  dispose(): void {
    this.ctx.loop.stop();
    window.removeEventListener("resize", this.onResize);
    window.removeEventListener("keydown", this.onKeyDown);
    this.input?.dispose();
    this.radio.stop();
    this.ui.dispose();
    this.sandboxButton?.remove();
    this.ctx.renderer.dispose();
  }
}

/** Map a saved map width back to its `MapSizeId` (defaults to medium). */
function sizeForWidth(width: number): MapSizeId {
  for (const id of Object.keys(MAP_SIZES) as MapSizeId[]) {
    if (MAP_SIZES[id] === width) return id;
  }
  return "medium";
}

/** Display names for the tile-inspector panel. */
const TERRAIN_NAME: Record<number, string> = {
  [TerrainType.Grass]: "Grassland",
  [TerrainType.Water]: "Water",
  [TerrainType.Rock]: "Rock",
};
const BIOME_NAME: Record<number, string> = {
  [Biome.Plains]: "Plains",
  [Biome.Ocean]: "Ocean",
  [Biome.Beach]: "Beach",
  [Biome.Forest]: "Forest",
  [Biome.Desert]: "Desert",
  [Biome.Tundra]: "Tundra",
  [Biome.Snow]: "Snow",
  [Biome.Mountain]: "Mountain",
};
const ZONE_NAME: Record<number, string> = {
  [Zone.Residential]: "Residential",
  [Zone.Commercial]: "Commercial",
  [Zone.Industrial]: "Industrial",
};

/** Bucket a 0–255 coverage strength into a readable inspector label. */
function coverageLabel(strength: number): string {
  if (strength === 0) return "None";
  if (strength < 90) return "Low";
  if (strength < 170) return "Medium";
  return "High";
}

/** Per-tile cost for a rect tool's readout, or null for tools that charge nothing. */
function rectUnitCost(tool: Tool): number | null {
  switch (tool) {
    case "zoneR":
    case "zoneC":
    case "zoneI":
      return COST.zone;
    case "raiseTerrain":
      return COST.raiseTerrain;
    case "lowerTerrain":
      return COST.lowerTerrain;
    default:
      return null;
  }
}
