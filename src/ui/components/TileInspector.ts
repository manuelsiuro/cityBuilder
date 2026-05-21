import { Container, Graphics, Text } from "pixi.js";

const W = 212;
const PAD = 12;
const TITLE_H = 26;
const ROW_H = 21;
const MARGIN = 12;
const CLOSE = 22;

/** One labelled fact about a tile. */
export interface TileInfoRow {
  label: string;
  value: string;
  /** Optional value-text tint (e.g. green for "Powered"). */
  accent?: number;
}

/** A formatted snapshot of a tile, built by `App` from `CityData`. */
export interface TileInfo {
  title: string;
  rows: TileInfoRow[];
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
  private readonly rowText: Text[] = [];
  private screenW = 0;
  private screenH = 0;
  private panelH = 0;

  constructor() {
    this.title = new Text({
      text: "",
      style: {
        fill: 0xffce7a,
        fontSize: 14,
        fontFamily: "ui-sans-serif, system-ui, sans-serif",
        fontWeight: "700",
      },
    });
    this.title.position.set(PAD, PAD);
    this.container.addChild(this.panel, this.title, this.close);
    this.container.visible = false;
  }

  /** Show the panel populated with `info`, resizing to fit its rows. */
  show(info: TileInfo): void {
    this.title.text = info.title;
    this.panelH = TITLE_H + PAD + info.rows.length * ROW_H + PAD;

    // Grow the pooled row-text objects to match the row count.
    while (this.rowText.length < info.rows.length) {
      const label = new Text({
        text: "",
        style: {
          fill: 0x9aa6b4,
          fontSize: 12,
          fontFamily: "ui-sans-serif, system-ui, sans-serif",
        },
      });
      const value = new Text({
        text: "",
        style: {
          fill: 0xe6ebf1,
          fontSize: 12,
          fontFamily: "ui-sans-serif, system-ui, sans-serif",
          fontWeight: "600",
        },
      });
      value.anchor.set(1, 0);
      this.rowText.push(label, value);
      this.container.addChild(label, value);
    }

    for (let r = 0; r < this.rowText.length / 2; r++) {
      const label = this.rowText[r * 2];
      const value = this.rowText[r * 2 + 1];
      const row = info.rows[r];
      if (!row) {
        label.visible = false;
        value.visible = false;
        continue;
      }
      const y = TITLE_H + PAD + r * ROW_H;
      label.visible = true;
      value.visible = true;
      label.text = row.label;
      label.position.set(PAD, y);
      value.text = row.value;
      value.position.set(W - PAD, y);
      value.style.fill = row.accent ?? 0xe6ebf1;
    }

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
