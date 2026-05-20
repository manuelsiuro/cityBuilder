import { CURRENT_VERSION, type SaveFile } from "./schema";

/**
 * Upgrades an on-disk save to the current schema. Each future version adds a
 * step here (`v1 → v2`, `v2 → v3`, …); a save newer than this build is refused.
 */
export function migrate(raw: unknown): SaveFile {
  if (!raw || typeof raw !== "object" || !("version" in raw)) {
    throw new Error("not a valid save file");
  }
  const file = raw as { version: number };

  // Future: while (file.version < CURRENT_VERSION) apply the next step.

  if (file.version > CURRENT_VERSION) {
    throw new Error(
      `save version ${file.version} is newer than this build (${CURRENT_VERSION})`,
    );
  }
  if (file.version !== CURRENT_VERSION) {
    throw new Error(`unsupported save version ${file.version}`);
  }
  return file as unknown as SaveFile;
}
