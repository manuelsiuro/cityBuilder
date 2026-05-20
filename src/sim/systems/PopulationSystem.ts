import type { CityData } from "../CityData";
import { Zone } from "../layers";
import { residents, commercialJobs, industrialJobs } from "../development";

/**
 * Tallies the city's population and job counts from developed buildings. Runs
 * on the slow cadence; cheap enough to scan the whole grid.
 */
export class PopulationSystem {
  update(city: CityData): void {
    let population = 0;
    let jobsC = 0;
    let jobsI = 0;

    for (let i = 0; i < city.grid.size; i++) {
      const level = city.buildLevel[i];
      if (level === 0) continue;
      switch (city.zone[i]) {
        case Zone.Residential:
          population += residents(level);
          break;
        case Zone.Commercial:
          jobsC += commercialJobs(level);
          break;
        case Zone.Industrial:
          jobsI += industrialJobs(level);
          break;
      }
    }

    city.population = population;
    city.jobsCommercial = jobsC;
    city.jobsIndustrial = jobsI;
  }
}
