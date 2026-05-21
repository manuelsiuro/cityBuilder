import { Application, Assets, Container, Text, type Texture } from "pixi.js";
import { ToolPalette, type ToolIcons } from "./components/ToolPalette";
import { MainMenu } from "./components/MainMenu";
import { OverlayButton, type OverlayChoice } from "./components/OverlayButton";
import { RciWidget } from "./components/RciWidget";
import { BudgetBar } from "./components/BudgetBar";
import { SystemBar, type SystemAction, type SystemIcons } from "./components/SystemBar";
import { Minimap } from "./components/Minimap";
import { Notifications } from "./components/Notifications";
import { SelectionReadout } from "./components/SelectionReadout";
import { TileInspector, type TileInfo } from "./components/TileInspector";
import { RadioPlayer } from "./components/RadioPlayer";
import type { RadioService } from "../radio/RadioService";
import type { Tool } from "../input/ToolController";
import type { BudgetReport } from "../sim/systems/BudgetSystem";
import type { CityData } from "../sim/CityData";
import type { MapSettings } from "../sim/MapSettings";

export interface UICallbacks {
  onSelectTool: (tool: Tool) => void;
  onOverlayChange: (mode: OverlayChoice) => void;
  onSystemAction: (action: SystemAction) => void;
  /** New City requested from the main menu, with chosen map settings. */
  onNewCity: (settings: MapSettings) => void;
  /** Load City requested from the main menu, for the given save slot. */
  onLoadCity: (slot: number) => void;
  /** List the save slots that currently hold a city. */
  listSlots: () => Promise<number[]>;
}

/**
 * The PixiJS v8 HUD. Runs on its own click-through canvas stacked above the
 * Three.js world canvas; the input system owns all listeners and asks the HUD
 * to hit-test. Hosts the tool palette, overlay/system buttons, budget, RCI
 * gauge, minimap, notifications and the pause banner.
 */
export class UIApp {
  private app?: Application;
  /** Holds every in-game HUD widget; hidden while the main menu is up. */
  private readonly hud = new Container();
  private palette?: ToolPalette;
  private overlay?: OverlayButton;
  private rci?: RciWidget;
  private budget?: BudgetBar;
  private system?: SystemBar;
  private minimap?: Minimap;
  private notifications?: Notifications;
  private selectionReadout?: SelectionReadout;
  private inspector?: TileInspector;
  private radio?: RadioPlayer;
  private pauseBanner?: Text;
  private menu?: MainMenu;

  async init(cb: UICallbacks, radio: RadioService): Promise<void> {
    const app = new Application();
    await app.init({
      resizeTo: window,
      backgroundAlpha: 0,
      antialias: true,
      resolution: Math.min(window.devicePixelRatio, 2),
      autoDensity: true,
    });
    this.app = app;

    const canvas = app.canvas;
    canvas.id = "ui";
    canvas.style.position = "fixed";
    canvas.style.inset = "0";
    canvas.style.pointerEvents = "none";
    canvas.style.zIndex = "5";
    document.body.appendChild(canvas);

    this.palette = new ToolPalette(cb.onSelectTool, await loadToolIcons());
    this.overlay = new OverlayButton(cb.onOverlayChange);
    this.system = new SystemBar(cb.onSystemAction, await loadSystemIcons());
    this.rci = new RciWidget();
    this.budget = new BudgetBar(await loadOptionalTexture("coin"));
    this.notifications = new Notifications();
    this.selectionReadout = new SelectionReadout();
    this.inspector = new TileInspector();
    this.radio = new RadioPlayer(radio);
    this.pauseBanner = new Text({
      text: "PAUSED",
      style: {
        fill: 0xffffff,
        fontSize: 46,
        fontFamily: "ui-sans-serif, system-ui, sans-serif",
        fontWeight: "800",
      },
    });
    this.pauseBanner.anchor.set(0.5);
    this.pauseBanner.alpha = 0.5;
    this.pauseBanner.visible = false;

    // In-game HUD — built now, but hidden until a city starts. The minimap is
    // added later by `onGameStart` once the map dimensions are known.
    this.hud.addChild(
      this.palette.container,
      this.overlay.container,
      this.system.container,
      this.rci.container,
      this.budget.container,
      this.notifications.container,
      this.selectionReadout.container,
      this.inspector.container,
      this.radio.container,
      this.pauseBanner,
    );
    this.hud.visible = false;

    this.menu = new MainMenu(
      { onNewCity: cb.onNewCity, onLoadCity: cb.onLoadCity },
      cb.listSlots,
    );

    app.stage.addChild(this.hud, this.menu.container);
    canvas.style.pointerEvents = "auto"; // the menu needs pointer input
    this.layout();
    window.addEventListener("resize", this.onResize);
    app.ticker.add((t) => this.notifications?.update(t.deltaMS));
  }

  /**
   * Reveal the HUD for a freshly-started city. Builds the minimap at the map's
   * dimensions and hides the main menu.
   */
  onGameStart(mapW: number, mapH: number): void {
    this.minimap?.container.destroy({ children: true });
    this.minimap = new Minimap(mapW, mapH);
    this.hud.addChildAt(this.minimap.container, 0);
    this.hud.visible = true;
    if (this.menu) this.menu.container.visible = false;
    if (this.app) this.app.canvas.style.pointerEvents = "none";
    this.layout();
  }

  /** Return to the main menu, hiding the HUD. */
  showMenu(): void {
    this.hud.visible = false;
    if (this.menu) this.menu.container.visible = true;
    if (this.app) this.app.canvas.style.pointerEvents = "auto";
    this.layout();
  }

  /** True if a press at `(x, y)` lands on a HUD widget (input should ignore it). */
  handlePress(x: number, y: number): boolean {
    return (
      this.radio?.handlePress(x, y) === true ||
      this.palette?.hitTest(x, y) != null ||
      this.overlay?.hitTest(x, y) === true ||
      this.system?.hitTest(x, y) === true ||
      this.inspector?.hitTest(x, y) === true
    );
  }

  /** Update the tool tooltip as the pointer hovers the HUD. */
  handleHover(x: number, y: number): void {
    this.palette?.handleHover(x, y);
  }

  /** Route a drag to the radio volume slider. Returns true if it consumed it. */
  handleDrag(x: number, y: number): boolean {
    return this.radio?.handleDrag(x, y) === true;
  }

  /** Notify widgets that the pointer was released (ends a slider drag). */
  handleRelease(): void {
    this.radio?.handleRelease();
  }

  /** Activate the widget under a tap. Returns true if one was hit. */
  handleTap(x: number, y: number): boolean {
    if (this.inspector?.closeHitTest(x, y)) {
      this.inspector.hide();
      return true;
    }
    if (this.inspector?.hitTest(x, y)) return true;
    if (this.radio?.handleTap(x, y)) return true;
    const tool = this.palette?.hitTest(x, y);
    if (tool) {
      this.palette?.select(tool);
      return true;
    }
    if (this.overlay?.hitTest(x, y)) {
      this.overlay.cycle();
      return true;
    }
    return this.system?.activate(x, y) ?? false;
  }

  setActiveTool(tool: Tool): void {
    this.palette?.setActive(tool);
  }

  /** Select a tool as if its palette button were clicked (keyboard shortcut). */
  chooseTool(tool: Tool): void {
    this.palette?.select(tool);
  }

  /** Populate and reveal the tile-inspector panel. */
  showTileInfo(info: TileInfo): void {
    this.inspector?.show(info);
  }

  /** Hide the tile-inspector panel. */
  hideTileInfo(): void {
    this.inspector?.hide();
  }

  /** Show the live tile-count / cost readout for a rubber-band selection. */
  setSelectionReadout(tiles: number, cost: number | null, affordable: boolean): void {
    this.selectionReadout?.show(tiles, cost, affordable);
  }

  clearSelectionReadout(): void {
    this.selectionReadout?.hide();
  }

  setDemand(r: number, c: number, i: number): void {
    this.rci?.update(r, c, i);
  }

  setFunds(funds: number): void {
    this.budget?.setFunds(funds);
  }

  setBudget(report: BudgetReport): void {
    this.budget?.setReport(report);
  }

  updateMinimap(city: CityData, dtMs: number): void {
    this.minimap?.update(city, dtMs);
  }

  notify(text: string, level: "info" | "warn" = "info"): void {
    this.notifications?.push(text, level);
  }

  setPaused(paused: boolean): void {
    if (this.pauseBanner) this.pauseBanner.visible = paused;
  }

  dispose(): void {
    window.removeEventListener("resize", this.onResize);
    this.app?.destroy(true, { children: true });
  }

  private layout(): void {
    if (!this.app) return;
    const { width, height } = this.app.screen;
    this.palette?.layout(width, height);
    this.overlay?.layout(width);
    this.system?.layout(width);
    this.rci?.layout(width, height);
    this.budget?.layout(width);
    this.minimap?.layout(width, height);
    this.notifications?.layout();
    this.selectionReadout?.layout(width);
    this.inspector?.layout(width, height);
    this.radio?.layout();
    this.pauseBanner?.position.set(width / 2, height / 2 - 40);
    this.menu?.layout(width, height);
  }

  private onResize = (): void => this.layout();
}

/** Tools whose glyphs live in `public/assets/icons/<tool>.png`. */
const ICON_TOOLS: Tool[] = [
  "inspect", "road", "bulldoze", "raiseTerrain", "lowerTerrain",
  "zoneR", "zoneC", "zoneI",
  "powerLine", "powerPlant", "pipe", "waterPump",
];

/** Load the generated tool glyphs; a missing icon falls back to text only. */
async function loadToolIcons(): Promise<ToolIcons> {
  const icons: ToolIcons = {};
  await Promise.all(
    ICON_TOOLS.map(async (tool) => {
      try {
        icons[tool] = await Assets.load(`/assets/icons/${tool}.png`);
      } catch {
        /* no glyph — ToolPalette renders the label alone */
      }
    }),
  );
  return icons;
}

/** File names for the New / Save / Load glyphs. */
const SYSTEM_ICON_FILES: Record<SystemAction, string> = {
  new: "sysNew",
  save: "sysSave",
  load: "sysLoad",
};

/** Load the generated system-button glyphs; missing icons fall back to text. */
async function loadSystemIcons(): Promise<SystemIcons> {
  const icons: SystemIcons = {};
  await Promise.all(
    (Object.keys(SYSTEM_ICON_FILES) as SystemAction[]).map(async (action) => {
      try {
        icons[action] = await Assets.load(`/assets/icons/${SYSTEM_ICON_FILES[action]}.png`);
      } catch {
        /* no glyph — SystemBar renders the label alone */
      }
    }),
  );
  return icons;
}

/** Load a single glyph by name, or `undefined` if the file is missing. */
async function loadOptionalTexture(name: string): Promise<Texture | undefined> {
  try {
    return await Assets.load(`/assets/icons/${name}.png`);
  } catch {
    return undefined;
  }
}
