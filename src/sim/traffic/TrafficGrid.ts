/**
 * Per-tick spatial index of car agents. Rebuilt fresh each simulation tick from
 * a snapshot of car positions, so movement resolves order-independently and
 * stays deterministic. Cars are keyed two ways: by the directed road edge they
 * are travelling along (for car-following) and by the tile they physically
 * occupy (for intersection gating).
 */

/** Direction codes for the 4-connected grid. */
export const DIR_N = 0;
export const DIR_E = 1;
export const DIR_S = 2;
export const DIR_W = 3;

/** Tile-space X delta for each direction code. */
export const DIR_DX = [0, 1, 0, -1] as const;
/** Tile-space Y delta for each direction code. */
export const DIR_DY = [-1, 0, 1, 0] as const;

/** Direction code for the unit step from tile `(ax,ay)` to adjacent `(bx,by)`. */
export function stepDir(ax: number, ay: number, bx: number, by: number): number {
  if (bx > ax) return DIR_E;
  if (bx < ax) return DIR_W;
  if (by > ay) return DIR_S;
  return DIR_N;
}

/** One car's presence on a directed edge: pool index + fraction along the edge. */
export interface EdgeEntry {
  car: number;
  /** Fraction 0..1 from the edge's start-tile centre to its end-tile centre. */
  f: number;
}

export class TrafficGrid {
  /** directed-edge key (`fromTile*4 + dir`) → cars travelling that edge. */
  private readonly edges = new Map<number, EdgeEntry[]>();
  /** tile index → pool indices of cars whose nearest tile is this one. */
  private readonly tiles = new Map<number, number[]>();

  /** Drop every registration — call once at the start of each rebuild. */
  clear(): void {
    this.edges.clear();
    this.tiles.clear();
  }

  /** Register `car` on the directed edge leaving `fromTile` in `dir`, at `f`. */
  addEdge(fromTile: number, dir: number, car: number, f: number): void {
    const key = fromTile * 4 + dir;
    let list = this.edges.get(key);
    if (!list) this.edges.set(key, (list = []));
    list.push({ car, f });
  }

  /** Register `car` as physically occupying `tile`. */
  addTile(tile: number, car: number): void {
    let list = this.tiles.get(tile);
    if (!list) this.tiles.set(tile, (list = []));
    list.push(car);
  }

  /** Cars travelling the directed edge leaving `fromTile` in `dir`. */
  edge(fromTile: number, dir: number): readonly EdgeEntry[] | undefined {
    return this.edges.get(fromTile * 4 + dir);
  }

  /** Cars physically occupying `tile`. */
  tileCars(tile: number): readonly number[] | undefined {
    return this.tiles.get(tile);
  }
}
