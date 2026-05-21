import { describe, it, expect } from "vitest";
import { Random } from "../src/engine/Random";
import { ValueNoise } from "../src/sim/noise/ValueNoise";

describe("ValueNoise", () => {
  it("is deterministic for a given seed", () => {
    const a = new ValueNoise(new Random(42));
    const b = new ValueNoise(new Random(42));
    for (let i = 0; i < 50; i++) {
      const x = i * 0.37;
      const y = i * 0.91;
      expect(a.value2D(x, y)).toBe(b.value2D(x, y));
      expect(a.fbm(x, y, 5, 2, 0.5)).toBe(b.fbm(x, y, 5, 2, 0.5));
    }
  });

  it("produces different fields for different seeds", () => {
    const a = new ValueNoise(new Random(1));
    const b = new ValueNoise(new Random(2));
    let differences = 0;
    for (let i = 0; i < 50; i++) {
      if (a.value2D(i * 0.5, i * 0.5) !== b.value2D(i * 0.5, i * 0.5)) differences++;
    }
    expect(differences).toBeGreaterThan(40);
  });

  it("keeps single-octave output within [-1, 1]", () => {
    const noise = new ValueNoise(new Random(7));
    for (let y = 0; y < 64; y++) {
      for (let x = 0; x < 64; x++) {
        const v = noise.value2D(x * 0.13, y * 0.13);
        expect(v).toBeGreaterThanOrEqual(-1);
        expect(v).toBeLessThanOrEqual(1);
      }
    }
  });

  it("keeps fbm output within [-1, 1]", () => {
    const noise = new ValueNoise(new Random(7));
    for (let y = 0; y < 64; y++) {
      for (let x = 0; x < 64; x++) {
        const v = noise.fbm(x * 0.13, y * 0.13, 6, 2, 0.5);
        expect(v).toBeGreaterThanOrEqual(-1);
        expect(v).toBeLessThanOrEqual(1);
      }
    }
  });
});
