---
type: planning
entity: phase
plan: "routing-intelligence-rework"
phase: 1
status: completed
created: "2026-07-22"
updated: "2026-08-03"
---

# Phase 1: Contracts, Baseline, and Golden Fixtures

> Part of [routing-intelligence-rework](../plan.md)

## Objective

Establish one decision-complete contract and measured baseline so later agents can work independently without inventing incompatible request shapes or performance claims.

## Scope

### Includes

- Shared intent, route request, progressive result, evidence, and progress-state contracts.
- Destination duration and `fun` semantics.
- Toll-policy representation.
- Abort-signal interface boundaries.
- Reproducible baseline timing and golden-route fixtures.
- Preservation of existing manual planner preferences in free-text request assembly.

### Excludes (deferred to later phases)

- Changing route orchestration or provider concurrency.
- GraphHopper configuration or graph import.
- Implementing corridor generation, You.com research, or loading UI.
- Changing live services.

## Prerequisites

- [ ] Confirm current branch/status and record the existing `next-env.d.ts` modification.
- [ ] Confirm local app, GraphHopper, and Valhalla health without restarting them.
- [ ] Read the high-level plan and agent execution guide.

## Deliverables

- [ ] Versioned shared contracts with compatibility defaults.
- [ ] Exact golden prompt fixture and control-route inventory.
- [ ] Baseline benchmark artifact with per-stage timings.
- [ ] Phase 2/3/5 branch point committed to the integration branch.

## Acceptance Criteria

- [ ] `2 hour fun ride from Hatboro to Stockton NJ` retains destination, 120 minutes, and maximum-twisties intent through request construction.
- [ ] Toll policy defaults to `allow-with-warning` and accepts explicit avoidance.
- [ ] Manual and free-text request builders preserve the same bike/lock/avoid/via preferences.
- [ ] Existing behavior remains functional; new tests describe contracts without pretending later routing behavior exists.
- [ ] Focused tests, typecheck, and diff checks pass.

## Dependencies on Other Phases

| Phase | Relationship | Notes |
|-------|-------------|-------|
| 2 | blocks | Primary pipeline uses these contracts |
| 3 | blocks | Graph details must map into the evidence contract |
| 5 | blocks | Adviser output must match corridor-hint contracts |
| 6 | blocks | UI state machine uses the progress contract |

## Notes

This phase is lead-owned. Do not delegate shared type decisions to GLM.
