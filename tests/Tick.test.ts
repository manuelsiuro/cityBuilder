import { describe, it, expect } from "vitest";
import {
  tickToDate,
  formatDate,
  isMonthStart,
  TICKS_PER_DAY,
  TICKS_PER_MONTH,
} from "../src/sim/Tick";

describe("Tick calendar", () => {
  it("starts at Year 1, month 1, day 1", () => {
    expect(tickToDate(0)).toEqual({ year: 1, month: 1, day: 1 });
  });

  it("rolls the day after TICKS_PER_DAY ticks", () => {
    expect(tickToDate(TICKS_PER_DAY)).toEqual({ year: 1, month: 1, day: 2 });
  });

  it("rolls the month after TICKS_PER_MONTH ticks", () => {
    expect(tickToDate(TICKS_PER_MONTH)).toEqual({ year: 1, month: 2, day: 1 });
  });

  it("rolls the year after 12 months", () => {
    expect(tickToDate(TICKS_PER_MONTH * 12)).toEqual({ year: 2, month: 1, day: 1 });
  });

  it("formats a date label", () => {
    expect(formatDate(tickToDate(0))).toBe("Jan 01, Year 1");
  });

  it("flags a month start exactly on the boundary tick", () => {
    expect(isMonthStart(0)).toBe(false);
    expect(isMonthStart(TICKS_PER_MONTH)).toBe(true);
    expect(isMonthStart(TICKS_PER_MONTH + 1)).toBe(false);
  });
});
