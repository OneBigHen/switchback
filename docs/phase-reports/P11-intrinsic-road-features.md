# P11 — Intrinsic road features and provenance

**Phase:** P11 — surface, access, curvature, elevation, flow, and MVUM
provenance
**Release gate:** G3

## Before behavior

- `plannedRouteToScoreable` filled missing provider facts with `permitted`
  access, `open` seasonal access, zero incident risk, urban density reused as
  signal/stop density, and arbitrary live/preview confidence values.
- Normalized route features had no explicit source, dataset, version, coverage,
  or limitation record. A successful route could therefore look more certain
  than the evidence supported.
- The route-import worker accepted an optional route payload without validating
  intrinsic feature provenance at the message boundary.

## After behavior

- `src/lib/roads/intrinsic-features.ts` owns the six intrinsic feature keys,
  explicit `complete`/`partial`/`unknown` coverage, limitations, runtime
  validation, and a measured field-coverage proxy. The proxy is documented as
  coverage, not a calibrated probability.
- `RoadSegmentFeature` and `PlannedRoute` carry optional feature provenance.
  Missing access and seasonal facts remain `unknown`; signal and stop density
  are omitted unless supplied by real evidence. Unknown numeric score inputs
  use neutral scoring defaults rather than fabricated zero/good values.
- GraphHopper and Valhalla normalization attach feature provenance, and the
  hybrid provider recomputes it and the route score after attaching the actual
  provider/version and fallback decision.
- The worker request/response boundary validates optional intrinsic provenance
  before a route can cross into the UI.

## Files changed

- `src/lib/roads/intrinsic-features.ts` — feature keys, coverage, provenance,
  and runtime validators.
- `src/lib/domain/contracts.ts` — unknown access and evidence-backed optional
  feature fields.
- `src/lib/recommendation/route-candidate.ts` — route provenance bridge and
  removal of unsupported defaults.
- `src/lib/recommendation/route-score.ts` — neutral handling for unknown
  optional metrics and measured-confidence gating.
- `src/lib/routing/types.ts` — normalized route provenance.
- `src/lib/routing/graphhopper.ts` and `src/lib/routing/valhalla.ts` — provider
  normalization ownership.
- `src/lib/routing/hybrid.ts` — provider-aware recomputation after fallback or
  primary selection.
- `src/lib/routing/import-worker-protocol.ts` — runtime provenance validation.
- `tests/unit/intrinsic-features.test.ts`,
  `tests/unit/route-import-client.test.ts`, and
  `tests/unit/hybrid-routing.test.ts` — focused coverage.

## Verification

| Command/evidence | Result |
|---|---|
| Focused P11 Vitest suite | 6 files, 41 tests passed locally |
| the validation host `npm run verify` | lint/typecheck/build passed; 175 test files, 1,190 passed, 1 skipped |
| the validation host broad Playwright | 24/24 |
| the validation host critical Chromium/WebKit | 30/30 |
| the validation host PWA | 2/2 |
| the validation host real-router fixture | 5/5, including private, motorcycle-closed, and disconnected refusals |
| the validation host memory soak | 1/1 test; 10/10 planner cycles |
| Router cleanup | PID file absent and port 8998 closed |

## Known limitations

- P11 carries route-level normalized evidence; it does not yet attach
  intrinsic facts to stable OSM canonical segments or replace provider edge
  IDs. RIG/segment integration remains a later phase.
- No official MVUM segment evidence is attached, so MVUM remains explicitly
  unknown. A successful route is not treated as legal-access authority.
- Coverage is a bounded availability proxy, not a calibrated quality or safety
  probability. The owner GPX corpus still has no configured live map-match
  endpoint.
- Automated checks do not prove authenticated-browser behavior,
  physical-device behavior, production concurrency, or field/model quality.

## Deferred

- P12 — RIG/evidence ownership and segment-level intrinsic feature integration.
- P27/P29 — map-match intelligence, canonical graph assignment, and grounded
  GPX enrichment.

## Rollback

Remove the P11 provenance bridge and focused tests only if the earlier route
contracts are restored together; do not reset the worktree because it contains
earlier phase and user changes.
