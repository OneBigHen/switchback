---
type: planning
entity: todo
plan: "routing-intelligence-rework"
updated: "2026-07-22"
---

# Todo: Switchback Routing Intelligence Rework

> Tracking [Switchback Routing Intelligence Rework](plan.md)

## Active Phase: 4 - Timeboxed Destination Corridors and Scoring

### Phase Context

- **Scope**: [Phase 4](phases/phase-4.md)
- **Implementation**: [Phase 4 Plan](implementation/phase-4-impl.md)
- **Latest Handover**: `handovers/phase-3-graph-audit.md`
- **Relevant Docs**: `README.md`, `docs/CLOSURE-REALITY-2026-07-21.md`, `docs/LEAD-DECISIONS.md`

### Pending

- [ ] Build and validate the Phase 3 candidate graph cache on a host with ≥6 GB free RAM (`scripts/graphhopper.sh import-candidate phase3-toll` then `validate-candidate`). <!-- added: 2026-08-03 -->
- [ ] Phase 3 live acceptance: toll/road-environment/urban-density evidence on real routes, fast-path timing, avoid-area/lock regressions. <!-- added: 2026-08-03 -->
- [ ] Phase 5 You.com corridor adviser package (independent; may run in parallel). <!-- added: 2026-08-03 -->

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
- [x] Phase 3: toll encoded value + persistent profile toll penalty; request-time toll avoidance rule. <!-- completed: 2026-08-03 -->
- [x] Phase 3: inert (0,0) request-time region masks removed; region policy documented as reference intent. <!-- completed: 2026-08-03 -->
- [x] Phase 3: toll/road-environment/urban-density evidence returned and normalized. <!-- completed: 2026-08-03 -->
- [x] Phase 3: side-by-side import/validate/swap script support + graph resource audit handover. <!-- completed: 2026-08-03 -->
- [x] Phase 3: focused + full verification and commit on the integration branch. <!-- completed: 2026-08-03 -->

### Blocked

- [ ] None.

## Changelog

### 2026-07-22

- Initialized execution tracking at Phase 1.
