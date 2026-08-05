# Switchback Recovery Work Log

## 2026-08-05 — Phase 0 baseline and containment

**Goal**
Establish an honest baseline: verify every spec defect claim against the live
tree, classify features, and apply containment so placeholder behavior cannot
mislead (feature flags for road requirements / Free Ride / neural ranking,
disable placeholder Must, remove misleading copy, add failing regressions).

**Repository evidence**
- All 11 defect areas in `02_CURRENT_STATE_ASSESSMENT.md` confirmed with
  file:line citations (see `BASELINE_AUDIT.md`).
- Baseline suite green: 1,149 unit, 30/30 critical, 5/5 real-router, 2/2 PWA,
  8/8 live smoke; lint/typecheck/build pass.

**Decision**
Per `00_EXECUTION_ORDER.md` and `19_FEATURE_CUT_AND_DEFER_RULES.md`:
- Road requirements: keep the sound domain model (`RoadLock`, satisfaction,
  rematch), but gate the UI behind a flag, strip the "exact" claim from manual
  locks, and disable Must priority-zero rules until graph matching ships.
- Free Ride: label Experimental, remove synthetic-claim copy, gate suggestions.
- Neural: keep as personalization over eligible candidates, remove "Neural Map"
  branding and the separate profile claim.

**Changes**
- Added `docs/recovery/BASELINE_AUDIT.md`, `FEATURE_DISPOSITION.md`,
  `TRACEABILITY.md`, this worklog.
- (Containment code edits follow in the same phase.)

**Verification**
- `npm run lint`, `npm run typecheck`, `npm test`, focused regressions.

**Remaining risk**
- Physical-device and live-provider checks remain device/environment dependent.

**Commit**
- Pending at phase close.

## 2026-08-05 — Phase 0 containment (code)

**Goal**
Contain the confirmed P0 defects: placeholder road requirements must not
influence routing or claim exact matches; Free Ride must be labeled
experimental without safety claims; misleading copy removed; failing
regressions added; docs reconciled.

**Repository evidence**
- `src/lib/domain/feature-flags.ts` (new): `roadRequirements=false`,
  `freeRideSuggestions=true` (labeled), `neuralRanking=true`.
- Road requirements: `graphhopper.ts` now only forwards locks to the provider
  model when the flag is on AND they carry edge IDs; `createManualRoadLock` /
  `createGpxRoadLock` claim `approximate` (never exact/matched) without edge
  IDs (SB-007); MapStage hides the Must radio, defaults to Prefer, clamps
  drafts to prefer, and labels the feature experimental; PlannerDeck disables
  the per-stop must-use toggle (SB-006).
- Free Ride: FreeRideHud replaces "Neural Map"/"safe, data-backed"/"never
  invents" with honest experimental copy; AppNavigation drops "Premium".
- Timebox fallback (SB-004): planner returns the eligible direct baseline with
  feasibility wording when no shaped candidate passes gates — never a
  gate-failing candidate labeled safe.
- Share copy (SB-008 partial): the success notice no longer claims full
  redaction while instructions still leak (Phase 2 fixes the leak itself).

**Decision**
Follow the spec's cut-and-flag rules: keep the sound road-lock domain model
but disable its untrustworthy plumbing until graph matching (Phase 2) ships.

**Changes**
- Tests updated to the corrected semantics: `graphhopper-lock-request.test.ts`
  (containment + enabled-path coverage), `region-policy-overlay.test.ts`,
  `planner-deck.test.tsx`, `timeboxed-destination-routing.test.ts` wording,
  `free-ride.spec.ts`/`free-ride-hud.test.tsx` copy, `road-lock.spec.ts`
  rewritten to the Prefer/experimental flow.
- Regressions added: manual/gpx locks without edge IDs never claim
  exact/matched; lock corridors never reach the provider model while the flag
  is off.

**Verification**
- `npm test`: 168 files / 1149 passed.
- Live golden timebox route: 108–132 min, 3/3 runs.
- e2e `road-lock.spec.ts` + `free-ride.spec.ts`: pass on desktop-chromium and
  mobile-safari.
- `npm run typecheck`, `npm run lint`: clean.
- Critical suite: running.

**Remaining risk**
- Docs beyond README profile list (full README reconciliation deferred to
  later phases).
- Profile simplification (Gravel/Avoid Highways/Neural as policies) deferred —
  tracked in FEATURE_DISPOSITION.md.

**Commit**
- Pending at phase close.

## 2026-08-05 — Phase 1 routing correctness

**Goal**
Every shown candidate is eligible and every mode applies the same normalized
constraints (SB-001..005).

**Repository evidence**
- `src/lib/domain/routing/normalized-request.ts` (new): `NormalizedRouteRequest`
  (requestId, shape, source, explicit avoidHighways/avoidAreas/tollPolicy/
  roadLocks) + `normalizeRouteRequest()` (idempotent).
- `RouteProvider` now consumes `NormalizedRouteRequest`; adapters
  (`createGraphHopperRequest`, `requestGraphHopperRoutes`,
  `createValhallaRequest`, `requestValhallaRoutes`) normalize at their
  boundary so direct callers also get the full contract.
- SB-003: `planSegmentedTrip` legs inherit the full request (was profile +
  points + two options).
- SB-005: store `selectionSource` ("user" | "automatic"); `selectRoute` marks
  user; `applyAutomaticRouteSelection` refuses to override a user pick;
  applyPlan resets to automatic; PlannerShell re-rank uses it.
- SB-002: `src/lib/domain/routing/eligibility.ts` — hard failures
  (invalid-geometry, preview-only, must-road-unresolved) never become ranking
  penalties; alternatives path filters ineligible candidates with warnings.
- SB-004 (from Phase 0): timebox fallback returns the eligible baseline.

**Decision**
Keep `TripPlanRequest` as the API input; the planner normalizes once at
`planMotorcycleTrip` and threads the normalized contract everywhere. Adapter
boundaries normalize defensively (idempotent) so no call site can bypass the
contract.

**Changes**
- New: normalized-request.ts, eligibility.ts, tests/unit/routing-semantics.test.ts.
- planner.ts, graphhopper.ts, valhalla.ts, hybrid.ts, types.ts,
  planner-store.ts, PlannerShell.tsx; test files updated to the contract.

**Verification**
- 102 routing-focused unit tests pass; new semantic tests (10) pass.
- typecheck + lint clean. Full suite + real-router running.

**Remaining risk**
- Eligibility module is route-derived; provider/coverage hard rules (e.g.
  graph-version staleness) are future extension points.
- Profile simplification (Gravel/Avoid-Highways/Neural as policies) still
  deferred.

**Commit**
- Pending at phase close.
