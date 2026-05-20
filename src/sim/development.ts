/**
 * Tuning constants and yield curves for the zone-development model. Zoned tiles
 * grow buildings (`buildLevel` 0 → 3); higher levels house more people / jobs.
 */

/** Highest building level a zoned tile can reach. */
export const MAX_BUILD_LEVEL = 3;

/** The slow-cadence systems (land value, RCI, development, population) run
 *  once every this many sim ticks — roughly one in-game day. */
export const SLOW_TICKS = 10;

/** Residents housed by a residential building of the given level. */
export function residents(level: number): number {
  return level * 12;
}

/** Jobs offered by a commercial building of the given level. */
export function commercialJobs(level: number): number {
  return level * 8;
}

/** Jobs offered by an industrial building of the given level. */
export function industrialJobs(level: number): number {
  return level * 10;
}

/** Land-value cap on building level (industry ignores this). */
export function levelCapFor(landValue: number): number {
  return Math.max(1, Math.min(MAX_BUILD_LEVEL, 1 + Math.floor(landValue / 70)));
}

/** Per-day probability a serviced, in-demand tile grows, from demand 0..100. */
export function growthChance(demand: number): number {
  return Math.max(0.03, Math.min(0.4, (demand / 100) * 0.4));
}
