import { Container, Graphics, Text } from "pixi.js";
import { drawIcon, ICON_SIZE, type TileIconKind } from "./tileIcons";

const W = 260;
const PAD = 12;
const TITLE_H = 26;
const ROW_H = 20;
const SECTION_GAP = 8;
const SECTION_HEADER_H = 14;
const ICON_GUTTER = 20;
const LABEL_X = PAD + ICON_GUTTER;
const VALUE_X = W - PAD;
const MARGIN = 12;
const CLOSE = 22;

const FONT = "ui-sans-serif, system-ui, sans-serif";

const COLOR_NEUTRAL_VALUE = 0xe6ebf1;
const COLOR_LABEL = 0x9aa6b4;
const COLOR_ICON_NEUTRAL = 0x9aa6b4;
const COLOR_SECTION = 0x8b95a1;
const COLOR_DIVIDER = 0x2c333f;
const COLOR_BAR_OFF = 0x39414d;

const TONE_COLORS: Record<TileTone, number> = {
  good: 0x6fcf7f,
  bad: 0xc0606a,
  warn: 0xe6a23a,
  neutral: 0xc6cdd6,
};

export type TileTone = "good" | "bad" | "warn" | "neutral";

export type TileInfoRow =
  | { kind: "text"; icon: TileIconKind; label: string; value: string; tone?: TileTone }
  | { kind: "pill"; icon: TileIconKind; label: string; text: string; tone: TileTone }
  | { kind: "bar"; icon: TileIconKind; label: string; value: number; max: number; tone?: TileTone };

export interface TileInfoSection {
  title: string;
  rows: TileInfoRow[];
}

export interface TileInfo {
  title: string;
  sections: TileInfoSection[];
}

interface SectionSlot {
  container: Container;
  header: Text;
  divider: Graphics;
}

interface RowSlot {
  container: Container;
  icon: Graphics;
  label: Text;
  valueText: Text;
  pillBg: Graphics;
  pillText: Text;
  bar: Graphics;
  barText: Text;
}

/**
 * Right-edge panel that reports the facts of a tile clicked with the Inspect
 * tool. Purely presentational — `App` reads `CityData` and passes a formatted
 * `TileInfo`; the panel never touches the simulation.
 */
export class TileInspector {
  readonly container = new Container();

  private readonly panel = new Graphics();
  private readonly close = new Graphics();
  private readonly title: Text;
  private readonly sectionPool: SectionSlot[] = [];
  private readonly rowPool: RowSlot[] = [];
  private screenW = 0;
  private screenH = 0;
  private panelH = 0;

  constructor() {
    this.title = new Text({
      text: "",
      style: { fill: 0xffce7a, fontSize: 14, fontFamily: FONT, fontWeight: "700" },
    });
    this.title.position.set(PAD, PAD);
    this.container.addChild(this.panel, this.title, this.close);
    this.container.visible = false;
  }

  /** Show the panel populated with `info`, resizing to fit its sections. */
  show(info: TileInfo): void {
    this.title.text = info.title;

    let y = TITLE_H + PAD;
    let sectionIdx = 0;
    let rowIdx = 0;

    for (const section of info.sections) {
      if (section.rows.length === 0) continue;

      const slot = this.ensureSection(sectionIdx++);
      slot.container.visible = true;
      slot.container.position.set(0, y);
      slot.header.text = section.title.toUpperCase();
      slot.header.position.set(PAD, 0);
      slot.divider
        .clear()
        .moveTo(PAD, SECTION_HEADER_H - 2)
        .lineTo(W - PAD, SECTION_HEADER_H - 2)
        .stroke({ width: 1, color: COLOR_DIVIDER });
      y += SECTION_HEADER_H + 4;

      for (const row of section.rows) {
        const r = this.ensureRow(rowIdx++);
        r.container.visible = true;
        r.container.position.set(0, y);
        this.layoutRow(r, row);
        y += ROW_H;
      }

      y += SECTION_GAP;
    }

    // Hide any leftover slots from a previous show().
    for (let i = sectionIdx; i < this.sectionPool.length; i++) {
      this.sectionPool[i].container.visible = false;
    }
    for (let i = rowIdx; i < this.rowPool.length; i++) {
      this.rowPool[i].container.visible = false;
    }

    this.panelH = Math.max(y - SECTION_GAP + PAD, TITLE_H + PAD * 2);
    this.draw();
    this.container.visible = true;
    this.reposition();
  }

  hide(): void {
    this.container.visible = false;
  }

  get visible(): boolean {
    return this.container.visible;
  }

  layout(screenW: number, screenH: number): void {
    this.screenW = screenW;
    this.screenH = screenH;
    if (this.container.visible) this.reposition();
  }

  /** True if `(x, y)` is anywhere on the panel — input should not paint. */
  hitTest(x: number, y: number): boolean {
    if (!this.container.visible) return false;
    const { x: px, y: py } = this.container.position;
    return x >= px && x <= px + W && y >= py && y <= py + this.panelH;
  }

  /** True if `(x, y)` hit the close button. */
  closeHitTest(x: number, y: number): boolean {
    if (!this.container.visible) return false;
    const { x: px, y: py } = this.container.position;
    const cx = px + W - CLOSE - 6;
    const cy = py + 6;
    return x >= cx && x <= cx + CLOSE && y >= cy && y <= cy + CLOSE;
  }

  private ensureSection(index: number): SectionSlot {
    let slot = this.sectionPool[index];
    if (!slot) {
      const container = new Container();
      const header = new Text({
        text: "",
        style: {
          fill: COLOR_SECTION,
          fontSize: 10,
          fontFamily: FONT,
          fontWeight: "700",
          letterSpacing: 1.2,
        },
      });
      const divider = new Graphics();
      container.addChild(divider, header);
      this.container.addChild(container);
      slot = { container, header, divider };
      this.sectionPool[index] = slot;
    }
    return slot;
  }

  private ensureRow(index: number): RowSlot {
    let slot = this.rowPool[index];
    if (!slot) {
      const container = new Container();
      const icon = new Graphics();
      icon.position.set(PAD, (ROW_H - ICON_SIZE) / 2);
      const label = new Text({
        text: "",
        style: { fill: COLOR_LABEL, fontSize: 12, fontFamily: FONT },
      });
      label.position.set(LABEL_X, 2);
      const valueText = new Text({
        text: "",
        style: { fill: COLOR_NEUTRAL_VALUE, fontSize: 12, fontFamily: FONT, fontWeight: "600" },
      });
      valueText.anchor.set(1, 0);
      valueText.position.set(VALUE_X, 2);
      const pillBg = new Graphics();
      const pillText = new Text({
        text: "",
        style: { fill: COLOR_NEUTRAL_VALUE, fontSize: 11, fontFamily: FONT, fontWeight: "600" },
      });
      pillText.anchor.set(1, 0.5);
      const bar = new Graphics();
      const barText = new Text({
        text: "",
        style: { fill: COLOR_NEUTRAL_VALUE, fontSize: 11, fontFamily: FONT, fontWeight: "600" },
      });
      barText.anchor.set(1, 0);
      barText.position.set(VALUE_X, 3);

      container.addChild(icon, label, valueText, pillBg, pillText, bar, barText);
      this.container.addChild(container);
      slot = { container, icon, label, valueText, pillBg, pillText, bar, barText };
      this.rowPool[index] = slot;
    }
    return slot;
  }

  private layoutRow(slot: RowSlot, row: TileInfoRow): void {
    const tone = "tone" in row && row.tone ? row.tone : undefined;
    const iconColor = tone ? TONE_COLORS[tone] : COLOR_ICON_NEUTRAL;
    slot.icon.clear();
    drawIcon(slot.icon, row.icon, iconColor);

    slot.label.text = row.label;
    slot.label.visible = true;

    slot.valueText.visible = false;
    slot.pillBg.visible = false;
    slot.pillText.visible = false;
    slot.bar.visible = false;
    slot.barText.visible = false;

    if (row.kind === "text") {
      slot.valueText.visible = true;
      slot.valueText.text = row.value;
      slot.valueText.style.fill = tone ? TONE_COLORS[tone] : COLOR_NEUTRAL_VALUE;
    } else if (row.kind === "pill") {
      slot.pillText.visible = true;
      slot.pillBg.visible = true;
      slot.pillText.text = row.text;
      slot.pillText.style.fill = TONE_COLORS[row.tone];
      const padX = 8;
      const h = 16;
      const w = Math.ceil(slot.pillText.width) + padX * 2;
      const x = VALUE_X - w;
      const yCenter = ROW_H / 2;
      slot.pillBg
        .clear()
        .roundRect(x, yCenter - h / 2, w, h, 6)
        .fill({ color: TONE_COLORS[row.tone], alpha: 0.18 });
      slot.pillText.position.set(VALUE_X - padX, yCenter);
    } else {
      slot.bar.visible = true;
      slot.barText.visible = true;
      slot.barText.text = String(row.value);
      const numberW = Math.ceil(slot.barText.width);
      const barColor = tone ? TONE_COLORS[tone] : TONE_COLORS.neutral;
      const cells = 5;
      const cellW = 8;
      const cellH = 6;
      const gap = 2;
      const totalBarW = cells * cellW + (cells - 1) * gap;
      const barRight = VALUE_X - numberW - 6;
      const barLeft = barRight - totalBarW;
      const yCenter = ROW_H / 2;
      const ratio = Math.max(0, Math.min(1, row.value / row.max));
      const lit = Math.round(ratio * cells);
      slot.bar.clear();
      for (let i = 0; i < cells; i++) {
        const cx = barLeft + i * (cellW + gap);
        slot.bar
          .roundRect(cx, yCenter - cellH / 2, cellW, cellH, 1.5)
          .fill({ color: i < lit ? barColor : COLOR_BAR_OFF });
      }
      slot.barText.style.fill = tone ? TONE_COLORS[tone] : COLOR_NEUTRAL_VALUE;
    }
  }

  private reposition(): void {
    this.container.position.set(
      Math.round(this.screenW - W - MARGIN),
      Math.round((this.screenH - this.panelH) / 2),
    );
  }

  private draw(): void {
    this.panel
      .clear()
      .roundRect(0, 0, W, this.panelH, 12)
      .fill({ color: 0x161a22, alpha: 0.94 })
      .stroke({ width: 2, color: 0x2c333f });

    const cx = W - CLOSE - 6;
    this.close
      .clear()
      .roundRect(cx, 6, CLOSE, CLOSE, 6)
      .fill(0x2b333f)
      .moveTo(cx + 7, 6 + 7)
      .lineTo(cx + CLOSE - 7, 6 + CLOSE - 7)
      .moveTo(cx + CLOSE - 7, 6 + 7)
      .lineTo(cx + 7, 6 + CLOSE - 7)
      .stroke({ width: 2, color: 0xc6cdd6 });
  }
}
