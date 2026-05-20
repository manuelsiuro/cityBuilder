/** Two-finger gesture maths — distance for pinch-zoom, angle for twist-rotate. */

export interface PointerPair {
  ax: number;
  ay: number;
  bx: number;
  by: number;
}

export function pairDistance(p: PointerPair): number {
  return Math.hypot(p.bx - p.ax, p.by - p.ay);
}

export function pairAngle(p: PointerPair): number {
  return Math.atan2(p.by - p.ay, p.bx - p.ax);
}

/** Shortest signed difference between two angles, in radians (−π..π). */
export function angleDelta(from: number, to: number): number {
  let d = to - from;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return d;
}
