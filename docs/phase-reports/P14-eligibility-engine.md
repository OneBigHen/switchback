# P14 — Eligibility engine

**Phase:** P14 — hard legality, closure, bike, surface, and coverage gates
**Current SHA:** `5632af2ea7109ae860d608069b8c4364d6f80273` HEAD plus the
uncommitted P14 worktree changes.
**Release gate:** G3

## Before behavior

- `src/lib/domain/routing/eligibility.ts` handled only geometry, preview, and
  unresolved Must locks.
- Segment access, closure, safety, profile compatibility, and coverage checks
  were embedded in `route-score.ts`, without a shared runtime feature guard.
- Unknown access, surface, closure, and coverage facts had no explicit warning
  channel separate from hard authority.
- Provider-computed route scores were not marked as accepted/rejected for the
  planner's candidate-selection seam.

## After behavior

- `eligibility.ts` owns the segment gate pipeline. Legal private/forbidden
  access, active closures, explicit bike/profile incompatibility, explicit
  incompatible surfaces, blocking safety flags, malformed feature data, and
  low coverage fail before utility calculation.
- Unknown access, surface, closure, and coverage remain warnings; the engine
  never converts missing facts into permission, closure, or safety claims.
  Current rider reports are warning-only and separate from hard flags.
- `isRoadSegmentFeature` validates feature data at the matcher/scoring trust
  boundary, including coordinates, normalized fields, confidence ranges,
  provenance, and profile compatibility values.
- `scoreRoute` delegates hard gates to the eligibility owner and only computes
  utility after an eligible result. Provider scores retain the gate result, and
  planner, timebox, and comparison candidate selection exclude rejected
  candidates.
- Provider route scoring receives the selected bike profile, so explicit
  surface/smoothness/track-type incompatibility is applied consistently across
  GraphHopper, Valhalla, and hybrid paths.

## Files changed

- `src/lib/domain/routing/eligibility.ts` — unified route/feature eligibility,
  warnings, hard gate ordering, and runtime validation.
- `src/lib/domain/contracts.ts` — optional current-report field and normalized
  unknown access support.
- `src/lib/recommendation/route-score.ts` — delegates gates before utility and
  carries warning explanations.
- `src/lib/recommendation/route-candidate.ts` — preserves computed gate result.
- `src/lib/routing/planner.ts` — excludes computed rejected candidates from
  selection, duration matching, and comparison.
- `src/lib/routing/types.ts` — optional accepted/rejection metadata on provider
  scores.
- `src/lib/routing/graphhopper.ts`, `src/lib/routing/valhalla.ts`,
  `src/lib/routing/hybrid.ts` — pass bike profile into scoring.
- `tests/unit/eligibility-engine.test.ts` — gate ordering, unknown warnings,
  bike surface rules, and malformed feature boundary.
- `docs/recovery/WORKLOG.md`.

## Files deleted

None. The superseded inline segment gate logic was removed from
`route-score.ts`; no parallel production gate remains.

## Migrations

None. P14 changes in-memory contracts and candidate handling only. Existing
saved routes and road locks remain readable; no route geometry or user data is
rewritten or deleted.

## Tests

- Focused local P14 suites: eligibility, route score, routing semantics, and
  planner tests passed — 4 files / 38 tests.
- the validation host full `npm run verify`: 178 test files / 1,203 passed / 1 skipped;
  lint, typecheck, and production build passed.
- the validation host broad browser matrix: 24/24.
- the validation host critical Chromium/WebKit: 30/30.
- the validation host PWA: 2/2.
- the validation host real-router fixture: 5/5, including private,
  motorcycle-closed, and disconnected refusals.
- the validation host memory soak: 1/1 test; 10/10 planner cycles.
- Local/remote SHA parity matched for all 10 scoped P14 source/test files.
- Router cleanup: PID file absent and port 8998 closed.

## Commands

- `npx vitest run tests/unit/eligibility-engine.test.ts tests/unit/routing-semantics.test.ts tests/unit/route-score-domain.test.ts tests/unit/planner.test.ts`
- the validation host `npm run verify`
- the validation host `npm run test:e2e`
- the validation host `npm run test:e2e:critical`
- the validation host `npm run test:e2e:pwa`
- the validation host `GRAPHHOPPER_URL=http://127.0.0.1:8998 npm run test:e2e:real-router`
- the validation host `npm run test:e2e:memory-soak`
- `git diff --check`

## Memory/performance evidence

P14 adds no worker, listener, timer, persistent cache, or geometry store. The
feature guard iterates the provided segment list once and rejects malformed
input before scoring. The validation host browser memory soak remained green at
10/10 cycles. The interrupted host-local full Vitest run was not used as
acceptance evidence; the complete suite ran successfully in the faster LXC.

## Routing quality evidence

The real GraphHopper fixture remained green at 5/5, including honest refusals
for private, motorcycle-closed, and disconnected fixture paths. P14 does not
change provider topology or claim live owner-corpus segment legality. Unknown
provider access remains explicitly unknown until tag-level evidence is
attached.

## Known limitations

- Current provider-normalized routes still expose an aggregate feature seam;
  per-canonical-segment access and MVUM attachment belongs to later graph/tile
  integration.
- Unknown access/surface/closure data warns rather than hard-rejects, as
  required by the evidence policy; only explicit authority or incompatible
  facts fail. This is not a legal guarantee for unmapped roads.
- `safetyFlags` are treated as normalized hard flags; future adapters must put
  current rider reports in `softCurrentReports`.
- Coverage threshold `0.25` is an engineering gate, not calibrated probability.
- Automated tests do not prove authenticated-browser behavior,
  physical-device behavior, production concurrency, or field/model quality.

## Deferred

- P15 — contiguous route utility v2, detour/overlap/uncertainty, and
  personalization.
- Per-canonical-segment OSM/MVUM authority and offline eligibility packaging —
  P27/P29/P30.

## Rollback

Remove the P14 eligibility additions and focused test, restore the prior
route-score gate calls, and remove the P14 worklog/report sections. No data
migration or user-data deletion is required.

## Next dependency

P15 — route utility v2.
