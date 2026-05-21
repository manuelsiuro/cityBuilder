import type { CityData } from "../CityData";
import type { GameEventBus } from "../events";
import { Dirty } from "../layers";
import { buildingDef, type ServiceType } from "../buildings";

/**
 * Computes the service-coverage layers — police, fire and park — that radiate
 * from each service building. Coverage falls off linearly with Euclidean
 * distance (the same model as `LandValueSystem`'s pollution), and overlapping
 * stations combine by taking the strongest value.
 *
 * Dirty-gated on `Dirty.Coverage`, so it costs nothing on a tick where no
 * service building was placed or removed.
 */
export class CoverageSystem {
  constructor(private readonly events: GameEventBus) {}

  update(city: CityData): void {
    if (!city.isDirty(Dirty.Coverage)) return;

    city.policeCoverage.fill(0);
    city.fireCoverage.fill(0);
    city.parkCoverage.fill(0);
    city.healthCoverage.fill(0);

    const { grid } = city;
    for (let i = 0; i < grid.size; i++) {
      const id = city.buildingId[i];
      if (id === 0) continue;
      const def = buildingDef(id);
      if (def.serviceType === "none") continue;
      this.stamp(
        city,
        def.serviceType,
        grid.x(i),
        grid.y(i),
        def.serviceRange,
        def.serviceStrength,
      );
    }

    city.clearDirty(Dirty.Coverage);
    this.events.emit("coverage:changed", undefined);
  }

  /** Paint a distance-decayed disc of coverage into the matching layer. */
  private stamp(
    city: CityData,
    type: ServiceType,
    cx: number,
    cy: number,
    range: number,
    strength: number,
  ): void {
    const { grid } = city;
    const layer = this.layerFor(city, type);
    if (!layer) return;

    for (let dy = -range; dy <= range; dy++) {
      for (let dx = -range; dx <= range; dx++) {
        const x = cx + dx;
        const y = cy + dy;
        if (!grid.inBounds(x, y)) continue;
        const dist = Math.hypot(dx, dy);
        if (dist > range) continue;
        const amount = strength * (1 - dist / range);
        const j = grid.index(x, y);
        layer[j] = Math.min(255, Math.max(layer[j], amount));
      }
    }
  }

  private layerFor(city: CityData, type: ServiceType): Uint8Array | null {
    switch (type) {
      case "police":
        return city.policeCoverage;
      case "fire":
        return city.fireCoverage;
      case "park":
        return city.parkCoverage;
      case "health":
        return city.healthCoverage;
      default:
        return null;
    }
  }
}
