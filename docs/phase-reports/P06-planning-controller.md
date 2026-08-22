# P06 — Planning controller

**Phase:** P06 — Planning controller  
**Current SHA:** `5632af2ea7109ae860d608069b8c4364d6f80273` HEAD plus the
uncommitted P02–P06 worktree changes.

## Before behavior

- `PlannerShell` created the latest-request gate and replaced its `invalidate`
  method with direct provider abort and planner-store cancellation.
- `PlannerShell` wrapped `runLatestTripPlan` to supply the planner store and
  warning callback, and directly imported the low-level router cancellation
  function for the visible Cancel command.
- `trip-planning-coordinator.ts` already owned primary routing, progressive
  alternatives, request generations, and stale-response protection. The
  React component still assembled the lifecycle boundary around it.

## After behavior

- Added `PlanningSessionController` as the single planning lifecycle boundary.
  It owns the request gate, invalidation, provider abort, planner cancellation,
  and delegation to the existing coordinator.
- `PlannerShell` creates one stable controller and keeps only UI-level request
  construction, previous-route recovery, notices, and existing hook wiring.
- Cancellation invalidates the generation before aborting provider work, so an
  aborted request cannot publish a failure after the planner has entered the
  cancelled state.
- No route geometry, provider selection, planner store, persisted data, route
  cache, worker, or visible navigation contract changed.

## Files changed

- `src/lib/client/planning-session-controller.ts` — new controller boundary.
- `src/lib/client/trip-planning-coordinator.ts` — exported its existing
  planner lifecycle type for the controller.
- `src/components/planner/PlannerShell.tsx` — uses the controller instead of
  assembling request cancellation and coordination directly.
- `tests/unit/planning-session-controller.test.ts` — delegation and
  stale-before-abort regressions.
- `docs/recovery/WORKLOG.md`.

## Files deleted

None.

## Migrations

None. No IndexedDB schema, persisted planner key, route data, runtime
database, provider configuration, or production service changed.

## Tests

The complete gate ran in the isolated the validation host `dedicated test LXC` LXC 109
(`<private-test-host>`) checkout at `/tmp/switchback-validation-test.LDEtb5`, using
Node 24.15.0. The checkout excluded Git metadata, `.env*`, dependencies,
production routing data, runtime databases, and generated source artifacts.
The real-router run used the isolated GraphHopper fixture on port 8998; the
fixture was stopped after the run.

## Commands

- `npx vitest run tests/unit/planning-session-controller.test.ts tests/unit/trip-planning-coordinator.test.ts tests/unit/latest-request.test.ts --reporter=dot`
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
| focused controller/coordinator/local request tests | 3 files / 16 tests passed |
| local lint and typecheck | passed |
| the validation host `npm run verify` | lint and typecheck passed; 170 files / 1,165 tests passed, 1 skipped; production build passed |
| `npm run test:e2e` | 24/24 passed across desktop Chromium, mobile Safari, and both landscape projects |
| `npm run test:e2e:critical` | 30/30 passed across Chromium and WebKit |
| `npm run test:e2e:pwa` | 2/2 passed |
| `GRAPHHOPPER_URL=http://127.0.0.1:8998 npm run test:e2e:real-router` | 5/5 passed, including honest fixture refusals |
| `npm run test:e2e:memory-soak` | 10/10 cycles passed |
| fixture cleanup | PID file clear; port 8998 clear |
| `git diff --check` | passed |

## Memory/performance evidence

The ten-cycle browser soak measured 35.1 MB used JS heap, 50.4 MB total heap,
and one map instance on every cycle. This is bounded automated lifecycle
evidence, not a two-hour ride plateau, physical-device result, or production
concurrency benchmark.

## Routing quality evidence

No routing algorithm, provider selection, route geometry, or legality behavior
changed. The isolated real GraphHopper suite passed 5/5, including the private,
motorcycle-closed, and disconnected refusal fixtures.

## Known limitations

- `PlannerShell` remains a broad composition component. P06 moves the planning
  lifecycle boundary; UI request construction and adjacent Free Ride, offline,
  recording, and library ownership remain for later controller phases.
- The known non-failing mobile MapLibre fit warning remains in broad E2E.
- Automated checks do not prove physical-device, authenticated-browser, or
  production-load behavior.

## Deferred

- P07/P08 — canonical route geometry ownership and worker/resource lifecycle.
- Later shell/controller phases — narrow view models and final visible UX.

## Rollback

Remove the controller import/use, restore the prior local gate wrapper and
direct coordinator calls in `PlannerShell`, and remove the focused controller
test. Preserve all overlapping P02–P05 changes; do not use a broad reset.

## Next dependency

P07 — canonical geometry ownership.
