import { Container, Graphics, Text } from "pixi.js";
import { type Tool } from "../../input/ToolController";
import { toolLabel } from "./ToolPalette";

const W = 248;
const H = 84;
const MARGIN = 12;
const PAD = 10;

const FONT = "ui-sans-serif, system-ui, sans-serif";
const MONO = "ui-monospace, SFMono-Regular, Menlo, monospace";

export interface StatusInfo {
  date: string;
  population: number;
  /** 0 = paused, 1×/2×/3× = sim speed. */
  speed: number;
  fps: number;
  tool: Tool;
  tile: { x: number; y: number } | null;
}

/**
 * Top-left HUD card. Three rows: in-game date (primary), population, and a
 * muted dev row (fps · speed · active tool · hover tile). Replaces the plain
 * HTML `#debug` pill in the playing state.
 */
export class StatusPanel {
  readonly container = new Container();

  private readonly dateText: Text;
  private readonly popText: Text;
  private readonly devText: Text;

  private last = {
    date: "",
    population: -1,
    speed: -1,
    fps: -1,
    tool: "" as Tool | "",
    tileKey: "",
  };

  constructor() {
    const bg = new Graphics()
      .roundRect(0, 0, W, H, 10)
      .fill({ color: 0x161a20, alpha: 0.86 })
      .stroke({ width: 1, color: 0x39414d });
    this.container.addChild(bg);

    const calIcon = new Text({
      text: "📅",
      style: { fill: 0xeef2f6, fontSize: 16, fontFamily: FONT },
    });
    calIcon.position.set(PAD, PAD - 1);
    this.container.addChild(calIcon);

    this.dateText = new Text({
      text: "—",
      style: { fill: 0xeef2f6, fontSize: 16, fontFamily: FONT, fontWeight: "700" },
    });
    this.dateText.position.set(PAD + 24, PAD);
    this.container.addChild(this.dateText);

    const popIcon = new Text({
      text: "👥",
      style: { fill: 0xc6cdd6, fontSize: 14, fontFamily: FONT },
    });
    popIcon.position.set(PAD, PAD + 26);
    this.container.addChild(popIcon);

    this.popText = new Text({
      text: "0 citizens",
      style: { fill: 0xc6cdd6, fontSize: 14, fontFamily: FONT, fontWeight: "600" },
    });
    this.popText.position.set(PAD + 24, PAD + 27);
    this.container.addChild(this.popText);

    this.devText = new Text({
      text: "—",
      style: { fill: 0x8b95a1, fontSize: 11, fontFamily: MONO },
    });
    this.devText.position.set(PAD, PAD + 54);
    this.container.addChild(this.devText);
  }

  layout(): void {
    this.container.x = MARGIN;
    this.container.y = MARGIN;
  }

  setStatus(s: StatusInfo): void {
    if (s.date !== this.last.date) {
      this.last.date = s.date;
      this.dateText.text = s.date;
    }
    if (s.population !== this.last.population) {
      this.last.population = s.population;
      this.popText.text = `${s.population.toLocaleString("en-US")} citizens`;
    }

    const tileKey = s.tile ? `${s.tile.x},${s.tile.y}` : "";
    const fpsRounded = Math.round(s.fps);
    if (
      s.speed !== this.last.speed ||
      fpsRounded !== this.last.fps ||
      s.tool !== this.last.tool ||
      tileKey !== this.last.tileKey
    ) {
      this.last.speed = s.speed;
      this.last.fps = fpsRounded;
      this.last.tool = s.tool;
      this.last.tileKey = tileKey;

      const paused = s.speed === 0;
      const speedLabel = paused ? "Paused" : `${s.speed}×`;
      const tileLabel = tileKey ? ` · tile ${tileKey}` : "";
      this.devText.text =
        `${fpsRounded} fps · ${speedLabel} · ${toolLabel(s.tool)}${tileLabel}`;
      this.devText.style.fill = paused ? 0xe6a23a : 0x8b95a1;
    }
  }
}
