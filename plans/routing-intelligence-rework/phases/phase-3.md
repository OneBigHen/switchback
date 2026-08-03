---
type: planning
entity: phase
plan: "routing-intelligence-rework"
phase: 3
status: pending
created: "2026-07-22"
updated: "2026-07-22"
---

# Phase 3: GraphHopper Toll and Fast-Path Correctness

> Part of [routing-intelligence-rework](../plan.md)

## Objective

Make the installed graph expose the road attributes needed for motorcycle quality scoring while preserving GraphHopper's prepared fast path and a safe cache rollback.

## Scope

### Includes

- `toll` encoded value and required route details.
- Persistent Fun/Twisty, Scenic, Quick, and Adventure custom-profile tuning.
- Removal of inert `(0,0)` request-time region masks.
- LM/preparation verification and performance comparison.
- Side-by-side graph build, validation, swap plan, and rollback cache.

### Excludes (deferred to later phases)

- Route candidate scoring implementation.
- You.com, free-text, or UI changes.
- Offline-region graph schema changes.

## Prerequisites

- [ ] Phase 1 contracts are merged.
- [ ] Available disk, RAM, active graph size, and expected import time are recorded.
- [ ] A rollback path for the active graph cache is agreed before import.

## Deliverables

- [ ] Graph configuration and persistent models with toll/urban/curvature behavior.
- [ ] Rebuilt graph cache produced beside the active cache.
- [ ] Focused route-detail, profile, avoid-area, and road-lock evidence.
- [ ] Atomic swap and rollback instructions.

## Acceptance Criteria

- [ ] Live results include toll, road-environment, urban-density, and curvature evidence.
- [ ] Ordinary requests use the prepared fast path and no fake regional geometry.
- [ ] Toll routes remain eligible and detectable.
- [ ] User-specific avoid areas, locks, and bike exclusions still work.
- [ ] Every profile starts and routes the golden/control endpoints.
- [ ] Old graph cache remains recoverable through Phase 7.

## Dependencies on Other Phases

| Phase | Relationship | Notes |
|-------|-------------|-------|
| 1 | blocked-by | Evidence contract must exist |
| 2 | parallel | Both branch after Phase 1 |
| 4 | blocks | Scoring requires graph details |
| 7 | blocks | Release gate performs final cache swap |

## Notes

Do not overwrite the active graph cache during worker implementation. Phase 7 owns the production swap.
