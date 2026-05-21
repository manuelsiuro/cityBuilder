import { World } from "../sim/World";
import { WorldRenderer } from "../render/WorldRenderer";
import { SandboxGallery } from "../render/SandboxGallery";
import { buildTrafficSandbox } from "./trafficSandbox";
import { Picker } from "../render/Picker";
import { Input } from "../input/Input";
import { ToolController } from "../input/ToolController";
import { UIApp } from "../ui/UIApp";
import { SaveSystem } from "../save/SaveSystem";
import { Sfx } from "../engine/Sfx";
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
  private readonly tools: ToolController;
  private readonly ui = new UIApp();
  private readonly save = new SaveSystem();
  private readonly sfx = new Sfx();

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
    const { world, renderer } = this.ctx;
    renderer.buildCity(world.city);

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
      if (report.net < 0) this.ui.notify(`Monthly deficit: −$${Math.abs(report.net)}`);
    });

    await this.ui.init(world.city.grid.width, world.city.grid.height, {
      onSelectTool: (tool) => {
        this.tools.activeTool = tool;
        this.sfx.click();
      },
      onOverlayChange: (mode) => {
        renderer.setOverlayMode(mode, world.city);
        this.sfx.click();
      },
      onSystemAction: (action) => this.handleSystemAction(action),
    });
    this.ctx.states.transitionTo(this.createPlayingState());
    this.ctx.loop.start();
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
      this.uiCaptured = false;
    });

    ev.on("drag", ({ dx, dy, x, y }) => {
      if (this.uiCaptured) return;
      if (this.tools.isBuilding) {
        this.paintAt(x, y);
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
      if (tile && this.tools.isBuilding) this.paintAt(x, y);
    });

    ev.on("hover", ({ x, y }) => {
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

  /** Sim-speed debug controls — full settings UI arrives in a later phase. */
  private onKeyDown = (e: KeyboardEvent): void => {
    const { loop } = this.ctx;
    switch (e.code) {
      case "Space":
        loop.speedMultiplier = loop.speedMultiplier === 0 ? 1 : 0;
        break;
      case "Digit1":
        loop.speedMultiplier = 1;
        break;
      case "Digit2":
        loop.speedMultiplier = 2;
        break;
      case "Digit3":
        loop.speedMultiplier = 3;
        break;
    }
  };

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
    this.ui.dispose();
    this.sandboxButton?.remove();
    this.ctx.renderer.dispose();
  }
}
