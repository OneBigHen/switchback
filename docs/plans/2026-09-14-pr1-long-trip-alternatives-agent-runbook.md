# PR 1 execution runbook — long-trip alternatives

> **Status:** executable packet. The canonical task ids are `T-1.1` through
> `T-1.10`. The execution authority at
> `2026-09-14-cheap-agent-execution-authority.md` owns sequencing and status; this
> file owns the bounded implementation procedure. It is based on the reconciled
> PR #139 head, not on an assumed historical line number.

## Scope and invariant

This packet fixes the long-trip alternatives request path so a primary route is
returned immediately and a bounded, deterministic set of alternatives can settle
before the shared deadline. It may change deadline ownership, engine-alternate
selection, lane settlement, optional enrichment, provider fallback, diagnostics,
and the existing alternatives status message. It must not change Route Policy V1,
implement Policy V2, add TomTom candidates, activate Mapbox, change provider
secrets, or execute production operations.

The primary route remains the selected route. Alternative route order is
deterministic from lane priority and path index, not from completion timing. A
finished lane is retained even if a sibling is still running. Caller cancellation
remains distinct from a lane timeout, and optional enrichment cannot hold the
request past the alternatives deadline.

## Packet prerequisites

- Reconcile `origin/main`, PR #139, and the assigned branch immediately before
  work. The current verified base was `a1346aeb85ffc25584ec46e19f124995d4568c9d`.
- Use a dedicated worktree based on the exact reconciled PR #139 head.
- Read `src/lib/routing/planner-contract.ts`, `planner.ts`,
  `planner-timebox.ts`, `planner-shared.ts`, `graphhopper-request.ts`,
  `graphhopper.ts`, `valhalla.ts`, `hybrid.ts`, `candidate-enrichment.ts`,
  `src/app/api/routes/handler.ts`, and `src/app/api/routes/route.ts`.
- Install dependencies and Playwright browsers in the isolated worktree before
  running gates. Do not modify the shared checkout's dependency tree.
- If a provider response or ADR contradicts this contract, stop the task and put
  the exact mismatch in the completion report.

## Shared completion/proof rules

For every task, record the exact base SHA, new head SHA, changed files, targeted
RED/GREEN result, broader result, and deviation status using the authority's
completion format. A task is not complete merely because TypeScript accepts it.

Each implementation task follows: inspect symbol → add the smallest regression
test → run the focused test and observe the expected failure → implement → rerun
focused test → run the affected suite → commit. Use verified paths below; if a
symbol moved, locate it by name and update this runbook before continuing.

---

## T-1.1 — shared deadline and signal composition

### Goal

Give the alternatives planner one explicit deadline that composes with caller
cancellation and can clean up its timer/listeners on success, rejection, timeout,
or cancellation.

### Dependencies

None. Preserve the existing `PlanningOptions.signal` contract in
`src/lib/routing/planner-contract.ts`.

### Existing implementation

- `src/lib/routing/planner.ts`: `planAlternativeRoutes` currently creates a
  native `AbortSignal.any`/`AbortSignal.timeout` pair for the 12-second budget.
- `src/lib/routing/planner-timebox.ts`: destination timeboxing also composes a
  native timeout with the caller signal.
- `src/lib/routing/graphhopper.ts` and `src/lib/routing/valhalla.ts`: provider
  requests compose provider timeouts with the passed signal.
- `tests/unit/request-timeout.test.ts`: existing browser-side timeout test; it is
  not a substitute for server planner deadline coverage.

### Files expected to change

- `src/lib/routing/deadline.ts` (new).
- `src/lib/routing/planner.ts`.
- `tests/unit/planner-alternatives-deadline.test.ts` (new).
- Existing timeout tests only if the verified helper contract requires it.

### Contract

- `timeoutSignal(ms)` returns a signal that aborts once after a finite positive
  duration using `setTimeout`.
- `composeSignals(...signals)` accepts defined/undefined parent signals and
  returns a composed signal that mirrors the first abort reason.
- `createDeadline(ms, parent)` returns `{ signal, dispose }`. The deadline signal
  aborts with a timeout reason when its own budget expires, mirrors `parent` when
  the caller aborts, and `dispose()` is idempotent and clears timer/listener
  resources. Invalid durations fail synchronously rather than silently creating
  an unbounded request.
- Caller abort is never rewritten as a timeout. Provider cancellation errors keep
  their existing `ROUTE_CANCELLED` behavior.

### Implementation steps

1. Add the typed helper and explicit disposable ownership. Use
   `setTimeout`/`clearTimeout`; do not use `AbortSignal.timeout` in the planner
   path because Vitest fake timers do not control it consistently.
2. On parent abort, abort the composed controller with the parent's reason and
   dispose the deadline. On deadline expiry, abort with a stable timeout reason.
3. Ensure normal completion/rejection calls `dispose()` from the planner's
   `finally` block.
4. Replace only the alternatives planner's ad-hoc composition first. Leave
   provider-specific hard timeouts intact until the signal propagation task.

### Tests

Run `tests/unit/planner-alternatives-deadline.test.ts` with fake timers. Add
regressions for: successful request cleanup, rejection cleanup, deadline abort,
caller abort/reason preservation, composed already-aborted parent, and idempotent
dispose. Run `tests/unit/request-timeout.test.ts` unchanged as a compatibility
check.

### Acceptance criteria

- Fake timers observe the deadline abort at exactly the configured duration.
- Caller cancellation aborts before the deadline and retains the caller reason.
- Timer/listener cleanup is observable after success and rejection.
- No production caller uses an unowned native timeout for the alternatives budget.

### Stop conditions

- A caller requires a different public signal API.
- The provider or framework requires native timeout signals for a behavior not
  expressible by the typed helper.
- Existing timeout test behavior changes outside this packet.

### Proof

`npx vitest run tests/unit/planner-alternatives-deadline.test.ts
tests/unit/request-timeout.test.ts` passes, followed by the affected planner and
provider tests. Record timer/listener assertions and the exact commit SHA.

---

## T-1.2 — choose engine alternatives only for short direct requests

### Goal

Select engine-native alternatives only when the request is a short, direct,
two-point request for which the provider cost is bounded. Long requests use
explicit lanes instead.

### Dependencies

`T-1.1` deadline helper tests and the existing `NormalizedRouteRequest` shape.

### Existing implementation

- `src/lib/routing/graphhopper-request.ts`: `createGraphHopperRequest` currently
  selects `algorithm: "alternative_route"` for every two-point alternatives
  request.
- `src/lib/routing/planner.ts`: `comparisonProfilesFor` and
  `planAlternativeRoutes` currently create profile comparison calls.
- `src/lib/routing/scoring.ts`: `haversine` is available for coordinate distance
  calculations.

### Files expected to change

- `src/lib/routing/alternatives-strategy.ts` (new).
- `src/lib/routing/planner.ts`.
- `tests/unit/planner-alternatives-deadline.test.ts` (new).

### Contract

`chooseAlternativesStrategy(request)` returns exactly one of
`"engine-alternates"` or `"lane-search"`. It returns engine alternatives only
when the normalized request has exactly two points, no `sketchCorridor`, and its
straight-line distance is at or below
`ENGINE_ALTERNATES_MAX_CROW_MILES`, default `60`. An environment override named
`ROUTING_ENGINE_ALTERNATES_MAX_MILES` is calibration-only and must be finite and
positive; malformed values use the default. Boundary comparisons are inclusive.

### Implementation steps

1. Implement the helper with the verified waypoint coordinate shape and a named
   exported threshold constant.
2. Call it from the alternatives planner, not from an untrusted request parser.
3. Pass the resulting boolean only into server-created normalized requests.
4. Preserve the existing corridor/loop exclusions and comparison profile order;
   do not alter scoring or duplicate thresholds.

### Tests

Add direct two-point cases below, at, and above the boundary; a corridor case;
three-point case; and a loop case. Keep `planner.test.ts` profile ordering tests
passing unless a failure proves an intentional lane-order update.

### Acceptance criteria

- Short direct requests choose engine alternatives at the configured boundary.
- Long, corridor, and loop requests never choose engine alternatives.
- No request with a client-controlled field can bypass this strategy.

### Stop conditions

- Straight-line distance cannot be derived from the verified request coordinate
  contract.
- The benchmark shows the approved threshold is materially wrong; record the
  evidence and stop instead of changing it by taste.

### Proof

Focused strategy tests pass with the default and a valid/invalid environment
override. The planner test output records the selected strategy for short and long
fixtures.

---

## T-1.3 — make engine alternates explicit and server-owned

### Goal

Prevent expensive provider-native alternate generation on long calls and prevent
clients from enabling it directly.

### Dependencies

`T-1.2` strategy contract.

### Existing implementation

- `src/lib/domain/routing/normalized-request.ts`: `NormalizedRouteRequest` and
  `normalizeRouteRequest` copy request properties into the provider contract.
- `src/lib/routing/graphhopper-request.ts`: `createGraphHopperRequest` builds the
  GraphHopper payload and currently uses `candidateSet === "alternatives"` as the
  engine-alternate trigger.
- `src/lib/routing/valhalla.ts`: `createValhallaRequest` currently emits
  `alternates: 2` for every two-point request.
- `src/app/api/routes/handler.ts`: route input schema is passthrough and calls
  `planMotorcycleTrip` after validation.
- `tests/unit/lib/routing/graphhopper-request.test.ts`: existing GraphHopper
  payload assertions.
- `tests/unit/routes-api-wiring.test.ts`: existing provider wiring boundary.

### Files expected to change

- `src/lib/domain/routing/normalized-request.ts`.
- `src/lib/routing/graphhopper-request.ts`.
- `src/lib/routing/valhalla.ts`.
- `src/app/api/routes/handler.ts`.
- `tests/unit/lib/routing/graphhopper-request.test.ts`.
- `tests/unit/routes-api-wiring.test.ts`.

### Contract

`NormalizedRouteRequest.engineAlternates?: boolean` is server-owned. GraphHopper
adds `alternative_route` fields only when it is true. Valhalla emits its
`alternates` field only when it is true; otherwise it sends no native alternate
request. `handleRouteRequest` strips `engineAlternates` from parsed client data
before normalization/planning. `candidateSet` remains the progressive endpoint
selector and is not itself permission to ask a provider for alternates.

### Implementation steps

1. Add the optional normalized field and preserve it only on server-created
   requests.
2. Update both provider request builders to branch on the explicit field.
3. In `handleRouteRequest`, destructure the field out of the passthrough payload
   before passing it to `planMotorcycleTrip`; do not weaken the schema's other
   compatibility fields.
4. Have the planner set the field when the strategy says engine alternates.

### Tests

Update the verified GraphHopper request tests for explicit true/false. Add
Valhalla payload coverage in its existing request test file if present; otherwise
add it beside the provider request tests after locating the real export. Add an API
wiring regression that submits `engineAlternates: true` and asserts the provider
receives `undefined`/false unless the planner itself selected it.

### Acceptance criteria

- Explicit server true produces native provider alternates.
- Default/false produces one provider path per lane.
- A client-supplied field cannot enable native alternates.
- Caller `signal` and all unrelated request fields are unchanged.

### Stop conditions

- Stripping the field breaks a documented client contract other than the new
  server-only field.
- Provider payload semantics differ from the verified GraphHopper/Valhalla APIs.

### Proof

Run the exact GraphHopper, Valhalla, handler, and wiring tests. Include serialized
payload assertions and the provider mock's received normalized request.

---

## T-1.4 — settle candidate lanes in completion order

### Goal

Collect bounded lane results as they settle, retain finished lanes at the deadline,
and stop/abort unfinished work when enough distinct candidates exist.

### Dependencies

`T-1.1` disposable deadline and `T-1.2` strategy. Use the existing provider
`PlanningOptions.signal` and `src/lib/server/route-job-limiter.ts` cancellation
contract.

### Existing implementation

- `src/lib/routing/planner.ts`: alternatives currently stores `pending` promises
  and awaits `pending.get(index)` in profile/index order.
- `src/lib/server/route-job-limiter.ts`: `createRouteJobLimiter` accepts a
  priority and signal, including queued-job cancellation.
- `src/lib/recommendation/route-diversity.ts`: existing route similarity and
  ranking helpers must remain the selection authority.

### Files expected to change

- `src/lib/routing/candidate-lanes.ts` (new).
- `src/lib/routing/planner.ts`.
- `tests/unit/planner-alternatives-deadline.test.ts` (new).

### Contract

`settleLanes(lanes, { concurrency, deadline, shouldStop })` accepts ordered lane
descriptors with stable `id`, `priority`, `budgetMs`, and an async `run(signal)`.
It returns all completed lane outcomes plus explicit timeout/cancellation/failure
metadata. Each lane's child budget includes time waiting for the route-job limiter.
Results are exposed in completion order to the collector, then sorted by stable
lane priority/path index before selection. At the deadline it resolves immediately
with completed outcomes and aborts pending lanes. `shouldStop` may request early
settlement; it must not discard already-finished results.

### Implementation steps

1. Define the smallest typed lane/result contract, including lane id and error
   classification.
2. Maintain at most `concurrency` active lanes. Start the next lane only after a
   lane settles or is cancelled.
3. Compose each lane's budget with the packet deadline and caller signal.
4. On packet timeout/caller abort/`shouldStop`, abort active lane controllers and
   resolve with finished results; clean all listeners/timers.
5. Do not sort by finish time for the final route order.

### Tests

In `tests/unit/planner-alternatives-deadline.test.ts`, use deferred promises and
fake timers to prove: a later lane finishing first is retained; reversing finish
order yields the same final ids/order; an over-budget lane aborts and permits the
next lane to start; the external signal stops new launches; and `shouldStop`
aborts only unfinished lanes.

### Acceptance criteria

- No collector path awaits lane promises by original index.
- Finished lane results are available at deadline even when an earlier lane hangs.
- Limiter-queued lanes receive cancellation before consuming a token.
- Final deterministic order is stable across completion order.

### Stop conditions

- The limiter cannot cancel queued work without changing its approved public
  contract.
- A lane requires a new provider API or production setting.

### Proof

Focused fake-timer/deferred-promise tests pass, and a source review shows no
`await pending.get(index)` or equivalent index-ordered barrier remains in the
alternatives collector.

---

## T-1.5 — implement the short/long lane table

### Goal

Use bounded lane search so long direct trips obtain candidates from quick,
corridor, profile, and optional fallback lanes without paying the native
alternative-route cost on every call.

### Dependencies

`T-1.1`–`T-1.4`; existing corridor sources and route-diversity contracts. Do not
start until lane settlement tests are green.

### Existing implementation

- `src/lib/routing/planner.ts`: `planAlternativeRoutes`,
  `comparisonProfilesFor`, `planCorridorAlternatives`, `chooseDistinctCandidate`,
  `ALTERNATIVES_DEADLINE_MS`, and `MAX_ALTERNATIVES`.
- `src/lib/routing/destination-corridors.ts`: `buildAnchorSets` and corridor
  source types.
- `src/lib/routing/candidate-generator.ts`: `generateCorridorCandidates`.
- `src/lib/routing/planner-timebox.ts`: `requestTimeboxedRoutes`.

### Files expected to change

- `src/lib/routing/planner.ts`.
- `tests/unit/planner.test.ts`.
- `tests/unit/planner-alternatives-deadline.test.ts` (new).
- `tests/unit/lib/routing/planner-segmented.test.ts` only if a shared helper
  contract is directly affected.

### Contract

Short direct requests use: quick single-path (3 s), primary profile with engine
alternates (5 s), then other comparison profiles single-path (5 s each). Long
direct requests use: quick single-path (3 s), up to two primary-profile corridor
lanes (7 s each), other profiles single-path excluding the primary (7 s each),
then optional Valhalla (6 s). The packet deadline is 12 s; candidate collection
must finish by 10 s, leaving up to 2 s for final enrichment/selection. Loops and
free-draw requests retain their existing specialized behavior unless the test
proves this table can be applied without a contract change. The primary route id
remains selected.

### Implementation steps

1. Build lane descriptors from the normalized request and primary anchor.
2. For long trips, obtain verified corridor sources through the existing
   `resolveCorridors` option; use `buildAnchorSets` and
   `generateCorridorCandidates` only for primary-profile corridor lanes.
3. Attach `engineAlternates: true` only to the short primary-style lane.
4. Run lane settlement with concurrency 2 and collect successful provider results.
5. Apply existing `evaluateEligibility`, duplicate filtering, and
   `chooseDistinctCandidate` after collection. Sort by lane priority/path index.
6. Enrich the final at-most-two selected alternatives together through the
   deadline-aware helper from T-1.6.
7. Classify no result, timeout, partial result, and unavailable provider states for
   T-1.7 without changing rider-facing text prematurely.
8. Remove/update the stale comment that says alternative concurrency is one.

### Tests

Update `tests/unit/planner.test.ts` only where the lane contract intentionally
changes: provider call count/ordering, duplicate profile handling, partial
provider warnings, and primary selection. Add the long-trip corridor request case
and external cancellation case to the new deadline spec. Existing planner,
segmented, timebox, and corridor-alternatives tests must remain green.

### Acceptance criteria

- A long two-point request can return at least one eligible distinct alternative
  when a later lane finishes before an earlier lane.
- Engine-native alternates are not requested for long trips.
- Selection is stable by lane priority/path index and never changes the primary
  selected id.
- Provider errors are normalized into the existing warning/error boundary.
- The 12-second packet budget is honored even with a slow lane.

### Stop conditions

- Corridor source shape or anchor generation differs materially from this table.
- A provider cannot accept the composed signal.
- The only way to meet the deadline is to weaken eligibility, duplicate thresholds,
  or scoring policy.

### Proof

Focused planner/deadline/corridor tests pass. Record a deterministic fake provider
trace showing lane ids, budgets, completion order, selected ids, and final route
order.

---

## T-1.6 — deadline-aware enrichment, fallback, and Valhalla limiter

### Goal

Ensure optional candidate enrichment and Valhalla fallback respect caller/packet
cancellation, and prevent Valhalla work from consuming GraphHopper's primary
limiter capacity.

### Dependencies

`T-1.1`, `T-1.4`, and the lane table. Preserve the existing hybrid provider role:
GraphHopper is primary; Valhalla is optional fallback/supplement only for its
existing eligible request shapes.

### Existing implementation

- `src/lib/routing/planner-contract.ts`: `RouteCandidateEnricher` currently takes
  only `(request, routes)`.
- `src/lib/routing/planner-shared.ts`: `enrichCandidates` catches all enricher
  failures and returns a generic warning.
- `src/lib/routing/candidate-enrichment.ts`: `createCandidateEnricher` runs region
  evidence and optional elevation; it closes over the HTTP request signal and
  uses a native 4-second timeout.
- `src/lib/routing/hybrid.ts`: `createHybridRouteProvider` falls back to Valhalla
  after any GraphHopper rejection and re-scores in `withProvenance`.
- `src/app/api/routes/route.ts`: `providerLimiter` is shared by GraphHopper and
  Valhalla; both provider callbacks call it.

### Files expected to change

- `src/lib/routing/planner-contract.ts`.
- `src/lib/routing/planner-shared.ts`.
- `src/lib/routing/candidate-enrichment.ts`.
- `src/lib/routing/hybrid.ts`.
- `src/app/api/routes/route.ts`.
- `tests/unit/candidate-enrichment.test.ts`.
- `tests/unit/hybrid-routing.test.ts`.
- `tests/unit/routes-api-wiring.test.ts`.

### Contract

`RouteCandidateEnricher(request, routes, options?: { signal?: AbortSignal })`
receives the lane/packet signal. Enrichment runs once over the final at-most-two
routes, in parallel where the existing adapter permits, and returns finished
geometry plus an explicit warning if optional evidence is unavailable. A caller
abort or packet timeout is not converted into a successful generic warning; it
stops work and leaves the planner's outcome classification in charge.

Hybrid fallback does not run after a caller/packet abort or `ROUTE_CANCELLED`.
Other GraphHopper provider errors retain the existing supported Valhalla fallback.
`createValhallaCandidateProvider` is exported from `hybrid.ts` (or the smallest
verified provider module) and is wired in `route.ts` through a dedicated
`createRouteJobLimiter(1)`. It is absent when `VALHALLA_URL` is unset. The single
GraphHopper limiter remains unchanged.

### Implementation steps

1. Add the optional signal parameter without breaking injected test enrichers.
2. Pass the child packet signal through `planner-shared.ts` and the candidate
   enricher. Preserve non-cancellation provider warnings; rethrow or classify
   cancellation rather than swallowing it.
3. Add an abort/error-code guard before the Valhalla fallback. Preserve the
   original GraphHopper error if a legitimate fallback also fails.
4. Extract the Valhalla callback as a named provider factory and inject a limiter
   with concurrency 1 in the route API wiring.
5. Remove only the hybrid second call to `scorePlannedRoute`; keep the score
   attached by provider normalization for T-1.8.

### Tests

Update candidate-enrichment tests for signal propagation, optional failure,
caller abort, and final parallel batch. Update hybrid tests for normal fallback,
abort/no-fallback, `ROUTE_CANCELLED`/no-fallback, and score identity. Update API
wiring tests for separate limiter callbacks and unset Valhalla behavior.

### Acceptance criteria

- A cancelled GraphHopper request never starts Valhalla fallback.
- Successful GraphHopper requests do not consume Valhalla tokens or perform a
  second score calculation.
- Enrichment cannot delay the plan beyond the shared deadline.
- Non-cancellation enrichment failures preserve the route and a rider-safe
  warning.

### Stop conditions

- The injected enricher contract is used by an external caller that cannot accept
  the optional third argument.
- The route limiter cannot distinguish provider queues without broadening its API.
- Cancellation reasons would have to be swallowed to preserve an old test.

### Proof

Run candidate-enrichment, hybrid, route-wiring, planner-timebox, and planner
focused suites. Include a mock call trace proving GraphHopper abort → no Valhalla,
and the two limiter instances' concurrency values.

---

## T-1.7 — alternatives outcome, diagnostics, timing, and progressive client merge

### Goal

Expose whether alternatives completed, partially completed, timed out, found no
distinct route, or were unavailable, while keeping internal lane diagnostics out
of rider-facing warnings and preserving warning-only progressive responses.

### Dependencies

`T-1.4`–`T-1.6` outcome data and the existing `TripPlan`/coordinator/store
contracts.

### Existing implementation

- `src/lib/routing/planner-contract.ts`: `TripPlan` has `routes`, `warnings`, and
  optional `timingMs`, but no alternatives outcome or diagnostics field.
- `src/app/api/routes/handler.ts`: serializes `TripPlan` and builds
  `Server-Timing` from `timingMs`.
- `src/lib/client/trip-planning-coordinator.ts`: `loadAlternatives` ignores the
  response when no routes arrive and does not notify/merge alternatives warnings.
- `src/stores/planner-store.ts`: `mergeAlternatives` already retains plan-level
  warnings when it is called, and must continue preserving the selected primary.

### Files expected to change

- `src/lib/routing/planner-contract.ts`.
- `src/lib/routing/planner.ts`.
- `src/app/api/routes/handler.ts`.
- `src/lib/client/trip-planning-coordinator.ts`.
- `src/stores/planner-store.ts` only if the verified merge contract requires it.
- `tests/unit/trip-planning-coordinator.test.ts`.
- `tests/unit/planner.test.ts`.
- `tests/unit/routes-api-wiring.test.ts`.

### Contract

`TripPlan.alternativesOutcome` is `{ status: "complete" | "partial" |
"timed-out" | "none-distinct" | "unavailable"; strategy: "engine-alternates" |
"lane-search" }`. `TripPlan.diagnostics.lanes[]` is internal and may contain lane
ids, timing, dropped-duplicate details, and comparison-unavailable errors. It is
never rendered or sent to rider-facing warning UI. `TripPlan.warnings` remains
concise rider-facing text. `timingMs` includes `alt-lanes`, `alt-enrich`,
`alt-select`, and stable `lane-<id>` keys; the handler emits them through
`Server-Timing`.

The coordinator merges a warning-only alternatives response and shows exactly
“Couldn't find a different route in time — your route is ready.” for timed-out or
unavailable alternatives when no alternative route is available. It must not
replace or deselect the primary route.

### Implementation steps

1. Add the typed outcome/diagnostic fields with optional compatibility defaults for
   old primary responses.
2. Populate outcome and diagnostics from the lane collector; keep provider errors
   out of `warnings` unless they are concise and rider-actionable.
3. Extend timing header serialization without exposing raw diagnostic text.
4. In `loadAlternatives`, merge when routes are empty but warnings exist and notify
   through the existing stable warning path. Preserve identity fencing.
5. Add only the specified timed-out/unavailable message; do not add a new toast or
   warning store.

### Tests

Add/update planner and API tests for every outcome, diagnostic/timing keys, and
header serialization. Add coordinator tests for warning-only responses, timeout
message, unavailable message, stale identity, and primary preservation. Run
`tests/unit/planner-store.test.ts` if merge behavior changes.

### Acceptance criteria

- Every alternatives response has a truthful outcome and strategy.
- Internal diagnostics never appear in `TripPlan.warnings` or UI notices.
- Warning-only responses reach the active store/coordinator.
- Primary route identity/selection remains unchanged.
- `Server-Timing` contains only approved timing keys and finite values.

### Stop conditions

- A required outcome cannot be distinguished from an existing provider error
  without a new product decision.
- The client identity fence does not match the current progressive request ids.

### Proof

Run planner, handler/wiring, coordinator, and store focused tests. Include one
serialized alternatives response with routes empty, warnings non-empty, outcome,
diagnostics, and Server-Timing values.

---

## T-1.8 — remove hybrid double scoring

### Goal

Keep the single provider-neutral score generated during route normalization and do
not overwrite it while attaching hybrid provenance.

### Dependencies

`T-1.6` provider path and current route-score contract. Do not change score policy.

### Existing implementation

- `src/lib/routing/graphhopper-response.ts`: `normalizeGraphHopperPath` attaches
  `routeScore` through `scorePlannedRoute`.
- `src/lib/routing/valhalla.ts`: normalized Valhalla routes attach their score.
- `src/lib/routing/hybrid.ts`: `withProvenance` currently calls
  `scorePlannedRoute` again after adding provider metadata.

### Files expected to change

- `src/lib/routing/hybrid.ts`.
- `tests/unit/hybrid-routing.test.ts`.
- `tests/unit/lib/routing/graphhopper-response.test.ts` only if the regression
  needs a score identity fixture.

### Contract

For a normalized route, `withProvenance` may add provider/version/fallback and
feature provenance but must preserve the exact existing `routeScore` object/value.
Injected legacy routes without a score remain compatible; no new scoring policy is
introduced to compensate.

### Implementation steps

1. Remove the `scorePlannedRoute` call/import from `withProvenance`.
2. Keep feature provenance and lock satisfaction attachment unchanged.
3. Do not “fix” changed totals in tests by changing policy inputs.

### Tests

Add a hybrid test with a sentinel score object and assert reference/value
preservation for GraphHopper and fallback Valhalla routes. Run the existing
GraphHopper response normalization test.

### Acceptance criteria

- No hybrid path scores a route twice.
- Provider metadata is still attached.
- Existing score values and accepted/rejected state are unchanged.

### Stop conditions

- A route enters hybrid without normalization and has no score; preserve the old
  compatibility behavior and report it rather than creating a second scoring path.

### Proof

Focused hybrid/normalization tests pass, and `rg -n "scorePlannedRoute" src/lib/routing/hybrid.ts`
shows no invocation.

---

## T-1.9 — regression suite and provider cancellation matrix

### Goal

Prove the complete routing-rework behavior at its actual seams, including
completion ordering, cancellation, cleanup, provider payloads, enrichment, API
wiring, and progressive client behavior.

### Dependencies

`T-1.1` through `T-1.8` implementation commits.

### Existing implementation

The verified affected tests are:

- `tests/unit/planner.test.ts`
- `tests/unit/request-timeout.test.ts`
- `tests/unit/hybrid-routing.test.ts`
- `tests/unit/candidate-enrichment.test.ts`
- `tests/unit/routes-api-wiring.test.ts`
- `tests/unit/trip-planning-coordinator.test.ts`
- `tests/unit/eligibility-engine.test.ts`
- `tests/unit/lib/routing/graphhopper-request.test.ts`
- `tests/unit/lib/routing/graphhopper-response.test.ts`
- `tests/unit/lib/routing/planner-timebox.test.ts`
- `tests/components/route-decision-rail.test.tsx`
- `tests/components/route-comparison.test.tsx`

### Files expected to change

- `tests/unit/planner-alternatives-deadline.test.ts` (new).
- Only the existing tests above that require a deliberate contract expectation
  update. No snapshots or assertions may be removed to make the suite green.

### Contract

The regression suite must distinguish: caller abort, lane timeout, successful
provider request, cleanup after success, cleanup after rejection, provider-specific
signal propagation, no Valhalla fallback after cancellation, engine alternates only
when server-selected, warning-only client merge, and stable final route ordering.

### Implementation steps

1. Add tests at the smallest seam before each corresponding implementation.
2. Keep deferred/fake-timer tests deterministic; avoid sleeps and real provider
   calls.
3. Update an old expectation only when the new explicit contract changes the
   observable behavior, and document the reason in the task report.

### Tests

Run the focused command:

```text
npm test -- --run \
  tests/unit/planner-alternatives-deadline.test.ts \
  tests/unit/request-timeout.test.ts \
  tests/unit/planner.test.ts \
  tests/unit/hybrid-routing.test.ts \
  tests/unit/candidate-enrichment.test.ts \
  tests/unit/routes-api-wiring.test.ts \
  tests/unit/trip-planning-coordinator.test.ts \
  tests/unit/eligibility-engine.test.ts \
  tests/unit/lib/routing/graphhopper-request.test.ts \
  tests/unit/lib/routing/graphhopper-response.test.ts \
  tests/unit/lib/routing/planner-timebox.test.ts \
  tests/components/route-decision-rail.test.tsx \
  tests/components/route-comparison.test.tsx
```

### Acceptance criteria

- All focused tests pass with no skipped configured cases.
- The new tests prove behavior at boundaries, not private implementation details
  alone.
- Any unrelated baseline failure is captured at the exact base SHA.

### Stop conditions

- A test failure cannot be attributed to this packet or its exact base without
  weakening the test or changing a frozen contract.

### Proof

Record the RED test command/result for each new behavior, the focused GREEN result,
and the affected-suite result. Include `git diff --check`.

---

## T-1.10 — benchmark and calibration evidence

### Goal

Make the routing benchmark report route count, alternatives outcome, and
Server-Timing, and provide a repeatable threshold calibration command without
writing to production.

### Dependencies

`T-1.7` serialized fields and a reachable branch build or explicitly recorded
unreachable-service result. No production endpoint or provider dashboard action.

### Existing implementation

- `scripts/benchmark-routing.mjs`: `parseArgs`, `jsonRequest`, endpoint table,
  raw sample records, and sanitized report writer.
- `artifacts/routing-rework/raw/`: gitignored raw samples.
- `artifacts/routing-rework/reports/`: tracked sanitized reports.
- Existing benchmark routes include direct, short, long, time-shaped, loop, and
  direct/long alternatives but not a mid-length Harrisburg→Scranton case.

### Files expected to change

- `scripts/benchmark-routing.mjs`.
- `artifacts/routing-rework/reports/` (sanitized report only; raw samples remain
  ignored).
- A focused benchmark test only if an existing script-test harness is found; do
  not invent a second benchmark framework.

### Contract

Each route response record includes `routeCount`, `alternativesOutcome`, and the
raw `Server-Timing` header (or an explicit unavailable value). Add
`routes.mid.alts` for Harrisburg→Scranton. Add
`--calibrate-alternates --graphhopper-url` to sweep 35/60/80/100/155 miles and
report the largest threshold whose alternative-route p95 is at most 4 seconds.
The command must not mutate service configuration or assume credentials.

### Implementation steps

1. Extend `jsonRequest` to return response headers needed for Server-Timing.
2. Extend raw records/report table with route count, outcome, and timing.
3. Add the mid-length endpoint following the existing primary→alternatives body
   dependency and request spacing.
4. Add a separate calibration mode that calls the explicitly supplied local
   GraphHopper URL, records p50/p95, and exits with a sanitized report; do not
   change the runtime threshold automatically.
5. Generate a report from the branch build or record the service as unreachable;
   never substitute historical production values for current evidence.

### Tests

Run the script's `--help` and a one-run unreachable/local smoke as applicable.
Run the repository benchmark command `npm run benchmark:routing` only against an
explicitly authorized local/branch URL. Inspect the generated report manually for
route count/outcome/timing fields.

### Acceptance criteria

- Reports distinguish zero routes from a missing/unreachable app.
- A successful long alternatives response records its outcome and route count.
- Calibration output is reproducible and does not activate a provider setting.
- No unverified p50/p95 claim is copied into a tracked report.

### Stop conditions

- No branch GraphHopper/app endpoint is available; record the exact skipped live
  benchmark and do not claim the performance acceptance bar.
- Calibration would require production or paid-provider mutation.

### Proof

Record command, URL, date, branch SHA, raw sample path if generated, sanitized
report path, and whether the acceptance bar was measured or remained unverified.

---

## Packet exit gate

Before pushing the PR 1 branch:

```text
git status --short
git diff --check
npm run lint
npm run typecheck
npm test
npm run build
npm run test:e2e:critical
npm run test:e2e:real-router
npm run test:e2e:pwa
```

Run visual/mobile gates only when the changed surface requires them; report every
configured but unrun gate. Reconcile the PR base/head and GitHub checks at the
exact pushed SHA. Do not merge, deploy, change `.env.local`, set
`TOMTOM_ROUTING_ENABLED`, or execute T-3.6 as part of this packet.
