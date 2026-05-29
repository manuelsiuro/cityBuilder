import { Container, Graphics, Text } from "pixi.js";
import {
  DISASTER_IDS,
  DISASTER_LABELS,
  type DisasterId,
  type DisasterSettings,
} from "../../sim/MapSettings";
import { DisasterSettingsView } from "./DisasterSettingsView";

const FONT = "ui-sans-serif, system-ui, sans-serif";
const PANEL_W = 520;
const PANEL_H = 720;
const PAD = 28;

export interface SettingsCallbacks {
  /** Current disaster settings — read live, may change between opens. */
  getDisasters: () => DisasterSettings;
  /** Persist new disaster settings into the live `World`. */
  onChangeDisasters: (next: DisasterSettings) => void;
  /** God-mode: fire `id` on the next tick via the command queue. */
  onTriggerDisaster: (id: DisasterId) => void;
}

/**
 * In-game settings modal. Hosts the disasters toggles + frequency stepper
 * (mid-game changes apply immediately via `World.setDisasterSettings`) and a
 * "Trigger now" god-mode section that fires each disaster on demand.
 */
export class SettingsPanel {
  readonly container = new Container();

  private screenW = window.innerWidth;
  private screenH = window.innerHeight;
  /** Cached height of the disasters view from the last render, for layout math. */
  private lastViewHeight = 0;

  constructor(
    private readonly cb: SettingsCallbacks,
    private readonly onClose: () => void,
  ) {
    this.container.visible = false;
    this.container.eventMode = "static";
  }

  open(): void {
    this.container.visible = true;
    this.render();
  }

  close(): void {
    this.container.visible = false;
  }

  layout(screenW: number, screenH: number): void {
    this.screenW = screenW;
    this.screenH = screenH;
    if (this.container.visible) this.render();
  }

  private get panelX(): number {
    return Math.round((this.screenW - PANEL_W) / 2);
  }

  private get panelY(): number {
    return Math.round((this.screenH - PANEL_H) / 2);
  }

  private render(): void {
    this.container.removeChildren().forEach((c) => c.destroy({ children: true }));

    // Backdrop — clicking it closes the panel.
    const backdrop = new Graphics()
      .rect(0, 0, this.screenW, this.screenH)
      .fill({ color: 0x0b0f14, alpha: 0.82 });
    backdrop.eventMode = "static";
    backdrop.cursor = "default";
    backdrop.on("pointertap", () => this.onClose());
    this.container.addChild(backdrop);

    // Panel — eats clicks so taps on it don't close.
    const panel = new Graphics()
      .roundRect(this.panelX, this.panelY, PANEL_W, PANEL_H, 16)
      .fill({ color: 0x161a20, alpha: 0.98 })
      .stroke({ width: 2, color: 0x39414d });
    panel.eventMode = "static";
    panel.on("pointertap", (e) => e.stopPropagation());
    this.container.addChild(panel);

    this.addText("Settings", this.panelX + PANEL_W / 2, this.panelY + 36,
      { size: 22, color: 0xeef2f6, weight: "700" });

    // --- Disaster settings ---
    this.addText(
      "Disasters",
      this.panelX + PAD, this.panelY + 72,
      { size: 14, color: 0xb6bfca, anchorX: 0, weight: "600" },
    );

    // Built fresh each render — the panel's `destroy({ children: true })` at
    // the top of this method nullifies the previous view's Pixi internals.
    const view = new DisasterSettingsView(PANEL_W - PAD * 2, (next) => {
      this.cb.onChangeDisasters(next);
      this.render();
    });
    view.container.position.set(this.panelX + PAD, this.panelY + 92);
    view.render(this.cb.getDisasters());
    this.container.addChild(view.container);
    this.lastViewHeight = view.height;

    // --- Trigger Now (god mode) ---
    const triggerY = this.panelY + 92 + this.lastViewHeight + 28;
    this.addText(
      "Trigger now",
      this.panelX + PAD, triggerY,
      { size: 14, color: 0xb6bfca, anchorX: 0, weight: "600" },
    );
    this.addText(
      "Fire a disaster immediately (god mode).",
      this.panelX + PAD, triggerY + 18,
      { size: 11, color: 0x6d7886, anchorX: 0 },
    );

    const gridX = this.panelX + PAD;
    const gridY = triggerY + 40;
    const cols = 2;
    const colW = (PANEL_W - PAD * 2 - 8) / cols;
    DISASTER_IDS.forEach((id, i) => {
      const col = i % cols;
      const row = Math.floor(i / cols);
      const x = gridX + col * (colW + 8) + colW / 2;
      const y = gridY + row * 36;
      this.addButton(DISASTER_LABELS[id], x, y, colW, 30,
        () => { this.cb.onTriggerDisaster(id); this.onClose(); }, false, 12);
    });

    // --- Close ---
    this.addButton("Close",
      this.panelX + PANEL_W / 2, this.panelY + PANEL_H - 36,
      200, 44, () => this.onClose(), true);
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

  private addButton(
    label: string,
    cx: number,
    cy: number,
    w: number,
    h: number,
    onClick: () => void,
    primary = false,
    fontSize = 14,
  ): void {
    const g = new Graphics()
      .roundRect(cx - w / 2, cy - h / 2, w, h, 8)
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

  /** Hit-test for the input layer — true if the panel is open and `(x,y)` is on it. */
  hitTest(x: number, y: number): boolean {
    if (!this.container.visible) return false;
    return x >= this.panelX && x <= this.panelX + PANEL_W &&
           y >= this.panelY && y <= this.panelY + PANEL_H;
  }
}
