import * as THREE from "three";
import { CityData } from "../sim/CityData";
import { Zone, TerrainType } from "../sim/layers";
import { MAX_BUILD_LEVEL } from "../sim/development";
import {
  BUILDING_VARIANTS,
  createBuildingGeometry,
  treeGeometry,
} from "./meshlib/buildingFactory";
import { plantGeometry, pumpGeometry, pylonGeometry } from "./UtilityRenderer";
import { sedanGeometry, vanGeometry, truckGeometry } from "./CarRenderer";
import { TerrainMesh } from "./TerrainMesh";
import { RoadInstances } from "./RoadInstances";
import { TrafficLightRenderer } from "./TrafficLightRenderer";
import type { Intersection } from "../sim/systems/IntersectionSystem";

/** World-space gap between gallery pads. */
const SPACING = 3;
/** Side length of a model pad. */
const PAD_SIZE = 1.9;

const ZONES: { zone: Zone; name: string }[] = [
  { zone: Zone.Residential, name: "Res" },
  { zone: Zone.Commercial, name: "Com" },
  { zone: Zone.Industrial, name: "Ind" },
];

/** Half-extents of the laid-out gallery, used to set the camera pan bounds. */
export interface GalleryExtent {
  halfW: number;
  halfH: number;
}

/**
 * Builds a static, labelled catalogue of every 3D model in the game — the 54
 * zone-building variants, the utility structures, vehicles, trees, and sample
 * terrain and road patches — laid out on a grid of pads. Read-only: it borrows
 * the renderer's scene but never touches the simulation.
 */
export class SandboxGallery {
  readonly group = new THREE.Group();

  private readonly material = new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.82,
    flatShading: true,
  });
  private readonly padGeo = new THREE.BoxGeometry(PAD_SIZE, 0.1, PAD_SIZE);
  private readonly padMat = new THREE.MeshStandardMaterial({
    color: 0x3a4250,
    roughness: 0.95,
  });
  private readonly geometries: THREE.BufferGeometry[] = [];
  private readonly labelTextures: THREE.Texture[] = [];
  private readonly labels: THREE.Sprite[] = [];
  private terrain?: TerrainMesh;
  private roads?: RoadInstances;
  private junctionLights?: TrafficLightRenderer;
  private ground?: THREE.Mesh;

  /** Lay out every model and add the gallery to `scene`. */
  build(scene: THREE.Scene): GalleryExtent {
    // 54 zone buildings — a row per (zone, level), six variant columns.
    for (let z = 0; z < ZONES.length; z++) {
      for (let level = 1; level <= MAX_BUILD_LEVEL; level++) {
        const row = z * MAX_BUILD_LEVEL + (level - 1);
        for (let v = 0; v < BUILDING_VARIANTS; v++) {
          this.addModel(
            createBuildingGeometry(ZONES[z].zone, level, v),
            `${ZONES[z].name} L${level}·${v}`,
            v,
            row,
          );
        }
      }
    }

    // Utilities, vehicles and trees on two extra rows of five.
    const extras: { geo: THREE.BufferGeometry; name: string; lift: number }[] = [
      { geo: plantGeometry(), name: "Power Plant", lift: 0 },
      { geo: pumpGeometry(), name: "Water Pump", lift: 0 },
      { geo: pylonGeometry(), name: "Power Pylon", lift: 0 },
      { geo: sedanGeometry(), name: "Sedan", lift: 0.11 },
      { geo: vanGeometry(), name: "Van", lift: 0.11 },
      { geo: truckGeometry(), name: "Truck", lift: 0.11 },
      { geo: treeGeometry(0), name: "Tree A", lift: 0 },
      { geo: treeGeometry(1), name: "Tree B", lift: 0 },
      { geo: treeGeometry(2), name: "Tree C", lift: 0 },
      { geo: treeGeometry(3), name: "Tree D", lift: 0 },
    ];
    const extrasRow0 = ZONES.length * MAX_BUILD_LEVEL;
    extras.forEach((e, idx) => {
      this.addModel(e.geo, e.name, idx % 5, extrasRow0 + Math.floor(idx / 5), e.lift);
    });

    // Sample terrain and road patches, rendered by the real renderers.
    const patchRow = extrasRow0 + 3;
    this.addTerrainPatch(2 * SPACING, patchRow * SPACING);
    this.addRoadPatch(6 * SPACING, patchRow * SPACING);

    // Centre the layout on the origin, then return its half-extents.
    const box = new THREE.Box3().setFromObject(this.group);
    const center = box.getCenter(new THREE.Vector3());
    const size = box.getSize(new THREE.Vector3());
    this.group.position.set(-center.x, 0, -center.z);
    scene.add(this.group);

    this.addGround(size);
    if (this.ground) scene.add(this.ground);

    return { halfW: size.x / 2, halfH: size.z / 2 };
  }

  /** Toggle every model label on or off. */
  setLabelsVisible(visible: boolean): void {
    for (const label of this.labels) label.visible = visible;
  }

  dispose(): void {
    for (const geo of this.geometries) geo.dispose();
    for (const tex of this.labelTextures) tex.dispose();
    this.material.dispose();
    this.padGeo.dispose();
    this.padMat.dispose();
    this.terrain?.dispose();
    this.roads?.dispose();
    this.junctionLights?.dispose();
    this.ground?.geometry.dispose();
    (this.ground?.material as THREE.Material | undefined)?.dispose();
  }

  /** Place one model on a labelled pad at grid cell `(col, row)`. */
  private addModel(
    geo: THREE.BufferGeometry,
    name: string,
    col: number,
    row: number,
    liftY = 0,
  ): void {
    const x = col * SPACING;
    const z = row * SPACING;

    const pad = new THREE.Mesh(this.padGeo, this.padMat);
    pad.position.set(x, -0.05, z);
    pad.receiveShadow = true;
    this.group.add(pad);

    const mesh = new THREE.Mesh(geo, this.material);
    mesh.position.set(x, liftY, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    this.group.add(mesh);
    this.geometries.push(geo);

    const label = this.makeLabel(name);
    label.position.set(x, 0.42, z);
    this.group.add(label);
  }

  /** A grass / water / rock cross-section with elevation steps. */
  private addTerrainPatch(x: number, z: number): void {
    const patch = new CityData(9, 5);
    // Per-column: grass at rising elevation, a rock peak, then water and shore.
    const cols: { type: TerrainType; elev: number }[] = [
      { type: TerrainType.Grass, elev: 0 },
      { type: TerrainType.Grass, elev: 1 },
      { type: TerrainType.Grass, elev: 2 },
      { type: TerrainType.Grass, elev: 3 },
      { type: TerrainType.Rock, elev: 2 },
      { type: TerrainType.Water, elev: 0 },
      { type: TerrainType.Water, elev: 0 },
      { type: TerrainType.Grass, elev: 1 },
      { type: TerrainType.Grass, elev: 0 },
    ];
    for (let ty = 0; ty < patch.grid.height; ty++) {
      for (let tx = 0; tx < patch.grid.width; tx++) {
        const i = patch.grid.index(tx, ty);
        patch.terrainType[i] = cols[tx].type;
        patch.elevation[i] = cols[tx].elev;
      }
    }
    this.terrain = new TerrainMesh(patch);
    this.terrain.mesh.position.set(x, 0, z);
    this.group.add(this.terrain.mesh);

    const label = this.makeLabel("Terrain samples");
    label.position.set(x, 1.6, z);
    this.group.add(label);
  }

  /** A flat grass patch with a four-way road junction. */
  private addRoadPatch(x: number, z: number): void {
    const patch = new CityData(7, 7);
    for (let t = 0; t < patch.grid.width; t++) {
      patch.road[patch.grid.index(t, 3)] = 1; // horizontal arm
      patch.road[patch.grid.index(3, t)] = 1; // vertical arm
    }
    const terrain = new TerrainMesh(patch);
    terrain.mesh.position.set(x, 0, z);
    this.group.add(terrain.mesh);

    this.roads = new RoadInstances(patch);
    this.roads.rebuild(patch);
    this.roads.group.position.set(x, 0, z);
    this.group.add(this.roads.group);

    // Signal the central 4-way so the gallery previews the traffic-light model.
    const junction: Intersection = {
      tile: patch.grid.index(3, 3),
      kind: "light",
      offset: 0,
    };
    this.junctionLights = new TrafficLightRenderer();
    this.junctionLights.rebuild(patch, [junction]);
    this.junctionLights.update(0); // static frame: one axis green, the other red
    this.junctionLights.group.position.set(x, 0, z);
    this.group.add(this.junctionLights.group);

    const label = this.makeLabel("Road junction");
    label.position.set(x, 1.2, z);
    this.group.add(label);
  }

  /** A large neutral ground plane behind the pads. */
  private addGround(size: THREE.Vector3): void {
    const span = Math.max(size.x, size.z) * 1.6;
    const geo = new THREE.PlaneGeometry(span, span);
    geo.rotateX(-Math.PI / 2);
    const mat = new THREE.MeshStandardMaterial({ color: 0x59616e, roughness: 1 });
    this.ground = new THREE.Mesh(geo, mat);
    this.ground.position.y = -0.12;
    this.ground.receiveShadow = true;
  }

  /** A camera-facing text label drawn to a canvas texture. */
  private makeLabel(text: string): THREE.Sprite {
    const canvas = document.createElement("canvas");
    canvas.width = 512;
    canvas.height = 96;
    const ctx = canvas.getContext("2d")!;
    ctx.fillStyle = "rgba(14,18,28,0.85)";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    // Shrink the font until the text fits the label box.
    let fontSize = 48;
    do {
      fontSize -= 2;
      ctx.font = `bold ${fontSize}px ui-sans-serif, system-ui, sans-serif`;
    } while (ctx.measureText(text).width > canvas.width - 36 && fontSize > 16);
    ctx.fillStyle = "#eef2f6";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(text, canvas.width / 2, canvas.height / 2 + 2);

    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    this.labelTextures.push(tex);

    const sprite = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: tex,
        depthTest: false,
        depthWrite: false,
        transparent: true,
      }),
    );
    sprite.scale.set(2.7, 0.5, 1);
    sprite.renderOrder = 10;
    this.labels.push(sprite);
    return sprite;
  }
}
