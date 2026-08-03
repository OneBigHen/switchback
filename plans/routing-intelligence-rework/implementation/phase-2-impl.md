---
type: planning
entity: implementation-plan
plan: "routing-intelligence-rework"
phase: 2
status: draft
created: "2026-07-22"
updated: "2026-07-22"
---

# Implementation Plan: Phase 2 - Fast Primary-Route Pipeline

> Implements [Phase 2](../phases/phase-2.md) of [routing-intelligence-rework](../plan.md)

## Approach

Split existing all-at-once planning into a primary path and a later alternatives path while retaining the existing `/api/routes` boundary. Thread cancellation through the client, handler, planner, hybrid provider, and fetch calls. Remove enrichment from the primary critical path and enforce host-friendly concurrency.

## Affected Modules

| Module | Change Type | Description |
|--------|-------------|-------------|
| `src/lib/routing/planner.ts` | modify | Primary and alternative orchestration |
| `src/lib/routing/hybrid.ts` / providers | modify | Abort signals, provider selection, deferred enrichment |
| `src/lib/client/trip-planning-coordinator.ts` | modify | Real cancellation and progressive calls |
| `src/components/planner/PlannerShell.tsx` | modify | Own the per-lifecycle abort controller and call coordinator paths |
| `src/app/api/routes/` | modify | Candidate-set validation and response timing |
| `src/lib/server/route-job-limiter.ts` | create | Bounded concurrency and request cache |
| `tests/unit/` and `tests/components/planner-shell-geocoding.test.tsx` | modify/create | Orchestration, limiter, cancellation, and caller coverage |

## Required Context

| File | Why |
|------|-----|
| `src/lib/routing/planner.ts` | Selected profile currently completes before three comparison profiles start |
| `src/lib/routing/hybrid.ts` | GraphHopper, Valhalla, and enrichment orchestration |
| `src/lib/routing/graphhopper.ts` | 30-second request and alternative-route shape |
| `src/lib/routing/valhalla.ts` | Candidate and elevation timeouts |
| `src/lib/client/trip-planning-coordinator.ts` | Latest-request gate without cancellation |
| `src/lib/client/routing-client.ts` | Existing optional signal not supplied by coordinator |
| `src/app/api/routes/handler.ts` | API validation and planning entrypoint |

## Implementation Steps

### Step 1: Define primary and alternatives planner paths

- **What**: Implement the locked stateless wire contract: primary returns one route for a client `planningId`; alternatives receives the same normalized request plus the primary ID and ≤128-point sampled geometry and returns at most two routes with ≤85% overlap.
- **Where**: `planMotorcycleTrip` and new internal helpers.
- **Why**: Comparison work must not block the first usable route.
- **Considerations**: Keep segmented trips and round trips compatible; Phase 4 later replaces destination time shaping. Echo `planningId` on every success; invalid alternative primary summaries return `400`; no useful alternatives returns an empty successful set.

### Step 2: Remove optional work from primary latency

- **What**: Skip Valhalla comparisons, elevation, PASDA, and other-profile requests on primary; expose background enrichment as a separate alternatives/evidence operation.
- **Where**: API route wiring, hybrid provider options, adventure enricher invocation.
- **Why**: These calls currently contribute 15–30-second failure windows.
- **Considerations**: GraphHopper may fall back to Valhalla only when the primary engine fails and the request is eligible.

### Step 3: Propagate cancellation end to end

- **What**: Create one `AbortController` per plan lifecycle and pass its signal through client fetch, API request context, planner, provider, and upstream fetches.
- **Where**: PlannerShell/coordinator, routing client, route handler, provider option types.
- **Why**: Invalidating a request currently leaves expensive work running.
- **Considerations**: Treat abort as cancelled, not a user-visible provider error; clear/replan/new prompt all abort the prior controller.

### Step 4: Add bounded host scheduling

- **What**: Add a priority semaphore around provider calls with two total GraphHopper tokens; a primary lifecycle may use both tokens, while alternatives may use at most one token and yield to queued primary work. Queue entries must be abortable.
- **Where**: New server limiter used by `/api/routes`.
- **Why**: Protect the micro-PC from simultaneous multi-profile explosions.
- **Considerations**: Health checks must bypass the queue; alternative calls never starve primary calls; queued calls retain the originating lifecycle deadline rather than starting a new timeout.

### Step 5: Add normalized short-lived caching and timing

- **What**: Cache primary results by rounded points plus routing-affecting preferences; emit server timing metadata/logs.
- **Where**: Server cache helper and route handler.
- **Why**: Replans and repeated golden tests should not repeat identical provider work.
- **Considerations**: Ten-minute TTL, bounded entry count, no user identity or precise prompt text in cache keys/logs.

## Testing Plan

| Test Type | What to Test | Expected Outcome |
|-----------|-------------|-----------------|
| Unit | Primary orchestration | One requested-profile provider path; no enrichment/comparisons |
| Unit | Alternatives orchestration | At most two results, concurrency one, 12-second deadline |
| Unit | Limiter/cache | Primary priority, abortable queue, correct cache key isolation |
| Integration | Client cancellation | Old request aborts through provider and never repaints |
| Live diagnostic | Direct route benchmark | p95 budget is met before Phase 2 closes |

Primary verify command:

```bash
npm test -- --run tests/unit/planner.test.ts tests/unit/hybrid-routing.test.ts tests/unit/routes-api-wiring.test.ts tests/unit/request-timeout.test.ts tests/unit/trip-planning-coordinator.test.ts && npm run typecheck && git diff --check
```

### Test Integrity Constraints

- Update comparison-count assertions only where the intentional primary/alternatives split changes behavior.
- Do not weaken GraphHopper fallback, Valhalla fallback, lock satisfaction, or stale-result protections.
- Tests must prove enrichment functions were not called, not merely that the response was fast under mocks.

## Rollback Strategy

Revert the Phase 2 merge commit. Candidate-set fields retain Phase 1 compatibility defaults so Phase 1 remains valid.

## Open Decisions

| Decision | Options | Chosen | Rationale |
|----------|---------|--------|-----------|
| Primary provider | hybrid race/GraphHopper-first | GraphHopper-first with eligible Valhalla failure fallback | Avoid waiting for two engines while retaining resilience |
| Alternative count | 2/3/all profiles | maximum 2 | User needs useful choice, not workload explosion |
| Cache | none/memory/persistent | bounded 10-minute memory | Low complexity; no persistent privacy surface |
| Concurrency | unlimited/priority semaphore/serial | two provider tokens total; alternatives use at most one | Protect host while letting one primary corridor evaluate two candidates concurrently |

## Reality Check

### Code Anchors Used

| File | Symbol/Area | Why it matters |
|------|-------------|----------------|
| `src/lib/routing/planner.ts` | `planMotorcycleTrip`, `requestTimeboxedRoutes` | Current selected-then-all-profiles critical path |
| `src/lib/routing/hybrid.ts` | `createHybridRouteProvider` | Waits for both engines and then enrichment |
| `src/lib/client/trip-planning-coordinator.ts` | `runLatestTripPlan` | Begins routing but creates no abort controller |
| `src/lib/client/routing-client.ts` | `requestTripPlan` | Already accepts a signal, enabling narrow client change |

### Mismatches / Notes

- Existing `compare` should be migrated internally to `candidateSet`; do not keep two competing sources of truth.
- Normal online planning has no offline-worker call today; add a regression assertion rather than removing offline code.
