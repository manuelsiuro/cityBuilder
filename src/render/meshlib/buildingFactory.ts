import * as THREE from "three";
import { Zone } from "../../sim/layers";

/**
 * Procedural low-poly building geometry. Each archetype — one per
 * (zone × level × variant) — is assembled from coloured boxes, prisms and
 * cylinders, giving a varied stylised skyline reminiscent of low-poly city
 * asset packs. Geometry is built once and shared by an `InstancedMesh`.
 */

/** Distinct procedural designs generated per (zone × level). */
export const BUILDING_VARIANTS = 6;

/* ---- shared palette ---------------------------------------------------- */

const GLASS = 0x9ec6da;
const GLASS_LIT = 0xe6cf94;
const TRIM = 0x3c4350;
const FOUND = 0xb7b1a4;
const METAL = 0x8b8f96;
const POLE = 0x55585f;
const ROOF_GREY = [0x595d66, 0x4a4e57, 0x6b6f78];

const RES_WALL = [0xe4d4b0, 0xcf8a6a, 0x84b0a0, 0xc77182, 0xd9b08c, 0x9aa9b8];
const HOUSE_ROOF = [0x9a4b3b, 0x4f5b6b, 0x6d4636, 0x3f5247, 0x7a5c3e, 0x5a4452];
const COM_WALL = [0xe2e7ec, 0x6fa8c9, 0xe09a52, 0xb9c0c9, 0xd9dde2, 0x7d9bb0];
const COM_ACCENT = [0xd2452f, 0x2f6f8c, 0xb5471f, 0x445063, 0xc9682f, 0x356b52];
const IND_WALL = [0x9c9588, 0x8c8478, 0xafa898, 0x86907d];

/* ---- mesh builder ------------------------------------------------------ */

/** Accumulates flat-shaded, vertex-coloured triangles into one geometry. */
export class MeshBuilder {
  private readonly pos: number[] = [];
  private readonly nrm: number[] = [];
  private readonly col: number[] = [];
  private readonly rgb = new THREE.Color();

  /** Axis-aligned box; `y` is the box's base (bottom) height. */
  box(w: number, h: number, d: number, x: number, y: number, z: number, color: number): void {
    const g = new THREE.BoxGeometry(w, h, d);
    g.translate(x, y + h / 2, z);
    this.merge(g, color);
    g.dispose();
  }

  /** Vertical cylinder; `y` is the base height. `rTop` defaults to `r`. */
  cyl(
    r: number,
    h: number,
    x: number,
    y: number,
    z: number,
    color: number,
    seg = 8,
    rTop = r,
  ): void {
    const g = new THREE.CylinderGeometry(rTop, r, h, seg);
    g.translate(x, y + h / 2, z);
    this.merge(g, color);
    g.dispose();
  }

  /** Gable (pitched) roof prism; base at `y`, ridge running along Z. */
  gable(w: number, h: number, d: number, x: number, y: number, z: number, color: number): void {
    const hw = w / 2;
    const hd = d / 2;
    const A: V = [x - hw, y, z - hd];
    const B: V = [x + hw, y, z - hd];
    const A2: V = [x - hw, y, z + hd];
    const B2: V = [x + hw, y, z + hd];
    const C: V = [x, y + h, z - hd];
    const C2: V = [x, y + h, z + hd];
    this.tri(A, C, B, color);
    this.tri(A2, B2, C2, color);
    this.tri(A, A2, C2, color);
    this.tri(A, C2, C, color);
    this.tri(B, C, C2, color);
    this.tri(B, C2, B2, color);
  }

  private tri(a: V, b: V, c: V, color: number): void {
    const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2];
    const vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
    let nx = uy * vz - uz * vy;
    let ny = uz * vx - ux * vz;
    let nz = ux * vy - uy * vx;
    const len = Math.hypot(nx, ny, nz) || 1;
    nx /= len; ny /= len; nz /= len;
    this.rgb.setHex(color);
    for (const p of [a, b, c]) {
      this.pos.push(p[0], p[1], p[2]);
      this.nrm.push(nx, ny, nz);
      this.col.push(this.rgb.r, this.rgb.g, this.rgb.b);
    }
  }

  private merge(g: THREE.BufferGeometry, color: number): void {
    const ng = g.index ? g.toNonIndexed() : g;
    const p = ng.attributes.position.array;
    const n = ng.attributes.normal.array;
    this.rgb.setHex(color);
    for (let k = 0; k < p.length; k += 3) {
      this.pos.push(p[k], p[k + 1], p[k + 2]);
      this.nrm.push(n[k], n[k + 1], n[k + 2]);
      this.col.push(this.rgb.r, this.rgb.g, this.rgb.b);
    }
    if (ng !== g) ng.dispose();
  }

  build(): THREE.BufferGeometry {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.Float32BufferAttribute(this.pos, 3));
    geo.setAttribute("normal", new THREE.Float32BufferAttribute(this.nrm, 3));
    geo.setAttribute("color", new THREE.Float32BufferAttribute(this.col, 3));
    return geo;
  }
}

type V = [number, number, number];

/* ---- shared parts ------------------------------------------------------ */

/** A ribbon of glazing wrapping all four walls of one storey. */
function windowBand(
  b: MeshBuilder,
  w: number,
  d: number,
  baseY: number,
  h: number,
  color: number,
): void {
  const fw = w * 0.74;
  const fd = d * 0.74;
  b.box(fw, h, 0.06, 0, baseY, d / 2, color);
  b.box(fw, h, 0.06, 0, baseY, -d / 2, color);
  b.box(0.06, h, fd, w / 2, baseY, 0, color);
  b.box(0.06, h, fd, -w / 2, baseY, 0, color);
}

/** Low parapet wall ringing a flat roof. */
function parapet(b: MeshBuilder, w: number, d: number, topY: number, color: number): void {
  const t = 0.05;
  const h = 0.13;
  b.box(w, h, t, 0, topY, d / 2, color);
  b.box(w, h, t, 0, topY, -d / 2, color);
  b.box(t, h, d, w / 2, topY, 0, color);
  b.box(t, h, d, -w / 2, topY, 0, color);
}

/** Rooftop clutter — AC units, tanks, stairwell boxes, antennae. */
function roofDetails(
  b: MeshBuilder,
  w: number,
  d: number,
  y: number,
  variant: number,
  wall: number,
): void {
  const ex = w * 0.26;
  const ez = d * 0.26;
  switch (variant % 4) {
    case 0:
      b.box(0.18, 0.12, 0.18, ex, y, ez, METAL);
      b.box(0.16, 0.2, 0.16, -ex, y, -ez, wall);
      break;
    case 1:
      b.cyl(0.1, 0.22, -ex, y, ez, 0x8a7d63);
      b.box(0.03, 0.42, 0.03, ex, y, -ez, POLE);
      break;
    case 2:
      b.box(0.2, 0.16, 0.2, 0, y, 0, wall);
      b.box(0.14, 0.1, 0.14, ex, y, ez, METAL);
      break;
    default:
      b.cyl(0.07, 0.16, ex, y, ez, METAL, 6);
      b.cyl(0.07, 0.16, -ex, y, -ez, METAL, 6);
      b.box(0.03, 0.36, 0.03, 0, y, 0, POLE);
  }
}

/* ---- archetype builders ------------------------------------------------ */

/** Small detached house — gabled or (variant 5) flat-roofed modern. */
function house(b: MeshBuilder, variant: number): void {
  const wall = RES_WALL[variant % RES_WALL.length];
  const roofC = HOUSE_ROOF[variant % HOUSE_ROOF.length];
  const w = 0.56 + (variant % 3) * 0.04;
  const d = 0.6;
  const fh = variant === 5 ? 0.62 : 0.5;

  b.box(w + 0.06, 0.08, d + 0.06, 0, 0, 0, FOUND);
  b.box(w, fh, d, 0, 0.04, 0, wall);

  if (variant === 5) {
    // Flat-roofed modern bungalow.
    b.box(w + 0.06, 0.06, d + 0.06, 0, 0.04 + fh, 0, roofC);
    windowBand(b, w, d, 0.2, 0.2, GLASS);
  } else {
    b.gable(w + 0.12, 0.34, d + 0.12, 0, 0.04 + fh, 0, roofC);
    b.box(0.16, 0.18, 0.05, w * 0.2, 0.22, -d / 2, GLASS);
    b.box(0.05, 0.18, 0.18, w / 2, 0.26, 0.06, GLASS);
    b.box(0.05, 0.18, 0.18, -w / 2, 0.26, -0.06, GLASS);
  }
  b.box(0.16, 0.28, 0.05, -w * 0.18, 0.04, -d / 2, TRIM);

  if (variant % 2 === 0) {
    b.box(0.1, 0.36, 0.1, w * 0.26, 0.04 + fh, d * 0.2, 0x6b5d52);
  }
  if (variant === 1) {
    // Side garage.
    b.box(0.26, 0.3, 0.32, w * 0.5 + 0.06, 0.04, d * 0.12, wall);
    b.box(0.22, 0.2, 0.04, w * 0.5 + 0.06, 0.04, d * 0.12 - 0.17, TRIM);
  }
  if (variant === 4) {
    // Covered front porch on slim posts.
    b.box(w * 0.7, 0.04, 0.2, 0, 0.04 + fh * 0.62, -d / 2 - 0.12, roofC);
    b.box(0.05, fh * 0.62, 0.05, -w * 0.3, 0.04, -d / 2 - 0.2, TRIM);
    b.box(0.05, fh * 0.62, 0.05, w * 0.3, 0.04, -d / 2 - 0.2, TRIM);
  }
}

/** Storeys for a flat-roof tower of the given zone, level and variant. */
function towerFloors(zone: Zone, level: number, variant: number): number {
  if (zone === Zone.Commercial) {
    const base = level === 1 ? 2 : level === 2 ? 4 : 7;
    return base + (variant % 2);
  }
  const base = level === 2 ? 3 : 5;
  return base + (variant % 2);
}

/** Flat-roof, window-banded building — commercial, or residential level 2+. */
function tower(b: MeshBuilder, zone: Zone, level: number, variant: number): void {
  const isComm = zone === Zone.Commercial;
  const floors = towerFloors(zone, level, variant);
  const fh = 0.42;
  const wall = (isComm ? COM_WALL : RES_WALL)[variant % COM_WALL.length];
  const w = (isComm ? 0.64 : 0.6) + (variant % 3) * 0.04;
  const d = (isComm ? 0.64 : 0.6) + ((variant + 1) % 3) * 0.04;
  const top = floors * fh;

  b.box(w + 0.08, 0.09, d + 0.08, 0, 0, 0, FOUND);
  b.box(w, top, d, 0, 0.05, 0, wall);

  for (let f = 0; f < floors; f++) {
    const by = 0.05 + f * fh + fh * 0.26;
    const lit = variant % 3 === 0 && f % 2 === 1;
    windowBand(b, w, d, by, fh * 0.46, lit ? GLASS_LIT : GLASS);
  }

  b.box(0.22, 0.32, 0.05, 0, 0.05, -d / 2, TRIM);

  // Residential towers with an odd variant get stacked front balconies.
  if (!isComm && variant % 2 === 1) {
    for (let f = 1; f < floors; f++) {
      const by = 0.05 + f * fh;
      b.box(w * 0.52, 0.04, 0.16, 0, by, -d / 2 - 0.08, wall);
      b.box(w * 0.52, 0.11, 0.03, 0, by, -d / 2 - 0.15, TRIM);
    }
  }

  if (isComm) {
    const accent = COM_ACCENT[variant % COM_ACCENT.length];
    b.box(w * 0.92, 0.05, 0.18, 0, fh * 0.92, -d / 2 - 0.07, accent);
    b.box(w * 0.44, 0.22, 0.06, 0, top * 0.52, -d / 2 - 0.02, accent);
  }

  const roofC = ROOF_GREY[variant % 3];
  b.box(w * 0.99, 0.05, d * 0.99, 0, 0.05 + top, 0, roofC);
  parapet(b, w, d, 0.05 + top, roofC);
  roofDetails(b, w, d, 0.05 + top + 0.05, variant, wall);
}

/** Wide, low industrial shed — flat or gable roofed, with stacks and vents. */
function industrial(b: MeshBuilder, level: number, variant: number): void {
  const wall = IND_WALL[variant % 4];
  const floors = Math.max(1, level);
  const fh = 0.44;
  const w = 0.78 + (variant % 2) * 0.06;
  const d = 0.74;
  const top = floors * fh;

  b.box(w + 0.08, 0.09, d + 0.08, 0, 0, 0, FOUND);
  b.box(w, top, d, 0, 0.05, 0, wall);

  for (let f = 0; f < floors; f++) {
    if (f === floors - 1) {
      windowBand(b, w, d, 0.05 + f * fh + fh * 0.32, fh * 0.34, GLASS);
    }
  }
  b.box(0.34, 0.36, 0.05, 0, 0.05, -d / 2, TRIM);

  const roofC = ROOF_GREY[variant % 3];
  if (variant === 3 || variant === 5) {
    b.gable(w + 0.06, 0.3, d + 0.06, 0, 0.05 + top, 0, roofC);
  } else {
    b.box(w * 0.99, 0.05, d * 0.99, 0, 0.05 + top, 0, roofC);
    parapet(b, w, d, 0.05 + top, roofC);
  }

  const y = 0.05 + top + 0.06;
  if (variant % 2 === 0) {
    b.cyl(0.08, 0.5, w * 0.3, 0.05 + top, d * 0.28, 0x9a4b3b);
  }
  b.cyl(0.06, 0.18, -w * 0.28, y, d * 0.2, METAL, 6);
  b.box(0.18, 0.1, 0.14, w * 0.1, y, -d * 0.25, METAL);
}

/* ---- entry point ------------------------------------------------------- */

/** Build the merged, vertex-coloured geometry for one building archetype. */
export function createBuildingGeometry(
  zone: Zone,
  level: number,
  variant: number,
): THREE.BufferGeometry {
  const b = new MeshBuilder();
  if (zone === Zone.Industrial) {
    industrial(b, level, variant);
  } else if (zone === Zone.Residential && level === 1) {
    house(b, variant);
  } else {
    tower(b, zone, level, variant);
  }
  return b.build();
}
