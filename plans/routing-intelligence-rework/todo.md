---
type: planning
entity: todo
plan: "routing-intelligence-rework"
updated: "2026-07-22"
---

# Todo: Switchback Routing Intelligence Rework

> Tracking [Switchback Routing Intelligence Rework](plan.md)

## Active Phase: 3 - GraphHopper Toll and Fast-Path Correctness

### Phase Context

- **Scope**: [Phase 3](phases/phase-3.md)
- **Implementation**: [Phase 3 Plan](implementation/phase-3-impl.md)
- **Latest Handover**: None yet; create under `handovers/` when pausing.
- **Relevant Docs**: `README.md`, `docs/CLOSURE-REALITY-2026-07-21.md`, `docs/LEAD-DECISIONS.md`

### Pending

- [ ] GraphHopper toll and fast-path encoded values, profiles, and re-import with rollback cache. <!-- added: 2026-07-22 -->
- [ ] You.com corridor adviser package (Phase 5) from the Phase 1/2 integration commit. <!-- added: 2026-07-22 -->

### In Progress

- [ ] None.

### Completed

- [x] Routing audit and user-facing decisions completed. <!-- completed: 2026-07-22 -->
- [x] High-level plan, phase gates, implementation plans, and orchestration guide created. <!-- completed: 2026-07-22 -->
- [x] Record the clean baseline commit and preserve unrelated working-tree changes. <!-- completed: 2026-08-03 -->
- [x] Capture direct, timeboxed, loop, and free-text live timings. <!-- completed: 2026-08-03 -->
- [x] Add locked shared intent, request, response, evidence, and progress contracts. <!-- completed: 2026-08-03 -->
- [x] Add Hatboro→Stockton and PA/NJ golden fixtures without asserting unimplemented behavior. <!-- completed: 2026-08-03 -->
- [x] Verify Phase 1 and commit the integration baseline. <!-- completed: 2026-08-03 -->
- [x] Phase 2: primary route returns before comparison/enrichment work. <!-- completed: 2026-08-03 -->
- [x] Phase 2: alternatives return separately (max two, concurrency one, 12s deadline). <!-- completed: 2026-08-03 -->
- [x] Phase 2: cancellation wired end to end (client → handler → planner → providers). <!-- completed: 2026-08-03 -->
- [x] Phase 2: bounded route-job limiter and 10-minute primary cache covered by tests. <!-- completed: 2026-08-03 -->
- [x] Phase 2: focused + full verification and commit on the integration branch. <!-- completed: 2026-08-03 -->

### Blocked

- [ ] None.

## Changelog

### 2026-07-22

- Initialized execution tracking at Phase 1.
