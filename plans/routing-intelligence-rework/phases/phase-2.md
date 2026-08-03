---
type: planning
entity: phase
plan: "routing-intelligence-rework"
phase: 2
status: completed
created: "2026-07-22"
updated: "2026-08-03"
---

# Phase 2: Fast Primary-Route Pipeline

> Part of [routing-intelligence-rework](../plan.md)

## Objective

Make the primary online route fast, cancellable, and independent of alternatives, enrichment, external research, and offline work.

## Scope

### Includes

- Primary-versus-alternatives server orchestration.
- Provider abort propagation and latest-request cancellation.
- Bounded route-job concurrency and short-lived normalized caching.
- Background comparison and enrichment boundaries.
- Primary-route performance instrumentation.

### Excludes (deferred to later phases)

- New corridor/scoring algorithm.
- Graph encoded-value changes or production graph swap.
- You.com implementation.
- Planner visual progress treatment.

## Prerequisites

- [ ] Phase 1 contracts are merged.
- [ ] Baseline timings and provider call counts are recorded.

## Deliverables

- [ ] Primary route returns without waiting for comparison profiles or enrichment.
- [ ] Alternatives return separately, maximum two, under concurrency one and a 12-second deadline.
- [ ] Browser/API/provider cancellation is wired end to end.
- [ ] Cache and concurrency behavior are covered by tests and metrics.

## Acceptance Criteria

- [ ] Direct primary-route API p95 ≤2.5 seconds on the micro-PC.
- [ ] Alternatives, elevation, PASDA, Valhalla comparison, and You.com cannot delay primary success.
- [ ] New prompt, clear, or replan aborts obsolete provider work.
- [ ] Online planning never invokes the offline worker or corridor-pack extraction.
- [ ] Existing avoid-area, road-lock, round-trip, and segmented-route tests remain green.

## Dependencies on Other Phases

| Phase | Relationship | Notes |
|-------|-------------|-------|
| 1 | blocked-by | Shared contracts and fixtures |
| 3 | parallel | Graph changes can proceed separately after Phase 1 |
| 4 | blocks | Corridor generation uses the primary pipeline |
| 6 | blocks | UI consumes the progressive API behavior |

## Notes

The latest-request gate currently suppresses stale repainting but does not stop provider work. Cancellation is complete only when the provider request receives an abort signal.
