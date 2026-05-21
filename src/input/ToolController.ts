import type { CommandQueue } from "../engine/CommandQueue";
import type { Grid } from "../engine/Grid";
import type { Command } from "../sim/commands";
import type { TileRect } from "../render/Picker";
import { Zone } from "../sim/layers";
import { BUILDING } from "../sim/buildings";

/** Build tools the player can select. */
export type Tool =
  | "inspect"
  | "road"
  | "bulldoze"
  | "raiseTerrain"
  | "lowerTerrain"
  | "zoneR"
  | "zoneC"
  | "zoneI"
  | "powerLine"
  | "powerPlant"
  | "pipe"
  | "waterPump";

/** Tools placed one tile at a time — a drag does not paint a line of them. */
const POINT_TOOLS = new Set<Tool>(["powerPlant", "waterPump"]);

/** Tools applied to a rubber-band rectangle — emitted on stroke commit. */
const RECT_TOOLS = new Set<Tool>([
  "zoneR",
  "zoneC",
  "zoneI",
  "bulldoze",
  "raiseTerrain",
  "lowerTerrain",
]);

/**
 * Holds the active build tool and turns painted tiles into `Command`s on the
 * world's command queue. Line tools interpolate a 4-connected path between
 * successive painted tiles so a fast drag never leaves gaps. Rect tools record
 * a press-anchored rectangle and emit it all at once on stroke commit.
 */
export class ToolController {
  activeTool: Tool = "inspect";

  private lastX = -1;
  private lastY = -1;

  private anchorX = -1;
  private anchorY = -1;
  private rect: TileRect | null = null;

  constructor(private readonly commands: CommandQueue<Command>) {}

  /** True when the active tool builds — a drag should paint, not pan. */
  get isBuilding(): boolean {
    return this.activeTool !== "inspect";
  }

  /** True when the active tool selects a rubber-band rectangle. */
  isRectTool(): boolean {
    return RECT_TOOLS.has(this.activeTool);
  }

  /** The rectangle a rect-tool stroke would apply, or null when none is pending. */
  get pendingRect(): TileRect | null {
    return this.rect;
  }

  /** Begin a fresh drag stroke; call on each pointer press. */
  beginStroke(): void {
    this.lastX = -1;
    this.lastY = -1;
    this.anchorX = -1;
    this.anchorY = -1;
    this.rect = null;
  }

  /** Paint a tile, filling the gap from the previously painted tile. */
  paint(tx: number, ty: number, grid: Grid): void {
    if (!this.isBuilding) return;
    if (RECT_TOOLS.has(this.activeTool)) {
      if (this.anchorX < 0) {
        this.anchorX = tx;
        this.anchorY = ty;
      }
      this.rect = normalizeRect(this.anchorX, this.anchorY, tx, ty, grid);
      return;
    }
    if (POINT_TOOLS.has(this.activeTool)) {
      this.emit(tx, ty, grid);
      return;
    }
    if (this.lastX < 0) {
      this.emit(tx, ty, grid);
    } else {
      this.line(this.lastX, this.lastY, tx, ty, grid);
    }
    this.lastX = tx;
    this.lastY = ty;
  }

  /**
   * End a stroke; call on each pointer release. For rect tools this emits one
   * command per tile in the pending rectangle. A no-op for other tools, whose
   * commands were already emitted during `paint`.
   */
  commitStroke(grid: Grid): void {
    if (!this.rect) return;
    for (let y = this.rect.y0; y <= this.rect.y1; y++) {
      for (let x = this.rect.x0; x <= this.rect.x1; x++) {
        this.emit(x, y, grid);
      }
    }
    this.rect = null;
    this.anchorX = -1;
    this.anchorY = -1;
  }

  /**
   * 4-connected Bresenham walk — emits every tile between two points, stepping
   * only one axis at a time so the resulting line is traversable.
   */
  private line(x0: number, y0: number, x1: number, y1: number, grid: Grid): void {
    let x = x0;
    let y = y0;
    const dx = Math.abs(x1 - x0);
    const dy = Math.abs(y1 - y0);
    const sx = x0 < x1 ? 1 : -1;
    const sy = y0 < y1 ? 1 : -1;
    let err = dx - dy;

    // The start tile was already emitted by the previous paint() call.
    while (x !== x1 || y !== y1) {
      if (x !== x1 && (y === y1 || 2 * err > -dy)) {
        err -= dy;
        x += sx;
      } else {
        err += dx;
        y += sy;
      }
      this.emit(x, y, grid);
    }
  }

  private emit(tx: number, ty: number, grid: Grid): void {
    if (!grid.inBounds(tx, ty)) return;
    const cmd = this.toCommand(tx, ty);
    if (cmd) this.commands.push(cmd);
  }

  private toCommand(x: number, y: number): Command | null {
    switch (this.activeTool) {
      case "road":
        return { type: "buildRoad", x, y };
      case "bulldoze":
        return { type: "bulldoze", x, y };
      case "raiseTerrain":
        return { type: "raiseTerrain", x, y };
      case "lowerTerrain":
        return { type: "lowerTerrain", x, y };
      case "powerLine":
        return { type: "buildPowerLine", x, y };
      case "pipe":
        return { type: "buildPipe", x, y };
      case "zoneR":
        return { type: "zone", x, y, zone: Zone.Residential };
      case "zoneC":
        return { type: "zone", x, y, zone: Zone.Commercial };
      case "zoneI":
        return { type: "zone", x, y, zone: Zone.Industrial };
      case "powerPlant":
        return { type: "placeBuilding", x, y, building: BUILDING.PowerPlant };
      case "waterPump":
        return { type: "placeBuilding", x, y, building: BUILDING.WaterPump };
      default:
        return null;
    }
  }
}

/** Sort two corners into a min/max rectangle and clamp it to the grid. */
function normalizeRect(
  ax: number,
  ay: number,
  bx: number,
  by: number,
  grid: Grid,
): TileRect {
  const clampX = (v: number) => Math.max(0, Math.min(grid.width - 1, v));
  const clampY = (v: number) => Math.max(0, Math.min(grid.height - 1, v));
  return {
    x0: clampX(Math.min(ax, bx)),
    y0: clampY(Math.min(ay, by)),
    x1: clampX(Math.max(ax, bx)),
    y1: clampY(Math.max(ay, by)),
  };
}
