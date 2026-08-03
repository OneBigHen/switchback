---
type: planning
entity: implementation-plan
plan: "routing-intelligence-rework"
phase: 4
status: draft
created: "2026-07-22"
updated: "2026-07-22"
---

# Implementation Plan: Phase 4 - Timeboxed Destination Corridors and Scoring

> Implements [Phase 4](../phases/phase-4.md) of [routing-intelligence-rework](../plan.md)

## Approach

Replace unconstrained provider alternatives with an explicit two-stage destination planner: calculate the direct baseline, then generate a small set of evidence-backed shaping corridors inside a time-derived envelope. Apply hard safety/relevance gates before a normalized maximum-twisties score.

## Affected Modules

| Module | Change Type | Description |
|--------|-------------|-------------|
| `src/lib/routing/planner.ts` | modify | Destination timebox orchestration |
| `src/lib/routing/scoring.ts` | modify | Stable curvature/twistiness and overlap components |
| `src/lib/routing/destination-corridors.ts` | create | Envelope, anchor, feedback, and candidate bounds |
| `src/lib/routing/route-quality.ts` | create | Hard gates, weighted score, and explanations |
| `src/lib/curvature/repository.ts` | modify | Corridor-oriented bounded queries |
| `src/lib/gpx/route-geometry.ts` | create | Load full imported GPX route geometry with unavailable fallback |
| `src/lib/routing/reference/pa-nj-boundaries.geojson` | create | Tracked simplified state boundaries with source metadata |
| `tests/fixtures/routing/philadelphia-rejection.geojson` | create | Golden-only geographic rejection boundary |
| `tests/unit/` and `tests/integration/` routing quality suites | create/modify | Gates, scoring, corridor, GPX, and golden behavior |

## Required Context

| File | Why |
|------|-----|
| `src/lib/routing/planner.ts` | Current selection and round-trip feedback patterns |
| `src/lib/routing/scoring.ts` | Current geometry metric can saturate on noisy routes |
| `src/lib/curvature/repository.ts` | Existing high-curvature SQLite evidence |
| `src/app/api/gpx-library/handler.ts` | Resolves imported route IDs to full route JSON with geometry under `data/gpx-library/routes/` |
| `src/lib/routing/types.ts` | Phase 1 contracts and Phase 3 evidence fields |
| `tests/fixtures/routing/` | Golden and control scenarios |

## Implementation Steps

### Step 1: Calculate baseline and feasibility

- **What**: Request one direct requested-profile route and compare its duration to the destination target.
- **Where**: New destination-planning helper called from primary orchestration.
- **Why**: The planner needs to know how much enjoyable detour time is available.
- **Considerations**: If direct duration exceeds 110% of target, return the closest safe route with a target warning; do not invent a faster scenic detour.

### Step 2: Build a bounded corridor envelope

- **What**: Estimate target distance as `direct miles × target minutes ÷ direct minutes`, then apply the locked envelope: anchor path-distance sum ≤105% of estimated target-distance, and lateral deviation ≤`min(40 miles, max(8 miles, 35% of target-distance))`.
- **Where**: `destination-corridors.ts` pure functions.
- **Why**: Prevent Philadelphia-scale or opposite-direction detours.
- **Considerations**: Endpoints remain fixed; anchor candidates outside the envelope or requiring obvious backtracking are discarded.

### Step 3: Produce and validate shaping-anchor sets

- **What**: Rank local curvature segments and full imported GPX route geometries loaded from `data/gpx-library/routes/<id>.json`, then merge source-backed/geocoded Phase 5 hints; apply final envelope and GraphHopper routability validation and produce at most four anchor sets.
- **Where**: Corridor-source adapters and candidate builder.
- **Why**: Provider alternatives alone have no knowledge of the requested ride duration or desired corridor.
- **Considerations**: De-duplicate nearby anchors, require routable matches, cap anchors per candidate, and never accept adviser geometry. If GPX manifest/files are unavailable, continue with curvature and validated hints and report `gpxEvidence: unavailable` rather than failing routing.

### Step 4: Route candidates with one feedback pass

- **What**: Route at most four candidates through the Phase 2 priority semaphore, using no more than two concurrent GraphHopper calls under one shared six-second deadline; if all miss tolerance, adjust the best corridor once using measured duration.
- **Where**: Destination planner orchestration.
- **Why**: Match 108–132 minutes without retry explosions.
- **Considerations**: Abort signal and the original six-second primary deadline apply to every active or queued candidate; queued work gets no fresh timeout.

### Step 5: Apply hard gates and maximum-twisties score

- **What**: Apply the locked gates (90–110% target, ≤15% immediate backtracking, ≤20% self-overlap, envelope, legal/bike checks), simplify geometry at 25 meters, count 15°–120° turns on ≥40-meter segments, then apply the exact component formulas and toll/state-transition penalties from the high-level plan.
- **Where**: `route-quality.ts`.
- **Why**: A candidate cannot compensate for irrelevance or unsafe behavior with a large curve score.
- **Considerations**: Toll is `-15` per distinct interval capped at `-30`, not a hard rejection under `allow-with-warning`; explicit avoid-tolls is hard. Use tracked simplified PA/NJ boundary GeoJSON with source metadata to count state transitions; minimum is zero for same-state and one for opposite-state endpoints, with `-20` per extra transition.

### Step 6: Generate route explanations

- **What**: Populate evidence and concise reasons such as target accuracy, high-curvature miles, backroad share, toll warning, and researched/GPX corridor support.
- **Where**: PlannedRoute normalization/presentation fields.
- **Why**: Riders need to understand why a route is considered fun.
- **Considerations**: Explanations must derive from measured fields, not model prose.

## Testing Plan

| Test Type | What to Test | Expected Outcome |
|-----------|-------------|-----------------|
| Unit | Envelope and anchor selection | Bounded, deterministic, no out-of-corridor anchors |
| Unit | Smoothed twistiness | Straight/noisy geometry cannot saturate; real curves score higher |
| Unit | Gates and score | Duration, toll, urban, overlap, surface, and crossing priorities are enforced |
| Golden | Hatboro→Stockton | 108–132 minutes, non-Philadelphia, Upper Bucks/Delaware family |
| Control | Direct/loop/cross-state routes | No regression or route-specific overfit |
| Live benchmark | Timeboxed primary | p95 ≤5 seconds on candidate graph |

Primary verify command:

```bash
npm test -- --run tests/unit/planner.test.ts tests/unit/graphhopper.test.ts tests/unit/curvature.test.ts tests/unit/route-quality.test.ts tests/integration/timeboxed-destination-routing.test.ts && npm run typecheck && git diff --check
```

### Test Integrity Constraints

- Do not hardcode a specific list of street names as the only passing golden route; use a tracked Philadelphia rejection polygon and simplified PA/NJ boundaries to assert corridor/geographic/evidence properties.
- Do not lower the ±10% target tolerance to make fixtures pass.
- The golden case may not pass through the general closest-safe-route warning fallback; it must produce 108–132 minutes.
- Keep loop timebox tests intact; destination logic must not reuse loop-only assumptions blindly.

## Rollback Strategy

Revert the Phase 4 merge commit. Phase 2 continues to provide a fast direct primary route under the shared Phase 1 contract.

## Open Decisions

| Decision | Options | Chosen | Rationale |
|----------|---------|--------|-----------|
| Candidate count | unlimited/4/6 | maximum 4 | Enough corridor diversity within host budget |
| Refinement | none/1/until match | maximum 1 | Prevent multi-minute retry loops |
| Score priority | scenic/balanced/maximum twisties | maximum twisties | User decision |
| Toll | exclude/neutral/penalize | strong penalty and disclosure | User allows tolls with warning |
| Score/envelope thresholds | worker-calibrated/fixed defaults | fixed defaults in `plan.md` | Prevent agents from inventing incompatible quality targets |

## Reality Check

### Code Anchors Used

| File | Symbol/Area | Why it matters |
|------|-------------|----------------|
| `src/lib/routing/planner.ts` | `selectedCandidateScore` | Scenic/Twisty scoring lacks duration, toll, urban, and detour controls |
| `src/lib/routing/scoring.ts` | `analyzeGeometry` | Current metric can overcount small bearing changes |
| `src/lib/curvature/repository.ts` | `queryBounds` | Local curvature data exists but is only exposed as a map overlay |
| `src/lib/planner/ride-plan-request.ts` | destination branch | Phase 1 changes make target available to this algorithm |

### Mismatches / Notes

- Current `alternative_route.max_weight_factor=1.8` can create irrelevant candidates; timeboxed corridors should use explicit anchors and ordinary path calculation.
- The exact live direct Hatboro→Stockton scenic route is roughly 47 minutes, confirming that a 120-minute request requires deliberate shaping.
- `src/lib/gpx/catalog.ts` contains summaries only; full geometry must be loaded from imported per-route JSON and routing must degrade cleanly when those files are absent.
