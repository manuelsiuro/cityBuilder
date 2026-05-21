# Service Vehicles

How to add dispatched vehicles — fire trucks, ambulances, police cars — that
drive from a station to an incident. This builds directly on the existing
traffic system; read `src/sim/systems/TrafficSystem.ts` and
`src/render/CarRenderer.ts` first.

## What already exists

`TrafficSystem` drives a pool of `Car` agents along the road network: A*
pathfinding on the road graph, car-following, lane offsets, intersection
signals. `CarRenderer` draws them as instanced low-poly meshes. A service vehicle
is a special `Car` with a purpose — reuse this machinery, do not rebuild it.

## Two approaches — pick by ambition

### A. Cosmetic (recommended first)

A service vehicle is just a `Car` with a distinct colour/mesh and a fixed
origin/destination. When an incident fires, spawn a car from the nearest station
to the incident tile; despawn it on arrival. The incident's resolution does not
actually depend on the truck reaching it (the `IncidentSystem` resolves on its
own timer) — the truck is visual feedback.

- Add a `kind` field to the `Car` interface (`"civilian" | "fire" | ...`).
- `CarRenderer` picks a mesh/tint by `kind` — add a `fireTruckGeometry()` built
  with `MeshBuilder`, like the existing `sedan`/`van`/`truck` geometries. Export
  it and add it to the `extras` array in `src/render/SandboxGallery.ts` so the
  new vehicle appears in the `?sandbox` 3D-model preview (the sedan/van/truck are
  already listed there).
- Add a spawn entry point on `TrafficSystem` (e.g. `dispatch(fromTile, toTile,
  kind)`) that runs A* and activates a pooled car with that path and kind.
- `World` subscribes its own `IncidentSystem` events (or wires them) to call
  `trafficSystem.dispatch(...)`.

This is low-risk: it touches `TrafficSystem` + `CarRenderer` only, and the
incident logic stays independent.

### B. Simulation-coupled

The incident only resolves when the truck physically arrives. The truck holds a
target incident tile; on reaching it, it clears the incident's persistent state
(`fireState[i] = 0`) and then returns to its station or despawns.

This needs careful determinism: dispatch decisions (which station, which truck)
must be deterministic — iterate stations/trucks in fixed index order, break ties
by tile index, use `world.random` for any genuine randomness. It also couples the
traffic tick ordering to incident resolution — keep `IncidentSystem` running
before `TrafficSystem` in `World.tick()` so a truck dispatched this tick is
visible to traffic next tick.

Start with A. Move to B only if the design needs response time to matter.

## Dispatch logic

To find the nearest station, the simulation needs to know where stations are.
Either scan `buildingId` for `BUILDING.FireStation` on demand, or keep a cached
list rebuilt on `Dirty.Fire`/`Dirty.Utility` (cheaper, like
`IntersectionSystem`'s junction list). Pick the station with the shortest A*
path — or, cheaper, the smallest Manhattan distance — to the incident.

A* (`findRoadPath`) needs both endpoints on the road network. A fire station and
an incident tile may not be road tiles, so dispatch from the station's
road-adjacent tile to the incident's road-adjacent tile (scan `forEachNeighbor4`
for a road). If neither has road access, the vehicle cannot be dispatched —
handle that case (the city failed to provide road access).

## Layering & determinism

- The vehicle agents live in `sim/` (`TrafficSystem`). `CarRenderer` only reads
  them. Do not put dispatch logic in `render/`.
- All vehicle motion and dispatch must stay deterministic — fixed iteration
  order, shared `Random`. Service vehicles are not saved (cars are pooled and
  respawned on load, like civilian traffic) — so no schema change for the
  vehicles themselves.
- Keep the vehicle pool bounded (a `MAX_SERVICE_CARS` constant) so a storm of
  incidents cannot exhaust memory or stall A*.

## Tests

Headless: build a `CityData` with a road from a station tile to an incident
tile, call `dispatch(...)`, tick `TrafficSystem`, assert a car of the right
`kind` becomes active and its path ends at the incident. For approach B, assert
the incident's `fireState` clears when the car arrives.

## Checklist

- [ ] `Car` gains a `kind` discriminator
- [ ] `CarRenderer` — mesh/tint per kind; new `MeshBuilder` geometry
- [ ] `TrafficSystem` — a `dispatch()` entry point, bounded service-car pool
- [ ] dispatch picks the nearest station deterministically, via road-adjacent tiles
- [ ] (approach B only) arrival clears the incident's persistent state
- [ ] `World` wires incident events → dispatch
- [ ] headless test for dispatch + arrival
