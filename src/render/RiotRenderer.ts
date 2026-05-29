import * as THREE from "three";
import type { CityData } from "../sim/CityData";
import { hashTile, tileCenterX, tileCenterZ, tileSurfaceY } from "./constants";

const MAX_RIOTS = 512;
/** Height of the smoke puff above the tile surface. */
const SMOKE_LIFT = 0.55;
/** Height of the warning chevron above the tile surface. */
const CHEVRON_LIFT = 1.4;

/**
 * Renders active riots with two layered instanced meshes per tile: a dark
 * smoke puff at the base, and a red warning chevron floating above it. The
 * chevron bobs and the smoke gently expands with intensity. Read-only over
 * `CityData.riot`.
 */
export class RiotRenderer {
  readonly group = new THREE.Group();

  private readonly smoke: THREE.InstancedMesh;
  private readonly chevron: THREE.InstancedMesh;
  private readonly smokeGeo: THREE.SphereGeometry;
  private readonly chevronGeo: THREE.ConeGeometry;
  private readonly smokeMat: THREE.MeshBasicMaterial;
  private readonly chevronMat: THREE.MeshBasicMaterial;
  private readonly capacity: number;
  private readonly dummy = new THREE.Object3D();
  private readonly tint = new THREE.Color();
  private readonly hot = new THREE.Color(0xff2a2a);
  private readonly cool = new THREE.Color(0xff8a55);

  constructor(maxTiles: number) {
    this.capacity = Math.min(maxTiles, MAX_RIOTS);

    // Smoke puff — wide low-poly sphere, dark and translucent.
    this.smokeGeo = new THREE.SphereGeometry(0.45, 10, 8);
    this.smokeMat = new THREE.MeshBasicMaterial({
      color: 0x2a2a30,
      transparent: true,
      opacity: 0.6,
      depthWrite: false,
    });
    this.smoke = new THREE.InstancedMesh(this.smokeGeo, this.smokeMat, this.capacity);
    this.smoke.count = 0;
    this.smoke.frustumCulled = false;

    // Warning chevron — inverted cone so the tip points down at the tile.
    this.chevronGeo = new THREE.ConeGeometry(0.22, 0.5, 4);
    this.chevronGeo.rotateZ(Math.PI); // point downward
    this.chevronGeo.rotateY(Math.PI / 4); // diamond profile
    this.chevronMat = new THREE.MeshBasicMaterial();
    this.chevron = new THREE.InstancedMesh(this.chevronGeo, this.chevronMat, this.capacity);
    this.chevron.count = 0;
    this.chevron.frustumCulled = false;

    this.group.add(this.smoke, this.chevron);
  }

  update(city: CityData, timeMs: number): void {
    const { grid } = city;
    let n = 0;
    for (let i = 0; i < grid.size && n < this.capacity; i++) {
      const r = city.riot[i];
      if (r === 0) continue;
      const x = grid.x(i);
      const y = grid.y(i);
      const t = r / 255;
      const phase = ((hashTile(x, y) % 1000) / 1000) * Math.PI * 2;
      const px = tileCenterX(x, grid);
      const pz = tileCenterZ(y, grid);
      const surface = tileSurfaceY(city, i);

      // Smoke — broad puff, throbs gently with intensity.
      const sSmoke = 0.85 + t * 0.5 + 0.08 * Math.sin(timeMs * 0.004 + phase);
      this.dummy.position.set(px, surface + SMOKE_LIFT, pz);
      this.dummy.scale.set(sSmoke, sSmoke * 0.55, sSmoke);
      this.dummy.rotation.set(0, phase, 0);
      this.dummy.updateMatrix();
      this.smoke.setMatrixAt(n, this.dummy.matrix);
      this.smoke.setColorAt(n, this.tint.setHex(0x222229));

      // Chevron — bobs up/down and pulses red with intensity.
      const bob = 0.12 * Math.sin(timeMs * 0.006 + phase);
      this.dummy.position.set(px, surface + CHEVRON_LIFT + bob, pz);
      const sChev = 0.85 + t * 0.6;
      this.dummy.scale.set(sChev, sChev, sChev);
      this.dummy.rotation.set(0, timeMs * 0.003 + phase, 0);
      this.dummy.updateMatrix();
      this.chevron.setMatrixAt(n, this.dummy.matrix);
      this.chevron.setColorAt(n, this.tint.copy(this.cool).lerp(this.hot, t));
      n++;
    }
    this.smoke.count = n;
    this.chevron.count = n;
    this.smoke.instanceMatrix.needsUpdate = true;
    this.chevron.instanceMatrix.needsUpdate = true;
    if (this.smoke.instanceColor) this.smoke.instanceColor.needsUpdate = true;
    if (this.chevron.instanceColor) this.chevron.instanceColor.needsUpdate = true;
  }

  dispose(): void {
    this.smoke.dispose();
    this.chevron.dispose();
    this.smokeGeo.dispose();
    this.chevronGeo.dispose();
    this.smokeMat.dispose();
    this.chevronMat.dispose();
  }
}
