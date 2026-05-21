import type { Random } from "../engine/Random";
import type { CityData } from "./CityData";
import { MAX_ELEVATION, TerrainType, Biome, Dirty } from "./layers";
import { DEFAULT_MAP_SETTINGS, type MapSettings } from "./MapSettings";
import { ValueNoise } from "./noise/ValueNoise";
import { classifyBiome, biomeTreeWeight } from "./BiomeMap";

/** Land height (as a fraction of the land band) at or above which a tile is Rock. */
const ROCK_LANDV = 0.72;

/**
 * Fills a city's `elevation`, `terrainType`, `biome`, and `trees` layers with
 * procedurally-generated terrain: domain-warped fractal hills, traced rivers,
 * and climate-driven biomes. Deterministic for a given `Random` state and
 * `MapSettings`.
 */
export function generateTerrain(
  city: CityData,
  random: Random,
  settings: MapSettings = DEFAULT_MAP_SETTINGS,
): void {
  const { width, height, size } = city.grid;
  const noise = new ValueNoise(random);

  // --- 1. Domain-warped fractal height field ----------------------------
  const octaves = 4 + Math.round(settings.roughness * 3);
  const gain = 0.45 + settings.roughness * 0.15;
  const freq = 3.2 / Math.max(width, height);

  const field = new Float32Array(size);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const wx = noise.fbm(x * freq * 0.5 + 11.3, y * freq * 0.5 + 7.1, 3, 2, 0.5);
      const wy = noise.fbm(x * freq * 0.5 + 5.2, y * freq * 0.5 + 19.7, 3, 2, 0.5);
      const h = noise.fbm(x * freq + wx * 1.2, y * freq + wy * 1.2, octaves, 2, gain);

      // Bias edges downward so the map reads as an island, not a cut-off slab.
      const edgeX = Math.min(x, width - 1 - x) / (width * 0.5);
      const edgeY = Math.min(y, height - 1 - y) / (height * 0.5);
      const falloff = Math.min(1, Math.min(edgeX, edgeY) * 1.6);
      field[y * width + x] = (h * 0.5 + 0.5) * falloff;
    }
  }

  // --- 2. Normalize to 0..1 --------------------------------------------
  let min = Infinity;
  let max = -Infinity;
  for (let i = 0; i < size; i++) {
    if (field[i] < min) min = field[i];
    if (field[i] > max) max = field[i];
  }
  const span = max - min || 1;
  for (let i = 0; i < size; i++) field[i] = (field[i] - min) / span;

  // --- 3. Pick a sea level honouring `settings.water` -------------------
  // A 256-bucket histogram finds the height percentile deterministically,
  // so the slider behaves regardless of the noise field's distribution.
  const seaLevel = percentile(field, Math.min(0.95, Math.max(0, settings.water)));

  // --- 4. Classify terrain type + elevation ----------------------------
  for (let i = 0; i < size; i++) {
    const v = field[i];
    if (v < seaLevel) {
      city.terrainType[i] = TerrainType.Water;
      city.elevation[i] = 0;
    } else {
      const landV = (v - seaLevel) / (1 - seaLevel || 1);
      city.elevation[i] = Math.round(landV * MAX_ELEVATION);
      city.terrainType[i] = landV >= ROCK_LANDV ? TerrainType.Rock : TerrainType.Grass;
    }
  }

  // --- 5. Trace rivers downhill from highland springs ------------------
  carveRivers(city, field, random);

  // --- 6. Climate maps + biome classification --------------------------
  const distToWater = waterDistance(city);
  let maxDist = 1;
  for (let i = 0; i < size; i++) if (distToWater[i] > maxDist) maxDist = distToWater[i];

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = y * width + x;
      const elev = city.elevation[i];

      // Temperature: temperate overall, cooling toward the north edge and with
      // altitude. Snow stays confined to the cold poles and high peaks.
      const latitude = 1 - y / (height - 1 || 1);
      const tempNoise = noise.value2D(x * freq * 1.7 + 41, y * freq * 1.7 + 3) * 0.5;
      let temp =
        0.55 + (latitude - 0.5) * 0.7 - (elev / MAX_ELEVATION) * 0.35 + tempNoise * 0.2;
      temp = clamp01(temp);

      // Moisture: wetter near water, plus a fractal channel.
      const moistNoise = noise.fbm(x * freq * 1.3 + 71, y * freq * 1.3 + 53, 4, 2, 0.5);
      const nearWater = 1 - distToWater[i] / maxDist;
      let moist = nearWater * 0.55 + (moistNoise * 0.5 + 0.5) * 0.45;
      moist = clamp01(moist);

      city.biome[i] = classifyBiome(city.terrainType[i], elev, temp, moist);
    }
  }

  // Shoreline land tiles become Beach.
  markBeaches(city);

  // --- 7. Scatter trees by biome + density -----------------------------
  for (let i = 0; i < size; i++) {
    const chance = biomeTreeWeight(city.biome[i] as Biome) * settings.treeDensity;
    city.trees[i] = chance > 0 && random.chance(chance) ? 60 + random.int(196) : 0;
  }

  city.markDirty(Dirty.Terrain);
}

/** Returns the value at the `p` percentile (0..1) of `field`, via a histogram. */
function percentile(field: Float32Array, p: number): number {
  const buckets = new Uint32Array(256);
  for (let i = 0; i < field.length; i++) {
    buckets[Math.min(255, (field[i] * 256) | 0)]++;
  }
  const target = field.length * p;
  let cumulative = 0;
  for (let b = 0; b < 256; b++) {
    cumulative += buckets[b];
    if (cumulative >= target) return b / 256;
  }
  return 1;
}

/**
 * Picks highland spring tiles and walks each downhill, carving water until it
 * reaches an existing water body or a local minimum.
 */
function carveRivers(city: CityData, field: Float32Array, random: Random): void {
  const { width, height, size } = city.grid;
  const riverCount = Math.max(2, Math.round(width / 22));
  const maxSteps = width + height;

  for (let r = 0; r < riverCount; r++) {
    // Reject-sample a high land tile to use as the spring.
    let spring = -1;
    for (let attempt = 0; attempt < 200; attempt++) {
      const i = random.int(size);
      if (city.terrainType[i] !== TerrainType.Water && field[i] > 0.6) {
        spring = i;
        break;
      }
    }
    if (spring < 0) continue;

    let i = spring;
    for (let step = 0; step < maxSteps; step++) {
      if (city.terrainType[i] === TerrainType.Water) break;
      city.terrainType[i] = TerrainType.Water;
      city.elevation[i] = 0;

      // Step to the lowest 4-neighbour by the original height field.
      const x = i % width;
      const y = (i / width) | 0;
      let next = -1;
      let lowest = field[i];
      if (y > 0 && field[i - width] < lowest) { lowest = field[i - width]; next = i - width; }
      if (y < height - 1 && field[i + width] < lowest) { lowest = field[i + width]; next = i + width; }
      if (x > 0 && field[i - 1] < lowest) { lowest = field[i - 1]; next = i - 1; }
      if (x < width - 1 && field[i + 1] < lowest) { lowest = field[i + 1]; next = i + 1; }
      if (next < 0) break; // local minimum — river ends in a lake
      i = next;
    }
  }
}

/** Multi-source BFS giving each tile its Chebyshev-ish distance to water. */
function waterDistance(city: CityData): Int32Array {
  const { width, height, size } = city.grid;
  const dist = new Int32Array(size).fill(-1);
  let frontier: number[] = [];
  for (let i = 0; i < size; i++) {
    if (city.terrainType[i] === TerrainType.Water) {
      dist[i] = 0;
      frontier.push(i);
    }
  }
  let d = 0;
  while (frontier.length > 0) {
    d++;
    const next: number[] = [];
    for (const i of frontier) {
      const x = i % width;
      const y = (i / width) | 0;
      if (y > 0 && dist[i - width] < 0) { dist[i - width] = d; next.push(i - width); }
      if (y < height - 1 && dist[i + width] < 0) { dist[i + width] = d; next.push(i + width); }
      if (x > 0 && dist[i - 1] < 0) { dist[i - 1] = d; next.push(i - 1); }
      if (x < width - 1 && dist[i + 1] < 0) { dist[i + 1] = d; next.push(i + 1); }
    }
    frontier = next;
  }
  for (let i = 0; i < size; i++) if (dist[i] < 0) dist[i] = d;
  return dist;
}

/** Low-lying land tiles adjacent to water become Beach. */
function markBeaches(city: CityData): void {
  const { width, height } = city.grid;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = y * width + x;
      if (city.terrainType[i] !== TerrainType.Grass) continue;
      if (city.elevation[i] > 1) continue;
      let coastal = false;
      city.grid.forEachNeighbor4(x, y, (_nx, _ny, ni) => {
        if (city.terrainType[ni] === TerrainType.Water) coastal = true;
      });
      if (coastal) city.biome[i] = Biome.Beach;
    }
  }
}

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}
