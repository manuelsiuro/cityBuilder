import { Container, Graphics, Sprite, Text, type Texture } from "pixi.js";
import type { Tool } from "../../input/ToolController";

const BTN_W = 80;
const BTN_H = 68;
const ICON = 42;
const GAP = 5;
const GROUP_GAP = 16;
const MARGIN = 16;
const PAD = 10;

interface ToolDef {
  tool: Tool;
  label: string;
  group: number;
  accent?: number;
}

const TOOLS: ToolDef[] = [
  { tool: "inspect", label: "Inspect", group: 0 },
  { tool: "road", label: "Road", group: 0 },
  { tool: "bulldoze", label: "Dozer", group: 0 },
  { tool: "zoneR", label: "Res", group: 1, accent: 0x49c46a },
  { tool: "zoneC", label: "Com", group: 1, accent: 0x4a90d8 },
  { tool: "zoneI", label: "Ind", group: 1, accent: 0xe0b53c },
  { tool: "powerLine", label: "Wire", group: 2, accent: 0xe6c84a },
  { tool: "powerPlant", label: "Plant", group: 2, accent: 0xe6c84a },
  { tool: "pipe", label: "Pipe", group: 3, accent: 0x4ab4e0 },
  { tool: "waterPump", label: "Pump", group: 3, accent: 0x4ab4e0 },
];

interface PaletteButton {
  def: ToolDef;
  container: Container;
  bg: Graphics;
  label: Text;
  localX: number;
}

interface ScreenRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Icon textures keyed by tool name; missing entries fall back to text only. */
export type ToolIcons = Partial<Record<Tool, Texture>>;

/**
 * Bottom-docked, grouped row of build-tool buttons. Each button stacks a
 * generated glyph above its label on a dark panel. Rendered with PixiJS;
 * hit-testing is driven externally by the input system.
 */
export class ToolPalette {
  readonly container = new Container();

  private readonly panel = new Graphics();
  private readonly row = new Container();
  private readonly buttons: PaletteButton[] = [];
  private readonly rects = new Map<Tool, ScreenRect>();
  private active: Tool = "inspect";

  constructor(
    private readonly onSelect: (tool: Tool) => void,
    icons: ToolIcons = {},
  ) {
    this.container.addChild(this.panel, this.row);

    let x = 0;
    let prevGroup = TOOLS[0].group;
    for (const def of TOOLS) {
      if (def.group !== prevGroup) {
        x += GROUP_GAP - GAP;
        prevGroup = def.group;
      }
      const btn = this.makeButton(def, icons[def.tool]);
      btn.localX = x;
      btn.container.x = x;
      this.buttons.push(btn);
      this.row.addChild(btn.container);
      x += BTN_W + GAP;
    }
    this.refresh();
  }

  /** Position the row centred along the bottom edge, scaled to fit narrow screens. */
  layout(screenW: number, screenH: number): void {
    const totalW = this.buttons.length > 0
      ? this.buttons[this.buttons.length - 1].localX + BTN_W
      : 0;
    const scale = Math.min(1, (screenW - 24) / (totalW + PAD * 2));
    this.row.scale.set(scale);
    this.panel.scale.set(scale);

    const drawnW = (totalW + PAD * 2) * scale;
    this.container.x = Math.round((screenW - drawnW) / 2);
    this.container.y = Math.round(screenH - (BTN_H + PAD * 2) * scale - MARGIN);
    this.row.x = PAD;
    this.row.y = PAD;

    this.panel
      .clear()
      .roundRect(0, 0, totalW + PAD * 2, BTN_H + PAD * 2, 14)
      .fill({ color: 0x161a22, alpha: 0.92 })
      .stroke({ width: 2, color: 0x2c333f });

    this.rects.clear();
    for (const b of this.buttons) {
      this.rects.set(b.def.tool, {
        x: this.container.x + (PAD + b.localX) * scale,
        y: this.container.y + PAD * scale,
        w: BTN_W * scale,
        h: BTN_H * scale,
      });
    }
  }

  /** Tool whose button covers screen point `(x, y)`, or null. */
  hitTest(x: number, y: number): Tool | null {
    for (const [tool, r] of this.rects) {
      if (x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h) return tool;
    }
    return null;
  }

  select(tool: Tool): void {
    this.setActive(tool);
    this.onSelect(tool);
  }

  setActive(tool: Tool): void {
    this.active = tool;
    this.refresh();
  }

  private makeButton(def: ToolDef, icon?: Texture): PaletteButton {
    const container = new Container();
    const bg = new Graphics();
    container.addChild(bg);

    if (icon) {
      const sprite = new Sprite(icon);
      sprite.anchor.set(0.5);
      const s = ICON / Math.max(sprite.texture.width, sprite.texture.height, 1);
      sprite.scale.set(s);
      sprite.x = BTN_W / 2;
      sprite.y = ICON / 2 + 8;
      container.addChild(sprite);
    }

    const label = new Text({
      text: def.label,
      style: {
        fill: 0xeef2f6,
        fontSize: 12,
        fontFamily: "ui-sans-serif, system-ui, sans-serif",
        fontWeight: "600",
      },
    });
    label.anchor.set(0.5);
    label.x = BTN_W / 2;
    label.y = BTN_H - 13;
    container.addChild(label);
    return { def, container, bg, label, localX: 0 };
  }

  private refresh(): void {
    for (const b of this.buttons) {
      const on = b.def.tool === this.active;
      const accent = b.def.accent ?? 0x6b7686;
      b.bg
        .clear()
        .roundRect(0, 0, BTN_W, BTN_H, 10)
        .fill(on ? 0x2f3744 : 0x222833)
        .stroke({ width: on ? 3 : 2, color: on ? 0xf0a23a : accent });
      if (on) {
        b.bg
          .roundRect(2, 2, BTN_W - 4, BTN_H - 4, 8)
          .stroke({ width: 1, color: 0xffce7a, alpha: 0.5 });
      }
      b.label.style.fill = on ? 0xffce7a : 0xc6cdd6;
    }
  }
}
