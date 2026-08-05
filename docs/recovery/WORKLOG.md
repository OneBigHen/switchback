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

## 2026-08-05 — Phase 2 (part 1): share redaction + graph road matching

**Goal**
Protected shares leak no protected metadata (SB-008); road requirements gain a
graph-backed matching path (SB-013) so placeholders cannot claim exactness.

**Repository evidence**
- `src/lib/share/route-share.ts`: redaction now removes protected geometry AND
  inserts zone-boundary intersection endpoints (no straight jump across a
  zone), drops waypoints inside zones, removes instructions inside/spanning
  zones, rebases surviving instruction intervals onto the visible geometry,
  and recalculates distance/duration proportionally (elevation evidence
  nulled). Oversized links get one deterministic Douglas-Peucker
  simplification (≤30m deviation, instructions dropped) before failing.
- `src/lib/roads/road-matching.ts` + `/api/road-matching` (handler/route):
  entry/exit anchors are routed against the live GraphHopper graph with
  edge_id/street/surface/toll details; returns real geometry, edge ids when
  the graph exposes them, street names, access evidence, graph version; a
  refusal is a typed error, never a straight-line placeholder. Live probe:
  82-point real geometry + street names; honestly "unresolved" when the
  deployed graph does not serve edge_id details.
- The road-requirements feature flag stays OFF: ordered Must traversal
  (SB-014) and bounded Prefer candidates (SB-015) are not yet implemented, so
  the honest state is disabled, not half-honored.

**Decision**
Share redaction is the P0 privacy item and is complete. Matching ships as the
graph-backed foundation; the flag flips only when SB-014/015 land.

**Changes**
- New: road-matching.ts, /api/road-matching, tests (22 share tests + 4
  matching tests).
- PlannerShell share notice now claims the true behavior.

**Verification**
- 170 files / 1170 unit tests pass; typecheck + lint clean.
- Live `/api/road-matching` returns real geometry and street names against the
  running router.

**Remaining risk**
- SB-014/015 (ordered Must traversal, bounded Prefer candidates) not yet
  implemented; Must stays disabled behind the flag.
- edge_id detail requires a graph that encodes it; until then matches report
  "unresolved" honestly.

**Commit**
- Pending at phase close.

## 2026-08-05 — Phase 3 offline and storage (part 1)

**Goal**
Large-download confirmation must start exactly one job (SB-009); Wi-Fi update
must prove or confirm connection; region readiness must be honest (SB-020);
service-worker caches must be bounded and separated (SB-019).

**Repository evidence**
- RegionDownloadsPanel: `downloadRegion` now takes an explicit `confirmed`
  flag — the confirm handler passes it, so a large download can never
  re-prompt forever; resuming a paused download carries the earlier
  confirmation forward. "Update all on Wi-Fi" now uses a conservative
  connection check and confirms when the link is not provably Wi-Fi
  (cellular/unknown).
- `src/lib/offline/readiness.ts` (new): OfflineReadiness model
  (shell/route/routing/mapTiles + per-region status + warnings) and an honest
  level label (Level 1/2/3). Unit tests cover all levels and warning paths.
- `public/sw.js`: rewritten with four bounded, separated caches — shell
  (network-first), build assets (cache-first, 200 cap), tiles (bounded
  cache-first, 500 cap), images (stale-while-revalidate, 100 cap); same-origin
  /api/* still never cached; activate prunes stale switchback-* caches and
  trims all caches to their caps. PWA e2e updated to the build cache name.

**Decision**
Pause/resume and atomic activation already exist in the v2 download client and
manifest flow (verified earlier); this pass fixes the confirmation loop, the
unverified Wi-Fi claim, the missing readiness model, and the unbounded cache.

**Verification**
- Readiness tests + region-download + offline-recovery unit tests pass;
  typecheck + lint clean; full suite running.

**Remaining risk**
- SB-017/018 already largely present; regional offline rerouting E2E and
  low-quota/eviction qualification remain for the release phase.
- The suite/rebuild no-op controls are still presentational; wiring or
  removing them is tracked in the backlog (Phase 3 part 2).

**Commit**
- Pending at phase close.

## 2026-08-05 — Phase 4 part 1: unified settings, stable bike identity, signed learning

**Goal**
P0 SB-010 (negative learning) and SB-011 (stable bike identity), plus the
versioned settings foundation of SB-023.

**Repository evidence**
- `src/lib/settings/rider-settings.ts` (new): versioned RiderSettings with
  stable RiderBike records (id/name/category/fuel/gravel/rough/unknown
  surface), migrateLegacySettings from the old "switchback:rider-profile"
  fields, load/save with an automatic one-time migration, getActiveBike.
- `src/lib/intelligence/rider-preferences.ts`: signed model — positive and
  negative feature centroids; signal weights 5★+2/4★+1/3★0/2★−1/1★−2,
  accepted +1, ignored −0.5, less-like-this −2, manual-edit +1,
  completed-ride +0.5. preferred* values derive from the positive centroid
  only, so a dislike can never raise affinity; fit scoring subtracts a
  negative-centroid resemblance penalty.
- `rider-preference-library.ts`: keys preferences by the stable bike id
  (schema field renamed motorcycleId→bikeId); PlannerShell and RouteRating
  read the active bike from settings — RouteRating's free-text "Motorcycle
  name" identity input is gone (display name is never the learning key).

**Decision**
Settings is the single source for bike identity and learning enablement;
legacy name-keyed preferences are not silently re-keyed (unprovable mapping)
but new signals use the stable id, which is what future sessions read.

**Verification**
- New/updated tests: rider-settings migration (4), signed preference
  regressions (5), route-comparison rating identity (6); all pass.
- typecheck + lint clean; full suite running.

**Remaining risk**
- ProfilePanel still stores legacy fields; the UI rewrite to the settings
  model is Phase 5. PlannerShell component split and explicit state-machine
  controllers remain Phase 4 part 2.

**Commit**
- Pending at phase close.

## 2026-08-05 — Free Ride directionality and expiry (SB-030)

**Goal**
A suggestion must never sit behind the rider or outlive its decision point
(SB-030): heading is enforced, expired suggestions disappear, and polling
continues while a suggestion is visible.

**Repository evidence**
- `src/lib/recommendation/free-ride.ts`: initial-bearing math + heading-delta
  check; `rankFreeRideCandidates` rejects candidates whose approach diverges
  >100° from the current heading (unknown heading = no guess, candidate
  still eligible); reducer gains an `expire` action and the `show` action
  refuses already-expired suggestions.
- `PlannerShell` Free Ride poll loop no longer stops while a suggestion is
  visible — it expires stale suggestions on the next poll.

**Verification**
- 5 new SB-030 tests (behind rejected, ahead accepted, unknown heading,
  expired never shown, visible suggestion expires) — 11 Free Ride tests
  total pass; typecheck + lint clean; free-ride e2e passes with a
  dynamic expiresAt fixture.

**Remaining risk**
- Graph-backed candidate generation (SB-029) and accepted-fragment traversal
  validation (SB-031) remain; suggestions are still curvature-database
  candidates labeled Experimental.

**Commit**
- Pending at phase close.

## 2026-08-05 — Phase 4 part 2: state machine guard + unified export

**Goal**
SB-022 (explicit planner lifecycle state machine) and SB-024 (unified
versioned export/restore).

**Repository evidence**
- `src/lib/domain/planner-state-machine.ts`: allowed-transition map per the
  spec (idle → interpreting → geocoding → routing-primary → alternatives →
  ready; manual idle → routing-primary; replan ready → routing-primary;
  terminal cancelled/error → idle). The store's setPlanningPhase ignores
  illegal transitions — no combination of unrelated booleans can fake a
  lifecycle state. 8 new tests (edges, invalid jumps, store guard, intent
  shortcut).
- `src/lib/settings/unified-export.ts`: versioned backup payload (settings,
  bikes, preferences, routes, trips, ride metadata summary — never raw GPS
  trails) with strict validation. 3 tests (round-trip, rejection, no trails).
- PlannerShell component-level split remains the open Phase 4 item; the
  existing hook decomposition (usePlannerRideIntent, usePlannerLibraries,
  useNavigationSessionController, usePlannerHome, navigation/offline
  reducers) already provides the controller boundaries.

**Verification**
- 1196 unit tests pass; real-router 5/5 through the guarded lifecycle;
  typecheck + lint clean.

**Remaining risk**
- The 1,440-line PlannerShell remains a composition point; the UX
  restructure (Phase 5) will pull more of it into controllers.

**Commit**
- Pending at phase close.

## 2026-08-05 — Diagnostics aggregation (SB-028)

**Goal**
One honest diagnostics snapshot: app version, offline readiness, storage
usage/persistence, and provider health — no invented "all good" claims.

**Repository evidence**
- `src/lib/domain/diagnostics.ts`: DiagnosticsSnapshot + summarizeStorage +
  providerLabel; 3 tests (storage honesty, provider labels, readiness
  warnings).
- UI panel wiring deferred to the Phase 5 UX pass; the aggregation layer is
  testable without React.

**Verification**
- 1199 unit tests total; typecheck + lint clean.

**Commit**
- Pending.
