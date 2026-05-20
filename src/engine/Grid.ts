/**
 * Index math for a 2D tile grid stored as flat arrays. A tile `(x, y)` maps to
 * the flat index `i = y * width + x`. Shared by every `CityData` layer.
 */
export class Grid {
  readonly size: number;

  constructor(
    readonly width: number,
    readonly height: number,
  ) {
    this.size = width * height;
  }

  index(x: number, y: number): number {
    return y * this.width + x;
  }

  x(i: number): number {
    return i % this.width;
  }

  y(i: number): number {
    return (i / this.width) | 0;
  }

  inBounds(x: number, y: number): boolean {
    return x >= 0 && y >= 0 && x < this.width && y < this.height;
  }

  /** Visit the 4-connected (N/E/S/W) in-bounds neighbours of `(x, y)`. */
  forEachNeighbor4(x: number, y: number, fn: (nx: number, ny: number, ni: number) => void): void {
    if (y > 0) fn(x, y - 1, this.index(x, y - 1));
    if (x < this.width - 1) fn(x + 1, y, this.index(x + 1, y));
    if (y < this.height - 1) fn(x, y + 1, this.index(x, y + 1));
    if (x > 0) fn(x - 1, y, this.index(x - 1, y));
  }
}
