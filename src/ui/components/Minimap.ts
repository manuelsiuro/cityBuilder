import { Container, Graphics, Sprite, Text, Texture } from "pixi.js";
import type { CityData } from "../../sim/CityData";
import { TerrainType, Zone } from "../../sim/layers";
import { BUILDING } from "../../sim/buildings";

const VIEW = 166;
const FRAME = 4;
const MARGIN = 16;
const REDRAW_MS = 450;

type RGB = [number, number, number];

/**
 * Bottom-right minimap. Draws a downsampled top-down view of the city to a
 * canvas-backed texture, refreshed on a throttled interval.
 */
export class Minimap {
  readonly container = new Container();

  private readonly canvas: HTMLCanvasElement;
  private readonly ctx2d: CanvasRenderingContext2D;
  private readonly img: ImageData;
  private readonly texture: Texture;
  private accum = REDRAW_MS;
  private readonly compass = new Container();
  private readonly compassNeedle = new Container();
  private readonly sprite: Sprite;
  private lastHeading = Number.NaN;

  constructor(width: number, height: number) {
    this.canvas = document.createElement("canvas");
    this.canvas.width = width;
    this.canvas.height = height;
    this.ctx2d = this.canvas.getContext("2d")!;
    this.img = this.ctx2d.createImageData(width, height);
    this.texture = Texture.from(this.canvas);

    this.sprite = new Sprite(this.texture);
    this.sprite.width = VIEW;
    this.sprite.height = VIEW;
    this.sprite.anchor.set(0.5);
    this.sprite.position.set(FRAME + VIEW / 2, FRAME + VIEW / 2);

    const bg = new Graphics()
      .roundRect(0, 0, VIEW + FRAME * 2, VIEW + FRAME * 2, 8)
      .fill({ color: 0x161a20, alpha: 0.9 })
      .stroke({ width: 1, color: 0x39414d });

    // Mask: clip the rotating bitmap to the frame's inner rounded rect so the
    // corners can't poke outside the border during the rotation tween.
    const mask = new Graphics()
      .roundRect(FRAME, FRAME, VIEW, VIEW, 6)
      .fill({ color: 0xffffff });
    this.sprite.mask = mask;

    this.buildCompass();
    this.container.addChild(bg, mask, this.sprite, this.compass);
  }

  private buildCompass(): void {
    const r = 12;
    const disc = new Graphics()
      .circle(0, 0, r)
      .fill({ color: 0x0e1116, alpha: 0.85 })
      .stroke({ width: 1, color: 0x4a5260 });
    const needle = new Graphics()
      .moveTo(0, -r + 2)
      .lineTo(3, 2)
      .lineTo(-3, 2)
      .closePath()
      .fill({ color: 0xd94a4a })
      .moveTo(0, r - 2)
      .lineTo(3, -2)
      .lineTo(-3, -2)
      .closePath()
      .fill({ color: 0xc7cdd6 });
    this.compassNeedle.addChild(needle);

    const label = new Text({
      text: "N",
      style: {
        fill: 0xe6ecf3,
        fontSize: 9,
        fontFamily: "ui-sans-serif, system-ui, sans-serif",
        fontWeight: "700",
      },
    });
    label.anchor.set(0.5, 1);
    label.position.set(0, -r - 1);

    this.compass.addChild(disc, this.compassNeedle, label);
    this.compass.position.set(FRAME + r + 2, FRAME + r + 2);
  }

  /**
   * Rotate the minimap content and compass needle to match the camera yaw
   * (radians). The frame, disc, and "N" label stay axis-aligned; the bitmap and
   * needle share a rotation frame so the needle always points to world-north on
   * the rotated map.
   */
  setHeading(yaw: number): void {
    if (Math.abs(yaw - this.lastHeading) < 1e-3) return;
    this.lastHeading = yaw;
    // Default camera yaw is π/4; at home rotation = 0 so the minimap looks
    // identical to the pre-rotation behavior.
    const rot = -(yaw - Math.PI / 4);
    this.sprite.rotation = rot;
    this.compassNeedle.rotation = rot;
  }

  layout(screenW: number, screenH: number): void {
    this.container.x = screenW - VIEW - FRAME * 2 - MARGIN;
    this.container.y = screenH - VIEW - FRAME * 2 - MARGIN;
  }

  /** Redraw on a throttled cadence. */
  update(city: CityData, dtMs: number): void {
    this.accum += dtMs;
    if (this.accum < REDRAW_MS) return;
    this.accum = 0;
    this.redraw(city);
  }

  /** Force an immediate redraw and return the map as a base64 PNG data URL. */
  snapshot(city: CityData): string {
    this.redraw(city);
    return this.canvas.toDataURL("image/png");
  }

  private redraw(city: CityData): void {
    const data = this.img.data;
    for (let i = 0; i < city.grid.size; i++) {
      const [r, g, b] = colorFor(city, i);
      const o = i * 4;
      data[o] = r;
      data[o + 1] = g;
      data[o + 2] = b;
      data[o + 3] = 255;
    }
    this.ctx2d.putImageData(this.img, 0, 0);
    this.texture.source.update();
  }
}

function colorFor(city: CityData, i: number): RGB {
  if (city.road[i]) return [42, 45, 51];
  if (city.buildingId[i] === BUILDING.PowerPlant) return [201, 79, 61];
  if (city.buildingId[i] === BUILDING.WaterPump) return [63, 111, 140];

  const zone = city.zone[i];
  if (zone !== Zone.None) {
    const developed = city.buildLevel[i] > 0;
    if (zone === Zone.Residential) return developed ? [96, 200, 110] : [54, 96, 60];
    if (zone === Zone.Commercial) return developed ? [90, 150, 220] : [50, 78, 104];
    return developed ? [224, 181, 60] : [104, 88, 44];
  }

  const type = city.terrainType[i];
  if (type === TerrainType.Water) return [58, 110, 160];
  if (type === TerrainType.Rock) return [139, 135, 132];
  const e = city.elevation[i];
  return [74 + e * 6, 116 + e * 5, 66 + e * 2];
}
