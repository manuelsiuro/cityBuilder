import { Container, Graphics, Text } from "pixi.js";
import type { Tool } from "../../input/ToolController";

const BTN_W = 92;
const BTN_H = 46;
const GAP = 4;
const GROUP_GAP = 16;
const MARGIN = 18;

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

/**
 * Bottom-docked, grouped row of build-tool buttons. Rendered with PixiJS;
 * hit-testing is driven externally by the input system.
 */
export class ToolPalette {
  readonly container = new Container();

  private readonly buttons: PaletteButton[] = [];
  private readonly rects = new Map<Tool, ScreenRect>();
  private active: Tool = "inspect";

  constructor(private readonly onSelect: (tool: Tool) => void) {
    let x = 0;
    let prevGroup = TOOLS[0].group;
    for (const def of TOOLS) {
      if (def.group !== prevGroup) {
        x += GROUP_GAP - GAP;
        prevGroup = def.group;
      }
      const btn = this.makeButton(def);
      btn.localX = x;
      btn.container.x = x;
      this.buttons.push(btn);
      this.container.addChild(btn.container);
      x += BTN_W + GAP;
    }
    this.refresh();
  }

  /** Position the row centred along the bottom edge, scaled to fit narrow screens. */
  layout(screenW: number, screenH: number): void {
    const totalW = this.buttons.length > 0
      ? this.buttons[this.buttons.length - 1].localX + BTN_W
      : 0;
    const scale = Math.min(1, (screenW - 24) / totalW);
    this.container.scale.set(scale);
    this.container.x = Math.round((screenW - totalW * scale) / 2);
    this.container.y = Math.round(screenH - BTN_H * scale - MARGIN);

    this.rects.clear();
    for (const b of this.buttons) {
      this.rects.set(b.def.tool, {
        x: this.container.x + b.localX * scale,
        y: this.container.y,
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

  private makeButton(def: ToolDef): PaletteButton {
    const container = new Container();
    const bg = new Graphics();
    const label = new Text({
      text: def.label,
      style: {
        fill: 0xffffff,
        fontSize: 14,
        fontFamily: "ui-sans-serif, system-ui, sans-serif",
        fontWeight: "600",
      },
    });
    label.anchor.set(0.5);
    label.x = BTN_W / 2;
    label.y = BTN_H / 2;
    container.addChild(bg, label);
    return { def, container, bg, label, localX: 0 };
  }

  private refresh(): void {
    for (const b of this.buttons) {
      const on = b.def.tool === this.active;
      const idle = b.def.accent !== undefined ? dim(b.def.accent) : 0x2b313c;
      const border = b.def.accent ?? 0x47505f;
      b.bg
        .clear()
        .roundRect(0, 0, BTN_W, BTN_H, 9)
        .fill(on ? 0xf0a23a : idle)
        .stroke({ width: 2, color: on ? 0xffce7a : border });
      b.label.style.fill = on ? 0x1a1407 : 0xeef2f6;
    }
  }
}

/** Darken an accent colour for an idle button background. */
function dim(hex: number): number {
  const r = ((hex >> 16) & 0xff) * 0.32;
  const g = ((hex >> 8) & 0xff) * 0.32;
  const b = (hex & 0xff) * 0.32;
  return (r << 16) | (g << 8) | b;
}
