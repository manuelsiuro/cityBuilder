import type { Graphics } from "pixi.js";

export type TileIconKind =
  | "terrain"
  | "biome"
  | "elevation"
  | "building"
  | "zone"
  | "surface"
  | "power"
  | "water"
  | "land"
  | "pollution"
  | "police"
  | "fire"
  | "health";

/** Box every icon is drawn inside. Keep glyphs visually centered in this box. */
export const ICON_SIZE = 14;

/**
 * Draw a tiny monochrome glyph into `g`, sized to fit a 14×14 box at (0, 0).
 * The caller clears `g` and positions it; this function only paints.
 */
export function drawIcon(g: Graphics, kind: TileIconKind, color: number): void {
  const stroke = { width: 1.4, color, cap: "round" as const, join: "round" as const };
  const fill = { color };

  switch (kind) {
    case "terrain": {
      // Two rolling hills.
      g.moveTo(1, 11).quadraticCurveTo(4, 4, 7, 11).quadraticCurveTo(10, 6, 13, 11)
        .stroke(stroke);
      g.moveTo(1, 13).lineTo(13, 13).stroke(stroke);
      return;
    }
    case "biome": {
      // Leaf.
      g.moveTo(2, 12).quadraticCurveTo(2, 2, 12, 2).quadraticCurveTo(12, 12, 2, 12)
        .stroke(stroke);
      g.moveTo(3, 11).lineTo(11, 3).stroke({ ...stroke, width: 1 });
      return;
    }
    case "elevation": {
      // Up-arrow on a baseline.
      g.moveTo(2, 13).lineTo(12, 13).stroke(stroke);
      g.moveTo(7, 11).lineTo(7, 3).stroke(stroke);
      g.moveTo(4, 6).lineTo(7, 3).lineTo(10, 6).stroke(stroke);
      return;
    }
    case "building": {
      // House: square with roof.
      g.moveTo(2, 7).lineTo(7, 2).lineTo(12, 7).stroke(stroke);
      g.rect(3, 7, 8, 6).stroke(stroke);
      g.rect(6, 9, 2, 4).fill(fill);
      return;
    }
    case "zone": {
      // Dashed plot square.
      const seg = (x1: number, y1: number, x2: number, y2: number) =>
        g.moveTo(x1, y1).lineTo(x2, y2).stroke(stroke);
      seg(2, 2, 6, 2); seg(8, 2, 12, 2);
      seg(12, 2, 12, 6); seg(12, 8, 12, 12);
      seg(12, 12, 8, 12); seg(6, 12, 2, 12);
      seg(2, 12, 2, 8); seg(2, 6, 2, 2);
      return;
    }
    case "surface": {
      // Three horizontal bands.
      g.moveTo(2, 4).lineTo(12, 4).stroke(stroke);
      g.moveTo(2, 7).lineTo(12, 7).stroke(stroke);
      g.moveTo(2, 10).lineTo(12, 10).stroke(stroke);
      return;
    }
    case "power": {
      // Lightning bolt.
      g.poly([8, 1, 3, 8, 7, 8, 6, 13, 11, 6, 7, 6, 8, 1]).fill(fill);
      return;
    }
    case "water": {
      // Droplet.
      g.moveTo(7, 1)
        .quadraticCurveTo(13, 7, 10, 11)
        .quadraticCurveTo(7, 14, 4, 11)
        .quadraticCurveTo(1, 7, 7, 1)
        .fill(fill);
      return;
    }
    case "land": {
      // Coin / value disc.
      g.circle(7, 7, 5).stroke(stroke);
      g.moveTo(7, 3.5).lineTo(7, 10.5).stroke(stroke);
      g.moveTo(5.5, 5).lineTo(8.5, 5).stroke(stroke);
      g.moveTo(5.5, 9).lineTo(8.5, 9).stroke(stroke);
      return;
    }
    case "pollution": {
      // Three small clouds/particles.
      g.circle(4, 5, 2).fill(fill);
      g.circle(9, 4, 1.6).fill(fill);
      g.circle(7, 10, 2.4).fill(fill);
      return;
    }
    case "police": {
      // 5-point star.
      g.star(7, 7, 5, 5.5, 2.4).fill(fill);
      return;
    }
    case "fire": {
      // Flame: rounded teardrop.
      g.moveTo(7, 1)
        .quadraticCurveTo(12, 6, 10, 10)
        .quadraticCurveTo(9, 13, 7, 13)
        .quadraticCurveTo(5, 13, 4, 10)
        .quadraticCurveTo(2, 6, 7, 1)
        .fill(fill);
      return;
    }
    case "health": {
      // Plus / cross.
      g.rect(6, 2, 2, 10).fill(fill);
      g.rect(2, 6, 10, 2).fill(fill);
      return;
    }
  }
}
