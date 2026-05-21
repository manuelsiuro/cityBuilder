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
  /** `KeyboardEvent.code` that selects this tool. */
  key: string;
  /** Human-readable form of `key`, shown in the tooltip. */
  keyLabel: string;
  /** One-line tooltip description, cost included. */
  desc: string;
}

const TOOLS: ToolDef[] = [
  { tool: "inspect", label: "Inspect", group: 0, key: "KeyI", keyLabel: "I",
    desc: "Click a tile to read its details" },
  { tool: "road", label: "Road", group: 0, key: "KeyR", keyLabel: "R",
    desc: "Build roads — $8 per tile" },
  { tool: "bulldoze", label: "Dozer", group: 0, key: "KeyB", keyLabel: "B",
    desc: "Clear roads, zones and buildings" },
  { tool: "raiseTerrain", label: "Raise", group: 0, key: "KeyT", keyLabel: "T",
    desc: "Raise terrain — $10 per tile" },
  { tool: "lowerTerrain", label: "Lower", group: 0, key: "KeyG", keyLabel: "G",
    desc: "Lower terrain — $10 per tile" },
  { tool: "zoneR", label: "Res", group: 1, accent: 0x49c46a, key: "KeyF", keyLabel: "F",
    desc: "Residential zone — $4 per tile" },
  { tool: "zoneC", label: "Com", group: 1, accent: 0x4a90d8, key: "KeyC", keyLabel: "C",
    desc: "Commercial zone — $4 per tile" },
  { tool: "zoneI", label: "Ind", group: 1, accent: 0xe0b53c, key: "KeyV", keyLabel: "V",
    desc: "Industrial zone — $4 per tile" },
  { tool: "powerLine", label: "Wire", group: 2, accent: 0xe6c84a, key: "KeyL", keyLabel: "L",
    desc: "Power line — $6 per tile" },
  { tool: "powerPlant", label: "Plant", group: 2, accent: 0xe6c84a, key: "KeyP", keyLabel: "P",
    desc: "Power plant — $3000" },
  { tool: "pipe", label: "Pipe", group: 3, accent: 0x4ab4e0, key: "KeyK", keyLabel: "K",
    desc: "Water pipe — $7 per tile" },
  { tool: "waterPump", label: "Pump", group: 3, accent: 0x4ab4e0, key: "KeyM", keyLabel: "M",
    desc: "Water pump — $600" },
  { tool: "police", label: "Police", group: 4, accent: 0x5b8fd6, key: "KeyO", keyLabel: "O",
    desc: "Police station — $800 · raises safety & land value" },
  { tool: "fire", label: "Fire", group: 4, accent: 0xe06a4a, key: "KeyN", keyLabel: "N",
    desc: "Fire station — $800 · protects against fires" },
  { tool: "park", label: "Park", group: 4, accent: 0x5fb05a, key: "KeyU", keyLabel: "U",
    desc: "Park — $150 · lifts nearby land value" },
];

/** Map a `KeyboardEvent.code` to the tool it selects, or null. */
export function toolForKey(code: string): Tool | null {
  return TOOLS.find((d) => d.key === code)?.tool ?? null;
}

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

  private readonly tooltip = new Container();
  private readonly tipBg = new Graphics();
  private readonly tipKeyBg = new Graphics();
  private readonly tipName: Text;
  private readonly tipDesc: Text;
  private readonly tipKey: Text;
  private hoverTool: Tool | null = null;
  private screenW = 0;

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

    const font = "ui-sans-serif, system-ui, sans-serif";
    this.tipName = new Text({ text: "", style: { fill: 0xffffff, fontSize: 13, fontFamily: font, fontWeight: "700" } });
    this.tipDesc = new Text({ text: "", style: { fill: 0xb9c2cd, fontSize: 11.5, fontFamily: font } });
    this.tipKey = new Text({ text: "", style: { fill: 0x12161d, fontSize: 11, fontFamily: font, fontWeight: "700" } });
    this.tooltip.addChild(this.tipBg, this.tipKeyBg, this.tipKey, this.tipName, this.tipDesc);
    this.tooltip.visible = false;
    this.container.addChild(this.tooltip);

    this.refresh();
  }

  /** Show or hide the tooltip as the pointer moves over the palette. */
  handleHover(x: number, y: number): void {
    const tool = this.hitTest(x, y);
    if (tool === this.hoverTool) return;
    this.hoverTool = tool;
    if (tool) this.showTooltip(tool);
    else this.tooltip.visible = false;
  }

  private showTooltip(tool: Tool): void {
    const def = TOOLS.find((d) => d.tool === tool);
    const rect = this.rects.get(tool);
    if (!def || !rect) return;

    this.tipName.text = def.label;
    this.tipDesc.text = def.desc;
    this.tipKey.text = def.keyLabel;

    const padX = 10;
    const padY = 8;
    const gap = 3;
    const keyW = this.tipKey.width + 12;
    const keyH = 16;
    const contentW = Math.max(this.tipName.width + keyW + 10, this.tipDesc.width);
    const w = contentW + padX * 2;
    const h = padY * 2 + this.tipName.height + gap + this.tipDesc.height;

    this.tipBg
      .clear()
      .roundRect(0, 0, w, h, 8)
      .fill({ color: 0x12161d, alpha: 0.97 })
      .stroke({ width: 1, color: 0x3a4350 });
    this.tipName.position.set(padX, padY);
    const keyX = padX + contentW - keyW;
    this.tipKeyBg.clear().roundRect(keyX, padY, keyW, keyH, 4).fill(0xf0a23a);
    this.tipKey.position.set(
      keyX + (keyW - this.tipKey.width) / 2,
      padY + (keyH - this.tipKey.height) / 2,
    );
    this.tipDesc.position.set(padX, padY + this.tipName.height + gap);

    // Centre above the button, clamped so it never spills off-screen.
    const screenX = Math.min(
      Math.max(8, rect.x + rect.w / 2 - w / 2),
      Math.max(8, this.screenW - w - 8),
    );
    this.tooltip.position.set(
      Math.round(screenX - this.container.x),
      Math.round(rect.y - h - 8 - this.container.y),
    );
    this.tooltip.visible = true;
  }

  /** Position the row centred along the bottom edge, scaled to fit narrow screens. */
  layout(screenW: number, screenH: number): void {
    this.screenW = screenW;
    this.tooltip.visible = false;
    this.hoverTool = null;
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
