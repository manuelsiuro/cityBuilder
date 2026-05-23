import { Container, Graphics, Sprite, Text, type Texture } from "pixi.js";
import type { Tool } from "../../input/ToolController";

/* ---- layout constants -------------------------------------------------- */

const BTN_W = 80;
const BTN_H = 68;
const ICON = 42;
const TAB_W = 92;
const TAB_H = 52;
const TAB_ICON = 24;
const GAP = 6;
/** Extra space between the standalone Inspect tab and the category tabs. */
const GROUP_GAP = 14;
const PAD = 10;
/** Vertical gap between the tool sub-palette and the tab row. */
const ROW_GAP = 8;
const MARGIN = 16;

/* ---- tool & category model -------------------------------------------- */

interface ToolDef {
  tool: Tool;
  label: string;
  accent?: number;
  /** `KeyboardEvent.code` that selects this tool. */
  key: string;
  /** Human-readable form of `key`, shown in the tooltip. */
  keyLabel: string;
  /** One-line tooltip description, cost included. */
  desc: string;
}

interface CategoryDef {
  id: string;
  label: string;
  accent: number;
  /** Tool whose icon represents the category on its tab. */
  iconTool: Tool;
  tools: Tool[];
}

/** Every build tool, keyed for metadata lookup (label / shortcut / tooltip). */
const TOOLS: ToolDef[] = [
  { tool: "inspect", label: "Inspect", key: "KeyI", keyLabel: "I",
    desc: "Click a tile to read its details" },
  { tool: "road", label: "Road", accent: 0x9aa3b0, key: "KeyR", keyLabel: "R",
    desc: "Build roads — $8 per tile" },
  { tool: "bulldoze", label: "Dozer", accent: 0x9aa3b0, key: "KeyB", keyLabel: "B",
    desc: "Clear roads, zones and buildings" },
  { tool: "raiseTerrain", label: "Raise", accent: 0x9aa3b0, key: "KeyT", keyLabel: "T",
    desc: "Raise terrain — $10 per tile" },
  { tool: "lowerTerrain", label: "Lower", accent: 0x9aa3b0, key: "KeyG", keyLabel: "G",
    desc: "Lower terrain — $10 per tile" },
  { tool: "zoneR", label: "Res", accent: 0x49c46a, key: "KeyF", keyLabel: "F",
    desc: "Residential zone — $4 per tile" },
  { tool: "zoneC", label: "Com", accent: 0x4a90d8, key: "KeyC", keyLabel: "C",
    desc: "Commercial zone — $4 per tile" },
  { tool: "zoneI", label: "Ind", accent: 0xe0b53c, key: "KeyV", keyLabel: "V",
    desc: "Industrial zone — $4 per tile" },
  { tool: "powerLine", label: "Wire", accent: 0xe6c84a, key: "KeyL", keyLabel: "L",
    desc: "Power line — $6 per tile" },
  { tool: "powerPlant", label: "Plant", accent: 0xe6c84a, key: "KeyP", keyLabel: "P",
    desc: "Power plant — $3000" },
  { tool: "pipe", label: "Pipe", accent: 0x4ab4e0, key: "KeyK", keyLabel: "K",
    desc: "Water pipe — $7 per tile" },
  { tool: "waterPump", label: "Pump", accent: 0x4ab4e0, key: "KeyM", keyLabel: "M",
    desc: "Water pump — $600" },
  { tool: "police", label: "Police", accent: 0x5b8fd6, key: "KeyO", keyLabel: "O",
    desc: "Police station — $800 · raises safety & land value" },
  { tool: "fire", label: "Fire", accent: 0xe06a4a, key: "KeyN", keyLabel: "N",
    desc: "Fire station — $800 · protects against fires" },
  { tool: "hospital", label: "Hospital", accent: 0xe2e2e2, key: "KeyH", keyLabel: "H",
    desc: "Hospital — $1200 · health care, sends ambulances" },
  { tool: "parkSmall", label: "Sm Park", accent: 0x6fc24a, key: "KeyJ", keyLabel: "J",
    desc: "Small park — $80 · cheap greenery, 3-tile reach" },
  { tool: "park", label: "Park", accent: 0x5fb05a, key: "KeyU", keyLabel: "U",
    desc: "Park — $150 · lifts nearby land value" },
  { tool: "plaza", label: "Plaza", accent: 0xc7b58a, key: "KeyY", keyLabel: "Y",
    desc: "Plaza — $200 · paved square, suits dense cores" },
  { tool: "sportsField", label: "Sports", accent: 0x4faa3a, key: "KeyX", keyLabel: "X",
    desc: "Sports field — $300 · wide 5-tile recreation reach" },
  { tool: "botanicalGarden", label: "Garden", accent: 0x3f9a3c, key: "KeyZ", keyLabel: "Z",
    desc: "Botanical garden — $500 · large 6-tile amenity boost" },
];

/** The category tabs. `inspect` is standalone and not in any category. */
const CATEGORIES: CategoryDef[] = [
  { id: "terrain", label: "Terrain", accent: 0x9aa3b0, iconTool: "road",
    tools: ["road", "bulldoze", "raiseTerrain", "lowerTerrain"] },
  { id: "zones", label: "Zones", accent: 0x49c46a, iconTool: "zoneR",
    tools: ["zoneR", "zoneC", "zoneI"] },
  { id: "power", label: "Power", accent: 0xe6c84a, iconTool: "powerPlant",
    tools: ["powerLine", "powerPlant"] },
  { id: "water", label: "Water", accent: 0x4ab4e0, iconTool: "waterPump",
    tools: ["pipe", "waterPump"] },
  { id: "services", label: "Services", accent: 0x5b8fd6, iconTool: "police",
    tools: ["police", "fire", "hospital"] },
  { id: "parks", label: "Parks", accent: 0x5fb05a, iconTool: "park",
    tools: ["parkSmall", "park", "plaza", "sportsField", "botanicalGarden"] },
];

const ACTIVE = 0xf0a23a;

function toolDef(tool: Tool): ToolDef {
  return TOOLS.find((d) => d.tool === tool) ?? TOOLS[0];
}

/** The category that owns `tool`, or null for the standalone Inspect tool. */
function categoryOf(tool: Tool): CategoryDef | null {
  return CATEGORIES.find((c) => c.tools.includes(tool)) ?? null;
}

/** Map a `KeyboardEvent.code` to the tool it selects, or null. */
export function toolForKey(code: string): Tool | null {
  return TOOLS.find((d) => d.key === code)?.tool ?? null;
}

/** Friendly display label for a tool, e.g. "Power Line" instead of "powerLine". */
export function toolLabel(tool: Tool): string {
  return toolDef(tool).label;
}

/** Icon textures keyed by tool name; missing entries fall back to text only. */
export type ToolIcons = Partial<Record<Tool, Texture>>;

interface ToolButton {
  def: ToolDef;
  container: Container;
  bg: Graphics;
  label: Text;
  localX: number;
}

interface TabButton {
  /** Category id, or "inspect" for the standalone tool tab. */
  id: string;
  container: Container;
  bg: Graphics;
  label: Text;
  accent: number;
  localX: number;
}

interface ScreenRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * Bottom-docked, two-level build palette. A row of category tabs (plus a
 * standalone Inspect tab) sits along the bottom edge; selecting a tab reveals
 * that category's tools in a sub-palette directly above it. Rendered with
 * PixiJS; hit-testing is driven externally by the input system.
 */
export class ToolPalette {
  readonly container = new Container();

  // Tab row — Inspect + the six category tabs.
  private readonly tabPanel = new Graphics();
  private readonly tabRow = new Container();
  private readonly tabs: TabButton[] = [];

  // Tool sub-palette — the active category's tools.
  private readonly toolPanel = new Graphics();
  private readonly toolRow = new Container();
  private toolButtons: ToolButton[] = [];

  private readonly tabRects = new Map<string, ScreenRect>();
  private readonly toolRects = new Map<Tool, ScreenRect>();
  private tabPanelRect: ScreenRect = { x: 0, y: 0, w: 0, h: 0 };
  private toolPanelRect: ScreenRect = { x: 0, y: 0, w: 0, h: 0 };

  private activeTool: Tool = "inspect";
  private activeCategory = "terrain";
  private screenW = 0;
  private screenH = 0;

  // Tooltip.
  private readonly tooltip = new Container();
  private readonly tipBg = new Graphics();
  private readonly tipKeyBg = new Graphics();
  private readonly tipName: Text;
  private readonly tipDesc: Text;
  private readonly tipKey: Text;
  private hoverKey: string | null = null;

  constructor(
    private readonly onSelect: (tool: Tool) => void,
    private readonly icons: ToolIcons = {},
  ) {
    this.container.addChild(this.toolPanel, this.toolRow, this.tabPanel, this.tabRow);

    // Build the tab row: a standalone Inspect tab, then the category tabs.
    let x = 0;
    const inspectTab = this.makeTab("inspect", "Inspect", ACTIVE, this.icons.inspect);
    inspectTab.localX = x;
    inspectTab.container.x = x;
    this.tabs.push(inspectTab);
    this.tabRow.addChild(inspectTab.container);
    x += TAB_W + GROUP_GAP;

    for (const cat of CATEGORIES) {
      const tab = this.makeTab(cat.id, cat.label, cat.accent, this.icons[cat.iconTool]);
      tab.localX = x;
      tab.container.x = x;
      this.tabs.push(tab);
      this.tabRow.addChild(tab.container);
      x += TAB_W + GAP;
    }

    const font = "ui-sans-serif, system-ui, sans-serif";
    this.tipName = new Text({ text: "", style: { fill: 0xffffff, fontSize: 13, fontFamily: font, fontWeight: "700" } });
    this.tipDesc = new Text({ text: "", style: { fill: 0xb9c2cd, fontSize: 11.5, fontFamily: font } });
    this.tipKey = new Text({ text: "", style: { fill: 0x12161d, fontSize: 11, fontFamily: font, fontWeight: "700" } });
    this.tooltip.addChild(this.tipBg, this.tipKeyBg, this.tipKey, this.tipName, this.tipDesc);
    this.tooltip.visible = false;
    this.container.addChild(this.tooltip);

    this.rebuildToolRow();
    this.refresh();
  }

  /* ---- public API ------------------------------------------------------ */

  /** True when a press at `(x, y)` lands on the palette (input should ignore it). */
  containsPoint(x: number, y: number): boolean {
    return inRect(this.tabPanelRect, x, y) || inRect(this.toolPanelRect, x, y);
  }

  /** Handle a tap on the palette. Returns true if it was consumed. */
  handleTap(x: number, y: number): boolean {
    for (const [tool, r] of this.toolRects) {
      if (inRect(r, x, y)) {
        this.select(tool);
        return true;
      }
    }
    for (const [id, r] of this.tabRects) {
      if (inRect(r, x, y)) {
        if (id === "inspect") this.select("inspect");
        else this.showCategory(id);
        return true;
      }
    }
    // Swallow taps that land on a panel but miss a button.
    return this.containsPoint(x, y);
  }

  /** Show or hide the tooltip as the pointer moves over the palette. */
  handleHover(x: number, y: number): void {
    for (const [tool, r] of this.toolRects) {
      if (inRect(r, x, y)) return this.showToolTip(tool, r);
    }
    for (const [id, r] of this.tabRects) {
      if (inRect(r, x, y)) return this.showTabTip(id, r);
    }
    this.hoverKey = null;
    this.tooltip.visible = false;
  }

  /** Position the palette centred along the bottom edge. */
  layout(screenW: number, screenH: number): void {
    this.screenW = screenW;
    this.screenH = screenH;
    this.hoverKey = null;
    this.tooltip.visible = false;
    this.place();
  }

  /** Select a tool as if its button were clicked (fires the change callback). */
  select(tool: Tool): void {
    this.setActive(tool);
    this.onSelect(tool);
  }

  /** Set the active tool and reveal its category, without firing the callback. */
  setActive(tool: Tool): void {
    this.activeTool = tool;
    const cat = categoryOf(tool);
    if (cat && cat.id !== this.activeCategory) {
      this.activeCategory = cat.id;
      this.rebuildToolRow();
      this.place();
    }
    this.refresh();
  }

  /* ---- internals ------------------------------------------------------- */

  /** Switch which category's tools the sub-palette shows. */
  private showCategory(id: string): void {
    if (id === this.activeCategory) return;
    this.activeCategory = id;
    this.rebuildToolRow();
    this.place();
    this.refresh();
  }

  /** Rebuild the sub-palette's tool buttons for the active category. */
  private rebuildToolRow(): void {
    for (const b of this.toolButtons) b.container.destroy({ children: true });
    this.toolButtons = [];
    this.toolRow.removeChildren();

    const cat = CATEGORIES.find((c) => c.id === this.activeCategory) ?? CATEGORIES[0];
    let x = 0;
    for (const tool of cat.tools) {
      const btn = this.makeToolButton(toolDef(tool), this.icons[tool]);
      btn.localX = x;
      btn.container.x = x;
      this.toolButtons.push(btn);
      this.toolRow.addChild(btn.container);
      x += BTN_W + GAP;
    }
  }

  /** Re-place both rows and recompute the cached hit-test rectangles. */
  private place(): void {
    if (this.screenW === 0) return;

    const tabW = this.tabs.length * TAB_W + (this.tabs.length - 1) * GAP + GROUP_GAP;
    const tabPanelW = tabW + PAD * 2;
    const tabPanelH = TAB_H + PAD * 2;
    const toolPanelW = this.toolButtons.length * BTN_W +
      Math.max(0, this.toolButtons.length - 1) * GAP + PAD * 2;
    const toolPanelH = BTN_H + PAD * 2;

    // Shrink to fit narrow screens — the tab row is the wider of the two.
    const scale = Math.min(1, (this.screenW - MARGIN * 2) / tabPanelW);

    const tabX = Math.round((this.screenW - tabPanelW * scale) / 2);
    const tabY = Math.round(this.screenH - tabPanelH * scale - MARGIN);
    const toolX = Math.round((this.screenW - toolPanelW * scale) / 2);
    const toolY = Math.round(tabY - toolPanelH * scale - ROW_GAP);

    this.tabRow.scale.set(scale);
    this.tabRow.position.set(tabX + PAD * scale, tabY + PAD * scale);
    this.toolRow.scale.set(scale);
    this.toolRow.position.set(toolX + PAD * scale, toolY + PAD * scale);

    const accent = this.openAccent();
    this.tabPanel
      .clear()
      .roundRect(tabX, tabY, tabPanelW * scale, tabPanelH * scale, 14)
      .fill({ color: 0x161a22, alpha: 0.94 })
      .stroke({ width: 2, color: 0x2c333f });
    this.toolPanel
      .clear()
      .roundRect(toolX, toolY, toolPanelW * scale, toolPanelH * scale, 12)
      .fill({ color: 0x161a22, alpha: 0.94 })
      .stroke({ width: 2, color: accent, alpha: 0.85 });

    this.tabPanelRect = { x: tabX, y: tabY, w: tabPanelW * scale, h: tabPanelH * scale };
    this.toolPanelRect = { x: toolX, y: toolY, w: toolPanelW * scale, h: toolPanelH * scale };

    this.tabRects.clear();
    for (const tab of this.tabs) {
      this.tabRects.set(tab.id, {
        x: tabX + (PAD + tab.localX) * scale,
        y: tabY + PAD * scale,
        w: TAB_W * scale,
        h: TAB_H * scale,
      });
    }
    this.toolRects.clear();
    for (const btn of this.toolButtons) {
      this.toolRects.set(btn.def.tool, {
        x: toolX + (PAD + btn.localX) * scale,
        y: toolY + PAD * scale,
        w: BTN_W * scale,
        h: BTN_H * scale,
      });
    }
  }

  /** Accent colour of the currently open category. */
  private openAccent(): number {
    return CATEGORIES.find((c) => c.id === this.activeCategory)?.accent ?? 0x47505f;
  }

  /** Repaint every tab and tool button for the current active state. */
  private refresh(): void {
    for (const tab of this.tabs) {
      const open = tab.id === "inspect"
        ? this.activeTool === "inspect"
        : tab.id === this.activeCategory;
      tab.bg
        .clear()
        .roundRect(0, 0, TAB_W, TAB_H, 9)
        .fill(open ? 0x2f3744 : 0x222833)
        .stroke({ width: open ? 3 : 2, color: open ? tab.accent : 0x3a4350 });
      tab.label.style.fill = open ? 0xffffff : 0xb6bdc7;
    }
    for (const btn of this.toolButtons) {
      const on = btn.def.tool === this.activeTool;
      const accent = btn.def.accent ?? 0x6b7686;
      btn.bg
        .clear()
        .roundRect(0, 0, BTN_W, BTN_H, 10)
        .fill(on ? 0x2f3744 : 0x222833)
        .stroke({ width: on ? 3 : 2, color: on ? ACTIVE : accent });
      if (on) {
        btn.bg
          .roundRect(2, 2, BTN_W - 4, BTN_H - 4, 8)
          .stroke({ width: 1, color: 0xffce7a, alpha: 0.5 });
      }
      btn.label.style.fill = on ? 0xffce7a : 0xc6cdd6;
    }
  }

  /* ---- builders -------------------------------------------------------- */

  private makeTab(id: string, label: string, accent: number, icon?: Texture): TabButton {
    const container = new Container();
    const bg = new Graphics();
    container.addChild(bg);

    if (icon) {
      const sprite = new Sprite(icon);
      sprite.anchor.set(0.5);
      const s = TAB_ICON / Math.max(sprite.texture.width, sprite.texture.height, 1);
      sprite.scale.set(s);
      sprite.x = TAB_W / 2;
      sprite.y = TAB_ICON / 2 + 6;
      container.addChild(sprite);
    }

    const text = new Text({
      text: label,
      style: {
        fill: 0xc6cdd6,
        fontSize: 11,
        fontFamily: "ui-sans-serif, system-ui, sans-serif",
        fontWeight: "700",
      },
    });
    text.anchor.set(0.5);
    text.x = TAB_W / 2;
    text.y = TAB_H - 11;
    container.addChild(text);
    return { id, container, bg, label: text, accent, localX: 0 };
  }

  private makeToolButton(def: ToolDef, icon?: Texture): ToolButton {
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

  /* ---- tooltip --------------------------------------------------------- */

  private showToolTip(tool: Tool, rect: ScreenRect): void {
    const def = toolDef(tool);
    this.drawTooltip(`tool:${tool}`, def.label, def.desc, def.keyLabel, rect);
  }

  private showTabTip(id: string, rect: ScreenRect): void {
    if (id === "inspect") {
      const def = toolDef("inspect");
      this.drawTooltip("tab:inspect", def.label, def.desc, def.keyLabel, rect);
      return;
    }
    const cat = CATEGORIES.find((c) => c.id === id);
    if (!cat) return;
    const names = cat.tools.map((t) => toolDef(t).label).join(", ");
    this.drawTooltip(`tab:${id}`, cat.label, names, "", rect);
  }

  private drawTooltip(
    key: string,
    name: string,
    desc: string,
    keyLabel: string,
    rect: ScreenRect,
  ): void {
    if (key === this.hoverKey) return;
    this.hoverKey = key;

    this.tipName.text = name;
    this.tipDesc.text = desc;
    this.tipKey.text = keyLabel;

    const padX = 10;
    const padY = 8;
    const gap = 3;
    const hasKey = keyLabel.length > 0;
    const keyW = hasKey ? this.tipKey.width + 12 : 0;
    const keyH = 16;
    const contentW = Math.max(
      this.tipName.width + (hasKey ? keyW + 10 : 0),
      this.tipDesc.width,
    );
    const w = contentW + padX * 2;
    const h = padY * 2 + this.tipName.height + gap + this.tipDesc.height;

    this.tipBg
      .clear()
      .roundRect(0, 0, w, h, 8)
      .fill({ color: 0x12161d, alpha: 0.97 })
      .stroke({ width: 1, color: 0x3a4350 });
    this.tipName.position.set(padX, padY);
    if (hasKey) {
      const keyX = padX + contentW - keyW;
      this.tipKeyBg.clear().roundRect(keyX, padY, keyW, keyH, 4).fill(0xf0a23a);
      this.tipKey.position.set(
        keyX + (keyW - this.tipKey.width) / 2,
        padY + (keyH - this.tipKey.height) / 2,
      );
    } else {
      this.tipKeyBg.clear();
    }
    this.tipDesc.position.set(padX, padY + this.tipName.height + gap);

    const screenX = Math.min(
      Math.max(8, rect.x + rect.w / 2 - w / 2),
      Math.max(8, this.screenW - w - 8),
    );
    this.tooltip.position.set(Math.round(screenX), Math.round(rect.y - h - 8));
    this.tooltip.visible = true;
  }
}

function inRect(r: ScreenRect, x: number, y: number): boolean {
  return x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h;
}
