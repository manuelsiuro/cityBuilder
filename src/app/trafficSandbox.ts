import type { CityData } from "../sim/CityData";
import { Dirty, TerrainType } from "../sim/layers";

/** Avenue offsets from the map centre — every 8 tiles, spanning ±24. */
const LINES = [-24, -16, -8, 0, 8, 16, 24];
/** Half-length of each avenue. */
const SPAN = 24;

/**
 * Flattens the map and lays a regular road grid for the `?sandbox=traffic`
 * mode. The grid's interior crossings are 4-way crossroads (signalled), its
 * edge crossings are 3-way T-junctions (give-way), giving a compact circuit
 * that exercises every traffic rule. Mutates `city` in place.
 */
export function buildTrafficSandbox(city: CityData): void {
  const { grid } = city;

  // Flat grass — no hills or water under the test circuit.
  city.elevation.fill(0);
  city.terrainType.fill(TerrainType.Grass);
  city.road.fill(0);

  const cx = grid.width >> 1;
  const cy = grid.height >> 1;
  for (const o of LINES) {
    for (let t = -SPAN; t <= SPAN; t++) {
      city.road[grid.index(cx + o, cy + t)] = 1; // vertical avenue
      city.road[grid.index(cx + t, cy + o)] = 1; // horizontal avenue
    }
  }

  city.markDirty(Dirty.Road);
}
