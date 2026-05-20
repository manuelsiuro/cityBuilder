import type { Random } from "../engine/Random";
import type { CityData } from "./CityData";
import { MAX_ELEVATION, TerrainType, Dirty } from "./layers";

/** Heights below this normalized value become water. */
const WATER_THRESHOLD = 0.34;
/** Heights above this normalized value become rock. */
const ROCK_THRESHOLD = 0.82;
/** Box-blur passes — more passes = smoother, rounder terrain. */
const SMOOTH_PASSES = 5;

/**
 * Fills a city's `elevation` and `terrainType` layers with smooth, varied
 * terrain: rolling grass, water basins, and rocky highlands. Deterministic for
 * a given `Random` state.
 */
export function generateTerrain(city: CityData, random: Random): void {
  const { width, height, size } = city.grid;

  // Start from white noise, then blur it into smooth rolling hills.
  let field: Float32Array = new Float32Array(size);
  for (let i = 0; i < size; i++) field[i] = random.next();

  for (let pass = 0; pass < SMOOTH_PASSES; pass++) {
    field = boxBlur(field, width, height);
  }

  // Bias the edges downward so the map reads as an island, not a cut-off slab.
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const edgeX = Math.min(x, width - 1 - x) / (width * 0.5);
      const edgeY = Math.min(y, height - 1 - y) / (height * 0.5);
      const falloff = Math.min(1, Math.min(edgeX, edgeY) * 1.6);
      field[y * width + x] *= falloff;
    }
  }

  // Normalize to 0..1.
  let min = Infinity;
  let max = -Infinity;
  for (let i = 0; i < size; i++) {
    if (field[i] < min) min = field[i];
    if (field[i] > max) max = field[i];
  }
  const span = max - min || 1;

  for (let i = 0; i < size; i++) {
    const v = (field[i] - min) / span;
    if (v < WATER_THRESHOLD) {
      city.terrainType[i] = TerrainType.Water;
      city.elevation[i] = 0;
    } else {
      const landV = (v - WATER_THRESHOLD) / (1 - WATER_THRESHOLD);
      city.elevation[i] = Math.round(landV * MAX_ELEVATION);
      city.terrainType[i] = v >= ROCK_THRESHOLD ? TerrainType.Rock : TerrainType.Grass;
    }
  }

  city.markDirty(Dirty.Terrain);
}

function boxBlur(src: Float32Array, width: number, height: number): Float32Array {
  const out = new Float32Array(src.length);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let sum = 0;
      let count = 0;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const nx = x + dx;
          const ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
          sum += src[ny * width + nx];
          count++;
        }
      }
      out[y * width + x] = sum / count;
    }
  }
  return out;
}
