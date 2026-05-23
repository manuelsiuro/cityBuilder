import { Container, Graphics, Text } from "pixi.js";

const MODES = [
  "off", "power", "water", "police", "fire", "health", "crime",
] as const;
export type OverlayChoice = (typeof MODES)[number];

interface ModeDef {
  mode: OverlayChoice;
  label: string;
  /** Single-character glyph rendered above the label. */
  glyph: string;
  accent: number;
}

const DEFS: ModeDef[] = [
  { mode: "off",    label: "Off",    glyph: "✕", accent: 0x6b7686 },
  { mode: "power",  label: "Power",  glyph: "⚡", accent: 0xe6c84a },
  { mode: "water",  label: "Water",  glyph: "☔", accent: 0x4ab4e0 },
  { mode: "police", label: "Police", glyph: "★", accent: 0x5b8fd6 },
  { mode: "fire",   label: "Fire",   glyph: "▲", accent: 0xe06a4a },
  { mode: "health", label: "Health", glyph: "✚", accent: 0x6fc24a },
  { mode: "crime",  label: "Crime",  glyph: "☠", accent: 0xc25a9f },
];

const ACTIVE = 0xf0a23a;
const BTN_W = 56;
const BTN_H = 50;
const GAP = 4;
const PAD = 8;
const MARGIN = 12;

interface ButtonView {
  def: ModeDef;
  container: Container;
  bg: Graphics;
  glyph: Text;
  label: Text;
  localX: number;
  /** Cached screen-space hit rectangle. */
  rect: { x: number; y: number; w: number; h: number };
}

/**
 * Top-right overlay selector. A row of direct-select buttons — one per overlay
 * mode — so any overlay is one click away. Active mode is highlighted with the
 * same accent the build palette uses for the selected tool.
 */
export class OverlayBar {
  readonly container = new Container();

  private readonly panel = new Graphics();
  private readonly row = new Container();
  private readonly buttons: ButtonView[] = [];
  private active: OverlayChoice = "off";
  private panelRect = { x: 0, y: 0, w: 0, h: 0 };

  constructor(private readonly onChange: (mode: OverlayChoice) => void) {
    this.container.addChild(this.panel, this.row);

    let x = 0;
    for (const def of DEFS) {
      const btn = this.makeButton(def);
      btn.localX = x;
      btn.container.x = x;
      this.buttons.push(btn);
      this.row.addChild(btn.container);
      x += BTN_W + GAP;
    }
    this.refresh();
  }

  layout(screenW: number): void {
    const panelW = this.buttons.length * BTN_W
      + (this.buttons.length - 1) * GAP
      + PAD * 2;
    const panelH = BTN_H + PAD * 2;
    const x = Math.round(screenW - panelW - MARGIN);
    const y = MARGIN;

    this.panel
      .clear()
      .roundRect(x, y, panelW, panelH, 12)
      .fill({ color: 0x161a22, alpha: 0.94 })
      .stroke({ width: 2, color: 0x2c333f });

    this.row.position.set(x + PAD, y + PAD);
    this.panelRect = { x, y, w: panelW, h: panelH };
    for (const btn of this.buttons) {
      btn.rect = {
        x: x + PAD + btn.localX,
        y: y + PAD,
        w: BTN_W,
        h: BTN_H,
      };
    }
  }

  /** True if a press at `(x, y)` lands on the bar (input should ignore it). */
  hitTest(x: number, y: number): boolean {
    const r = this.panelRect;
    return x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h;
  }

  /** Handle a tap on the bar. Returns true if it landed on a button. */
  handleTap(x: number, y: number): boolean {
    for (const btn of this.buttons) {
      const r = btn.rect;
      if (x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h) {
        if (btn.def.mode !== this.active) {
          this.active = btn.def.mode;
          this.refresh();
          this.onChange(this.active);
        }
        return true;
      }
    }
    return this.hitTest(x, y);
  }

  /** Programmatic select (used by the tool layer's auto-switch). No callback. */
  setMode(mode: OverlayChoice): void {
    if (mode === this.active) return;
    this.active = mode;
    this.refresh();
  }

  private makeButton(def: ModeDef): ButtonView {
    const container = new Container();
    const bg = new Graphics();
    container.addChild(bg);

    const font = "ui-sans-serif, system-ui, sans-serif";
    const glyph = new Text({
      text: def.glyph,
      style: { fill: 0xeef2f6, fontSize: 20, fontFamily: font, fontWeight: "700" },
    });
    glyph.anchor.set(0.5);
    glyph.x = BTN_W / 2;
    glyph.y = 17;
    container.addChild(glyph);

    const label = new Text({
      text: def.label,
      style: { fill: 0xc6cdd6, fontSize: 11, fontFamily: font, fontWeight: "600" },
    });
    label.anchor.set(0.5);
    label.x = BTN_W / 2;
    label.y = BTN_H - 10;
    container.addChild(label);

    return {
      def,
      container,
      bg,
      glyph,
      label,
      localX: 0,
      rect: { x: 0, y: 0, w: BTN_W, h: BTN_H },
    };
  }

  private refresh(): void {
    for (const btn of this.buttons) {
      const on = btn.def.mode === this.active;
      btn.bg
        .clear()
        .roundRect(0, 0, BTN_W, BTN_H, 8)
        .fill(on ? 0x2f3744 : 0x222833)
        .stroke({ width: on ? 3 : 2, color: on ? ACTIVE : btn.def.accent });
      if (on) {
        btn.bg
          .roundRect(2, 2, BTN_W - 4, BTN_H - 4, 6)
          .stroke({ width: 1, color: 0xffce7a, alpha: 0.5 });
      }
      btn.label.style.fill = on ? 0xffce7a : 0xc6cdd6;
      btn.glyph.style.fill = on ? 0xffffff : 0xeef2f6;
    }
  }
}
