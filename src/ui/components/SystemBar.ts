import { Container, Graphics, Text } from "pixi.js";

export type SystemAction = "new" | "save" | "load";

const BTN_W = 66;
const BTN_H = 32;
const GAP = 6;
const MARGIN = 12;
/** Sits below the overlay button (12 + 38 + 8). */
const TOP = 58;

const DEFS: { id: SystemAction; label: string }[] = [
  { id: "new", label: "New" },
  { id: "save", label: "Save" },
  { id: "load", label: "Load" },
];

interface SysButton {
  id: SystemAction;
  container: Container;
  localX: number;
}

/** Top-right cluster of New / Save / Load buttons. */
export class SystemBar {
  readonly container = new Container();

  private readonly buttons: SysButton[] = [];
  private readonly rects = new Map<SystemAction, { x: number; y: number; w: number; h: number }>();

  constructor(private readonly onAction: (action: SystemAction) => void) {
    DEFS.forEach((def, i) => {
      const c = new Container();
      const bg = new Graphics()
        .roundRect(0, 0, BTN_W, BTN_H, 7)
        .fill({ color: 0x2b313c, alpha: 0.92 })
        .stroke({ width: 1, color: 0x47505f });
      const label = new Text({
        text: def.label,
        style: {
          fill: 0xdfe6ee,
          fontSize: 13,
          fontFamily: "ui-sans-serif, system-ui, sans-serif",
          fontWeight: "600",
        },
      });
      label.anchor.set(0.5);
      label.position.set(BTN_W / 2, BTN_H / 2);
      c.addChild(bg, label);
      const localX = i * (BTN_W + GAP);
      c.x = localX;
      this.container.addChild(c);
      this.buttons.push({ id: def.id, container: c, localX });
    });
  }

  layout(screenW: number): void {
    const totalW = DEFS.length * BTN_W + (DEFS.length - 1) * GAP;
    this.container.x = Math.round(screenW - totalW - MARGIN);
    this.container.y = TOP;
    this.rects.clear();
    for (const b of this.buttons) {
      this.rects.set(b.id, {
        x: this.container.x + b.localX,
        y: TOP,
        w: BTN_W,
        h: BTN_H,
      });
    }
  }

  hitTest(x: number, y: number): boolean {
    for (const r of this.rects.values()) {
      if (x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h) return true;
    }
    return false;
  }

  /** Fire the action under a tap. Returns true if one was hit. */
  activate(x: number, y: number): boolean {
    for (const [id, r] of this.rects) {
      if (x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h) {
        this.onAction(id);
        return true;
      }
    }
    return false;
  }
}
