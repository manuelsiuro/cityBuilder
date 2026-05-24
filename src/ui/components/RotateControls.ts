import { Container, Graphics, Text } from "pixi.js";

const BTN_SIZE = 36;
const GAP = 6;
const MARGIN = 16;
/** Stack the cluster directly above the minimap (166 + frame + margin + own gap). */
const MINIMAP_STACK = 166 + 8 + MARGIN + 8;

interface Button {
  dir: number;
  container: Container;
  localX: number;
}

/**
 * Two-button cluster (rotate left / rotate right) anchored above the minimap.
 * Drives the same `IsoCamera.rotate(dir)` path the Q/E keys already use.
 */
export class RotateControls {
  readonly container = new Container();

  private readonly buttons: Button[] = [];
  private readonly rects = new Map<number, { x: number; y: number; w: number; h: number }>();

  constructor(private readonly onRotate: (dir: number) => void) {
    const defs: { dir: number; glyph: string }[] = [
      { dir: -1, glyph: "↺" },
      { dir: +1, glyph: "↻" },
    ];
    defs.forEach((def, i) => {
      const c = new Container();
      const bg = new Graphics()
        .roundRect(0, 0, BTN_SIZE, BTN_SIZE, 9)
        .fill({ color: 0x222833, alpha: 0.95 })
        .stroke({ width: 1.5, color: 0x3a4250 });
      c.addChild(bg);

      const label = new Text({
        text: def.glyph,
        style: {
          fill: 0xdfe6ee,
          fontSize: 22,
          fontFamily: "ui-sans-serif, system-ui, sans-serif",
          fontWeight: "600",
        },
      });
      label.anchor.set(0.5);
      label.position.set(BTN_SIZE / 2, BTN_SIZE / 2 + 1);
      c.addChild(label);

      const localX = i * (BTN_SIZE + GAP);
      c.x = localX;
      this.container.addChild(c);
      this.buttons.push({ dir: def.dir, container: c, localX });
    });
  }

  layout(screenW: number, screenH: number): void {
    const totalW = this.buttons.length * BTN_SIZE + (this.buttons.length - 1) * GAP;
    this.container.x = Math.round(screenW - totalW - MARGIN);
    this.container.y = Math.round(screenH - MINIMAP_STACK - BTN_SIZE);
    this.rects.clear();
    for (const b of this.buttons) {
      this.rects.set(b.dir, {
        x: this.container.x + b.localX,
        y: this.container.y,
        w: BTN_SIZE,
        h: BTN_SIZE,
      });
    }
  }

  hitTest(x: number, y: number): boolean {
    for (const r of this.rects.values()) {
      if (x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h) return true;
    }
    return false;
  }

  /** Fire the rotate action under a tap. Returns true if one was hit. */
  activate(x: number, y: number): boolean {
    for (const [dir, r] of this.rects) {
      if (x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h) {
        this.onRotate(dir);
        return true;
      }
    }
    return false;
  }
}
