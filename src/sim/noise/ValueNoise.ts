import type { Random } from "../../engine/Random";

/**
 * Deterministic 2D value noise with fractal Brownian motion (fBm).
 *
 * A 256-entry lattice of random values is interpolated with a quintic
 * smoothstep. All randomness is drawn in the constructor in a fixed order, so
 * `value2D` / `fbm` are pure functions of the coordinates — the same seeded
 * `Random` always produces the same field.
 */
export class ValueNoise {
  /** Doubled permutation table — avoids an index mask in the hash. */
  private readonly perm = new Uint8Array(512);
  /** Random lattice values in [-1, 1]. */
  private readonly lattice = new Float32Array(256);

  constructor(random: Random) {
    for (let i = 0; i < 256; i++) this.perm[i] = i;
    // Fisher–Yates shuffle of the permutation table.
    for (let i = 255; i > 0; i--) {
      const j = random.int(i + 1);
      const tmp = this.perm[i];
      this.perm[i] = this.perm[j];
      this.perm[j] = tmp;
    }
    for (let i = 0; i < 256; i++) this.perm[i + 256] = this.perm[i];
    for (let i = 0; i < 256; i++) this.lattice[i] = random.next() * 2 - 1;
  }

  /** Single-octave value noise at `(x, y)`, output in [-1, 1]. */
  value2D(x: number, y: number): number {
    const x0 = Math.floor(x);
    const y0 = Math.floor(y);
    const fx = x - x0;
    const fy = y - y0;
    const u = fade(fx);
    const v = fade(fy);

    const ix = x0 & 255;
    const iy = y0 & 255;
    const v00 = this.cornerValue(ix, iy);
    const v10 = this.cornerValue((ix + 1) & 255, iy);
    const v01 = this.cornerValue(ix, (iy + 1) & 255);
    const v11 = this.cornerValue((ix + 1) & 255, (iy + 1) & 255);

    return lerp(lerp(v00, v10, u), lerp(v01, v11, u), v);
  }

  /**
   * Fractal Brownian motion — sums `octaves` of value noise at rising
   * frequency and falling amplitude. Output is normalized back to ~[-1, 1].
   */
  fbm(x: number, y: number, octaves: number, lacunarity: number, gain: number): number {
    let sum = 0;
    let amp = 1;
    let freq = 1;
    let norm = 0;
    for (let o = 0; o < octaves; o++) {
      sum += amp * this.value2D(x * freq, y * freq);
      norm += amp;
      amp *= gain;
      freq *= lacunarity;
    }
    return norm > 0 ? sum / norm : 0;
  }

  private cornerValue(ix: number, iy: number): number {
    return this.lattice[this.perm[this.perm[ix] + iy]];
  }
}

/** Quintic smoothstep — 6t⁵ − 15t⁴ + 10t³, zero first and second derivatives. */
function fade(t: number): number {
  return t * t * t * (t * (t * 6 - 15) + 10);
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}
