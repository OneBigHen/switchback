---
type: planning
entity: todo
plan: "routing-intelligence-rework"
updated: "2026-07-22"
---

# Todo: Switchback Routing Intelligence Rework

> Tracking [Switchback Routing Intelligence Rework](plan.md)

## Active Phase: 6 - Planner Progress and Progressive Alternatives UX

### Phase Context

- **Scope**: [Phase 6](phases/phase-6.md)
- **Implementation**: [Phase 6 Plan](implementation/phase-6-impl.md)
- **Latest Handover**: None yet; create under `handovers/` when pausing.
- **Relevant Docs**: `README.md`, `docs/CLOSURE-REALITY-2026-07-21.md`, `docs/LEAD-DECISIONS.md`

### Pending

- [ ] Build/validate the Phase 3 candidate cache on a ≥6 GB RAM host (`import-candidate phase3-toll` → `validate-candidate`), then swap in Phase 7. <!-- added: 2026-08-03 -->
- [ ] Phase 3/4 live acceptance on the candidate graph: toll/road-environment/urban-density/curvature evidence, golden 108–132-minute route quality. <!-- added: 2026-08-03 -->
- [ ] Phase 4 follow-up: tune corridor anchor generation if the golden route still trips backtracking/self-overlap gates on the live graph. <!-- added: 2026-08-03 -->
- [ ] Phase 5 merge step: invoke the corridor adviser from the alternatives path (background, deadline-bounded) and feed validated hints into Phase 4 anchor sets. <!-- added: 2026-08-03 -->
- [ ] Phase 6: visible progress from prompt submission to primary route + progressive alternatives treatment. <!-- added: 2026-08-03 -->

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
- [x] Phase 4: corridor envelope, anchor bounds, and feasibility pure logic. <!-- completed: 2026-08-03 -->
- [x] Phase 4: hard gates + maximum-twisties score + smoothed metrics + PA/NJ boundary counting. <!-- completed: 2026-08-03 -->
- [x] Phase 4: destination-timebox orchestration (≤4 candidates, one refinement, closest-safe fallback). <!-- completed: 2026-08-03 -->
- [x] Phase 4: curvature/GPX corridor sources with graceful degradation + graceful detail retry. <!-- completed: 2026-08-03 -->
- [x] Phase 4: unit + mock-orchestration tests; live smoke against the running graph recorded in the handover. <!-- completed: 2026-08-03 -->
- [x] Phase 4: focused + full verification and commit on the integration branch. <!-- completed: 2026-08-03 -->
- [x] Phase 5: current You.com Search/Research transports (Research structured output, Search GET migration). <!-- completed: 2026-08-03 -->
- [x] Phase 5: strict corridor-hint schema, source preservation, geocoding validation, hallucination discard. <!-- completed: 2026-08-03 -->
- [x] Phase 5: 7-day SQLite cache (intent-keyed, degrade-safe) + bounded /api/ride-corridors endpoint. <!-- completed: 2026-08-03 -->
- [x] Phase 5: focused + full verification and commit on the integration branch. <!-- completed: 2026-08-03 -->

### Blocked

- [ ] None.

## Changelog

### 2026-07-22

- Initialized execution tracking at Phase 1.
