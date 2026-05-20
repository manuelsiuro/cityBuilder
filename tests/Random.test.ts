import { describe, it, expect } from "vitest";
import { Random } from "../src/engine/Random";

describe("Random", () => {
  it("is deterministic for a given seed", () => {
    const a = new Random(42);
    const b = new Random(42);
    const seqA = Array.from({ length: 8 }, () => a.next());
    const seqB = Array.from({ length: 8 }, () => b.next());
    expect(seqA).toEqual(seqB);
  });

  it("differs across seeds", () => {
    const a = new Random(1);
    const b = new Random(2);
    expect(a.next()).not.toBe(b.next());
  });

  it("produces floats in [0, 1)", () => {
    const r = new Random(7);
    for (let i = 0; i < 500; i++) {
      const v = r.next();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });

  it("int() stays within range", () => {
    const r = new Random(9);
    for (let i = 0; i < 200; i++) {
      const v = r.int(6);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(6);
    }
  });

  it("resumes an exact sequence from a saved state", () => {
    const r = new Random(123);
    r.next();
    r.next();
    const saved = r.state;
    const expected = [r.next(), r.next(), r.next()];

    const restored = new Random(0);
    restored.state = saved;
    expect([restored.next(), restored.next(), restored.next()]).toEqual(expected);
  });
});
