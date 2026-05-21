import { Container, Graphics, Text } from "pixi.js";

const H = 30;
const PAD_X = 14;

/**
 * Small panel shown while dragging a rubber-band selection: how many tiles the
 * stroke covers and, for tools that charge, the total cost. Hidden otherwise.
 */
export class SelectionReadout {
  readonly container = new Container();

  private readonly bg = new Graphics();
  private readonly label: Text;
  private screenW = 0;

  constructor() {
    this.label = new Text({
      text: "",
      style: {
        fill: 0xe8edf2,
        fontSize: 15,
        fontFamily: "ui-sans-serif, system-ui, sans-serif",
        fontWeight: "700",
      },
    });
    this.label.anchor.set(0.5, 0.5);
    this.container.addChild(this.bg, this.label);
    this.container.visible = false;
  }

  layout(screenW: number): void {
    this.screenW = screenW;
    this.reposition();
  }

  /** Show the readout. `cost` is null for tools that charge nothing (bulldoze). */
  show(tiles: number, cost: number | null, affordable: boolean): void {
    const plural = tiles === 1 ? "tile" : "tiles";
    this.label.text =
      cost === null
        ? `${tiles} ${plural}`
        : `${tiles} ${plural} · $${cost.toLocaleString("en-US")}`;
    this.label.style.fill = cost !== null && !affordable ? 0xd6645a : 0xe8edf2;

    const w = Math.ceil(this.label.width) + PAD_X * 2;
    this.bg
      .clear()
      .roundRect(0, 0, w, H, 8)
      .fill({ color: 0x161a20, alpha: 0.88 })
      .stroke({ width: 1, color: 0x39414d });
    this.label.position.set(w / 2, H / 2);

    this.container.visible = true;
    this.reposition();
  }

  hide(): void {
    this.container.visible = false;
  }

  private reposition(): void {
    // Top-centre, just below the budget bar.
    this.container.x = Math.round((this.screenW - this.bg.width) / 2);
    this.container.y = 78;
  }
}
