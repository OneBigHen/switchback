---
type: planning
entity: implementation-plan
plan: "routing-intelligence-rework"
phase: 3
status: draft
created: "2026-07-22"
updated: "2026-07-22"
---

# Implementation Plan: Phase 3 - GraphHopper Toll and Fast-Path Correctness

> Implements [Phase 3](../phases/phase-3.md) of [routing-intelligence-rework](../plan.md)

## Approach

Move ordinary regional/profile behavior into prepared persistent GraphHopper models, add routable toll evidence, and remove request-time fake region areas. Build a new graph beside the active cache and produce verification evidence; do not perform the production swap until Phase 7.

## Affected Modules

| Module | Change Type | Description |
|--------|-------------|-------------|
| `infra/graphhopper/config.yml` | modify | Encoded values, LM profiles, and graph paths |
| `infra/graphhopper/custom-models/` | modify | Toll, urban, highway, and profile preferences |
| `src/lib/routing/graphhopper.ts` | modify | Fast-path request model and new path details |
| `src/lib/routing/region-policy.ts` | modify | Remove or reframe nonfunctional request-time rules |
| `scripts/graphhopper.sh` | modify | Side-by-side import/validate/swap support |
| `tests/unit/graphhopper.test.ts`, `region-policy-overlay.test.ts`, `routes-api-wiring.test.ts` | modify | Request details, real region behavior, and compatibility coverage |

## Required Context

| File | Why |
|------|-----|
| `infra/graphhopper/config.yml` | Current graph, profiles_lm, encoded values, and timeout |
| `infra/graphhopper/custom-models/motorcycle-base.json` | Shared motorcycle restrictions |
| `infra/graphhopper/custom-models/prefer-curvature.json` | Existing curvature semantics |
| `src/lib/routing/graphhopper.ts` | Builds every request and fake region areas |
| `src/lib/routing/region-policy.ts` | Contains descriptive flags not fully implemented |
| `scripts/prepare-motorcycle-osm.mjs` | Input preparation and re-import implications |
| `scripts/graphhopper.sh` | Existing import/start workflow |

## Implementation Steps

### Step 1: Audit active graph resources and preparation

- **What**: Record current PBF/cache sizes, free disk/RAM, import duration history, active profile health, and LM availability.
- **Where**: Read-only system and GraphHopper checks; attach artifact to phase handover.
- **Why**: A safe re-import requires known capacity and rollback.
- **Considerations**: Stop before import if both old and new caches cannot coexist.

### Step 2: Add encoded values and persistent profile rules

- **What**: Register `toll`; retain `road_environment`, `urban_density`, and `curvature`; apply profile-specific toll/city/highway preferences in persistent custom models.
- **Where**: GraphHopper config and custom-model JSON.
- **Why**: Ordinary routing should use prepared profiles and return scorable evidence.
- **Considerations**: Toll remains eligible by default; explicit avoid-tolls remains a request-time zero-priority rule.

### Step 3: Remove inert regional request masks

- **What**: Stop adding `(0,0)` polygons and conditions to normal PA/NJ requests; retain only real rider-specific areas/locks.
- **Where**: `buildRegionOverlayRules`, `resolveRegionOverlaysForRequest`, and request builder tests.
- **Why**: Current regions never intersect the route and add substantial calculation cost.
- **Considerations**: Preserve valid GeoJSON FeatureCollection behavior for avoid areas and locks.

### Step 4: Return route evidence details

- **What**: Request and normalize toll, road environment, urban density, and curvature distributions/intervals.
- **Where**: GraphHopper request/response types and `normalizePath`.
- **Why**: Phase 4 needs edge-derived scoring rather than inference from route names.
- **Considerations**: Missing detail remains `unknown`, never falsely `no toll`.

### Step 5: Build and validate a candidate cache

- **What**: Import to a versioned candidate directory, start it on a nonproduction port, and run health, profile, golden endpoint, avoid-area, lock, and timing checks.
- **Where**: GraphHopper scripts and generated data outside git.
- **Why**: Prove compatibility before swap.
- **Considerations**: Preserve active cache unchanged; record exact candidate/rollback paths in handover.

## Testing Plan

| Test Type | What to Test | Expected Outcome |
|-----------|-------------|-----------------|
| Unit | Request builder | No fake region area; real avoid/lock areas retained |
| Unit | Normalization | Toll/urban/environment/curvature evidence correctly normalized |
| Config | GraphHopper startup | All profiles and LM preparation load candidate cache |
| Live candidate | Golden/control routes | Successful and materially faster ordinary requests |
| Live candidate | Avoid areas and locks | Geometry respects explicit constraints |

Primary verify command:

```bash
npm test -- --run tests/unit/graphhopper.test.ts tests/unit/region-policy-overlay.test.ts tests/unit/routes-api-wiring.test.ts && npm run typecheck && node scripts/validate-curvature-live.mjs && git diff --check
```

### Test Integrity Constraints

- Replace tests that only assert fake region IDs with coordinate/evidence tests proving actual behavior.
- Preserve legal underscore-safe avoid-area ID and FeatureCollection assertions.
- Do not make unknown toll data appear toll-free in fixtures.

## Rollback Strategy

Code/config rollback is the Phase 3 merge revert. Runtime rollback points GraphHopper back to the untouched active cache; candidate cache is removed only after Phase 7 approval.

## Open Decisions

| Decision | Options | Chosen | Rationale |
|----------|---------|--------|-----------|
| Toll encoding | infer/name/GraphHopper `toll` | GraphHopper `toll` | Official encoded value and custom-model support |
| Region behavior | fake areas/real polygons/persistent+post-score | persistent profile rules plus Phase 4 post-score | Fast and general without large request models |
| Production cache swap | worker/Phase 7 | Phase 7 only | Central rollback and live verification authority |

## Reality Check

### Code Anchors Used

| File | Symbol/Area | Why it matters |
|------|-------------|----------------|
| `infra/graphhopper/config.yml` | `profiles_lm`, `graph.encoded_values` | LM exists; toll is absent |
| `src/lib/routing/graphhopper.ts` | `buildRegionOverlayRules` | Creates degenerate `(0,0)` polygons |
| `infra/graphhopper/custom-models/motorcycle-scenic.json` | profile priorities | Persistent rural/city preferences already exist |
| `infra/graphhopper/custom-models/prefer-curvature.json` | curvature rule | Curvature is represented as a GraphHopper encoded value |

### Mismatches / Notes

- Region-policy booleans currently claim behavior that is not translated into usable route rules; documentation/tests must reflect implemented behavior only.
- Graph re-import is mandatory after changing encoded values.
