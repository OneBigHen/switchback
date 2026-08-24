# P15 — Route utility v2

**Phase:** P15 — contiguous quality, detour, overlap, uncertainty, and
personalization
**Current SHA:** `5632af2ea7109ae860d608069b8c4364d6f80273` HEAD plus the
uncommitted P15 worktree changes.
**Release gate:** G3

## Before behavior

- `route-score.ts` computed a single aggregate score, but had no explicit
  contiguous-run, corridor-coherence, fragmentation, overlap, or uncertainty
  breakdown.
- Detour cost was linear inside the allowed band, so a small preferred-band
  detour was treated the same way as a late-band detour.
- Planner selection still used a profile-specific switch when an injected or
  cached route had no provider score.

## After behavior

- The existing provider-neutral scorer now owns `RouteUtilityBreakdown` with
  weighted segment utility, connected high-quality runs, diminishing
  contiguous bonuses, coherence, fragmentation, uncertainty, backtracking,
  self-overlap, detour, and rider-preference diagnostics.
- Connected runs use a bounded 100 m endpoint-proximity proxy until canonical
  segment linkage is available. Only multi-segment runs over 1 km earn the
  sustained-run bonus; disconnected runs lose coherence utility.
- Detour cost is piecewise: the first 8% is cheap, then the penalty ramps
  quadratically until the existing hard maximum-detour gate.
- Unknown surface, access, seasonal access, and feature coverage remain
  eligible when not explicitly prohibited, but add an explicit uncertainty
  penalty and explanation. Personalization remains subordinate to eligibility.
- Provider route selection consumes `routeScore.total`; a compact fallback is
  retained only for injected/legacy unscored routes so compatibility fixtures
  do not create a second production ranker.

## Files changed

- `src/lib/recommendation/route-score.ts` — utility breakdown, connected-run
  quality, piecewise detour, uncertainty, overlap, and explanations.
- `src/lib/recommendation/route-candidate.ts` — exposes the full scored-route
  result type.
- `src/lib/routing/types.ts` — carries utility diagnostics on provider scores.
- `src/lib/routing/planner.ts` — uses provider utility totals for selection and
  keeps only the unscored-provider compatibility fallback.
- `tests/unit/route-utility-v2.test.ts` — contiguous quality, detour,
  unknown-data, and overlap behavior.
- `docs/recovery/WORKLOG.md`.

## Files deleted

None. The old profile switch was removed from the production scored path; no
route geometry or persisted user data was deleted.

## Migrations

None. P15 changes in-memory score diagnostics and candidate selection only.

## Tests

- Local focused suites: 3 files / 28 tests passed.
- the validation host full `npm run verify`: 179 test files / 1,207 passed / 1 skipped;
  lint, typecheck, and production build passed.
- the validation host broad browser matrix: 24/24.
- the validation host critical Chromium/WebKit: 30/30.
- the validation host PWA: 2/2.
- the validation host real-router fixture: 5/5, including private,
  motorcycle-closed, and disconnected refusals.
- the validation host memory soak: 1/1 test; 10/10 planner cycles.
- Scoped local/remote SHA parity matched for all 5 P15 source/test files.
- Router cleanup: PID file absent and port 8998 closed.
- `git diff --check` passed.

## Commands

- `npx vitest run tests/unit/route-utility-v2.test.ts tests/unit/route-score-domain.test.ts tests/unit/planner.test.ts`
- the validation host `npm run verify`
- the validation host `npm run test:e2e`
- the validation host `npm run test:e2e:critical`
- the validation host `npm run test:e2e:pwa`
- the validation host `GRAPHHOPPER_URL=http://127.0.0.1:8998 npm run test:e2e:real-router`
- the validation host `npm run test:e2e:memory-soak`
- `git diff --check`

## Memory/performance evidence

P15 adds no worker, listener, timer, persistent cache, or geometry store.
Overlap uses the existing sampled geometry helper; connected-run evaluation is
linear in the supplied feature list. The validation host browser memory soak remained
green at 10/10 cycles.

## Routing quality evidence

The real GraphHopper fixture remained green at 5/5, including honest refusals
for private, motorcycle-closed, and disconnected fixture paths. The new
utility behavior is exercised by focused tests and browser route journeys, but
the numeric bonus weights are engineering heuristics, not calibrated riding
outcomes.

## Known limitations

- Provider-normalized routes still expose an aggregate feature seam; true
  per-canonical-segment utility, RIG corridor linkage, and OSM/MVUM authority
  remain later graph/tile integration work.
- Endpoint proximity is a topology proxy and can join nearby parallel roads;
  canonical directed linkage should replace it when attached to the route.
- The 8% preferred detour band and utility weights are explicit tunables, not
  field-calibrated probabilities.
- Automated tests do not prove authenticated-browser behavior,
  physical-device behavior, production concurrency, owner-corpus map matching,
  or field/model quality.

## Deferred

- P16 — candidate generation, provider diversity, and route explanation
  contracts.
- P17 — canonical directed-segment overlap and diversity enforcement.
- Per-canonical-segment OSM/MVUM authority and offline eligibility packaging —
  P27/P29/P30.

## Rollback

Remove the P15 utility breakdown and focused test, restore the prior detour and
planner score paths, and remove the P15 worklog/report sections. No data
migration or user-data deletion is required.

## Next dependency

P16 — candidate generation, provider diversity, and route explanation.
