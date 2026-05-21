import { describe, it, expect } from "vitest";
import { CityData } from "../src/sim/CityData";
import { EventBus } from "../src/engine/EventBus";
import {
  IntersectionSystem,
  lightState,
  LIGHT_CYCLE,
  type Intersection,
} from "../src/sim/systems/IntersectionSystem";
import type { GameEventMap } from "../src/sim/events";

/** A city with one 4-way crossroads and one 3-way T-junction. */
function junctionCity(): CityData {
  const city = new CityData(20, 20);
  const idx = (x: number, y: number) => city.grid.index(x, y);
  // 4-way at (8,10): full cross.
  for (let x = 4; x <= 12; x++) city.road[idx(x, 10)] = 1;
  for (let y = 6; y <= 14; y++) city.road[idx(8, y)] = 1;
  // T-junction at (8,4): a horizontal road meets the top of the vertical arm.
  for (let x = 4; x <= 12; x++) city.road[idx(x, 4)] = 1;
  for (let y = 4; y <= 6; y++) city.road[idx(8, y)] = 1;
  return city;
}

describe("IntersectionSystem", () => {
  it("classifies 4-way crossroads as lights and 3-way junctions as yields", () => {
    const city = junctionCity();
    const system = new IntersectionSystem(new EventBus<GameEventMap>());
    system.update(city);

    const cross = system.at(city.grid.index(8, 10));
    const tee = system.at(city.grid.index(8, 4));
    expect(cross?.kind).toBe("light");
    expect(tee?.kind).toBe("yield");
    // A plain straight road tile is not a junction.
    expect(system.at(city.grid.index(5, 10))).toBeUndefined();
  });

  it("alternates the two signal axes with a yellow buffer", () => {
    const inter: Intersection = { tile: 0, kind: "light", offset: 0 };
    expect(lightState(inter, 0, 0)).toBe("green");
    expect(lightState(inter, 0, 1)).toBe("red");
    expect(lightState(inter, 69, 0)).toBe("green");
    expect(lightState(inter, 70, 0)).toBe("yellow");
    expect(lightState(inter, 80, 0)).toBe("red");
    expect(lightState(inter, 80, 1)).toBe("green");
    expect(lightState(inter, 150, 1)).toBe("yellow");
    expect(lightState(inter, LIGHT_CYCLE, 0)).toBe("green");
  });

  it("gives each junction a deterministic phase offset", () => {
    const city = junctionCity();
    const a = new IntersectionSystem(new EventBus<GameEventMap>());
    const b = new IntersectionSystem(new EventBus<GameEventMap>());
    a.update(city);
    b.update(city);
    expect(a.list.map((i) => i.offset)).toEqual(b.list.map((i) => i.offset));
  });
});
