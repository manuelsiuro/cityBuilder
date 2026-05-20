import type { CityData } from "../CityData";

/** Binary min-heap keyed by f-score; stores tile indices. Lazy-deletes. */
class MinHeap {
  private readonly nodes: number[] = [];
  private readonly keys: number[] = [];

  get size(): number {
    return this.nodes.length;
  }

  push(node: number, key: number): void {
    this.nodes.push(node);
    this.keys.push(key);
    let c = this.nodes.length - 1;
    while (c > 0) {
      const p = (c - 1) >> 1;
      if (this.keys[p] <= this.keys[c]) break;
      this.swap(p, c);
      c = p;
    }
  }

  pop(): number {
    const top = this.nodes[0];
    const last = this.nodes.length - 1;
    this.swap(0, last);
    this.nodes.pop();
    this.keys.pop();
    let p = 0;
    const n = this.nodes.length;
    for (;;) {
      const l = p * 2 + 1;
      const r = l + 1;
      let smallest = p;
      if (l < n && this.keys[l] < this.keys[smallest]) smallest = l;
      if (r < n && this.keys[r] < this.keys[smallest]) smallest = r;
      if (smallest === p) break;
      this.swap(p, smallest);
      p = smallest;
    }
    return top;
  }

  private swap(a: number, b: number): void {
    [this.nodes[a], this.nodes[b]] = [this.nodes[b], this.nodes[a]];
    [this.keys[a], this.keys[b]] = [this.keys[b], this.keys[a]];
  }
}

/**
 * A* over the road layer. Returns the list of road-tile indices from `start`
 * to `goal`, or null if unreachable. Edge cost rises with `trafficLoad` so
 * cars steer around congestion.
 */
export function findRoadPath(
  city: CityData,
  start: number,
  goal: number,
): number[] | null {
  if (city.road[start] === 0 || city.road[goal] === 0) return null;
  if (start === goal) return [start];

  const { grid } = city;
  const g = new Float64Array(grid.size).fill(Infinity);
  const cameFrom = new Int32Array(grid.size).fill(-1);
  const closed = new Uint8Array(grid.size);

  const goalX = grid.x(goal);
  const goalY = grid.y(goal);
  const heuristic = (i: number): number =>
    Math.abs(grid.x(i) - goalX) + Math.abs(grid.y(i) - goalY);

  const open = new MinHeap();
  g[start] = 0;
  open.push(start, heuristic(start));

  while (open.size > 0) {
    const current = open.pop();
    if (current === goal) return reconstruct(cameFrom, goal);
    if (closed[current]) continue;
    closed[current] = 1;

    grid.forEachNeighbor4(grid.x(current), grid.y(current), (_nx, _ny, ni) => {
      if (city.road[ni] === 0 || closed[ni]) return;
      const tentative = g[current] + 1 + city.trafficLoad[ni] / 48;
      if (tentative < g[ni]) {
        g[ni] = tentative;
        cameFrom[ni] = current;
        open.push(ni, tentative + heuristic(ni));
      }
    });
  }
  return null;
}

function reconstruct(cameFrom: Int32Array, goal: number): number[] {
  const path: number[] = [goal];
  let node = goal;
  while (cameFrom[node] !== -1) {
    node = cameFrom[node];
    path.push(node);
  }
  path.reverse();
  return path;
}
