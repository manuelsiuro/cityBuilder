import {
  CURRENT_VERSION,
  type SaveFile,
  type SaveFileV1,
  type SaveFileV2,
  type SaveFileV3,
  type SaveFileV4,
} from "./schema";
import { Biome, TerrainType } from "../sim/layers";
import { DEFAULT_DISASTER_SETTINGS } from "../sim/MapSettings";

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
  if (file.version === 2) file = v2ToV3(file as unknown as SaveFileV2);
  if (file.version === 3) file = v3ToV4(file as unknown as SaveFileV3);

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

/**
 * v2 → v3: only `meta.thumbnail` was added, and it is optional — an old save
 * simply has no minimap snapshot.
 */
function v2ToV3(file: SaveFileV2): SaveFileV3 {
  return { ...file, version: 3 };
}

/**
 * v3 → v4: disaster toggles + frequency multiplier added to the save. Old
 * saves default to "all disasters on, normal frequency" — same as today's
 * behaviour, so existing cities load unchanged.
 */
function v3ToV4(file: SaveFileV3): SaveFileV4 {
  return { ...file, version: 4, disasters: { ...DEFAULT_DISASTER_SETTINGS } };
}
