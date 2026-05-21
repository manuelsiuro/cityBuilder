import { describe, it, expect } from "vitest";
import { CityData } from "../src/sim/CityData";
import { DispatchSystem } from "../src/sim/systems/DispatchSystem";
import type { Incident } from "../src/sim/systems/IncidentSystem";
import { BUILDING } from "../src/sim/buildings";

/** A 16×16 city with one straight road along row `y`. */
function roadedCity(y = 8): CityData {
  const city = new CityData(16, 16);
  for (let x = 0; x < city.grid.width; x++) {
    city.road[city.grid.index(x, y)] = 1;
  }
  return city;
}

describe("DispatchSystem", () => {
  it("routes a fire truck from its station to a fire and puts it out", () => {
    const city = roadedCity(8);
    city.buildingId[city.grid.index(3, 7)] = BUILDING.FireStation;
    const fireTile = city.grid.index(11, 7);
    city.fire[fireTile] = 200;

    const sys = new DispatchSystem();
    let sawFireTruck = false;
    for (let t = 0; t < 400 && city.fire[fireTile] > 0; t++) {
      sys.update(city, []);
      if (sys.vehicles.some((v) => v.kind === "fire")) sawFireTruck = true;
    }

    expect(sawFireTruck).toBe(true);
    expect(city.fire[fireTile]).toBe(0);
  });

  it("sends a police car that resolves a crime incident", () => {
    const city = roadedCity(8);
    city.buildingId[city.grid.index(2, 7)] = BUILDING.PoliceStation;
    const incident: Incident = {
      kind: "crime",
      tile: city.grid.index(12, 9),
      severity: 120,
      state: "open",
      age: 0,
    };

    const sys = new DispatchSystem();
    let assigned = false;
    for (let t = 0; t < 500 && incident.state !== "resolved"; t++) {
      sys.update(city, [incident]);
      if (incident.state === "assigned") assigned = true;
    }

    expect(assigned).toBe(true);
    expect(incident.state).toBe("resolved");
  });

  it("dispatches an ambulance from a hospital to a medical emergency", () => {
    const city = roadedCity(8);
    city.buildingId[city.grid.index(2, 7)] = BUILDING.Hospital;
    const incident: Incident = {
      kind: "medical",
      tile: city.grid.index(13, 9),
      severity: 130,
      state: "open",
      age: 0,
    };

    const sys = new DispatchSystem();
    let sawAmbulance = false;
    for (let t = 0; t < 500 && incident.state !== "resolved"; t++) {
      sys.update(city, [incident]);
      if (sys.vehicles.some((v) => v.kind === "medical")) sawAmbulance = true;
    }

    expect(sawAmbulance).toBe(true);
    expect(incident.state).toBe("resolved");
  });

  it("dispatches nothing to an incident with no road access", () => {
    const city = new CityData(16, 16); // no roads at all
    city.buildingId[city.grid.index(2, 2)] = BUILDING.PoliceStation;
    const incident: Incident = {
      kind: "crime",
      tile: city.grid.index(12, 12),
      severity: 120,
      state: "open",
      age: 0,
    };

    const sys = new DispatchSystem();
    for (let t = 0; t < 50; t++) sys.update(city, [incident]);

    expect(sys.vehicles.length).toBe(0);
    expect(incident.state).toBe("open");
  });

  it("returns vehicles to the pool once a response is complete", () => {
    const city = roadedCity(8);
    city.buildingId[city.grid.index(3, 7)] = BUILDING.FireStation;
    const fireTile = city.grid.index(9, 7);
    city.fire[fireTile] = 120;

    const sys = new DispatchSystem();
    for (let t = 0; t < 800; t++) sys.update(city, []);

    // Fire is out and the truck has driven home — the pool is idle again.
    expect(city.fire[fireTile]).toBe(0);
    expect(sys.vehicles.length).toBe(0);
  });
});
