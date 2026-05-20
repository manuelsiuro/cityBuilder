import * as THREE from "three";
import { Zone } from "../../sim/layers";

/**
 * Procedural low-poly building geometry. Each archetype — one per
 * (zone × level) — is assembled from coloured boxes, matching the blocky
 * terrain aesthetic. Geometry is built once and shared by an `InstancedMesh`.
 */

/** One box of a building. `y` is the box's *base* (bottom) height. */
interface BoxSpec {
  w: number;
  h: number;
  d: number;
  x: number;
  y: number;
  z: number;
  color: number;
}

function body(w: number, h: number, d: number, color: number, y = 0): BoxSpec {
  return { w, h, d, x: 0, y, z: 0, color };
}

/** Box list for a building archetype. Footprint stays within a ±0.42 tile. */
function buildingSpecs(zone: Zone, level: number): BoxSpec[] {
  if (zone === Zone.Residential) {
    if (level === 1) {
      return [
        body(0.62, 0.42, 0.7, 0xd9c9a8),
        { w: 0.7, h: 0.16, d: 0.78, x: 0, y: 0.42, z: 0, color: 0x9a4b3b },
      ];
    }
    if (level === 2) {
      return [
        body(0.72, 0.95, 0.72, 0xc8b48c),
        { w: 0.78, h: 0.1, d: 0.78, x: 0, y: 0.95, z: 0, color: 0x6b5640 },
      ];
    }
    return [
      body(0.6, 1.7, 0.6, 0xcdbfa0),
      { w: 0.4, h: 0.42, d: 0.4, x: 0, y: 1.7, z: 0, color: 0xb3a283 },
    ];
  }

  if (zone === Zone.Commercial) {
    if (level === 1) {
      return [
        body(0.78, 0.5, 0.7, 0x6fa8c9),
        { w: 0.82, h: 0.1, d: 0.34, x: 0, y: 0.4, z: 0.32, color: 0x355a72 },
      ];
    }
    if (level === 2) {
      return [
        body(0.74, 1.05, 0.74, 0x4f93c4),
        { w: 0.78, h: 0.12, d: 0.78, x: 0, y: 1.05, z: 0, color: 0x2f5d7c },
      ];
    }
    return [
      body(0.62, 2.05, 0.62, 0x3f7fb8),
      { w: 0.08, h: 0.34, d: 0.08, x: 0.16, y: 2.05, z: 0.16, color: 0x9aa3ad },
    ];
  }

  // Industrial.
  if (level === 1) {
    return [body(0.82, 0.4, 0.72, 0x9a9382)];
  }
  if (level === 2) {
    return [
      body(0.78, 0.66, 0.78, 0x8a8276),
      { w: 0.16, h: 0.7, d: 0.16, x: 0.24, y: 0.66, z: -0.22, color: 0x655e54 },
    ];
  }
  return [
    body(0.84, 0.96, 0.84, 0x7e7669),
    { w: 0.16, h: 0.62, d: 0.16, x: -0.24, y: 0.96, z: -0.22, color: 0x5d574e },
    { w: 0.16, h: 0.78, d: 0.16, x: 0.26, y: 0.96, z: 0.2, color: 0x5d574e },
  ];
}

/** Build the merged, vertex-coloured geometry for one building archetype. */
export function createBuildingGeometry(zone: Zone, level: number): THREE.BufferGeometry {
  const positions: number[] = [];
  const normals: number[] = [];
  const colors: number[] = [];
  const color = new THREE.Color();

  for (const s of buildingSpecs(zone, level)) {
    const box = new THREE.BoxGeometry(s.w, s.h, s.d).toNonIndexed();
    box.translate(s.x, s.y + s.h / 2, s.z);
    const pos = box.attributes.position.array;
    const nrm = box.attributes.normal.array;
    color.setHex(s.color);
    for (let k = 0; k < pos.length; k += 3) {
      positions.push(pos[k], pos[k + 1], pos[k + 2]);
      normals.push(nrm[k], nrm[k + 1], nrm[k + 2]);
      colors.push(color.r, color.g, color.b);
    }
    box.dispose();
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute("normal", new THREE.Float32BufferAttribute(normals, 3));
  geo.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
  return geo;
}
