---
type: planning
entity: todo
plan: "routing-intelligence-rework"
updated: "2026-07-22"
---

# Todo: Switchback Routing Intelligence Rework

> Tracking [Switchback Routing Intelligence Rework](plan.md)

## Active Phase: 7 - Integration, Release, and Live Golden Verification

### Phase Context

- **Scope**: [Phase 7](phases/phase-7.md)
- **Implementation**: [Phase 7 Plan](implementation/phase-7-impl.md)
- **Latest Handover**: `handovers/phase-7-release-readiness.md`
- **Relevant Docs**: `README.md`, `docs/CLOSURE-REALITY-2026-07-21.md`, `docs/LEAD-DECISIONS.md`

### Pending (release gate — authorized lead + ≥6 GB RAM host required)

- [ ] Build/validate the Phase 3 candidate cache on a ≥6 GB RAM host (`import-candidate phase3-toll` → `validate-candidate`), then swap. <!-- added: 2026-08-03 -->
- [ ] Deploy the merged app; run e2e + live benchmark p95 gates + live golden route. <!-- added: 2026-08-03 -->
- [ ] Phase 4 follow-up: tune corridor anchor generation if the golden route still trips the gates. <!-- added: 2026-08-03 -->
- [ ] Authorized merge of `routing-rework/integration` → release branch and push. <!-- added: 2026-08-03 -->

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
- [x] Phase 6: unified planner lifecycle state (interpreting → geocoding → routing-primary → alternatives → ready/cancelled/error). <!-- completed: 2026-08-03 -->
- [x] Phase 6: previous route retained and dimmed during replan; restored on cancel/failure. <!-- completed: 2026-08-03 -->
- [x] Phase 6: omnibox progress status with elapsed time + Cancel, accessible live region, mobile/minimized compatible. <!-- completed: 2026-08-03 -->
- [x] Phase 6: lifecycle/merge/retention/accessibility tests; full verification and commit on the integration branch. <!-- completed: 2026-08-03 -->
- [x] Phase 7 prep: full verify pipeline (lint/typecheck/tests/build) green; live smoke of the NEW build on a spare port recorded in `handovers/phase-7-release-readiness.md`. <!-- completed: 2026-08-03 -->
- [x] Phase 5→4 merge step: background adviser-hint refresh from the alternatives flow + local cache read into Phase 4 anchor sets. <!-- completed: 2026-08-03 -->

### Blocked

- [ ] None.

## Changelog

### 2026-07-22

- Initialized execution tracking at Phase 1.
