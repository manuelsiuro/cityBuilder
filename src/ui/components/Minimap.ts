import { Container, Graphics, Sprite, Texture } from "pixi.js";
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

  constructor(width: number, height: number) {
    this.canvas = document.createElement("canvas");
    this.canvas.width = width;
    this.canvas.height = height;
    this.ctx2d = this.canvas.getContext("2d")!;
    this.img = this.ctx2d.createImageData(width, height);
    this.texture = Texture.from(this.canvas);

    const sprite = new Sprite(this.texture);
    sprite.width = VIEW;
    sprite.height = VIEW;
    sprite.position.set(FRAME, FRAME);

    const bg = new Graphics()
      .roundRect(0, 0, VIEW + FRAME * 2, VIEW + FRAME * 2, 8)
      .fill({ color: 0x161a20, alpha: 0.9 })
      .stroke({ width: 1, color: 0x39414d });

    this.container.addChild(bg, sprite);
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
