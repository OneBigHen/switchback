# Module quality sweep — Routing & providers

Area: `src/lib/routing/`, `src/lib/roads/`, `src/lib/curvature/`
Watch-for: GraphHopper/Valhalla seam drift, dead profile logic, error paths
that swallow provider failures silently.
Branch: `quality-sweep/routing-providers`

## Prior-work check (done before auditing)

Grepped every doc the brief lists for this area's paths before treating
anything as new:

- `docs/reviews/2026-08-21/OPUS-ADVERSARIAL-REVIEW.md` +
  `REMEDIATION-RESULT.md` — ADV-001 (KMZ `DecompressionStream` deadlock),
  ADV-002 (poisoned must-lock on failed road-match), ADV-003 (deployment
  restore path) are all **confirmed fixed and present in the current tree**:
  `src/lib/routing/import/kmz-parser.ts` now pipes a `ReadableStream` into
  `DecompressionStream` before writing instead of writing before attaching a
  reader, and `src/lib/roads/road-locks.ts:454-461`
  (`evaluateRoadLockSatisfaction`) correctly rejects a `must` lock with
  `edgeIds: []` instead of treating it as satisfied. Not re-reported.
- Same review's Architecture Assessment / Refactor Residue sections flagged
  a dead re-export shim in `destination-corridors.ts` as P2 (never actioned
  by the remediation pass, which only executed P0/P1). Still present — see
  Finding 2 below. "Still not fixed," not a new discovery.
- `docs/audit-mimo-v2.5-pro.md` C-1/C-2/C-3 (valhalla.ts elevation
  null-coalescing, polyline6 bounds, twistiness formula) — checked, see
  "Still open, not touched" below.
- `docs/audit-deepseek-v4-pro.md` finding #1 (route cache key omits
  `bikeProfile`) — the file it names, `src/lib/server/route-cache.ts`, is
  outside this area's assigned paths (not under `routing/`, `roads/`, or
  `curvature/`, and not owned by any other row in the sweep's module table
  either). Spot-checked and still open (grep for `bikeProfile` in
  `route-cache.ts` returns nothing) — flagging here so it doesn't fall
  through the cracks during consolidation, but not fixed by this PR.
- `docs/audit-deepseek-v4-pro.md` finding #7 (Valhalla routes carry empty
  `roadMix`/`surfaceMix`, `src/lib/routing/valhalla.ts:519-520`) — still
  true; `normalizeTrip` sets both to `{}` with no warning. Recommended fix in
  that audit ("emit a warning when a Valhalla-sourced route lacks
  surface/road detail") is the same shape as Finding 1 below but a separate,
  larger change (surface/road-class detail isn't in Valhalla's `/route`
  response at all, so "warn" here means threading a route-level
  `featureProvenance` flag through scoring, not a local catch/return fix).
  Left flagged, not fixed, to keep this PR small and reviewable.
- `AUDIT-SUPPLEMENT.md` / `AUDIT-EVALUATION.md` routing sections (Valhalla
  migration recommendation, maneuver-kind expansion, elevation) are
  product/architecture recommendations, not defects — out of scope for a
  code-quality sweep; not re-litigated here.
- `docs/phase-reports/P03-dead-complexity.md`, `P04`, `P09`, `P11` — read;
  no re-introduced dead code found in the areas they cover.

## Findings

### [routing] Elevation-fetch provider failures were indistinguishable from legitimate no-data
**File:** `src/lib/routing/valhalla.ts` (`fetchRouteElevations`, `enrichWithElevations`)
**Severity:** medium
**Evidence:** `fetchRouteElevations` returned the identical
`{ ascentMeters: null, descentMeters: null }` shape whether the Valhalla
`/height` endpoint was unreachable, returned a non-2xx status, returned
unparseable JSON, **or** legitimately had no elevation data for the geometry
(e.g. outside DEM coverage). `enrichWithElevations` never threw in any of
these cases, so the one place designed to warn on enrichment failure —
`src/lib/routing/hybrid.ts:111-118`'s `try { result = await options.enrich(result) } catch { ...push a warning... }`
— was unreachable for this specific enrichment. Net effect: a real Valhalla
elevation-service outage produced zero rider-visible signal, silently
downgrading every route to `ascentMeters: null` with no warning, while the
sibling enrichment path in this same request
(`src/lib/roads/adventure-route-enricher.ts:60-65`) already surfaces the
equivalent failure as a warning string. This is exactly the "error paths
that swallow provider failures silently" pattern this sweep was asked to
watch for. Zero test coverage existed for either function's failure paths
(`tests/unit/valhalla.test.ts` / `valhalla-runtime.test.ts` never call
`fetchRouteElevations` or `enrichWithElevations`).
**Fix:** `fetchRouteElevations` now returns an additional `unavailable: true`
flag on the three genuine-provider-failure branches only (fetch throws,
`!response.ok`, JSON parse throws); the "valid response, no usable height
data" branch is untouched and stays silent, preserving today's behavior for
that (expected, non-failure) case. `enrichWithElevations` collects the flag
across all routes in the result and appends one warning —
`"Elevation data was unavailable for one or more routes; distances and turns are unaffected."`
— to `result.warnings` when at least one fetch failed, following the exact
convention already used by `hybrid.ts` and `adventure-route-enricher.ts`.
The internal flag is stripped before merging into the route object via
destructuring, so `PlannedRoute` is unaffected. No routing/selection/
navigation behavior changed — this only adds an optional warning string.
Added `tests/unit/valhalla-elevation.test.ts` (9 cases): fetch-throw,
non-ok response, unparseable JSON, legitimate-no-data (asserts **no**
warning), full success (asserts ascent/descent merge and no warning),
warning-append preserves prior warnings, and the internal flag never leaks
onto the route object.

### [routing] Dead re-export shim in `destination-corridors.ts`
**File:** `src/lib/routing/destination-corridors.ts:5` (removed)
**Severity:** low
**Evidence:** `export { backtrackingShare, selfOverlapShare } from "./route-geometry-quality"`
was a pure re-export whose only consumer was `src/lib/routing/route-quality.ts:2`
(`src/lib/recommendation/route-score.ts` already imported the same two
functions directly from `route-geometry-quality.ts`). Documented in
`docs/reviews/2026-08-21/OPUS-ADVERSARIAL-REVIEW.md` section 6 ("Abstractions
I would undo") and again in section 8 as P2 item #13
("drop the destination-corridors compat shim"); the remediation pass
(`REMEDIATION-RESULT.md`) executed only P0/P1, so this survived untouched.
**Fix:** Removed the re-export from `destination-corridors.ts`; repointed
`route-quality.ts:2` to import `backtrackingShare`/`selfOverlapShare`
directly from `./route-geometry-quality`. Verified no other file imported
the shim path. Zero behavior change; `npm run verify` confirms.

### [routing] `region-policy.ts` has zero production consumers
**File:** `src/lib/routing/region-policy.ts` (whole module, 130 lines)
**Severity:** medium
**Evidence:** `REGION_POLICY_OVERLAYS`, `getRegionPolicyOverlay`,
`getRegionPolicyOverlayByCatalog`, and the `RegionPolicyOverlay` type are
referenced only by two dedicated test files
(`tests/unit/region-policy.test.ts`, `tests/unit/region-policy-overlay.test.ts`)
and a one-line comment in a third
(`tests/unit/graphhopper-lock-request.test.ts:22`). A repo-wide grep for
these four names outside the file itself and its tests returns nothing —
no component, API route, store, or other lib module imports from it.
Checked for dynamic access before calling this a candidate rather than a
verdict: the functions take an explicit `regionId: string` /
`region: OfflineRegion` argument (no string-keyed registry, no
`React.lazy`, no config-driven dispatch table that could reach them
indirectly); there is no barrel/index file re-exporting it either. The
module's own doc comment concedes the runtime wiring is gone: "Phase 3
moved the tuning into the persistent GraphHopper custom models... and
removed the request-time `in_<region>` area rules... `customModel` below is
kept as the documented intent." It also says overlay `notes` are meant to
be "surfaced to the rider on the region card," but no "region card"
component exists anywhere under `src/components` or `src/app` (grepped
case-insensitively for `RegionCard`/`region-policy`/`RegionPolicyOverlay`,
zero hits).
**Fix:** Flagged, not fixed. Two readings are equally plausible from the
code alone: (a) leftover scaffolding from the Phase 3 GraphHopper-custom-
model migration, safe to delete, or (b) reference data intentionally staged
for a not-yet-built "region card" UI feature. Deleting a whole module plus
its two dedicated test suites is a product call about whether that feature
is still planned, not a mechanical dead-code removal — outside what this
sweep should decide unilaterally.

**NEEDS YOUR DECISION:** Is a rider-facing "region card" (PA/WV/NJ/NY riding
notes) still planned? If yes — leave `region-policy.ts` as-is, or track
wiring it up as a fast-follow. If no — delete
`src/lib/routing/region-policy.ts`, `tests/unit/region-policy.test.ts`, and
`tests/unit/region-policy-overlay.test.ts`.
**My recommendation: delete.** Nothing else in the docs I checked
(`docs/cinco/roadmap/`, phase reports, prior audits) references a "region
card" concept, and dead reference data carrying its own test suite is
exactly the drift this sweep exists to catch.

## Still open from prior audits — checked, not touched (out of this PR's scope)

- **`docs/audit-mimo-v2.5-pro.md` C-1** (elevation null-coalescing overwrite
  risk in `enrichWithElevations`'s `{...route, ...elevations}` merge):
  confirmed **not currently reachable** —
  `src/lib/routing/graphhopper-request.ts:331` hardcodes `elevation: false`
  on every GraphHopper request, so `ascentMeters`/`descentMeters` are always
  `null` before Valhalla enrichment runs; there is no non-null value to
  overwrite today. Left as documented (low severity, latent only).
- **`docs/audit-mimo-v2.5-pro.md` C-2** (`decodePolyline6` doesn't validate
  decoded coordinates are in-range): still absent. Not in this sweep's
  watch-list (seam drift / dead profiles / silent failure-swallowing); noted
  only.
- **`docs/audit-mimo-v2.5-pro.md` C-3** (scoring.ts twistiness formula):
  Info-severity heuristic note, unchanged, not a defect.
- **`OPUS-ADVERSARIAL-REVIEW.md` P2 item #14** (`graphhopper-response.test.ts`
  lacks malformed/partial-response cases): still true —
  `tests/unit/lib/routing/graphhopper-response.test.ts` covers one
  well-formed path, error normalization, and ID stability only. Read
  `normalizeGraphHopperPath` (`src/lib/routing/graphhopper-response.ts:120-210`)
  and confirmed every field already defends with `??` fallbacks and the
  function explicitly throws a clean `GraphHopperProviderError` when
  geometry is missing (`:125-132`) — this is a coverage gap on already-
  correct code, not a live defect, so left flagged rather than adding
  coverage-only tests that don't protect against a reachable bug.

## Verification

`npm run verify` (lint + typecheck + unit tests + build) passes clean on
this branch, including the new `tests/unit/valhalla-elevation.test.ts`.
Focused re-run: `npx vitest run tests/unit/valhalla-elevation.test.ts
tests/unit/valhalla.test.ts tests/unit/valhalla-runtime.test.ts
tests/unit/route-utility-v2.test.ts tests/unit/route-quality.test.ts
tests/unit/lib/routing/route-geometry-quality.test.ts` — 5 files, all
passing.

## Rollup

| Severity | Count | Fixed | Flagged |
|---|---|---|---|
| High | 0 | 0 | 0 |
| Medium | 2 | 1 (elevation warning) | 1 (`region-policy.ts`) |
| Low | 1 | 1 (dead shim) | 0 |
| **Total** | **3** | **2** | **1** |

Plus 4 items re-verified as still open from prior audits (not new; not
touched in this PR — see above) and 1 out-of-area item
(`route-cache.ts` bikeProfile) surfaced for the consolidation pass.

**Are any of the 8 prior audit docs now fully resolved/archivable?** No,
not as whole documents — each spans areas well beyond routing/roads/
curvature (deployment, security, CSP, other modules), which other parallel
sweep agents are covering. Within just this area's scope:
`docs/reviews/2026-08-21/OPUS-ADVERSARIAL-REVIEW.md`'s ADV-001/002/003 and
P1-A/P1-B findings were already fully remediated (per
`REMEDIATION-RESULT.md`) before this sweep started, and this sweep confirms
that remediation is still intact in the current tree. That review's P2
list item #13 (destination-corridors shim) is now resolved by this PR.
Its P2 item #14 (malformed-response test coverage) remains open. The
review as a whole is not archivable because its ADV-003/deployment findings
and P2 items #6-8/#11-12 are outside this area.
