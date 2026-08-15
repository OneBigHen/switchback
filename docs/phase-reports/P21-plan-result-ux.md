# P21 — Plan result UX

**Phase:** P21 — 2–3 meaningful route alternatives and explanations  
**Current SHA:** `5632af2ea7109ae860d608069b8c4364d6f80273` HEAD plus the
uncommitted phase documentation changes  
**Release gate:** G4

## Before behavior

- Progressive primary-then-alternatives planning, duplicate filtering, route
  comparison cards, and measured route facts already existed in the working
  tree from the routing and diversity phases.
- The P21 acceptance boundary and browser evidence were not recorded as a
  phase-level result.

## After behavior

- The primary route is applied first; the same lifecycle loads optional
  alternatives with abort and latest-request guards.
- The comparison path caps alternatives at two, evaluates eligibility before
  diversity/utility, rejects duplicate or over-overlapping candidates, and
  leaves the primary usable when optional work fails.
- `RouteComparison` presents route choices and score/distance/time/twist
  metrics first. Long-form details, measured route facts, provenance, and score
  reasons require explicit disclosure.
- Explanations are derived from measured route fields or comparison peers; the
  UI does not claim unsupported legality, safety, confidence, or model facts.
- No production source, route data, or schema migration was needed. P21 is an
  audit/acceptance closure of the existing coherent implementation.

## Files changed

- `docs/recovery/WORKLOG.md` — P21 before/after evidence and boundary.
- `docs/phase-reports/P21-plan-result-ux.md` — this phase report.

## Files deleted

None.

## Migrations

None.

## Tests

- Megaplex focused audit: 5 files / 46 tests passed:
  `planner.test.ts`, `route-diversity.test.ts`, `route-explanations.test.ts`,
  `trip-planning-coordinator.test.ts`, and `route-comparison.test.tsx`.
- Megaplex critical browser alternative journey: 2/2 passed across Chromium
  and WebKit.
- The unchanged source tree retained the P19 acceptance gates: `npm run
  verify` at 184 test files / 1,225 passed / 1 skipped, lint, typecheck, and
  build; browser 24/24; critical 30/30; PWA 2/2; real-router 5/5; memory soak
  10/10 planner cycles; and clean router shutdown.

## Commands

```text
npm exec -- vitest run tests/unit/planner.test.ts \
  tests/unit/route-diversity.test.ts \
  tests/unit/route-explanations.test.ts \
  tests/unit/trip-planning-coordinator.test.ts \
  tests/components/route-comparison.test.tsx --reporter=verbose

npm exec -- playwright test tests/e2e/critical/planner-journeys.spec.ts \
  --project=critical-chromium --project=critical-webkit \
  --grep "route alternatives"
```

## Gate boundary

P21 proves bounded alternative selection and factual result rendering under
component and critical-browser fixtures. It does not prove current provider
quality, authenticated-browser behavior, physical-device behavior, or field
calibration of route preferences.

## Deferred

- P22 — expert customize/edit with surface, bike, locks, sketch, avoid, and via
  controls behind progressive disclosure.
- Physical-device drill and production-concurrency evidence remain release
  gates outside this local/Megaplex acceptance loop.

## Rollback

Revert the two documentation files only. No production or data rollback is
required.
