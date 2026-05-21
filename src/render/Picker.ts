import * as THREE from "three";
import type { CityData } from "../sim/CityData";
import { worldToTile } from "./constants";

export interface TileCoord {
  x: number;
  y: number;
}

/** An inclusive rectangle of tiles; `(x0,y0)` min corner, `(x1,y1)` max corner. */
export interface TileRect {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

/**
 * Converts a screen-space pointer position into a tile coordinate by raycasting
 * against the terrain mesh.
 */
export class Picker {
  private readonly raycaster = new THREE.Raycaster();
  private readonly ndc = new THREE.Vector2();

  constructor(
    private readonly camera: THREE.Camera,
    private readonly terrain: THREE.Object3D,
    private readonly city: CityData,
  ) {}

  /** `clientX/Y` are pointer coords; `rect` is the canvas bounding rect. */
  pick(clientX: number, clientY: number, rect: DOMRect): TileCoord | null {
    this.ndc.x = ((clientX - rect.left) / rect.width) * 2 - 1;
    this.ndc.y = -((clientY - rect.top) / rect.height) * 2 + 1;
    this.raycaster.setFromCamera(this.ndc, this.camera);

    const hit = this.raycaster.intersectObject(this.terrain, false)[0];
    if (!hit) return null;

    const { x, y } = worldToTile(hit.point.x, hit.point.z, this.city.grid);
    return this.city.grid.inBounds(x, y) ? { x, y } : null;
  }
}
