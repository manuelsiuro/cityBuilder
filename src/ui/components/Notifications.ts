import { Container, Graphics, Text } from "pixi.js";

const W = 250;
const H = 30;
const GAP = 6;
const MARGIN = 12;
/** Below the debug HUD. */
const TOP = 44;
const LIFE_MS = 4200;
const FADE_MS = 900;
const MAX = 4;

interface Toast {
  box: Container;
  life: number;
}

/** Top-left feed of transient notification toasts that fade out. */
export class Notifications {
  readonly container = new Container();

  private readonly toasts: Toast[] = [];

  constructor() {
    this.container.position.set(MARGIN, TOP);
  }

  layout(): void {
    this.container.position.set(MARGIN, TOP);
  }

  /** Show a message. The oldest toast is dropped past the cap. */
  push(text: string): void {
    const box = new Container();
    const bg = new Graphics()
      .roundRect(0, 0, W, H, 7)
      .fill({ color: 0x1d2530, alpha: 0.92 })
      .stroke({ width: 1, color: 0x3f6f8c });
    const label = new Text({
      text,
      style: {
        fill: 0xdfe6ee,
        fontSize: 12.5,
        fontFamily: "ui-sans-serif, system-ui, sans-serif",
      },
    });
    label.anchor.set(0, 0.5);
    label.position.set(10, H / 2);
    box.addChild(bg, label);
    this.container.addChild(box);
    this.toasts.unshift({ box, life: LIFE_MS });

    while (this.toasts.length > MAX) {
      const dropped = this.toasts.pop()!;
      this.container.removeChild(dropped.box);
      dropped.box.destroy({ children: true });
    }
    this.reflow();
  }

  /** Advance fade timers. Driven by the Pixi ticker. */
  update(dtMs: number): void {
    let changed = false;
    for (let i = this.toasts.length - 1; i >= 0; i--) {
      const toast = this.toasts[i];
      toast.life -= dtMs;
      if (toast.life <= 0) {
        this.container.removeChild(toast.box);
        toast.box.destroy({ children: true });
        this.toasts.splice(i, 1);
        changed = true;
        continue;
      }
      toast.box.alpha = toast.life < FADE_MS ? toast.life / FADE_MS : 1;
    }
    if (changed) this.reflow();
  }

  private reflow(): void {
    this.toasts.forEach((toast, i) => {
      toast.box.y = i * (H + GAP);
    });
  }
}
