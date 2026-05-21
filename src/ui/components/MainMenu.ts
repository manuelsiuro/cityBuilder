import { Container, Graphics, Text, type FederatedPointerEvent } from "pixi.js";
import {
  DEFAULT_MAP_SETTINGS,
  MAP_SIZES,
  type MapSettings,
  type MapSizeId,
} from "../../sim/MapSettings";

const FONT = "ui-sans-serif, system-ui, sans-serif";
const PANEL_W = 460;
const PANEL_H = 520;

export interface MenuCallbacks {
  onNewCity: (settings: MapSettings) => void;
  onLoadCity: (slot: number) => void;
}

type Screen = "root" | "new" | "load";

interface SliderDef {
  key: "water" | "roughness" | "treeDensity";
  label: string;
}

const SLIDERS: SliderDef[] = [
  { key: "water", label: "Water amount" },
  { key: "roughness", label: "Terrain roughness" },
  { key: "treeDensity", label: "Tree density" },
];

const SIZE_LABELS: Record<MapSizeId, string> = {
  small: "Small",
  medium: "Medium",
  large: "Large",
};

/**
 * Full-screen main menu shown at boot. Offers New City — with a map-settings
 * panel (seed, size, water, roughness, tree density) — and Load City. Uses
 * PixiJS native pointer events; the canvas is made interactive while it shows.
 */
export class MainMenu {
  readonly container = new Container();

  private screen: Screen = "root";
  private settings: MapSettings = { ...DEFAULT_MAP_SETTINGS, seed: randomSeed() };
  private slots: number[] = [];
  private screenW = window.innerWidth;
  private screenH = window.innerHeight;

  /** Slider currently being dragged, or null. */
  private dragKey: SliderDef["key"] | null = null;

  constructor(
    private readonly cb: MenuCallbacks,
    private readonly listSlots: () => Promise<number[]>,
  ) {
    this.container.eventMode = "static";
    this.container.on("globalpointermove", this.onPointerMove);
    this.container.on("pointerup", this.endDrag);
    this.container.on("pointerupoutside", this.endDrag);
    this.render();
  }

  layout(screenW: number, screenH: number): void {
    this.screenW = screenW;
    this.screenH = screenH;
    this.render();
  }

  // --- Geometry --------------------------------------------------------

  private get panelX(): number {
    return Math.round((this.screenW - PANEL_W) / 2);
  }

  private get panelY(): number {
    return Math.round((this.screenH - PANEL_H) / 2);
  }

  private sliderTrack(index: number): { x: number; y: number; w: number } {
    return { x: this.panelX + 40, y: this.panelY + 250 + index * 64, w: PANEL_W - 80 };
  }

  // --- Rendering -------------------------------------------------------

  private render(): void {
    this.container.removeChildren().forEach((c) => c.destroy({ children: true }));

    // Dimmed full-screen backdrop.
    const backdrop = new Graphics()
      .rect(0, 0, this.screenW, this.screenH)
      .fill({ color: 0x0b0f14, alpha: 0.82 });
    this.container.addChild(backdrop);

    // Panel.
    const panel = new Graphics()
      .roundRect(this.panelX, this.panelY, PANEL_W, PANEL_H, 16)
      .fill({ color: 0x161a20, alpha: 0.98 })
      .stroke({ width: 2, color: 0x39414d });
    this.container.addChild(panel);

    this.addText("MINICITY", this.panelX + PANEL_W / 2, this.panelY + 48, {
      size: 36,
      weight: "800",
      color: 0xeef2f6,
    });

    if (this.screen === "root") this.renderRoot();
    else if (this.screen === "new") this.renderNew();
    else this.renderLoad();
  }

  private renderRoot(): void {
    this.addText("Build the city of your dreams", this.panelX + PANEL_W / 2,
      this.panelY + 92, { size: 14, color: 0x8b95a1 });

    this.addButton("New City", this.panelX + PANEL_W / 2, this.panelY + 200, 260, 56, () => {
      this.screen = "new";
      this.render();
    }, true);

    this.addButton("Load City", this.panelX + PANEL_W / 2, this.panelY + 280, 260, 56, () => {
      this.screen = "load";
      this.slots = [];
      this.render();
      this.listSlots()
        .then((slots) => {
          this.slots = slots;
          if (this.screen === "load") this.render();
        })
        .catch(() => { /* keep the empty list */ });
    });
  }

  private renderNew(): void {
    // Seed row.
    this.addText("Seed", this.panelX + 40, this.panelY + 120,
      { size: 14, color: 0xb6bfca, anchorX: 0 });
    this.addText(String(this.settings.seed), this.panelX + 110, this.panelY + 120,
      { size: 14, color: 0xeef2f6, weight: "700", anchorX: 0 });
    this.addButton("Randomise", this.panelX + PANEL_W - 105, this.panelY + 120, 130, 32, () => {
      this.settings.seed = randomSeed();
      this.render();
    }, false, 13);

    // Map-size toggle.
    this.addText("Map size", this.panelX + 40, this.panelY + 168,
      { size: 14, color: 0xb6bfca, anchorX: 0 });
    const sizes: MapSizeId[] = ["small", "medium", "large"];
    sizes.forEach((id, i) => {
      const w = 108;
      const cx = this.panelX + 150 + i * (w + 8) + w / 2;
      const active = this.settings.size === id;
      this.addButton(
        `${SIZE_LABELS[id]}\n${MAP_SIZES[id]}²`,
        cx, this.panelY + 168, w, 40,
        () => { this.settings.size = id; this.render(); },
        active,
      );
    });

    // Sliders.
    SLIDERS.forEach((def, i) => {
      const track = this.sliderTrack(i);
      const value = this.settings[def.key];
      this.addText(def.label, track.x, track.y - 20,
        { size: 13, color: 0xb6bfca, anchorX: 0 });
      this.addText(`${Math.round(value * 100)}%`, track.x + track.w, track.y - 20,
        { size: 13, color: 0xeef2f6, weight: "700", anchorX: 1 });

      const fillW = track.w * value;
      const bar = new Graphics()
        .roundRect(track.x, track.y - 4, track.w, 8, 4)
        .fill(0x2b313c)
        .roundRect(track.x, track.y - 4, fillW, 8, 4)
        .fill(0x4a90c2)
        .circle(track.x + fillW, track.y, 9)
        .fill(0xeef2f6);
      bar.eventMode = "static";
      bar.cursor = "pointer";
      bar.hitArea = { contains: (px, py) => containsTrack(px, py, track) };
      bar.on("pointerdown", (e: FederatedPointerEvent) => {
        this.dragKey = def.key;
        this.setSliderFromEvent(e);
      });
      this.container.addChild(bar);
    });

    // Start / Back.
    this.addButton("Start", this.panelX + PANEL_W / 2 + 70, this.panelY + PANEL_H - 50,
      180, 52, () => this.cb.onNewCity({ ...this.settings }), true);
    this.addButton("Back", this.panelX + PANEL_W / 2 - 110, this.panelY + PANEL_H - 50,
      150, 52, () => { this.screen = "root"; this.render(); });
  }

  private renderLoad(): void {
    this.addText("Saved cities", this.panelX + PANEL_W / 2, this.panelY + 96,
      { size: 16, color: 0xb6bfca });

    if (this.slots.length === 0) {
      this.addText("No saved cities found", this.panelX + PANEL_W / 2,
        this.panelY + 200, { size: 14, color: 0x8b95a1 });
    } else {
      this.slots.forEach((slot, i) => {
        this.addButton(`Slot ${slot}`, this.panelX + PANEL_W / 2,
          this.panelY + 150 + i * 60, PANEL_W - 80, 48,
          () => this.cb.onLoadCity(slot));
      });
    }

    this.addButton("Back", this.panelX + PANEL_W / 2, this.panelY + PANEL_H - 50,
      180, 52, () => { this.screen = "root"; this.render(); });
  }

  // --- Slider dragging -------------------------------------------------

  private onPointerMove = (e: FederatedPointerEvent): void => {
    if (this.dragKey) this.setSliderFromEvent(e);
  };

  private endDrag = (): void => {
    if (this.dragKey) {
      this.dragKey = null;
      this.render();
    }
  };

  private setSliderFromEvent(e: FederatedPointerEvent): void {
    if (!this.dragKey) return;
    const index = SLIDERS.findIndex((s) => s.key === this.dragKey);
    const track = this.sliderTrack(index);
    const v = Math.max(0, Math.min(1, (e.global.x - track.x) / track.w));
    this.settings[this.dragKey] = v;
    this.render();
  }

  // --- Drawing helpers -------------------------------------------------

  private addButton(
    label: string,
    cx: number,
    cy: number,
    w: number,
    h: number,
    onClick: () => void,
    primary = false,
    fontSize = 15,
  ): void {
    const g = new Graphics()
      .roundRect(cx - w / 2, cy - h / 2, w, h, 10)
      .fill(primary ? 0x2b6cb0 : 0x222833)
      .stroke({ width: 1.5, color: primary ? 0x4a90c2 : 0x3a4250 });
    g.eventMode = "static";
    g.cursor = "pointer";
    g.on("pointertap", onClick);
    this.container.addChild(g);

    const t = new Text({
      text: label,
      style: {
        fill: 0xeef2f6,
        fontSize,
        fontFamily: FONT,
        fontWeight: primary ? "700" : "600",
        align: "center",
        lineHeight: fontSize + 2,
      },
    });
    t.anchor.set(0.5);
    t.position.set(cx, cy);
    t.eventMode = "none";
    this.container.addChild(t);
  }

  private addText(
    text: string,
    x: number,
    y: number,
    opts: { size: number; color: number; weight?: string; anchorX?: number },
  ): void {
    const t = new Text({
      text,
      style: {
        fill: opts.color,
        fontSize: opts.size,
        fontFamily: FONT,
        fontWeight: (opts.weight ?? "500") as Text["style"]["fontWeight"],
      },
    });
    t.anchor.set(opts.anchorX ?? 0.5, 0.5);
    t.position.set(x, y);
    t.eventMode = "none";
    this.container.addChild(t);
  }
}

function randomSeed(): number {
  return (Math.random() * 0xffffffff) >>> 0;
}

/** Generous hit region around a slider track for easy grabbing. */
function containsTrack(
  px: number,
  py: number,
  track: { x: number; y: number; w: number },
): boolean {
  return (
    px >= track.x - 12 &&
    px <= track.x + track.w + 12 &&
    py >= track.y - 16 &&
    py <= track.y + 16
  );
}
