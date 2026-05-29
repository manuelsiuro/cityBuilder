import { Container, Graphics, Text, type FederatedPointerEvent } from "pixi.js";
import {
  DEFAULT_MAP_SETTINGS,
  MAP_SIZES,
  type DisasterSettings,
  type MapSettings,
  type MapSizeId,
} from "../../sim/MapSettings";
import type { SlotMeta } from "../../save/SaveSystem";
import { SaveSlotList } from "./SaveSlotList";
import { DisasterSettingsView } from "./DisasterSettingsView";

const FONT = "ui-sans-serif, system-ui, sans-serif";
const PANEL_W = 480;
const PANEL_H_DEFAULT = 620;
const PANEL_H_DISASTERS = 660;
const PAD = 44;

export interface MenuCallbacks {
  onNewCity: (settings: MapSettings) => void;
  onLoadCity: (slot: number) => void;
}

type Screen = "root" | "new" | "load" | "disasters";

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
const SIZES: MapSizeId[] = ["small", "medium", "large"];

/**
 * Full-screen main menu shown at boot. Offers New City — with a map-settings
 * panel (seed, size, water, roughness, tree density) — and Load City. Uses
 * PixiJS native pointer events; the canvas is made interactive while it shows.
 */
export class MainMenu {
  readonly container = new Container();

  private screen: Screen = "root";
  private settings: MapSettings = { ...DEFAULT_MAP_SETTINGS, seed: randomSeed() };
  private slotMetas: SlotMeta[] = [];
  private screenW = window.innerWidth;
  private screenH = window.innerHeight;

  /** Slider currently being dragged, or null. */
  private dragKey: SliderDef["key"] | null = null;

  constructor(
    private readonly cb: MenuCallbacks,
    private readonly listMetas: () => Promise<SlotMeta[]>,
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

  private get panelH(): number {
    return this.screen === "disasters" ? PANEL_H_DISASTERS : PANEL_H_DEFAULT;
  }

  private get panelX(): number {
    return Math.round((this.screenW - PANEL_W) / 2);
  }

  private get panelY(): number {
    return Math.round((this.screenH - this.panelH) / 2);
  }

  private sliderTrack(index: number): { x: number; y: number; w: number } {
    return {
      x: this.panelX + PAD,
      y: this.panelY + 300 + index * 64,
      w: PANEL_W - PAD * 2,
    };
  }

  // --- Rendering -------------------------------------------------------

  private render(): void {
    this.container.removeChildren().forEach((c) => c.destroy({ children: true }));

    // Dimmed full-screen backdrop.
    this.container.addChild(
      new Graphics()
        .rect(0, 0, this.screenW, this.screenH)
        .fill({ color: 0x0b0f14, alpha: 0.82 }),
    );

    // Panel.
    this.container.addChild(
      new Graphics()
        .roundRect(this.panelX, this.panelY, PANEL_W, this.panelH, 16)
        .fill({ color: 0x161a20, alpha: 0.98 })
        .stroke({ width: 2, color: 0x39414d }),
    );

    this.addText("MINICITY", this.panelX + PANEL_W / 2, this.panelY + 56, {
      size: 38,
      weight: "800",
      color: 0xeef2f6,
    });

    if (this.screen === "root") this.renderRoot();
    else if (this.screen === "new") this.renderNew();
    else if (this.screen === "disasters") this.renderDisasters();
    else this.renderLoad();
  }

  private renderRoot(): void {
    this.addText("Build the city of your dreams", this.panelX + PANEL_W / 2,
      this.panelY + 100, { size: 14, color: 0x8b95a1 });

    const cx = this.panelX + PANEL_W / 2;
    this.addButton("New City", cx, this.panelY + 248, 300, 60, () => {
      this.screen = "new";
      this.render();
    }, true);

    this.addButton("Load City", cx, this.panelY + 332, 300, 60, () => {
      this.screen = "load";
      this.slotMetas = [];
      this.render();
      this.listMetas()
        .then((metas) => {
          this.slotMetas = metas;
          if (this.screen === "load") this.render();
        })
        .catch(() => { /* keep the empty list */ });
    });
  }

  private renderNew(): void {
    const left = this.panelX + PAD;
    const right = this.panelX + PANEL_W - PAD;

    // --- Seed row ---
    this.addText("Seed", left, this.panelY + 122,
      { size: 14, color: 0xb6bfca, anchorX: 0 });
    this.addText(String(this.settings.seed), left + 60, this.panelY + 122,
      { size: 14, color: 0xeef2f6, weight: "700", anchorX: 0 });
    this.addButton("Randomise", right - 64, this.panelY + 122, 128, 34, () => {
      this.settings.seed = randomSeed();
      this.render();
    }, false, 13);

    // --- Map-size toggle ---
    this.addText("Map size", left, this.panelY + 180,
      { size: 14, color: 0xb6bfca, anchorX: 0 });
    const groupX = left + 80;
    const groupW = right - groupX;
    const btnW = (groupW - 16) / 3;
    SIZES.forEach((id, i) => {
      const bx = groupX + i * (btnW + 8) + btnW / 2;
      this.addButton(
        `${SIZE_LABELS[id]}  ${MAP_SIZES[id]}²`,
        bx, this.panelY + 180, btnW, 40,
        () => { this.settings.size = id; this.render(); },
        this.settings.size === id,
        12.5,
      );
    });

    // --- Terrain toggle ---
    this.addText("Terrain", left, this.panelY + 236,
      { size: 14, color: 0xb6bfca, anchorX: 0 });
    const terrainX = left + 80;
    const terrainW = (right - terrainX - 8) / 2;
    ([["Hills", false], ["Flat", true]] as const).forEach(([label, flat], i) => {
      const bx = terrainX + i * (terrainW + 8) + terrainW / 2;
      this.addButton(label, bx, this.panelY + 236, terrainW, 40,
        () => { this.settings.flat = flat; this.render(); },
        this.settings.flat === flat, 12.5);
    });

    // --- Sliders ---
    SLIDERS.forEach((def, i) => {
      const track = this.sliderTrack(i);
      const value = this.settings[def.key];
      // Water and roughness have no effect on a flat map — show them disabled.
      const disabled = this.settings.flat && def.key !== "treeDensity";
      this.addText(def.label, track.x, track.y - 22,
        { size: 13, color: disabled ? 0x5a626d : 0xb6bfca, anchorX: 0 });
      this.addText(`${Math.round(value * 100)}%`, track.x + track.w, track.y - 22,
        { size: 13, color: disabled ? 0x5a626d : 0xeef2f6, weight: "700", anchorX: 1 });

      const fillW = track.w * value;
      const bar = new Graphics()
        .roundRect(track.x, track.y - 4, track.w, 8, 4)
        .fill(0x2b313c)
        .roundRect(track.x, track.y - 4, fillW, 8, 4)
        .fill(disabled ? 0x3a4250 : 0x4a90c2)
        .circle(track.x + fillW, track.y, 9)
        .fill(disabled ? 0x5a626d : 0xeef2f6);
      if (!disabled) {
        bar.eventMode = "static";
        bar.cursor = "pointer";
        bar.hitArea = { contains: (px, py) => containsTrack(px, py, track) };
        bar.on("pointerdown", (e: FederatedPointerEvent) => {
          this.dragKey = def.key;
          this.setSliderFromEvent(e);
        });
      }
      this.container.addChild(bar);
    });

    // --- Disasters subscreen entry ---
    const disasterBtnY = this.panelY + 504;
    const enabledCount = Object.values(this.settings.disasters.enabled)
      .filter(Boolean).length;
    this.addButton(
      `Disasters · ${enabledCount} on · ${this.settings.disasters.frequency}×`,
      this.panelX + PANEL_W / 2, disasterBtnY, PANEL_W - PAD * 2, 40,
      () => { this.screen = "disasters"; this.render(); },
      false, 13,
    );

    // --- Start / Back ---
    const btnY = this.panelY + this.panelH - 52;
    this.addButton("Back", this.panelX + PANEL_W / 2 - 116, btnY, 160, 52,
      () => { this.screen = "root"; this.render(); });
    this.addButton("Start", this.panelX + PANEL_W / 2 + 80, btnY, 196, 52,
      () => this.cb.onNewCity({ ...this.settings }), true);
  }

  private renderDisasters(): void {
    this.addText("Disasters", this.panelX + PANEL_W / 2, this.panelY + 106,
      { size: 20, color: 0xeef2f6, weight: "700" });
    this.addText(
      "Toggle each disaster and pick a global frequency.",
      this.panelX + PANEL_W / 2, this.panelY + 132,
      { size: 13, color: 0x8b95a1 },
    );

    const view = new DisasterSettingsView(PANEL_W - PAD * 2, (next: DisasterSettings) => {
      this.settings.disasters = next;
      this.render();
    });
    view.container.position.set(this.panelX + PAD, this.panelY + 156);
    view.render(this.settings.disasters);
    this.container.addChild(view.container);

    const btnY = this.panelY + this.panelH - 52;
    this.addButton("Back", this.panelX + PANEL_W / 2, btnY, 200, 52,
      () => { this.screen = "new"; this.render(); });
  }

  private renderLoad(): void {
    this.addText("Saved cities", this.panelX + PANEL_W / 2, this.panelY + 100,
      { size: 16, color: 0xb6bfca });

    const list = new SaveSlotList(PANEL_W - PAD * 2, (slot) => this.cb.onLoadCity(slot));
    list.container.position.set(this.panelX + PAD, this.panelY + 128);
    list.render(this.slotMetas.map((m) => ({ slot: m.slot, meta: m.meta })));
    this.container.addChild(list.container);

    this.addButton("Back", this.panelX + PANEL_W / 2, this.panelY + this.panelH - 52,
      200, 52, () => { this.screen = "root"; this.render(); });
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
