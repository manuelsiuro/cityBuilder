import * as THREE from "three";
import type { CityData } from "../sim/CityData";
import { Zone } from "../sim/layers";
import { IsoCamera } from "./IsoCamera";
import { TerrainMesh } from "./TerrainMesh";
import { RoadInstances } from "./RoadInstances";
import { BuildingInstances } from "./BuildingInstances";
import { CarRenderer } from "./CarRenderer";
import { TileOverlay, type TileColorFn } from "./TileOverlay";
import { UtilityRenderer } from "./UtilityRenderer";
import type { Car } from "../sim/systems/TrafficSystem";
import { TILE, tileCenterX, tileCenterZ, tileSurfaceY } from "./constants";
import type { TileCoord } from "./Picker";

/** Power / water coverage overlay mode. */
export type OverlayMode = "off" | "power" | "water";

const ZONE_COLOR: Record<number, number> = {
  [Zone.Residential]: 0x49c46a,
  [Zone.Commercial]: 0x4a90d8,
  [Zone.Industrial]: 0xe0b53c,
};

const zoneColor: TileColorFn = (city, i) => ZONE_COLOR[city.zone[i]] ?? null;

const powerColor: TileColorFn = (city, i) => {
  const relevant = city.powerLine[i] || city.buildingId[i] || city.zone[i] !== Zone.None;
  if (!relevant) return null;
  return city.powered[i] ? 0x46d66a : 0xd6464a;
};

const waterColor: TileColorFn = (city, i) => {
  const relevant = city.pipe[i] || city.buildingId[i] || city.zone[i] !== Zone.None;
  if (!relevant) return null;
  return city.watered[i] ? 0x3aa6e0 : 0xd6464a;
};

/**
 * Owns the Three.js renderer, scene, lights, camera and every world layer
 * (terrain, roads, zones, utilities, overlays). Strictly downstream of the
 * simulation — it reads `CityData` and never writes.
 */
export class WorldRenderer {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene: THREE.Scene;
  readonly isoCamera = new IsoCamera();

  private terrain?: TerrainMesh;
  private roads?: RoadInstances;
  private buildings?: BuildingInstances;
  private cars?: CarRenderer;
  private utilities?: UtilityRenderer;
  private zoneOverlay?: TileOverlay;
  private networkOverlay?: TileOverlay;
  private city?: CityData;
  private overlayMode: OverlayMode = "off";
  private readonly highlight: THREE.Mesh;

  constructor(private readonly mount: HTMLElement) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    mount.appendChild(this.renderer.domElement);

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x9fc8e8);
    this.scene.fog = new THREE.Fog(0x9fc8e8, 140, 320);

    const hemi = new THREE.HemisphereLight(0xfdf6e3, 0x5d5a52, 1.05);
    const sun = new THREE.DirectionalLight(0xfff1d0, 1.85);
    sun.position.set(60, 90, 30);
    this.scene.add(hemi, sun);

    this.highlight = makeHighlight();
    this.highlight.visible = false;
    this.scene.add(this.highlight);

    this.resize();
  }

  /** Build the scene contents for a city. Call once after `World` is created. */
  buildCity(city: CityData): void {
    this.city = city;
    this.terrain = new TerrainMesh(city);
    this.roads = new RoadInstances(city);
    this.buildings = new BuildingInstances();
    this.cars = new CarRenderer(160);
    this.utilities = new UtilityRenderer(city);
    this.zoneOverlay = new TileOverlay(city.grid.size, 0.05, 0.5);
    this.networkOverlay = new TileOverlay(city.grid.size, 0.14, 0.6);
    this.networkOverlay.visible = false;

    this.scene.add(
      this.terrain.mesh,
      this.roads.group,
      this.buildings.group,
      this.cars.mesh,
      this.utilities.group,
      this.zoneOverlay.mesh,
      this.networkOverlay.mesh,
    );
    this.zoneOverlay.rebuild(city, zoneColor);
    this.utilities.setShowPipes(false);
    this.isoCamera.setMapExtent(
      (city.grid.width / 2) * TILE,
      (city.grid.height / 2) * TILE,
    );
  }

  rebuildRoads(city: CityData): void {
    this.roads?.rebuild(city);
  }

  rebuildZones(city: CityData): void {
    this.zoneOverlay?.rebuild(city, zoneColor);
  }

  rebuildUtilities(city: CityData): void {
    this.utilities?.rebuild(city);
  }

  rebuildBuildings(city: CityData): void {
    this.buildings?.rebuild(city);
  }

  /** Rebuild every world layer — used after loading a save. */
  rebuildAll(city: CityData): void {
    this.city = city;
    this.terrain?.rebuild(city);
    this.roads?.rebuild(city);
    this.utilities?.rebuild(city);
    this.buildings?.rebuild(city);
    this.zoneOverlay?.rebuild(city, zoneColor);
    this.applyOverlay(city);
  }

  /** Interpolate and re-place car instances. Call every render frame. */
  updateCars(cars: readonly Car[], city: CityData, alpha: number): void {
    this.cars?.sync(cars, city, alpha);
  }

  /** Refresh the coverage overlay if it is currently showing the given layer. */
  refreshOverlay(city: CityData, layer: "power" | "water"): void {
    if (this.overlayMode === layer) this.applyOverlay(city);
  }

  setOverlayMode(mode: OverlayMode, city: CityData): void {
    this.overlayMode = mode;
    this.utilities?.setShowPipes(mode === "water");
    if (this.networkOverlay) this.networkOverlay.visible = mode !== "off";
    this.applyOverlay(city);
  }

  get camera(): THREE.Camera {
    return this.isoCamera.camera;
  }

  get terrainObject(): THREE.Object3D | undefined {
    return this.terrain?.mesh;
  }

  get canvas(): HTMLCanvasElement {
    return this.renderer.domElement;
  }

  setHighlight(tile: TileCoord | null): void {
    if (!tile || !this.city) {
      this.highlight.visible = false;
      return;
    }
    const i = this.city.grid.index(tile.x, tile.y);
    this.highlight.position.set(
      tileCenterX(tile.x, this.city.grid),
      tileSurfaceY(this.city, i) + 0.12,
      tileCenterZ(tile.y, this.city.grid),
    );
    this.highlight.visible = true;
  }

  update(dtMs: number): void {
    this.isoCamera.update(dtMs);
  }

  render(): void {
    this.renderer.render(this.scene, this.isoCamera.camera);
  }

  resize(): void {
    const w = this.mount.clientWidth || window.innerWidth;
    const h = this.mount.clientHeight || window.innerHeight;
    this.renderer.setSize(w, h, false);
    this.isoCamera.setViewport(w, h);
  }

  dispose(): void {
    this.terrain?.dispose();
    this.roads?.dispose();
    this.buildings?.dispose();
    this.cars?.dispose();
    this.utilities?.dispose();
    this.zoneOverlay?.dispose();
    this.networkOverlay?.dispose();
    (this.highlight.geometry as THREE.BufferGeometry).dispose();
    (this.highlight.material as THREE.Material).dispose();
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }

  private applyOverlay(city: CityData): void {
    if (!this.networkOverlay || this.overlayMode === "off") return;
    this.networkOverlay.rebuild(
      city,
      this.overlayMode === "power" ? powerColor : waterColor,
    );
  }
}

function makeHighlight(): THREE.Mesh {
  const geo = new THREE.PlaneGeometry(TILE, TILE);
  geo.rotateX(-Math.PI / 2);
  const mat = new THREE.MeshBasicMaterial({
    color: 0xffe14d,
    transparent: true,
    opacity: 0.42,
    depthWrite: false,
  });
  return new THREE.Mesh(geo, mat);
}
