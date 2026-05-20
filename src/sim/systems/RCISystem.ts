import type { CityData } from "../CityData";

/**
 * Residential / commercial / industrial demand model. Demand drives which
 * zones develop:
 *  - residents move in when jobs are available,
 *  - shops open to serve residents,
 *  - industry grows from a base seed plus resident-driven goods demand.
 * Pure arithmetic over the aggregates `PopulationSystem` produced.
 */
export class RCISystem {
  update(city: CityData): void {
    const pop = city.population;
    const jobsC = city.jobsCommercial;
    const jobsI = city.jobsIndustrial;
    const jobs = jobsC + jobsI;

    city.demandR = clamp((jobs * 1.15 - pop) / 2 + 5);
    city.demandC = clamp((pop * 0.45 - jobsC) / 2 + 5);
    city.demandI = clamp((pop * 0.55 - jobsI) / 2 + 15);
  }
}

function clamp(value: number): number {
  return Math.max(-100, Math.min(100, Math.round(value)));
}
