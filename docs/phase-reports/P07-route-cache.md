# P07 — Canonical route cache

**Phase:** P07 — Canonical route cache  
**Current SHA:** `5632af2ea7109ae860d608069b8c4364d6f80273` HEAD plus the
uncommitted P02–P07 worktree changes.

## Before behavior

- `PlannerState.plan.routes` stored complete `PlannedRoute` objects, including
  potentially large geometry arrays, in Zustand.
- `PlannerShell` kept previous-route and ride-original route objects in React
  state and derived map, comparison, ranking, and ride consumers from the full
  planner payload.
- The existing server `RouteCache` was request-result caching and was not a
  browser owner for active route entities.

## After behavior

- Added one bounded client `RouteEntityCache` with a maximum of 32 active route
  entities, 50,000 geometry points per entity, and four retained recovery/ride
  references.
- The planner store now keeps `RoutePlanSummary` values whose route entries do
  not contain geometry; `applyPlan` and progressive alternatives register full
  entities in the cache first.
- `PlannerShell` stores previous and ride-original route IDs, resolves full
  routes only at the consumer boundary, and releases/clears retained entities
  during route cleanup.
- The cache validates route IDs, duplicate IDs, finite coordinate pairs, and
  geometry shape before accepting a route. Explicit route clearing removes
  retained entities as well as the active plan.
- Saved routes, GPX, share, offline-pack, and navigation paths still receive
  resolved `PlannedRoute` values; no persisted user route data was rewritten.

## Files changed

- `src/lib/client/route-entity-cache.ts` — new bounded canonical entity cache,
  summaries, retention, validation, and cleanup.
- `src/stores/planner-store.ts` — stores route summaries and registers route
  entities at plan/alternative boundaries.
- `src/components/planner/PlannerShell.tsx` — resolves route IDs through the
  cache and retains only recovery/ride references.
- `src/components/planner/PlannerDeckViewModel.ts` — accepts summary plans.
- `tests/unit/route-entity-cache.test.ts` — summary, retention, validation,
  capacity, and explicit-clear tests.
- `tests/components/planner-shell-geocoding.test.tsx` — routes the imported
  track fixture through the canonical store boundary.
- `docs/recovery/WORKLOG.md`.

## Files deleted

None.

## Migrations

None. The active plan is not included in the persisted Zustand projection, so
no IndexedDB/localStorage schema or user-data migration was required.

## Tests

The complete final gate ran in the isolated validation host `<lxc-vmid>`
(`<private-test-host>`) checkout at `<validation-checkout>`, using
Node 24.15.0. The checkout excluded Git metadata, `.env*`, dependencies,
production routing data, runtime databases, and generated source artifacts.
The real-router run used the isolated GraphHopper fixture on port 8998; the
fixture was stopped after the run.

## Commands

- `npx vitest run tests/unit/route-entity-cache.test.ts tests/unit/planner-store.test.ts tests/unit/planner-store-locks.test.ts tests/components/planner-shell-geocoding.test.tsx --reporter=dot`
- `npm run lint`
- `npm run typecheck`
- `npm run verify`
- `npm run test:e2e`
- `npm run test:e2e:critical`
- `npm run test:e2e:pwa`
- `GRAPHHOPPER_URL=http://127.0.0.1:8998 npm run test:e2e:real-router`
- `npm run test:e2e:memory-soak`
- `git diff --check`

## Results

| Command/evidence | Result |
|---|---|
| focused cache/store/planner-shell tests | 4 files / 49 tests passed |
| local lint and typecheck | passed |
| the validation host `npm run verify` | lint and typecheck passed; 171 files / 1,171 tests passed, 1 skipped; production build passed |
| `npm run test:e2e` | 24/24 passed across desktop Chromium, mobile Safari, and both landscape projects |
| `npm run test:e2e:critical` | 30/30 passed across Chromium and WebKit |
| `npm run test:e2e:pwa` | 2/2 passed |
| `GRAPHHOPPER_URL=http://127.0.0.1:8998 npm run test:e2e:real-router` | 5/5 passed, including honest fixture refusals |
| `npm run test:e2e:memory-soak` | 10/10 cycles passed |
| fixture cleanup | PID file clear; port 8998 clear |
| `git diff --check` | passed locally before the final LXC sync |

## Memory/performance evidence

The final ten-cycle browser soak measured 33.1 MB used JS heap, 50.4 MB total
heap, and one map instance on every cycle. The captured result is
`artifacts/quality/memory-soak.json`. This is bounded automated lifecycle
evidence, not a two-hour ride plateau, physical-device result, or production
concurrency benchmark.

## Routing quality evidence

No routing algorithm, provider selection, route geometry, or legality behavior
changed. The isolated real GraphHopper suite passed 5/5, including private,
motorcycle-closed, and disconnected refusal fixtures.

## Known limitations

- The cache is an in-memory active-online owner; saved/GPX/offline/navigation
  payload ownership remains intentionally unchanged for their existing flows.
- Map and comparison consumers still receive resolved full entities transiently;
  they are not retained in Zustand, persisted storage, or a second global
  route store. Further consumer-local resolution can be tightened in a later
  phase if profiling shows prop materialization matters.
- Route summaries retain non-geometry metadata needed by the existing planner
  deck contract; geometry is the canonical large payload moved out of UI state.
- `PlannerShell` remains a broad composition component. Narrower worker and
  controller boundaries belong to later phases.
- The known non-failing mobile MapLibre fit warning remains in broad E2E.
- Automated checks do not prove physical-device, authenticated-browser, or
  production-load behavior.

## Deferred

- P08 — worker/resource lifecycle and the next large-payload ownership seam.
- Later shell/controller phases — narrow view models and final visible UX.

## Rollback

Remove the route-cache import/use, restore full `TripPlan` route arrays in the
planner store and shell state, remove the cache tests, and preserve the
existing P02–P06 changes. Do not use a broad reset.

## Next dependency

P08 — worker/resource lifecycle.
