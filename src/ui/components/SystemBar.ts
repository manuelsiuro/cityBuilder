import { Container, Graphics, Sprite, Text, type Texture } from "pixi.js";

export type SystemAction = "new" | "save" | "load";

/** Icon textures keyed by action; a missing entry falls back to text only. */
export type SystemIcons = Partial<Record<SystemAction, Texture>>;

const BTN_W = 96;
const BTN_H = 36;
const GAP = 6;
const MARGIN = 12;
const ICON = 22;
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

/** Top-right cluster of New / Save / Load buttons, each with a glyph. */
export class SystemBar {
  readonly container = new Container();

  private readonly buttons: SysButton[] = [];
  private readonly rects = new Map<SystemAction, { x: number; y: number; w: number; h: number }>();

  constructor(
    private readonly onAction: (action: SystemAction) => void,
    icons: SystemIcons = {},
  ) {
    DEFS.forEach((def, i) => {
      const c = new Container();
      const bg = new Graphics()
        .roundRect(0, 0, BTN_W, BTN_H, 9)
        .fill({ color: 0x222833, alpha: 0.95 })
        .stroke({ width: 1.5, color: 0x3a4250 });
      c.addChild(bg);

      let labelX = BTN_W / 2;
      const icon = icons[def.id];
      if (icon) {
        const sprite = new Sprite(icon);
        sprite.anchor.set(0.5);
        const s = ICON / Math.max(sprite.texture.width, sprite.texture.height, 1);
        sprite.scale.set(s);
        sprite.position.set(20, BTN_H / 2);
        c.addChild(sprite);
        labelX = 20 + ICON / 2 + (BTN_W - 20 - ICON / 2) / 2;
      }

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
      label.position.set(labelX, BTN_H / 2);
      c.addChild(label);

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
