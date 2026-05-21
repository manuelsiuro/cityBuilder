import { CURRENT_VERSION, type SaveFile, type SaveFileV1, type SaveFileV2 } from "./schema";
import { Biome, TerrainType } from "../sim/layers";

/**
 * Upgrades an on-disk save to the current schema. Each future version adds a
 * step here (`v1 → v2`, `v2 → v3`, …); a save newer than this build is refused.
 */
export function migrate(raw: unknown): SaveFile {
  if (!raw || typeof raw !== "object" || !("version" in raw)) {
    throw new Error("not a valid save file");
  }
  let file = raw as { version: number };

  if (file.version > CURRENT_VERSION) {
    throw new Error(
      `save version ${file.version} is newer than this build (${CURRENT_VERSION})`,
    );
  }

  if (file.version === 1) file = v1ToV2(file as unknown as SaveFileV1);

  if (file.version !== CURRENT_VERSION) {
    throw new Error(`unsupported save version ${file.version}`);
  }
  return file as unknown as SaveFile;
}

/**
 * v1 → v2: the biome and tree layers did not exist. Synthesize a coarse biome
 * from the saved terrain (water → Ocean, rock → Mountain, else Plains) and
 * leave the map treeless.
 */
function v1ToV2(file: SaveFileV1): SaveFileV2 {
  const { terrainType } = file.layers;
  const n = terrainType.length;
  const biome = new Uint8Array(n);
  const trees = new Uint8Array(n);
  for (let i = 0; i < n; i++) {
    if (terrainType[i] === TerrainType.Water) biome[i] = Biome.Ocean;
    else if (terrainType[i] === TerrainType.Rock) biome[i] = Biome.Mountain;
    else biome[i] = Biome.Plains;
  }
  return {
    ...file,
    version: 2,
    layers: { ...file.layers, biome, trees },
  };
}
