# T-4.2 execution runbook — allow-with-warning route contract

> **Status:** the dependency-ready T-4.2a/b warning implementation is complete on
> branch `fix/routing-allow-with-warning`, head
> `851a6ac9a9ef3bf2883212dd996eddd9bdda3aba`, in PR #143 stacked on PR1. The follow-up also hardens warning
> preservation through replacing enrichment seams and weighted segmented routes.
> The full T-4.2 card/details work remains a Packet H follow-through task after the
> traffic/decision contracts exist. This runbook covers the warning defect only: an
> eligible route with toll evidence must retain structured rider-facing warning data
> through the complete active route path. The canonical status lives in
> `2026-09-14-cheap-agent-execution-authority.md`.

## Required invariant

The policy result is a three-way contract:

```text
reject
  -> candidate is ineligible; it cannot be recommended or selected
allow
  -> candidate is eligible; no policy warning is required
allow-with-warning
  -> candidate is eligible AND carries rider-facing warning evidence
```

`allow-with-warning` must never be silently converted into rejection. It must also
never be represented only by a console message, a raw provider detail, or text
created by an unrelated UI component. Eligibility and warning transport are
separate assertions and both require regression proof.

## Verified current path and drop points

The following symbols were located on the reconciled PR #139 base. Re-locate by
symbol name if a preceding packet moves them.

| Boundary | Current implementation | Current behavior / risk |
|---|---|---|
| Provider/evidence | `src/lib/routing/graphhopper-response.ts` `normalizeGraphHopperPath` and `src/lib/routing/route-warnings.ts` `withRoutePolicyWarnings` | GraphHopper `details.toll` becomes `PlannedRoute.tollEvidence`; known exposure under `allow-with-warning` adds a typed `toll-exposure` warning. Repeated application is stable/deduplicated. |
| Provider normalization | `src/lib/routing/valhalla.ts` `normalizeTrip` | Valhalla routes have the active `PlannedRoute` shape; toll evidence is absent unless a later trusted adapter supplies it. Absence is unknown, not “no toll”. The generic planner wrapper applies policy warnings to injected provider results. |
| Active route type | `src/lib/routing/types.ts` `PlannedRoute` | Carries optional `warnings: RouteWarning[]` alongside `tollEvidence` and `routeScore`; the optional field preserves existing fixtures. |
| Existing typed warning model | `src/lib/domain/contracts.ts` `RouteWarning` and `CandidateRoute.warnings` | The active route now reuses this typed structure, with the smallest `toll-exposure` code-union member. No parallel warning model was introduced. |
| Feature policy | `src/lib/domain/routing/eligibility.ts` `evaluateFeatureEligibility` | Unknown/discouraged feature facts produce structured `EligibilityWarning` values and preserve eligibility; hard illegal/closed facts produce failures. |
| Route policy | `src/lib/domain/routing/eligibility.ts` `evaluateEligibility` and `tollFailure` | `allow-with-warning` remains eligible; known toll exposure rejects only when `tollPolicy === "avoid"`; unknown/zero evidence does not guess or reject. Existing feature warnings remain separate. |
| Candidate bridge | `src/lib/recommendation/route-candidate.ts` `plannedRouteToScoreable` / `scorePlannedRoute` | Scoring still consumes route evidence, while `PlannedRoute.warnings` stays on the route object. Warning rendering is not derived from score explanation strings. |
| Recommendation | `src/lib/routing/planner.ts` `policyAwareProvider`, alternative filtering, and `src/lib/routing/planner-shared.ts` `chooseSelectedCandidate` | Provider results are policy-enriched before selection; eligibility filters receive the normalized toll policy; warning-bearing eligible routes remain selectable and are not reconstructed without warnings. |
| Plan result | `src/lib/routing/planner-contract.ts` `TripPlan` | Existing `TripPlan.warnings: string[]` remains the plan-level rider channel from T-1.7. Route-specific typed warnings live on each `PlannedRoute`, so API/state can identify the affected route without flattening evidence. |
| API serialization | `src/app/api/routes/handler.ts` `jsonWithRequestId` | The serialized `TripPlan.routes[].warnings` field survives the API response and the tested planner-store summary/cache projection. `serverTimingHeader` is unrelated to warning content. |
| Progressive client | `src/lib/client/trip-planning-coordinator.ts` `loadAlternatives` | T-1.7 already owns warning-only alternatives merge/notification and identity fencing. T-4.2b preserves route warnings on non-empty primary/alternative route objects; it does not create a second coordinator warning path. |
| State projection | `src/stores/planner-store.ts` `applyPlan` and `mergeAlternatives` | Existing plan application/alternative merge retains route objects and the tests assert route warning preservation; plan-level warnings continue to use the established string channel. |
| Rider surface | `src/components/planner/v2/RouteDecisionCard.tsx` `buildRouteDecisionPresentation` and `src/components/planner/RouteEvidencePanel.tsx` | The decision card shows the first concise route warning without changing selection; the evidence panel renders all distinct structured route warnings as progressive detail. |

The repaired defect was not merely missing copy: toll evidence existed at the
provider-normalized route, but active eligibility had no toll-policy branch, the
active route type had no structured warning carrier, and downstream transforms had
to be proven not to drop the warning. T-1.7 owns the separate warning-only
alternative response lifecycle; T-4.2b owns route-warning preservation.

Implementation evidence at the current head: the focused provider/eligibility/
planner/API/state/component suite is `133/133` passing, and the full repository
suite is `424` files with `2,890` tests passed and `1` configured skip. The route
warning field is optional for compatibility, but every policy-aware planner path
adds/merges it before selection; no UI code parses provider detail text.

## Scope and dependencies

This packet may implement the smallest typed warning carrier and its propagation,
plus the narrowly required card/details rendering and coordinator merge regression.
It must not implement traffic scoring, Route Policy V2, TomTom, a new provider
framework, or unrelated card redesign.

Prerequisites:

- Reconcile the exact branch/base and inspect the active symbols above.
- T-1.7 is implemented in PR #142 and defines the final `TripPlan.warnings` /
  diagnostics ownership. This follow-up preserves the existing `string[]` plan
  channel and adds only the route-level typed warning field required for affected
  candidate evidence.
- Use the existing `RouteWarning` type if it is compatible. Do not create a second
  warning enum or duplicate evidence model.
- `tollEvidence.known === false` is unknown evidence. It must not produce a clean
  toll claim, a guessed toll warning, or a rejection.

## T-4.2a — define and attach the structured warning

### Goal

Represent a known toll exposure under `allow-with-warning` as typed route warning
evidence without changing eligibility.

### Dependencies

The active `PlannedRoute` type, existing `RouteWarning` type, `TollPolicy`, and
GraphHopper toll normalization. No traffic or Policy V2 dependency.

### Files expected to change

- `src/lib/domain/contracts.ts` only if a new toll warning code is necessary.
- `src/lib/routing/route-warnings.ts` for the pure policy-warning derivation and
  stable warning merge helper.
- `src/lib/routing/types.ts` to carry the reused typed warning field on the active
  `PlannedRoute` contract.
- `src/lib/domain/routing/eligibility.ts` to keep the toll-policy classification
  separate from warning transport.
- `src/lib/routing/graphhopper-response.ts` to create the warning from known toll
  evidence and request toll policy.
- `src/lib/routing/valhalla.ts` only if a verified toll evidence source exists;
  otherwise leave it unchanged and document unknown evidence.
- `tests/unit/lib/routing/graphhopper-response.test.ts`.
- `tests/unit/eligibility-engine.test.ts` or a new focused eligibility test after
  locating the current route fixture helpers.

### Contract

- Known toll share greater than zero + `allow-with-warning` yields an eligible
  `PlannedRoute` with one typed toll warning containing the route-relevant
  condition, measured share when the existing contract supports it, and rider
  verification guidance.
- Known zero toll share yields no toll warning.
- Unknown toll evidence yields no guessed warning or clean assertion; the approved
  unknown-evidence policy remains the source of any generic uncertainty warning.
- `avoid` remains an eligibility/engine constraint. If known toll exposure reaches
  the route eligibility seam, it is ineligible; it is never reclassified as
  allow-with-warning.

### Implementation steps

1. Reuse `RouteWarning` and add the smallest code union member if needed.
2. Add the typed warnings field to the active `PlannedRoute`, preserving all
   existing route fixtures through an optional default during migration.
3. At GraphHopper normalization, compute toll evidence once and derive the warning
   from that exact result and `request.tollPolicy`; do not parse provider text in UI.
4. Extend the route eligibility result/adapter so an allow-with-warning route
   returns `eligible: true` and preserves existing route warnings. Do not filter it
   from `chooseDistinctCandidate` or recommendation ranking.
5. Dedupe by stable warning identity (`code`, `segmentId`, and message/condition)
   while
   preserving multiple distinct warnings.

### Tests

Red/green cases:

- direct allow with no toll evidence: eligible, no toll warning;
- reject with known toll exposure under `avoid`: ineligible;
- allow-with-warning with known toll exposure: eligible and typed warning present;
- allow-with-warning with unknown evidence: no invented toll claim;
- two distinct warnings survive without overwrite;
- repeated normalization does not duplicate the same warning.

### Acceptance criteria

The route object proves both `eligible === true` and a structured warning for
known toll exposure. The warning source is the normalized toll evidence, not a
console side effect or UI-only inference.

### Stop conditions

- No existing typed warning structure can represent measured toll exposure without
  widening a public contract beyond the approved architecture.
- A provider supplies only ambiguous/untrusted toll text; keep evidence unknown and
  stop rather than guessing.

### Proof

Run the focused GraphHopper normalization and eligibility tests and inspect the
serialized route object. Record known/zero/unknown evidence separately.

## T-4.2b — preserve warnings through recommendation and API/state projection

### Goal

Keep the typed warning attached while candidates are enriched, ranked, selected,
serialized, cached, merged progressively, and presented to the rider.

### Dependencies

T-4.2a and the T-1.7 `TripPlan` ownership contract.

### Files expected to change

- `src/lib/routing/planner.ts`, `planner-shared.ts`, `planner-timebox.ts`,
  `planner-segmented.ts`, and `gravel-atlas-provider.ts` so policy-aware selection
  and every active route-producing path retain the warning.
- `src/lib/routing/planner-contract.ts` only for the existing route contract; no
  new plan-level warning channel is required.
- `src/stores/planner-store.ts` only where the route entity/cache projection needs
  an explicit preservation assertion.
- `src/components/planner/v2/RouteDecisionCard.tsx` and
  `src/components/planner/RouteEvidencePanel.tsx` for progressive-disclosure rider
  presentation.
- `tests/unit/planner.test.ts`.
- `tests/unit/candidate-enrichment.test.ts`.
- `tests/unit/planner-store.test.ts`.
- `tests/unit/api-handlers.test.ts` for the actual serialization fixture.
- `tests/components/route-decision-rail.test.tsx`.
- `tests/components/route-evidence-panel.test.tsx`.

### Contract

At every boundary, the same route warning identity and content are preserved:

```text
provider toll detail
  -> normalized tollEvidence + PlannedRoute.warnings
  -> eligibility: eligible=true, warning retained
  -> candidate enrichment: warning retained
  -> recommendation/ranking: warning retained; no score-based rejection
  -> TripPlan/API JSON: warning field and approved rider-facing projection retained
  -> coordinator/store/cache: primary and progressive alternatives retain it
  -> UI: concise condition plus affected route/evidence guidance is visible
```

Raw diagnostics may remain internal. The UI must not manufacture warnings from a
missing/unknown field, must not display every provider debug detail, and must not
let warning rendering affect selected route or eligibility.

### Implementation steps

1. Add a pure warning projection/merge helper next to the active routing contract
   and use it from both normalized primary and alternatives results.
2. Ensure enrichment returns the original route object fields when it adds region
   or elevation evidence.
3. Update planner acceptance/ranking tests to assert warning-bearing routes remain
   candidates and preserve all distinct warnings.
4. Preserve the T-1.7 coordinator identity fence and warning-only merge; do not
   add a second warning channel or flatten route-specific warnings into unrelated
   plan text.
5. Render the warning on the existing route decision/evidence surface with a
   stable test id/accessible text. Keep copy concise and include measured toll
   share only if that value is actually known.
6. Verify cached/API JSON round-trips the warning and that an explicit route
   selection remains unchanged after rendering.

### Regression matrix

The implementation is not complete until the applicable real seams prove:

| Case | Required assertion |
|---|---|
| direct allow | eligible, no policy warning required |
| reject | ineligible and never selected |
| allow-with-warning | eligible and warning present |
| warning after normalization | `tollEvidence` and typed warning agree |
| warning after enrichment | region/elevation changes do not remove it |
| warning after recommendation/ranking | route remains in pool and warning remains |
| warning after API serialization | JSON contains the approved route/plan warning |
| warning after state projection | `applyPlan` and `mergeAlternatives` preserve it |
| warning in UI | rider sees condition on the route/evidence surface |
| warning does not alter eligibility | same route remains selectable/eligible |
| multiple warnings | distinct warning identities all survive; none overwrite another |
| missing evidence | approved unknown policy applies; no guessed toll claim |
| warning-only alternatives | T-1.7 response lifecycle remains merged/notified even with zero new routes |
| stale lifecycle | an old warning cannot land on a newer plan |

### Acceptance criteria

- A test can follow one known toll route from normalized provider response through
  API/state/UI and observe the same warning condition.
- `allow-with-warning` is eligible at every policy/selection boundary.
- `reject` cannot reach recommendation/UI as a rideable candidate.
- Missing evidence never becomes a false “no toll” or fabricated confidence claim.
- Warning rendering is progressive disclosure and has no selection side effect.

### Stop conditions

- A contract boundary cannot carry the warning without introducing a duplicate
  warning system or an unapproved public API.
- The required UI surface depends on the not-yet-available Phase 6 traffic/role
  decision payload; complete the domain/API propagation and mark card work
  blocked rather than inventing a role contract.
- An existing test is green only because it never exercises the active production
  caller; locate and test that caller before declaring completion.

### Proof

Run the full regression matrix's focused tests, then the affected unit/component
suite, API serialization test, `npm run typecheck`, and the relevant browser test.
Attach one JSON/state/UI evidence chain with exact branch SHA. Confirm `git diff
--check` and inspect the final route object for warning preservation.

## Explicit non-goals and owner gates

- Do not enable TomTom, traffic scoring, Mapbox rollout, or production data.
- Do not change `PA_NJ_ROUTE_POLICY_V1` or claim Phase 7 complete.
- Do not execute T-3.6 or alter `.env.local`, provider dashboards, service units,
  or production databases.
- If a production secret/config or owner decision is required, stop and list it as
  an owner action with prerequisites, verification, rollback, and proof required.
