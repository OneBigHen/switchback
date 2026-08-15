# P17 — Diversity and factual route explanations

**Phase:** P17 — canonical directed-segment overlap, MMR diversity, and
measured route facts
**Current SHA:** `5632af2ea7109ae860d608069b8c4364d6f80273` HEAD plus the
uncommitted P17 worktree changes.
**Release gate:** G3

## Before behavior

- Candidate differentiation used a geometry-overlap helper directly in the
  planner and sorted by profile-specific utility or overlap.
- The planner had no reusable similarity contract for directed canonical
  segments, and no bounded MMR ranking seam.
- Route comparison exposed score telemetry but did not present a compact list
  of measured route facts.

## After behavior

- Added `route-diversity.ts` with directed canonical-segment overlap and
  weighted Jaccard when both routes carry valid canonical refs.
- Kept the existing geometry overlap calculation as an explicitly named
  `geometry-proxy` fallback when canonical refs are not available; unknown
  geometry does not claim segment truth.
- Replaced planner alternative selection with bounded MMR. It filters rejected
  routes, balances normalized utility against maximum similarity, honors the
  existing strict overlap gate, and uses deterministic tie-breaking.
- Added `route-explanations.ts` and a measured-facts block in route comparison.
  Facts are derived from route duration, mapped surface/road mixes, candidate
  source, sustained-run utility, and explicit uncertainty only.
- Added optional canonical refs to the route contract without changing saved
  route geometry ownership or requiring a migration.

## Files changed

- `src/lib/recommendation/route-diversity.ts` — canonical similarity and MMR.
- `src/lib/recommendation/route-explanations.ts` — factual explanation
  generation.
- `src/lib/routing/planner.ts` — MMR-based alternative selection.
- `src/lib/routing/types.ts` — optional canonical refs and candidate metadata
  used by the diversity/explanation seams.
- `src/components/planner/RouteComparison.tsx` — measured route facts UI.
- `tests/unit/route-diversity.test.ts` — directed overlap, MMR, strict gate,
  and geometry fallback tests.
- `tests/unit/route-explanations.test.ts` — measured facts and no-invention
  tests.
- `docs/recovery/WORKLOG.md`.

## Files deleted

None.

## Migrations

None. Canonical refs and candidate source metadata are optional; existing
saved routes remain readable.

## Tests

- Local focused P17 suites: 4 files / 33 tests passed.
- Megaplex LXC `192.168.1.175`, Node 24.15.0: `npm run verify` passed with
  182 test files / 1,217 tests passed and 1 skipped; lint, typecheck, and
  production build passed.
- Megaplex broad browser matrix: 24/24.
- Megaplex critical Chromium/WebKit: 30/30.
- Megaplex PWA: 2/2.
- Megaplex real-router fixture: 5/5, including private,
  motorcycle-closed, and disconnected refusals.
- Megaplex memory soak: 1/1 test; 10/10 planner cycles.
- Router cleanup: PID file absent and port 8998 closed.
- `git diff --check` passed.
- Scoped local/remote SHA parity matched for all seven P17 source/test files.

## Commands

- `npx vitest run tests/unit/route-diversity.test.ts tests/unit/route-explanations.test.ts tests/unit/planner.test.ts tests/components/route-comparison.test.tsx --reporter=verbose`
- Megaplex `npm run verify`
- Megaplex `npm run test:e2e`
- Megaplex `npm run test:e2e:critical`
- Megaplex `npm run test:e2e:pwa`
- Megaplex `GRAPHHOPPER_URL=http://127.0.0.1:8998 npm run test:e2e:real-router`
- Megaplex `npm run test:e2e:memory-soak`
- `git diff --check`

## Memory/performance evidence

P17 adds no listener, timer, persistent cache, worker, or geometry store. MMR
and canonical similarity are bounded scans over the already bounded candidate
sets. The Megaplex browser memory soak remained green at 10/10 cycles.

## Routing quality evidence

The real GraphHopper fixture remained green at 5/5, including honest refusals
for private, motorcycle-closed, and disconnected fixture paths. Browser
journeys continued to complete direct, native-alternative, corridor, and loop
planning flows.

## Known limitations

- Canonical refs are optional and the current normalized provider path does not
  yet attach per-segment refs; live planner comparisons therefore use the
  explicit geometry proxy until graph matching supplies directed refs.
- MMR is applied at the existing bounded alternative-selection seam; it does
  not invent additional provider routes or solve topology.
- Route facts are field-derived observations, not calibrated legal, safety,
  weather, or model-confidence claims.
- Automated tests do not prove authenticated-browser behavior,
  physical-device behavior, production concurrency, owner-corpus map matching,
  or field/model quality.

## Deferred

- P18 — owner-reviewed PA/NJ golden corpus and policy tuning.
- Canonical graph-backed RIG geometry and offline graph candidate integration —
  P29/P30.

## Rollback

Remove the diversity/explanation modules and focused tests, restore the prior
planner overlap sort, and remove the measured-facts block. No data migration or
user-data deletion is required.

## Next dependency

P18 — owner-reviewed PA/NJ golden corpus and policy tuning.
