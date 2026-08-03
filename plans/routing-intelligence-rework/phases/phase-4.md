---
type: planning
entity: phase
plan: "routing-intelligence-rework"
phase: 4
status: pending
created: "2026-07-22"
updated: "2026-07-22"
---

# Phase 4: Timeboxed Destination Corridors and Scoring

> Part of [routing-intelligence-rework](../plan.md)

## Objective

Generate relevant maximum-twisties A-to-B routes that honor a requested duration instead of selecting arbitrary provider alternatives.

## Scope

### Includes

- Direct baseline and time-budget feasibility calculation.
- Bounded corridor envelope and shaping-anchor generation.
- Curvature database, known-good GPX, and validated adviser hint inputs.
- One normalized multi-objective quality score with rider-facing evidence.
- Duration feedback with at most four candidates and one refinement pass.
- Geographic, backtracking, toll, urban, highway, surface, and crossing constraints.

### Excludes (deferred to later phases)

- You.com transport/HTTP adapter.
- Loading UI.
- Graph import or production deployment.

## Prerequisites

- [ ] Phases 2 and 3 are integrated.
- [ ] Graph route details required by scoring are proven available.
- [ ] Golden and control fixtures from Phase 1 are stable.

## Deliverables

- [ ] Destination-timebox planner and corridor-source interfaces.
- [ ] Corrected twistiness/curvature metrics.
- [ ] Hard-rejection and weighted-ranking pipeline.
- [ ] Evidence-backed route explanations.
- [ ] Golden and generalized route-quality tests.

## Acceptance Criteria

- [ ] Hatboro→Stockton produces a safe 108–132-minute route; an impossibility warning does not pass this known-feasible golden case.
- [ ] The selected golden route stays outside Philadelphia and favors the Upper Bucks/Delaware family.
- [ ] No unnecessary PA/NJ recrossing is selected.
- [ ] Artificial geometry noise cannot earn a perfect twistiness score.
- [ ] Toll routes are penalized and disclosed, not silently removed.
- [ ] No request evaluates more than four initial corridors or more than one refinement pass.
- [ ] Timeboxed destination primary-route API p95 ≤5 seconds on the micro-PC.

## Dependencies on Other Phases

| Phase | Relationship | Notes |
|-------|-------------|-------|
| 2 | blocked-by | Uses fast primary orchestration |
| 3 | blocked-by | Uses toll/urban/curvature details |
| 5 | parallel/consumes | Adviser hints are optional inputs |
| 6 | blocks | UI displays route evidence and target status |

## Notes

External hints can add candidates but cannot bypass envelope, legal, bike, duration, or scoring checks.
