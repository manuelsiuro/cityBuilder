import type { RadioStation } from "./RadioApi";

const STORAGE_KEY = "citybuilder.radio";

/** Persisted radio preferences. */
interface RadioPrefs {
  volume: number;
  muted: boolean;
  station: RadioStation | null;
}

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

function loadPrefs(): RadioPrefs {
  const fallback: RadioPrefs = { volume: 0.6, muted: false, station: null };
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw) as Partial<RadioPrefs>;
    return {
      volume: typeof parsed.volume === "number" ? clamp01(parsed.volume) : fallback.volume,
      muted: parsed.muted === true,
      station: parsed.station ?? null,
    };
  } catch {
    return fallback;
  }
}

/**
 * Plays a live internet radio stream through a single `HTMLAudioElement`, which
 * handles MP3/AAC buffering natively. Independent of the SFX mute flag. Volume,
 * mute and the last station persist to `localStorage`; playback never starts on
 * its own — browser autoplay policy needs a user gesture.
 */
export class RadioService {
  /** Invoked whenever playback state changes, so the HUD can re-render. */
  onChange?: () => void;

  private readonly audio = new Audio();
  private station: RadioStation | null;
  private _volume: number;
  private _muted: boolean;
  /** True between a play() request and the stream actually producing sound. */
  private _buffering = false;

  constructor() {
    const prefs = loadPrefs();
    this.station = prefs.station;
    this._volume = prefs.volume;
    this._muted = prefs.muted;

    this.audio.crossOrigin = "anonymous";
    this.audio.preload = "none";
    this.audio.volume = this._volume;
    this.audio.muted = this._muted;

    this.audio.addEventListener("playing", () => {
      this._buffering = false;
      this.emit();
    });
    this.audio.addEventListener("waiting", () => {
      this._buffering = true;
      this.emit();
    });
    this.audio.addEventListener("error", () => {
      this._buffering = false;
      this.emit();
    });
  }

  get currentStation(): RadioStation | null {
    return this.station;
  }

  get volume(): number {
    return this._volume;
  }

  get muted(): boolean {
    return this._muted;
  }

  /** True while a stream is loading but not yet audible. */
  get buffering(): boolean {
    return this._buffering;
  }

  /** True while a stream is selected and not stopped. */
  get playing(): boolean {
    return this.station !== null && !this.audio.paused;
  }

  /** Start (or restart) streaming `station`. */
  play(station: RadioStation): void {
    this.station = station;
    this.audio.src = station.url;
    this._buffering = true;
    void this.audio.play().catch(() => {
      this._buffering = false;
      this.emit();
    });
    this.save();
    this.emit();
  }

  /** Resume the currently selected station after a pause. */
  resume(): void {
    if (!this.station) return;
    if (!this.audio.src) this.audio.src = this.station.url;
    this._buffering = true;
    void this.audio.play().catch(() => {
      this._buffering = false;
      this.emit();
    });
    this.emit();
  }

  /** Pause playback but keep the station selected. */
  pause(): void {
    this.audio.pause();
    this._buffering = false;
    this.emit();
  }

  /** Turn the radio off: stop playback and clear the selected station. */
  stop(): void {
    this.audio.pause();
    this.audio.removeAttribute("src");
    this.audio.load();
    this.station = null;
    this._buffering = false;
    this.save();
    this.emit();
  }

  setVolume(v: number): void {
    this._volume = clamp01(v);
    this.audio.volume = this._volume;
    this.save();
    this.emit();
  }

  setMuted(muted: boolean): void {
    this._muted = muted;
    this.audio.muted = muted;
    this.save();
    this.emit();
  }

  toggleMute(): void {
    this.setMuted(!this._muted);
  }

  private emit(): void {
    this.onChange?.();
  }

  private save(): void {
    try {
      const prefs: RadioPrefs = {
        volume: this._volume,
        muted: this._muted,
        station: this.station,
      };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs));
    } catch {
      /* localStorage unavailable or full — preferences just won't persist */
    }
  }
}
