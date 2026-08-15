# P18 — PA/NJ golden tuning

**Phase:** P18 — owner-defined PA/NJ relational corpus and versioned policy
freeze  
**Current SHA:** `5632af2ea7109ae860d608069b8c4364d6f80273` HEAD plus the
uncommitted P18 worktree changes  
**Release gate:** G3

## Before behavior

- Profile weights lived in `route-score.ts`.
- Preferred detour, MMR lambda, duplicate threshold, and planner alternative
  cap were separate literals.
- `tests/fixtures/routing/golden.ts` had one intent prompt and evaluator
  metadata, but no versioned relational corpus.
- There was no policy-version field on route scores or trust-boundary check for
  a malformed scoring policy.

## After behavior

- Added `src/lib/recommendation/route-policy.ts` with frozen
  `pa-nj-route-policy-v1` values and runtime validation.
- Updated route scoring to use the policy for profile weights, detour pricing,
  contiguous utility, ETA penalty, and score telemetry. Invalid policies are
  rejected before scoring.
- Updated diversity and planner selection to consume the policy's lambda,
  duplicate threshold, and alternative cap.
- Added optional `RouteScore.policyVersion` without changing saved route data.
- Added `PA_NJ_GOLDEN_CORPUS` with 11 owner-defined relational cases covering
  Hatboro/Delaware Valley, loops, Jim Thorpe, gravel, paved twisties,
  access/seasonal rules, ambiguous surface evidence, and PA/NJ crossing.
- Added focused policy tests for ranking relationships, eligibility ordering,
  malformed input, and corpus stability. The fixtures contain no copied route
  geometry or invented provider facts.

## Files changed

- `src/lib/recommendation/route-policy.ts` — versioned policy and validator.
- `src/lib/recommendation/route-score.ts` — policy-driven scoring and version.
- `src/lib/recommendation/route-diversity.ts` — policy-driven MMR defaults.
- `src/lib/routing/planner.ts` — policy-driven planner bounds.
- `src/lib/domain/contracts.ts` — optional score policy version.
- `tests/fixtures/routing/golden.ts` — versioned 11-case intent corpus.
- `tests/unit/route-policy.test.ts` — policy and ranking regressions.
- `tests/unit/routing-fixtures.test.ts` — locked corpus metadata assertion.
- `docs/recovery/WORKLOG.md`.

## Files deleted

None.

## Migrations

None. `policyVersion` is optional and no saved route or user data changes.

## Tests

- Local focused P18 suites: 6 files / 52 tests passed.
- Megaplex `npm run verify`: 183 test files / 1,223 passed / 1 skipped;
  lint, typecheck, and production build passed.
- Megaplex broad browser: 24/24.
- Megaplex critical Chromium/WebKit: 30/30.
- Megaplex PWA: 2/2.
- Megaplex real-router fixture: 5/5.
- Megaplex memory soak: 1/1 test with 10/10 planner cycles.
- Router cleanup: PID file absent and port 8998 closed.
- `git diff --check` and scoped local/remote SHA parity passed.

## Commands

- `npm exec -- vitest run tests/unit/route-policy.test.ts tests/unit/route-score-domain.test.ts tests/unit/route-utility-v2.test.ts tests/unit/routing-fixtures.test.ts tests/unit/route-diversity.test.ts tests/unit/planner.test.ts --reporter=verbose`
- Megaplex `npm run verify`
- Megaplex `npm run test:e2e`
- Megaplex `npm run test:e2e:critical`
- Megaplex `npm run test:e2e:pwa`
- Megaplex `GRAPHHOPPER_URL=http://127.0.0.1:8998 npm run test:e2e:real-router`
- Megaplex `npm run test:e2e:memory-soak`
- `git diff --check`

## Memory/performance evidence

P18 adds no listener, timer, worker, persistent cache, or unbounded route
store. Policy lookup and validation are bounded over fixed profile keys. The
Megaplex memory soak stayed green for ten planner cycles.

## Routing quality evidence

The isolated real GraphHopper fixture remained green at 5/5, including the
existing refusal cases. Policy tests prove measured synthetic feature
relationships such as twisty-over-highway and mapped-gravel-over-paved under
the matching profiles. No live PA/NJ provider corpus output or field
calibration is claimed here.

## Known limitations

- The golden corpus is owner-defined relational intent, not a map-matched
  collection of live route geometries.
- Current provider normalization may not attach canonical segment refs, so live
  comparison still uses the explicit geometry proxy where needed.
- Policy values are versioned engineering defaults, not calibrated probabilities;
  future tuning requires a new policy version and corpus run.
- Automated gates do not prove authenticated-browser, physical-device,
  production-concurrency, or model-quality behavior.

## Deferred

- P19 — design-system and map-first responsive primitives.
- Live PA/NJ map matching and offline graph-backed corpus execution — later
  graph/RIG phases.

## Rollback

Remove the policy module and focused tests, restore the prior scorer/planner
literals, and remove the optional score field. No data deletion is required.

## Next dependency

P19 — design-system and map-first responsive primitives.
