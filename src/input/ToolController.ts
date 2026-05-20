import type { CommandQueue } from "../engine/CommandQueue";
import type { Grid } from "../engine/Grid";
import type { Command } from "../sim/commands";
import { Zone } from "../sim/layers";
import { BUILDING } from "../sim/buildings";

/** Build tools the player can select. */
export type Tool =
  | "inspect"
  | "road"
  | "bulldoze"
  | "zoneR"
  | "zoneC"
  | "zoneI"
  | "powerLine"
  | "powerPlant"
  | "pipe"
  | "waterPump";

/** Tools placed one tile at a time — a drag does not paint a line of them. */
const POINT_TOOLS = new Set<Tool>(["powerPlant", "waterPump"]);

/**
 * Holds the active build tool and turns painted tiles into `Command`s on the
 * world's command queue. Line tools interpolate a 4-connected path between
 * successive painted tiles so a fast drag never leaves gaps.
 */
export class ToolController {
  activeTool: Tool = "inspect";

  private lastX = -1;
  private lastY = -1;

  constructor(private readonly commands: CommandQueue<Command>) {}

  /** True when the active tool builds — a drag should paint, not pan. */
  get isBuilding(): boolean {
    return this.activeTool !== "inspect";
  }

  /** Begin a fresh drag stroke; call on each pointer press. */
  beginStroke(): void {
    this.lastX = -1;
    this.lastY = -1;
  }

  /** Paint a tile, filling the gap from the previously painted tile. */
  paint(tx: number, ty: number, grid: Grid): void {
    if (!this.isBuilding) return;
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
