/**
 * Sim calendar. The simulation advances in fixed ticks (10 Hz at 1× speed);
 * this maps a tick count onto an in-game date.
 *
 * At 1× speed: 10 ticks = 1 game day, so a game month passes in ~3 real seconds.
 */
export const TICKS_PER_DAY = 10;
export const DAYS_PER_MONTH = 30;
export const MONTHS_PER_YEAR = 12;
export const TICKS_PER_MONTH = TICKS_PER_DAY * DAYS_PER_MONTH;

const MONTH_NAMES = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
] as const;

export interface SimDate {
  /** 1-based in-game year. */
  year: number;
  /** 1-based month (1–12). */
  month: number;
  /** 1-based day of month (1–30). */
  day: number;
}

export function tickToDate(tick: number): SimDate {
  const totalDays = Math.floor(tick / TICKS_PER_DAY);
  const day = totalDays % DAYS_PER_MONTH;
  const totalMonths = Math.floor(totalDays / DAYS_PER_MONTH);
  const month = totalMonths % MONTHS_PER_YEAR;
  const year = Math.floor(totalMonths / MONTHS_PER_YEAR);
  return { year: year + 1, month: month + 1, day: day + 1 };
}

export function formatDate(d: SimDate): string {
  const day = String(d.day).padStart(2, "0");
  return `${MONTH_NAMES[d.month - 1]} ${day}, Year ${d.year}`;
}

/** True on the first tick of a new month (used by the monthly budget pass). */
export function isMonthStart(tick: number): boolean {
  return tick > 0 && tick % TICKS_PER_MONTH === 0;
}
