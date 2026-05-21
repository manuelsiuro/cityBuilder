import { Container, Graphics, Text } from "pixi.js";
import { fetchGenre, type RadioGenre, type RadioStation } from "../../radio/RadioApi";
import type { RadioService } from "../../radio/RadioService";

const MARGIN = 12;
/** Sits below the debug HUD readout at the top-left. */
const TOP = 38;

const BAR_W = 340;
const BAR_H = 40;

/** Local-coordinate hit rectangles inside the collapsed bar. */
const R = {
  chevron: { x: 8, y: 8, w: 24, h: 24 },
  play: { x: 36, y: 8, w: 28, h: 24 },
  slider: { x: 178, y: 8, w: 100, h: 24 },
  mute: { x: 284, y: 8, w: 24, h: 24 },
  off: { x: 310, y: 8, w: 24, h: 24 },
};
/** Volume track geometry, derived from the slider hit region. */
const TRACK = { x: 184, y: BAR_H / 2, w: 88, h: 6 };

const TABS: { id: RadioGenre; label: string }[] = [
  { id: "top", label: "Top" },
  { id: "jazz", label: "Jazz" },
  { id: "lofi", label: "Lofi" },
  { id: "rock", label: "Rock" },
  { id: "news", label: "News" },
];
const TAB_W = 62;
const TAB_H = 26;
const TAB_GAP = 4;
const TAB_Y = BAR_H + 4 + 8;

const ROW_W = 324;
const ROW_H = 30;
const ROW_GAP = 2;
const ROW_Y0 = TAB_Y + TAB_H + 8;
const LIST_LEN = 8;
const PANEL_BOTTOM = ROW_Y0 + LIST_LEN * (ROW_H + ROW_GAP) + 8;

const FONT = "ui-sans-serif, system-ui, sans-serif";

type ListState = "loading" | "ready" | "error";

interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

function inRect(x: number, y: number, r: Rect): boolean {
  return x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h;
}

/** Trim `text` to roughly `max` characters with an ellipsis. */
function ellipsize(text: string, max: number): string {
  return text.length > max ? text.slice(0, max - 1) + "…" : text;
}

/**
 * Top-left collapsible radio dock: a compact always-visible bar (now-playing,
 * play/pause, volume, mute, off) that expands into a genre-tabbed station list.
 * Reads/drives a {@link RadioService}; fetches stations from radio-browser.info.
 */
export class RadioPlayer {
  readonly container = new Container();

  private expanded = false;
  private genre: RadioGenre = "top";
  private stations: RadioStation[] = [];
  private listState: ListState = "loading";
  private draggingSlider = false;
  /** Bumped per fetch so a stale response cannot overwrite a newer one. */
  private fetchToken = 0;

  constructor(private readonly radio: RadioService) {
    this.radio.onChange = () => this.refresh();
    this.refresh();
  }

  layout(): void {
    this.container.x = MARGIN;
    this.container.y = TOP;
  }

  /** A press anywhere on the dock is captured; a press on the track starts a drag. */
  handlePress(x: number, y: number): boolean {
    const lx = x - this.container.x;
    const ly = y - this.container.y;
    if (inRect(lx, ly, R.slider)) {
      this.draggingSlider = true;
      this.setVolumeFromX(lx);
      return true;
    }
    return this.contains(lx, ly);
  }

  /** While dragging the volume handle, track the pointer. */
  handleDrag(x: number, y: number): boolean {
    if (!this.draggingSlider) return false;
    this.setVolumeFromX(x - this.container.x);
    void y;
    return true;
  }

  handleRelease(): void {
    this.draggingSlider = false;
  }

  /** Activate the control under a tap. Returns true if the dock handled it. */
  handleTap(x: number, y: number): boolean {
    const lx = x - this.container.x;
    const ly = y - this.container.y;
    if (!this.contains(lx, ly)) return false;

    if (inRect(lx, ly, R.chevron)) {
      this.expanded = !this.expanded;
      if (this.expanded && this.listState !== "ready") this.loadGenre(this.genre);
      else this.refresh();
      return true;
    }
    if (inRect(lx, ly, R.play)) {
      this.togglePlay();
      return true;
    }
    if (inRect(lx, ly, R.mute)) {
      this.radio.toggleMute();
      return true;
    }
    if (inRect(lx, ly, R.off)) {
      this.radio.stop();
      return true;
    }
    if (inRect(lx, ly, R.slider)) return true; // handled by press/drag

    if (this.expanded) {
      for (let i = 0; i < TABS.length; i++) {
        if (inRect(lx, ly, this.tabRect(i))) {
          if (this.genre !== TABS[i].id) this.loadGenre(TABS[i].id);
          return true;
        }
      }
      if (this.listState === "ready") {
        for (let i = 0; i < this.stations.length; i++) {
          if (inRect(lx, ly, this.rowRect(i))) {
            this.radio.play(this.stations[i]);
            return true;
          }
        }
      }
    }
    return true; // press landed on the dock body — swallow it
  }

  private contains(lx: number, ly: number): boolean {
    if (inRect(lx, ly, { x: 0, y: 0, w: BAR_W, h: BAR_H })) return true;
    return this.expanded && inRect(lx, ly, { x: 0, y: BAR_H, w: BAR_W, h: PANEL_BOTTOM - BAR_H });
  }

  private tabRect(i: number): Rect {
    return { x: 8 + i * (TAB_W + TAB_GAP), y: TAB_Y, w: TAB_W, h: TAB_H };
  }

  private rowRect(i: number): Rect {
    return { x: 8, y: ROW_Y0 + i * (ROW_H + ROW_GAP), w: ROW_W, h: ROW_H };
  }

  private setVolumeFromX(lx: number): void {
    this.radio.setVolume((lx - TRACK.x) / TRACK.w);
  }

  private togglePlay(): void {
    const station = this.radio.currentStation;
    if (!station) return;
    if (this.radio.playing) this.radio.pause();
    else this.radio.resume();
  }

  private loadGenre(genre: RadioGenre): void {
    this.genre = genre;
    this.listState = "loading";
    const token = ++this.fetchToken;
    this.refresh();
    fetchGenre(genre, LIST_LEN)
      .then((stations) => {
        if (token !== this.fetchToken) return;
        this.stations = stations;
        this.listState = "ready";
        this.refresh();
      })
      .catch(() => {
        if (token !== this.fetchToken) return;
        this.stations = [];
        this.listState = "error";
        this.refresh();
      });
  }

  // --- Rendering ---------------------------------------------------------

  /** Tear down and rebuild the whole dock from current state. */
  private refresh(): void {
    this.container.removeChildren().forEach((c) => c.destroy({ children: true }));
    this.drawBar();
    if (this.expanded) this.drawPanel();
  }

  private drawBar(): void {
    const bg = new Graphics()
      .roundRect(0, 0, BAR_W, BAR_H, 9)
      .fill({ color: 0x161a20, alpha: 0.92 })
      .stroke({ width: 1, color: 0x39414d });
    this.container.addChild(bg);

    this.addGlyph(this.expanded ? "▾" : "▸", R.chevron, 0x9aa4af);

    const playable = this.radio.currentStation !== null;
    this.addButton(R.play, playable ? 0x2b6cb0 : 0x2b313c);
    this.addGlyph(this.radio.playing ? "❚❚" : "▶", R.play, playable ? 0xeef2f6 : 0x6b7280, 11);

    const label = new Text({
      text: this.nowPlayingText(),
      style: { fill: 0xdfe6ee, fontSize: 12, fontFamily: FONT, fontWeight: "600" },
    });
    label.anchor.set(0, 0.5);
    label.position.set(72, BAR_H / 2);
    this.container.addChild(label);

    this.drawSlider();

    this.addButton(R.mute, this.radio.muted ? 0x7a3030 : 0x2b313c);
    this.addGlyph(this.radio.muted ? "🔇" : "🔊", R.mute, 0xeef2f6, 11);

    this.addButton(R.off, 0x2b313c);
    this.addGlyph("⏏", R.off, 0xc4ccd6, 12);
  }

  private nowPlayingText(): string {
    const station = this.radio.currentStation;
    if (!station) return "Radio off";
    if (this.radio.buffering) return ellipsize(station.name, 18) + " · buffering…";
    return ellipsize(station.name, 24);
  }

  private drawSlider(): void {
    const fillW = TRACK.w * this.radio.volume;
    const track = new Graphics()
      .roundRect(TRACK.x, TRACK.y - TRACK.h / 2, TRACK.w, TRACK.h, 3)
      .fill(0x2b313c)
      .roundRect(TRACK.x, TRACK.y - TRACK.h / 2, fillW, TRACK.h, 3)
      .fill(this.radio.muted ? 0x5a6270 : 0x4a90c2)
      .circle(TRACK.x + fillW, TRACK.y, 6)
      .fill(0xeef2f6);
    this.container.addChild(track);
  }

  private drawPanel(): void {
    const panel = new Graphics()
      .roundRect(0, BAR_H, BAR_W, PANEL_BOTTOM - BAR_H, 9)
      .fill({ color: 0x12161c, alpha: 0.95 })
      .stroke({ width: 1, color: 0x39414d });
    this.container.addChild(panel);

    TABS.forEach((tab, i) => {
      const r = this.tabRect(i);
      const active = tab.id === this.genre;
      const g = new Graphics()
        .roundRect(r.x, r.y, r.w, r.h, 6)
        .fill(active ? 0x2b6cb0 : 0x222833)
        .stroke({ width: 1, color: 0x3a4250 });
      this.container.addChild(g);
      const t = new Text({
        text: tab.label,
        style: {
          fill: active ? 0xffffff : 0xb6bfca,
          fontSize: 12,
          fontFamily: FONT,
          fontWeight: "600",
        },
      });
      t.anchor.set(0.5);
      t.position.set(r.x + r.w / 2, r.y + r.h / 2);
      this.container.addChild(t);
    });

    if (this.listState === "ready" && this.stations.length > 0) {
      this.stations.forEach((s, i) => this.drawRow(s, i));
    } else {
      const msg =
        this.listState === "loading"
          ? "Loading stations…"
          : this.listState === "error"
            ? "Could not load stations"
            : "No stations found";
      const t = new Text({
        text: msg,
        style: { fill: 0x8b95a1, fontSize: 12, fontFamily: FONT },
      });
      t.anchor.set(0, 0.5);
      t.position.set(14, ROW_Y0 + ROW_H / 2);
      this.container.addChild(t);
    }
  }

  private drawRow(station: RadioStation, i: number): void {
    const r = this.rowRect(i);
    const current = this.radio.currentStation?.uuid === station.uuid;
    const g = new Graphics()
      .roundRect(r.x, r.y, r.w, r.h, 6)
      .fill(current ? 0x1f3a52 : 0x1b2129);
    this.container.addChild(g);

    if (current) {
      const marker = new Text({
        text: "▸",
        style: { fill: 0x4a90c2, fontSize: 12, fontFamily: FONT },
      });
      marker.anchor.set(0, 0.5);
      marker.position.set(r.x + 8, r.y + r.h / 2);
      this.container.addChild(marker);
    }

    const name = new Text({
      text: ellipsize(station.name, 30),
      style: {
        fill: current ? 0xeef2f6 : 0xc4ccd6,
        fontSize: 12,
        fontFamily: FONT,
        fontWeight: current ? "700" : "500",
      },
    });
    name.anchor.set(0, 0.5);
    name.position.set(r.x + 22, r.y + r.h / 2 - 5);
    this.container.addChild(name);

    const meta = [station.country, station.codec, station.bitrate ? `${station.bitrate}k` : ""]
      .filter(Boolean)
      .join(" · ");
    if (meta) {
      const sub = new Text({
        text: ellipsize(meta, 40),
        style: { fill: 0x7c8694, fontSize: 9.5, fontFamily: FONT },
      });
      sub.anchor.set(0, 0.5);
      sub.position.set(r.x + 22, r.y + r.h / 2 + 8);
      this.container.addChild(sub);
    }
  }

  private addButton(r: Rect, fill: number): void {
    const g = new Graphics()
      .roundRect(r.x, r.y, r.w, r.h, 6)
      .fill(fill)
      .stroke({ width: 1, color: 0x3a4250 });
    this.container.addChild(g);
  }

  private addGlyph(glyph: string, r: Rect, color: number, size = 13): void {
    const t = new Text({
      text: glyph,
      style: { fill: color, fontSize: size, fontFamily: FONT },
    });
    t.anchor.set(0.5);
    t.position.set(r.x + r.w / 2, r.y + r.h / 2);
    this.container.addChild(t);
  }
}
