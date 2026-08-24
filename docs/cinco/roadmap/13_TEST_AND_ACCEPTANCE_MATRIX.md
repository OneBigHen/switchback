# Test and Acceptance Matrix

## Existing gates
Every phase:
- lint
- typecheck
- targeted Vitest
- build

Before merge for material UX phases:
- critical browser suite
- relevant PWA suite
- relevant real-router checks

Never weaken a gate because UI selectors changed.

## Phase matrix

| Requirement group | Unit | Component | E2E | Visual | Physical |
|---|---:|---:|---:|---:|---:|
| ContextSheet | Yes | Yes | Yes | Yes | Optional |
| Map insets | Yes | Yes | Yes | Yes | Optional |
| Mapbox fallback | Yes | Yes | Yes | Yes | Recommended |
| Route labels/reasons | Yes | Yes | Yes | Yes | No |
| Flowy | Yes | No | Yes | Yes | Recommended |
| Ride HUD | Yes | Yes | Yes | Yes | Strongly recommended |
| Add stop | Yes | Yes | Yes | Yes | Strongly recommended |
| Road conditions | Yes | Yes | Yes | Yes | No |
| Free Ride workload | Yes | No | Yes | No | Strongly recommended |
| Free Ride prompt | Yes | Yes | Yes | Yes | Strongly recommended |
| Offline renderer | Yes | Yes | Yes | Optional | Required before claiming offline UX |

## Required viewport visual evidence
- 390x844
- 844x390
- 768x1024
- 1024x768
- 1440x900

## Visual approval questions

For each screen:
1. Is the selected route the strongest visual object after the maneuver (if riding)?
2. Is enough map visible?
3. Is the primary action obvious?
4. Can detail expand without losing spatial context?
5. Are metrics understandable without decoding a score?
6. Does tablet use width productively?
7. Does satellite remain legible?
8. Does night/dusk remain legible?
9. Are warnings distinguishable but not overwhelming?
10. Are touch targets appropriate?

## Performance tests
At least:
- map initialization timing sampled,
- route source update does not recreate map,
- navigation updates do not cause full planner rerenders,
- memory soak after major map changes,
- no unbounded listener accumulation.

## Provider failure cases
- GraphHopper unavailable,
- live conditions unavailable,
- Mapbox token unavailable,
- Mapbox style load error,
- geolocation denied,
- GPS low confidence,
- offline/no-network.

The UI must distinguish route failure from map-renderer failure.

## Free Ride acceptance
A Free Ride failure to find a safe candidate is a normal state, not a red error.

## Snapshot discipline
A snapshot update PR must explain what visual change is intentional.
Never run an update command and commit all diffs without inspection.
