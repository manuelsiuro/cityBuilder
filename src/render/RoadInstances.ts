import * as THREE from "three";
import type { CityData } from "../sim/CityData";
import { MeshBuilder } from "./meshlib/buildingFactory";
import {
  TILE,
  hashTile,
  tileCenterX,
  tileCenterZ,
  tileCornerX,
  tileCornerZ,
  tileCornerYs,
  sampleRoadY,
} from "./constants";

/** Neighbour offsets and the edge-aligned yaw for each. */
const DIRS = [
  { dx: 0, dz: -1, rot: 0 },
  { dx: 1, dz: 0, rot: Math.PI / 2 },
  { dx: 0, dz: 1, rot: 0 },
  { dx: -1, dz: 0, rot: Math.PI / 2 },
] as const;

/** Vertical offset of the asphalt surface above the terrain. */
const ASPHALT_LIFT = 0.06;

/**
 * Renders the road layer with five `InstancedMesh`es: a dark asphalt slab per
 * road tile, dashed centre-line stubs pointing at each connected neighbour
 * (they meet across edges as a lane line), raised concrete kerbs along every
 * edge that borders a non-road tile, zebra crosswalks on intersection arms,
 * and street lamps dotted along the kerbs.
 */
export class RoadInstances {
  readonly group = new THREE.Group();

  private readonly asphalt: THREE.Mesh;
  private asphaltGeometry: THREE.BufferGeometry;
  private readonly asphaltMaterial: THREE.MeshStandardMaterial;
  private readonly markings: THREE.InstancedMesh;
  private readonly kerbs: THREE.InstancedMesh;
  private readonly crosswalks: THREE.InstancedMesh;
  private readonly lamps: THREE.InstancedMesh;
  private readonly lampMaterial: THREE.MeshStandardMaterial;
  private readonly maxRoad: number;
  private readonly maxMark: number;
  private readonly maxKerb: number;
  private readonly maxCross: number;
  private readonly dummy = new THREE.Object3D();

  constructor(city: CityData) {
    this.maxRoad = city.grid.size;
    this.maxMark = city.grid.size * 8;
    this.maxKerb = city.grid.size * 4;
    this.maxCross = city.grid.size * 8;

    this.asphaltMaterial = new THREE.MeshStandardMaterial({
      color: 0x303339,
      roughness: 0.95,
    });
    this.asphaltGeometry = new THREE.BufferGeometry();
    this.asphalt = new THREE.Mesh(this.asphaltGeometry, this.asphaltMaterial);
    this.asphalt.frustumCulled = false;
    this.asphalt.receiveShadow = true;

    const markGeo = new THREE.BoxGeometry(0.09, 0.035, TILE * 0.2);
    const markMat = new THREE.MeshStandardMaterial({ color: 0xe6e3d6, roughness: 0.75 });
    this.markings = new THREE.InstancedMesh(markGeo, markMat, this.maxMark);
    this.markings.frustumCulled = false;

    const kerbGeo = new THREE.BoxGeometry(TILE * 0.99, 0.13, 0.1);
    const kerbMat = new THREE.MeshStandardMaterial({ color: 0x9a9ea6, roughness: 0.9 });
    this.kerbs = new THREE.InstancedMesh(kerbGeo, kerbMat, this.maxKerb);
    this.kerbs.frustumCulled = false;

    const crossGeo = new THREE.BoxGeometry(TILE * 0.5, 0.045, 0.075);
    const crossMat = new THREE.MeshStandardMaterial({ color: 0xeef0f2, roughness: 0.7 });
    this.crosswalks = new THREE.InstancedMesh(crossGeo, crossMat, this.maxCross);
    this.crosswalks.frustumCulled = false;

    this.lampMaterial = new THREE.MeshStandardMaterial({
      vertexColors: true,
      roughness: 0.7,
      flatShading: true,
    });
    this.lamps = new THREE.InstancedMesh(lampGeometry(), this.lampMaterial, this.maxRoad);
    this.lamps.frustumCulled = false;

    this.group.add(this.asphalt, this.markings, this.kerbs, this.crosswalks, this.lamps);
    this.rebuild(city);
  }

  /** Re-place every instance from the current road layer. */
  rebuild(city: CityData): void {
    const { grid } = city;
    const positions: number[] = [];
    let markN = 0;
    let kerbN = 0;
    let crossN = 0;
    let lampN = 0;

    for (let ty = 0; ty < grid.height; ty++) {
      for (let tx = 0; tx < grid.width; tx++) {
        const i = grid.index(tx, ty);
        if (city.road[i] === 0) continue;

        const cx = tileCenterX(tx, grid);
        const cz = tileCenterZ(ty, grid);
        const corners = tileCornerYs(city, tx, ty);

        // Asphalt top quad — possibly sloped — inset by 1% on each side so it
        // doesn't z-fight with the terrain wall at the tile boundary.
        const inset = 0.01;
        const x0 = tileCornerX(tx, grid) + TILE * inset;
        const x1 = x0 + TILE * (1 - inset * 2);
        const z0 = tileCornerZ(ty, grid) + TILE * inset;
        const z1 = z0 + TILE * (1 - inset * 2);
        const yNW = sampleRoadY(corners, inset, inset) + ASPHALT_LIFT;
        const yNE = sampleRoadY(corners, 1 - inset, inset) + ASPHALT_LIFT;
        const ySW = sampleRoadY(corners, inset, 1 - inset) + ASPHALT_LIFT;
        const ySE = sampleRoadY(corners, 1 - inset, 1 - inset) + ASPHALT_LIFT;
        positions.push(
          x0, yNW, z0, x0, ySW, z1, x1, ySE, z1,
          x0, yNW, z0, x1, ySE, z1, x1, yNE, z0,
        );

        // A tile with three or more road neighbours is a junction.
        let conns = 0;
        for (const d of DIRS) {
          const nx = tx + d.dx;
          const ny = ty + d.dz;
          if (grid.inBounds(nx, ny) && city.road[grid.index(nx, ny)] !== 0) conns++;
        }
        const junction = conns >= 3;

        for (const d of DIRS) {
          const nx = tx + d.dx;
          const ny = ty + d.dz;
          const connected =
            grid.inBounds(nx, ny) && city.road[grid.index(nx, ny)] !== 0;

          if (connected) {
            // Two dashes per connected arm — they meet across edges.
            // Marking length is along local +Z (TILE * 0.2 long); after Y
            // rotation that's along world (sin(d.rot), 0, cos(d.rot)).
            const markHalfLen = TILE * 0.1;
            const markEndDx = Math.sin(d.rot) * markHalfLen;
            const markEndDz = Math.cos(d.rot) * markHalfLen;
            for (const t of [0.15, 0.36]) {
              if (markN >= this.maxMark) continue;
              const fx = 0.5 + d.dx * t;
              const fz = 0.5 + d.dz * t;
              const y = sampleRoadY(corners, fx, fz) + ASPHALT_LIFT + 0.03;
              const yPlus = sampleRoadY(corners, fx + markEndDx, fz + markEndDz);
              const yMinus = sampleRoadY(corners, fx - markEndDx, fz - markEndDz);
              const pitch = Math.atan2(yPlus - yMinus, markHalfLen * 2);
              this.dummy.position.set(cx + d.dx * TILE * t, y, cz + d.dz * TILE * t);
              this.dummy.rotation.set(0, d.rot, 0);
              // rotateX(-pitch) lifts the +Z end of the marking to match the
              // slope (positive rotateX lowers +Z, so negate).
              this.dummy.rotateX(-pitch);
              this.dummy.updateMatrix();
              this.markings.setMatrixAt(markN++, this.dummy.matrix);
            }
            // Zebra crosswalk striping each junction arm. Junction tiles are
            // flat by rule, so no tilt is needed, but we still sample per
            // stripe in case the asphalt has any drift.
            if (junction) {
              for (const t of [0.16, 0.25, 0.34, 0.43]) {
                if (crossN >= this.maxCross) continue;
                const fx = 0.5 + d.dx * t;
                const fz = 0.5 + d.dz * t;
                const y = sampleRoadY(corners, fx, fz) + ASPHALT_LIFT + 0.032;
                this.dummy.position.set(cx + d.dx * TILE * t, y, cz + d.dz * TILE * t);
                this.dummy.rotation.set(0, d.rot, 0);
                this.dummy.updateMatrix();
                this.crosswalks.setMatrixAt(crossN++, this.dummy.matrix);
              }
            }
          } else if (kerbN < this.maxKerb) {
            // Raised kerb along an edge that faces grass or the map border.
            // Kerb length is along local +X (TILE * 0.99); after Y rotation
            // that's along world (cos(d.rot), 0, -sin(d.rot)).
            const offset = 0.47;
            const fx = 0.5 + d.dx * offset;
            const fz = 0.5 + d.dz * offset;
            const y = sampleRoadY(corners, fx, fz) + ASPHALT_LIFT + 0.02;
            const kerbHalfLen = TILE * 0.495;
            const kerbEndDx = Math.cos(d.rot) * kerbHalfLen;
            const kerbEndDz = -Math.sin(d.rot) * kerbHalfLen;
            const yPlus = sampleRoadY(corners, fx + kerbEndDx, fz + kerbEndDz);
            const yMinus = sampleRoadY(corners, fx - kerbEndDx, fz - kerbEndDz);
            // rotateZ(roll) lifts the +X end of the kerb (positive rotateZ
            // raises +X), matching the slope along the kerb's length.
            const roll = Math.atan2(yPlus - yMinus, kerbHalfLen * 2);
            this.dummy.position.set(cx + d.dx * TILE * offset, y, cz + d.dz * TILE * offset);
            this.dummy.rotation.set(0, d.rot, 0);
            this.dummy.rotateZ(roll);
            this.dummy.updateMatrix();
            this.kerbs.setMatrixAt(kerbN++, this.dummy.matrix);
          }
        }

        // A street lamp on a kerb corner of roughly every fourth road tile.
        const h = hashTile(tx, ty);
        if (h % 4 === 0 && lampN < this.maxRoad) {
          const cdx = h & 1 ? 1 : -1;
          const cdz = h & 2 ? 1 : -1;
          const fx = 0.5 + cdx * 0.42;
          const fz = 0.5 + cdz * 0.42;
          const y = sampleRoadY(corners, fx, fz) + ASPHALT_LIFT + 0.02;
          this.dummy.position.set(cx + cdx * TILE * 0.42, y, cz + cdz * TILE * 0.42);
          this.dummy.rotation.set(0, Math.atan2(cdz, -cdx), 0);
          this.dummy.updateMatrix();
          this.lamps.setMatrixAt(lampN++, this.dummy.matrix);
        }
      }
    }

    this.asphaltGeometry.dispose();
    this.asphaltGeometry = new THREE.BufferGeometry();
    this.asphaltGeometry.setAttribute(
      "position",
      new THREE.Float32BufferAttribute(positions, 3),
    );
    this.asphaltGeometry.computeVertexNormals();
    this.asphalt.geometry = this.asphaltGeometry;

    this.markings.count = markN;
    this.kerbs.count = kerbN;
    this.crosswalks.count = crossN;
    this.lamps.count = lampN;
    this.markings.instanceMatrix.needsUpdate = true;
    this.kerbs.instanceMatrix.needsUpdate = true;
    this.crosswalks.instanceMatrix.needsUpdate = true;
    this.lamps.instanceMatrix.needsUpdate = true;
  }

  dispose(): void {
    this.asphaltGeometry.dispose();
    for (const m of [this.markings, this.kerbs, this.crosswalks, this.lamps]) {
      m.geometry.dispose();
    }
    this.asphaltMaterial.dispose();
    (this.markings.material as THREE.Material).dispose();
    (this.kerbs.material as THREE.Material).dispose();
    (this.crosswalks.material as THREE.Material).dispose();
    this.lampMaterial.dispose();
  }
}

/** A short street lamp: pole, arm and a warm lamp head. */
function lampGeometry(): THREE.BufferGeometry {
  const b = new MeshBuilder();
  b.cyl(0.028, 0.54, 0, 0, 0, 0x3b4048, 6);
  b.box(0.18, 0.035, 0.05, 0.08, 0.51, 0, 0x3b4048);
  b.box(0.1, 0.08, 0.1, 0.16, 0.46, 0, 0xf6e7a8);
  return b.build();
}
