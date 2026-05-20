import type { CityData } from "../CityData";

/**
 * Connectivity view of the road layer. Each road tile is assigned a network
 * (connected-component) id via flood fill; two tiles are connected iff they
 * share an id. Rebuilt by `RoadSystem` whenever the road layer changes; the
 * basis for car pathfinding in Phase 5.
 */
export class RoadGraph {
  /** Network id per tile, or -1 where there is no road. */
  private component = new Int32Array(0);
  private _networkCount = 0;
  private _roadTileCount = 0;

  get networkCount(): number {
    return this._networkCount;
  }

  get roadTileCount(): number {
    return this._roadTileCount;
  }

  /** Network id of a tile, or -1 if it carries no road. */
  networkOf(index: number): number {
    return this.component[index] ?? -1;
  }

  /** True when both tiles carry road and belong to the same network. */
  connected(indexA: number, indexB: number): boolean {
    const a = this.component[indexA];
    return a >= 0 && a === this.component[indexB];
  }

  /** Recompute networks from the city's road layer. */
  rebuild(city: CityData): void {
    const { grid } = city;
    if (this.component.length !== grid.size) {
      this.component = new Int32Array(grid.size);
    }
    this.component.fill(-1);
    this._roadTileCount = 0;
    this._networkCount = 0;

    const stack: number[] = [];
    for (let start = 0; start < grid.size; start++) {
      if (city.road[start] === 0 || this.component[start] !== -1) continue;

      const id = this._networkCount++;
      this.component[start] = id;
      stack.push(start);

      while (stack.length > 0) {
        const i = stack.pop()!;
        this._roadTileCount++;
        grid.forEachNeighbor4(grid.x(i), grid.y(i), (_nx, _ny, ni) => {
          if (city.road[ni] !== 0 && this.component[ni] === -1) {
            this.component[ni] = id;
            stack.push(ni);
          }
        });
      }
    }
  }
}
