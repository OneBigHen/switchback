# Traceability Matrix

**Updated:** 2026-08-05 (baseline)

| Requirement | Current files | New/changed files | Unit test | Integration/E2E | Status | Evidence |
|---|---|---|---|---|---|---|
| Normalized route request | `src/lib/routing/types.ts`, `planner.ts` | `src/domain/...` | pending | pending | Not started | |
| Eligibility before ranking | `src/lib/routing/route-quality.ts` (gates) | `src/domain/routing/eligibility.ts` | pending | pending | Not started | |
| Segmented propagation | `src/lib/routing/planner.ts:209-219` (drops bike/locks/toll) | same | pending | pending | Not started | |
| Timebox fallback wording | `planner.ts:727-738` ("closest safe route") | same | pending | pending | Not started | |
| Sticky explicit selection | `PlannerShell.tsx:264-278` (re-ranks on routes change) | `PlannerSessionController` | pending | pending | Not started | |
| Must-road traversal | `graphhopper.ts:165-170` (zero priority), `road-locks.ts` | Phase 2 rewrite | pending | pending | Not started | |
| Prefer bounded bonus | `graphhopper.ts:172-177` (0.625 penalty) | Phase 2 rewrite | pending | pending | Not started | |
| Road graph matching | missing (`road-match-request.ts` client-side) | `/api/road-matching` | pending | pending | Not started | |
| Rematch/drift review | `road-locks.ts:356-405` (rematch exists) | wire UI + graph version | pending | pending | Partial | |
| Free Ride direction | `free-ride.ts:104-149` (heading unused) | Phase 6 | pending | pending | Not started | |
| Free Ride synthetic claims | `handler.ts:67-92` | Phase 0 flag/labels; Phase 6 rewrite | pending | pending | Not started | |
| Share redaction | `route-share.ts:72-85` (geometry+waypoints only) | Phase 2 | pending | pending | Not started | |
| Offline large download | `RegionDownloadsPanel.tsx:310-349` (recursive confirm) | Phase 3 | pending | pending | Not started | |
| Offline reroute | `src/lib/offline/v2-router.ts` | Phase 3 E2E | pending | pending | Partial (unit only) | |
| Signed learning | `rider-preferences.ts:84-93` (averages dislikes) | Phase 6 | pending | pending | Not started | |
| Stable bike identity | `rider-preference-library.ts:22-46` (name key) | `RiderSettings` | pending | pending | Not started | |
| Mobile flow (Search→Choose→Edit→Prepare) | `PlannerDeck.tsx` | Phase 5 | pending | pending | Not started | |
| Desktop editor (three-pane) | `MapStage.tsx` | Phase 5 | pending | pending | Not started | |
| Migration (versioned storage) | `trip-plan-migration.ts` (partial) | Phase 4 | pending | pending | Partial | |
| Physical iPhone | none | `PHYSICAL_DEVICE_RESULTS.md` | — | manual | Not started | |

## P0 backlog items → phase mapping

| Backlog | Phase | Disposition |
|---|---|---|
| SB-001 Normalize route requests | 1 | |
| SB-002 Eligibility before ranking | 1 | |
| SB-003 Segmented propagation | 1 | |
| SB-004 Timebox fallback/wording | 1 | |
| SB-005 Preserve explicit selection | 1 | |
| SB-006 Disable placeholder Must | 0 | In progress |
| SB-007 Replace manual snapping placeholder | 0 (label) / 2 (matching) | |
| SB-008 Fix share instruction leakage | 2 | |
| SB-009 Fix large-download confirmation | 3 | |
| SB-010 Correct negative learning | 6 | |
| SB-011 Stable bike identity | 4 | |
| SB-012 Remove misleading Free Ride claims | 0 | In progress |
| SB-013..016 Road matching/traversal/prefer/rematch | 2 | |
| SB-017..020 Offline downloads/activation/caches/readiness | 3 | |
| SB-021..024 Modularization/settings/migrations | 4 | |
| SB-025..028 Mobile flow/desktop/confirmations/diagnostics | 5 | |
| SB-029..034 Free Ride graph-backed/learning/calibration/fuel | 6 | |
| SB-035..036 Physical iPhone/release evidence | 7 | |
