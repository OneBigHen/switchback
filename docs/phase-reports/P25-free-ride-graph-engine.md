# P25 — Free Ride graph engine

**Phase:** P25 — ahead/reachable RIG candidates with real detour/rejoin
**Current SHA:** `5632af2ea7109ae860d608069b8c4364d6f80273` HEAD plus the
uncommitted P25 worktree changes
**Release gate:** G5

## Before behavior

- The Free Ride API returned a deliberate `503 FREE_RIDE_UNAVAILABLE`.
- The client could render fixture suggestions, but no runtime path turned a
  verified road-intelligence graph into an ahead, legal, routable suggestion.
- The old curvature-only path was not allowed to manufacture road class,
  surface, access, confidence, or route geometry.

## After behavior

- Added a bounded, trusted `FreeRideGraphDocument` containing canonical segment
  geometry and RIG corridor provenance. The loader rejects malformed,
  disconnected, over-large, stale-reference, or topology-mismatched data.
- Current position is map-matched with a bounded distance and heading check;
  directed graph reachability, decision distance, recent-segment suppression,
  and forward rejoin checks reject behind, unreachable, or irrelevant roads.
- Each accepted opportunity is routed twice through the provider: baseline to
  the rejoin and detour through the RIG corridor anchors. Candidates are kept
  only when measured fragment traversal is at least 80% and added time is
  calculated from those two routes.
- Suggestions carry source build, graph version, corridor ID, segment UIDs,
  measured length, expected utility, and confidence. Accepted routes preserve
  corridor anchors and do not copy unsupported road/surface distributions.
- The API has bounded input, honest graph/router-unavailable responses,
  abort-aware provider calls, cooldown/workload suppression, and no fallback to
  curvature rows or straight-line geometry. `FREE_RIDE_RIG_PATH` is optional;
  without a verified artifact the feature remains unavailable.

## Files changed

- `src/lib/recommendation/free-ride-graph.ts` — trusted graph index,
  directed reachability, matching, and opportunity generation.
- `src/lib/recommendation/free-ride.ts` — provider-backed candidate build,
  measured detour, provenance, traversal, and accepted-route conversion.
- `src/app/api/free-ride/suggestions/handler.ts` — bounded request and typed
  suppression/provider/graph failures.
- `src/app/api/free-ride/suggestions/route.ts` — bounded graph loading and
  GraphHopper baseline/detour adapter.
- `src/lib/domain/contracts.ts` — optional corridor anchors and provenance.
- `src/components/planner/PlannerShell.tsx` — preserves accepted anchors and
  uses the 80% traversal threshold.
- `.env.example`, `README.md`, and `src/lib/server/api-contract.ts` — runtime
  configuration and typed failure documentation.
- `tests/unit/free-ride-graph.test.ts`, `tests/unit/free-ride-api.test.ts`,
  `tests/unit/free-ride-recommendation.test.ts`, and
  `tests/components/free-ride-hud.test.tsx` — graph, API, conversion, and UI
  regressions.

## Files deleted

None.

## Migrations

None. The graph is an external build artifact and is read-only at runtime;
saved route data remains compatible.

## Tests

- the validation host focused P25 audit: 4 files / 23 tests passed; lint and typecheck
  passed.
- the validation host `npm run verify`: 185 test files / 1,230 passed / 1 skipped; lint,
  typecheck, and production build passed.
- Free Ride browser matrix: 4/4 passed across desktop Chromium, mobile Safari,
  and both landscape projects.
- Broad browser matrix: 24/24 passed.
- Critical Chromium/WebKit matrix: 30/30 passed.
- PWA/offline matrix: 2/2 passed.
- Real GraphHopper fixture: 5/5 passed with clean router shutdown.
- Memory soak: 1/1 test, 10/10 planner cycles.
- `git diff --check` passed.

## Commands

```text
npm exec -- vitest run tests/unit/free-ride-graph.test.ts \
  tests/unit/free-ride-recommendation.test.ts \
  tests/unit/free-ride-api.test.ts \
  tests/components/free-ride-hud.test.tsx --reporter=verbose
```

The remaining acceptance commands ran in `<validation-checkout>`
inside a dedicated test LXC with Node 24.

## Memory/performance evidence

The graph loader, request body, candidate list, corridor references, and
recent-ID inputs are bounded. No raw GPS trail is persisted. The 10-cycle
browser memory soak passed. The implementation does not claim a long-duration
physical-device endurance result.

## Routing quality evidence

The focused injected graph/provider test proves directed matching, provenance,
baseline-versus-detour measurement, and 80% corridor traversal. The real-router
fixture proves the existing GraphHopper adapter and refusal behavior. This does
not prove a production RIG artifact is installed, that an owner corpus has been
matched against current map data, or that field GPS/provider quality is good.

## Known limitations

- No production `FREE_RIDE_RIG_PATH` artifact was added to the repository or
  test tree; deployment must supply a verified graph document.
- The current browser fixtures still mock the suggestion endpoint, so they
  prove acceptance into Ride and responsive behavior, not live RIG quality.
- The known MapLibre narrow-viewport canvas-fit warning appeared during browser
  runs and did not fail or alter any test outcome.
- Automated tests do not prove an authenticated browser, physical iPhone GPS,
  outdoor audio/wake behavior, or real-world route/model quality.

## Deferred

- P26 — Free Ride interruption, quiet-period, preference-signal, and Head Home
  behavior.
- Physical-device drill and production-concurrency evidence remain release
  gates outside this local/the validation host acceptance loop.

## Rollback

Remove the graph engine/API wiring and focused tests, restore the explicit
unavailable handler, and remove the optional `FREE_RIDE_RIG_PATH` documentation.
No route or user-data rollback is required.

## Next dependency

P26 — Free Ride interruption/learning and Head Home.
