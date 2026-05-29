import * as THREE from "three";
import type { CityData } from "../sim/CityData";
import { tileCenterX, tileCenterZ, tileSurfaceY } from "./constants";

/** How many sim ticks the funnel takes to travel the whole path. */
const TRAVEL_TICKS = 30;
/** Ticks the funnel lingers after reaching the path's end before vanishing. */
const LINGER_TICKS = 8;
/** Number of debris instances spun around the funnel base. */
const DEBRIS_COUNT = 24;

/**
 * Renders an active tornado: a tall, twisted funnel (two counter-rotating
 * cones for the swirl), a rotating ring of debris near the base, and a dust
 * disc on the ground. Walks `city.tornadoPath` over ~3 seconds of sim time
 * then fades. Reads `CityData.tornadoPath`; clears it when the animation ends.
 */
export class TornadoRenderer {
  readonly group = new THREE.Group();

  private readonly funnelOuter: THREE.Mesh;
  private readonly funnelInner: THREE.Mesh;
  private readonly debris: THREE.InstancedMesh;
  private readonly dust: THREE.Mesh;

  private readonly funnelGeoOuter: THREE.CylinderGeometry;
  private readonly funnelGeoInner: THREE.CylinderGeometry;
  private readonly debrisGeo: THREE.BoxGeometry;
  private readonly dustGeo: THREE.CircleGeometry;
  private readonly funnelMatOuter: THREE.MeshBasicMaterial;
  private readonly funnelMatInner: THREE.MeshBasicMaterial;
  private readonly debrisMat: THREE.MeshBasicMaterial;
  private readonly dustMat: THREE.MeshBasicMaterial;
  private readonly dummy = new THREE.Object3D();

  constructor() {
    // Outer translucent funnel — wide at top, narrow at base (tornado shape).
    this.funnelGeoOuter = new THREE.CylinderGeometry(1.8, 0.4, 6.5, 24, 6, true);
    this.funnelGeoOuter.translate(0, 3.25, 0);
    this.funnelMatOuter = new THREE.MeshBasicMaterial({
      color: 0x4a4a52,
      transparent: true,
      opacity: 0.55,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    this.funnelOuter = new THREE.Mesh(this.funnelGeoOuter, this.funnelMatOuter);

    // Inner darker funnel — counter-rotates for a churning feel.
    this.funnelGeoInner = new THREE.CylinderGeometry(1.2, 0.25, 5.8, 18, 4, true);
    this.funnelGeoInner.translate(0, 2.9, 0);
    this.funnelMatInner = new THREE.MeshBasicMaterial({
      color: 0x222229,
      transparent: true,
      opacity: 0.7,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    this.funnelInner = new THREE.Mesh(this.funnelGeoInner, this.funnelMatInner);

    // Debris ring — small boxes orbiting near the base.
    this.debrisGeo = new THREE.BoxGeometry(0.18, 0.16, 0.32);
    this.debrisMat = new THREE.MeshBasicMaterial({ color: 0x6b5a3d });
    this.debris = new THREE.InstancedMesh(this.debrisGeo, this.debrisMat, DEBRIS_COUNT);
    this.debris.frustumCulled = false;
    this.debris.count = DEBRIS_COUNT;

    // Dust disc on the ground.
    this.dustGeo = new THREE.CircleGeometry(1.6, 24);
    this.dustGeo.rotateX(-Math.PI / 2);
    this.dustMat = new THREE.MeshBasicMaterial({
      color: 0x8a7a5d,
      transparent: true,
      opacity: 0.45,
      depthWrite: false,
    });
    this.dust = new THREE.Mesh(this.dustGeo, this.dustMat);

    this.group.visible = false;
    this.group.add(this.dust, this.funnelOuter, this.funnelInner, this.debris);
  }

  update(city: CityData, tick: number, timeMs: number): void {
    const path = city.tornadoPath;
    if (!path || path.tiles.length === 0) {
      this.group.visible = false;
      return;
    }
    const age = tick - path.spawnedAt;
    if (age < 0 || age > TRAVEL_TICKS + LINGER_TICKS) {
      // Expired (or not yet started) — the sim owns clearing the path.
      this.group.visible = false;
      return;
    }

    const progress = Math.min(1, age / TRAVEL_TICKS);
    const idxFloat = progress * (path.tiles.length - 1);
    const i0 = Math.floor(idxFloat);
    const i1 = Math.min(path.tiles.length - 1, i0 + 1);
    const t = idxFloat - i0;
    const { grid } = city;
    const tile0 = path.tiles[i0];
    const tile1 = path.tiles[i1];
    const x0 = tileCenterX(grid.x(tile0), grid);
    const z0 = tileCenterZ(grid.y(tile0), grid);
    const x1 = tileCenterX(grid.x(tile1), grid);
    const z1 = tileCenterZ(grid.y(tile1), grid);
    const x = x0 + (x1 - x0) * t;
    const z = z0 + (z1 - z0) * t;
    const y = tileSurfaceY(city, tile0);

    this.group.position.set(x, y, z);

    // Counter-rotating swirls.
    this.funnelOuter.rotation.y = timeMs * 0.012;
    this.funnelInner.rotation.y = -timeMs * 0.020;
    this.dust.rotation.y = timeMs * 0.004;

    // Orbiting debris — radius pulses to imply rotation; vertical drift.
    const spin = timeMs * 0.008;
    for (let i = 0; i < DEBRIS_COUNT; i++) {
      const a = (i / DEBRIS_COUNT) * Math.PI * 2 + spin;
      const ringR = 0.7 + 0.5 * Math.sin(timeMs * 0.005 + i);
      const hh = 0.25 + ((i * 0.37 + timeMs * 0.0015) % 2.4);
      this.dummy.position.set(Math.cos(a) * ringR, hh, Math.sin(a) * ringR);
      this.dummy.rotation.set(spin + i, spin * 1.4 + i, 0);
      this.dummy.scale.set(1, 1, 1);
      this.dummy.updateMatrix();
      this.debris.setMatrixAt(i, this.dummy.matrix);
    }
    this.debris.instanceMatrix.needsUpdate = true;

    const fadeIn = Math.min(1, age / 4);
    const fadeOut = age > TRAVEL_TICKS
      ? Math.max(0, 1 - (age - TRAVEL_TICKS) / LINGER_TICKS)
      : 1;
    const opacity = fadeIn * fadeOut;
    this.funnelMatOuter.opacity = 0.55 * opacity;
    this.funnelMatInner.opacity = 0.7 * opacity;
    this.dustMat.opacity = 0.45 * opacity;
    this.group.visible = opacity > 0.02;
  }

  dispose(): void {
    this.debris.dispose();
    this.funnelGeoOuter.dispose();
    this.funnelGeoInner.dispose();
    this.debrisGeo.dispose();
    this.dustGeo.dispose();
    this.funnelMatOuter.dispose();
    this.funnelMatInner.dispose();
    this.debrisMat.dispose();
    this.dustMat.dispose();
  }
}
