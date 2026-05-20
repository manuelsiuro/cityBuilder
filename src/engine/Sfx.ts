/**
 * Tiny synthesized sound effects via the Web Audio API — no audio assets. The
 * AudioContext is created lazily and resumed on first use so it satisfies
 * browser autoplay policy (the first call is always from a user gesture).
 */
export class Sfx {
  private ctx?: AudioContext;
  muted = false;

  private context(): AudioContext {
    if (!this.ctx) this.ctx = new AudioContext();
    if (this.ctx.state === "suspended") void this.ctx.resume();
    return this.ctx;
  }

  private blip(freq: number, duration: number, type: OscillatorType, volume: number): void {
    if (this.muted) return;
    const ctx = this.context();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(volume, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + duration);
    osc.connect(gain).connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + duration);
  }

  /** Light tick — tool selection. */
  click(): void {
    this.blip(620, 0.05, "square", 0.05);
  }

  /** Soft thunk — placing something in the world. */
  build(): void {
    this.blip(300, 0.08, "triangle", 0.06);
  }

  /** Bright chime — confirmed action (save / load). */
  confirm(): void {
    this.blip(880, 0.12, "sine", 0.07);
  }
}
