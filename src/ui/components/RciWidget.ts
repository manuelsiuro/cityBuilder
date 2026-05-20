import { Container, Graphics, Text } from "pixi.js";

const BAR_W = 26;
const BAR_H = 96;
const GAP = 10;
const PAD = 12;
const HEADER = 18;
const PANEL_W = PAD * 2 + BAR_W * 3 + GAP * 2;
const PANEL_H = PAD * 2 + HEADER + BAR_H + 18;
const MARGIN = 16;

const COLORS = [0x49c46a, 0x4a90d8, 0xe0b53c];
const LETTERS = ["R", "C", "I"];

/**
 * Bottom-left RCI demand gauge: three bars filling up (demand) or down
 * (surplus) from a centre baseline. Redraws only when a value changes.
 */
export class RciWidget {
  readonly container = new Container();

  private readonly bars = new Graphics();
  private last: [number, number, number] = [NaN, NaN, NaN];

  constructor() {
    const bg = new Graphics()
      .roundRect(0, 0, PANEL_W, PANEL_H, 10)
      .fill({ color: 0x161a20, alpha: 0.82 })
      .stroke({ width: 1, color: 0x39414d });
    this.container.addChild(bg, this.bars);

    const header = new Text({
      text: "DEMAND",
      style: {
        fill: 0x8b95a1,
        fontSize: 11,
        fontFamily: "ui-sans-serif, system-ui, sans-serif",
        fontWeight: "700",
        letterSpacing: 1.5,
      },
    });
    header.anchor.set(0.5, 0);
    header.x = PANEL_W / 2;
    header.y = PAD - 2;
    this.container.addChild(header);

    LETTERS.forEach((ch, k) => {
      const label = new Text({
        text: ch,
        style: {
          fill: 0xcfd6de,
          fontSize: 13,
          fontFamily: "ui-sans-serif, system-ui, sans-serif",
          fontWeight: "700",
        },
      });
      label.anchor.set(0.5);
      label.x = PAD + BAR_W / 2 + k * (BAR_W + GAP);
      label.y = PANEL_H - 11;
      this.container.addChild(label);
    });
  }

  layout(_screenW: number, screenH: number): void {
    this.container.x = MARGIN;
    this.container.y = screenH - PANEL_H - MARGIN;
  }

  /** Update the three demand values (each −100..100). */
  update(r: number, c: number, i: number): void {
    if (this.last[0] === r && this.last[1] === c && this.last[2] === i) return;
    this.last = [r, c, i];

    const g = this.bars.clear();
    const top = PAD + HEADER;
    const midY = top + BAR_H / 2;
    [r, c, i].forEach((demand, k) => {
      const x = PAD + k * (BAR_W + GAP);
      g.roundRect(x, top, BAR_W, BAR_H, 4).fill(0x0e1116);
      const frac = Math.max(-1, Math.min(1, demand / 100));
      const h = Math.abs(frac) * (BAR_H / 2);
      if (h > 0.5) {
        const y = frac >= 0 ? midY - h : midY;
        g.rect(x + 3, y, BAR_W - 6, h).fill(COLORS[k]);
      }
    });
    g.rect(PAD - 3, midY, PANEL_W - 2 * (PAD - 3), 1).fill(0x5a6472);
  }
}
