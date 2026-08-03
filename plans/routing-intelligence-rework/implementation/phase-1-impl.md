---
type: planning
entity: implementation-plan
plan: "routing-intelligence-rework"
phase: 1
status: active
created: "2026-07-22"
updated: "2026-07-22"
---

# Implementation Plan: Phase 1 - Contracts, Baseline, and Golden Fixtures

> Implements [Phase 1](../phases/phase-1.md) of [routing-intelligence-rework](../plan.md)

## Approach

Add compatibility-first types and fixtures before changing runtime behavior. Keep existing route responses valid while introducing the fields later phases need. Record baseline timings separately from pass/fail golden assertions so Phase 1 does not claim unimplemented quality improvements.

## Affected Modules

| Module | Change Type | Description |
|--------|-------------|-------------|
| `src/lib/ai/ride-intent.ts` | modify | Represent `fun`, destination duration, ambiguity, and toll language |
| `src/lib/routing/types.ts` / `planner.ts` | modify | Add route request, evidence, candidate-set, and result metadata contracts |
| `src/lib/planner/ride-plan-request.ts` | modify | Preserve target and manual preferences for destination requests |
| `src/components/planner/usePlannerRideIntent.ts` / `PlannerShell.tsx` | modify | Pass the complete current preference set into shared request construction without changing orchestration |
| `tests/fixtures/routing/` | create | Golden and control scenarios |
| `scripts/benchmark-routing.mjs` | create | Reproducible baseline timing collection |
| `.gitignore` / `artifacts/routing-rework/reports/` | modify/create | Separate ignored raw samples from tracked sanitized summaries |
| `tests/unit/` and `tests/components/planner-shell-geocoding.test.tsx` | modify | Contract and caller preservation coverage |

## Required Context

| File | Why |
|------|-----|
| `plans/routing-intelligence-rework/plan.md` | Locked behavior and performance budgets |
| `src/lib/ai/ride-intent.ts` | Current local/OpenRouter intent behavior |
| `src/lib/planner/ride-plan-request.ts` | Current destination-duration loss |
| `src/lib/routing/types.ts` | Public route request/result types |
| `src/lib/routing/planner.ts` | Trip-plan response and comparison behavior |
| `tests/unit/ride-intent.test.ts` | Existing parser expectations |
| `tests/unit/ride-plan-request.test.ts` | Existing request-construction expectations that intentionally change |

## Implementation Steps

### Step 1: Record the baseline safely

- **What**: Capture service health, exact golden parse, direct route, `compare:true`, loop, and long-route timings with provider call counts.
- **Where**: New benchmark script, ignored `artifacts/routing-rework/raw/`, and tracked sanitized summary under `artifacts/routing-rework/reports/`.
- **Why**: Later phases need measured improvement rather than anecdotal timing.
- **Considerations**: Do not restart services; do not print credentials; distinguish cold from warm runs.

### Step 2: Extend the intent contract

- **What**: Add explicit ride character, destination time target, toll policy, and local-parser confidence/ambiguity without removing existing fields.
- **Where**: `src/lib/ai/ride-intent.ts` and its tests.
- **Why**: "Fun" and the two-hour destination target must survive every layer.
- **Considerations**: Default `fun` to maximum twisties; explicit quick/scenic/adventure language still wins; explicit avoid-tolls maps to `avoid`.

### Step 3: Extend routing contracts with compatibility defaults

- **What**: Add `candidateSet`, destination `targetMinutes`, `tollPolicy`, route evidence, timing metadata, and the exact `planningId`/sampled-primary progressive wire contract defined in the high-level plan.
- **Where**: `src/lib/routing/types.ts`, `src/lib/routing/planner.ts`, and API validation.
- **Why**: Parallel agents need one stable contract.
- **Considerations**: Old saved routes and API callers must remain readable; optional fields default to primary/allow-with-warning behavior. Alternative requests carry at most 128 sampled primary coordinates and remain stateless across cache misses.

### Step 4: Preserve complete planner intent

- **What**: Make free-text and manual request assembly share one preference-complete input path.
- **Where**: `src/lib/planner/ride-plan-request.ts` and caller-facing option types.
- **Why**: Free text currently omits bike, locks, avoid areas, and duration.
- **Considerations**: Do not yet change runtime orchestration or clear-via behavior beyond contract preservation.

### Step 5: Add fixtures and contract assertions

- **What**: Add Hatboro→Stockton plus direct, loop, toll, avoid-area, and road-lock fixtures.
- **Where**: `tests/fixtures/routing/` and focused unit tests.
- **Why**: Later packages need deterministic inputs.
- **Considerations**: Assert Phase 1 contract behavior only; mark future geographic/performance expectations as evaluator metadata, not passing assertions.

## Testing Plan

| Test Type | What to Test | Expected Outcome |
|-----------|-------------|-----------------|
| Unit | Exact golden prompt and parser precedence | Destination, 120 minutes, fun/max-twisties, allow-with-warning |
| Unit | Request assembly | Duration and all manual preferences are preserved |
| Contract | Old route/request fixtures | Continue validating with compatibility defaults |
| Diagnostic | Benchmark script | Produces per-stage timings and provider counts |

Primary verify command:

```bash
npm test -- --run tests/unit/ride-intent.test.ts tests/unit/ride-plan-request.test.ts tests/unit/api-handlers.test.ts && npm run typecheck && git diff --check
```

### Test Integrity Constraints

- Update the destination request test that currently expects `targetMinutes` to be discarded; this is an intentional behavior correction.
- Do not weaken existing destination, loop, highway-avoidance, road-lock, or avoid-area assertions.
- Benchmark thresholds are not enforced until Phase 7; Phase 1 records reality.

## Rollback Strategy

Revert the Phase 1 contract commit as one unit. No graph, service, or persistent-data changes occur in this phase.

## Open Decisions

| Decision | Options | Chosen | Rationale |
|----------|---------|--------|-----------|
| `fun` behavior | balanced/scenic/maximum twisties | maximum twisties | User decision |
| Destination target tolerance | ceiling/±15 min/±10% | ±10% | User decision |
| Toll default | avoid/forbid/allow with warning | allow with warning | User decision |
| Progressive transport | stream/separate modes | separate `candidateSet` calls | Lower CDN/client complexity and isolates primary latency |

## Reality Check

### Code Anchors Used

| File | Symbol/Area | Why it matters |
|------|-------------|----------------|
| `src/lib/ai/ride-intent.ts` | `parseRidePromptLocally` | Parses 120 minutes but currently defaults unknown "fun" to Scenic |
| `src/lib/planner/ride-plan-request.ts` | `buildRideTripRequest` | Destination branch currently drops target minutes |
| `src/components/planner/usePlannerRideIntent.ts` | prompt request construction | Currently omits several manual preferences |
| `src/components/planner/PlannerShell.tsx` | manual plan request construction | Source of bike, locks, avoid areas, via, and segment preferences to preserve |
| `src/lib/routing/planner.ts` | `TripPlanRequest`, `TripPlan` | Shared server/client route contract |

### Mismatches / Notes

- The current live exact prompt uses the local parser because no working remote interpretation is required.
- Current repository status already contains a modified `next-env.d.ts`; preserve it.
