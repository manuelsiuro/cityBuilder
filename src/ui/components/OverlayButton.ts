import { Container, Graphics, Text } from "pixi.js";

const MODES = ["off", "power", "water", "police", "fire"] as const;
export type OverlayChoice = (typeof MODES)[number];

const LABEL: Record<OverlayChoice, string> = {
  off: "Overlay: Off",
  power: "Overlay: Power",
  water: "Overlay: Water",
  police: "Overlay: Police",
  fire: "Overlay: Fire",
};
const FILL: Record<OverlayChoice, number> = {
  off: 0x2b313c,
  power: 0x2f6f3a,
  water: 0x2f5a7a,
  police: 0x344a73,
  fire: 0x73402f,
};

const W = 168;
const H = 38;
const MARGIN = 12;

/** Top-right button that cycles the power / water coverage overlay. */
export class OverlayButton {
  readonly container = new Container();

  private readonly bg = new Graphics();
  private readonly label: Text;
  private index = 0;
  private rect = { x: 0, y: 0, w: W, h: H };

  constructor(private readonly onChange: (mode: OverlayChoice) => void) {
    this.label = new Text({
      text: LABEL.off,
      style: {
        fill: 0xeef2f6,
        fontSize: 14,
        fontFamily: "ui-sans-serif, system-ui, sans-serif",
        fontWeight: "600",
      },
    });
    this.label.anchor.set(0.5);
    this.label.x = W / 2;
    this.label.y = H / 2;
    this.container.addChild(this.bg, this.label);
    this.refresh();
  }

  layout(screenW: number): void {
    this.container.x = Math.round(screenW - W - MARGIN);
    this.container.y = MARGIN;
    this.rect = { x: this.container.x, y: this.container.y, w: W, h: H };
  }

  hitTest(x: number, y: number): boolean {
    const r = this.rect;
    return x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h;
  }

  /** Advance to the next overlay mode and notify the listener. */
  cycle(): void {
    this.index = (this.index + 1) % MODES.length;
    this.refresh();
    this.onChange(MODES[this.index]);
  }

  private refresh(): void {
    const mode = MODES[this.index];
    this.bg
      .clear()
      .roundRect(0, 0, W, H, 8)
      .fill(FILL[mode])
      .stroke({ width: 2, color: 0x47505f });
    this.label.text = LABEL[mode];
  }
}
