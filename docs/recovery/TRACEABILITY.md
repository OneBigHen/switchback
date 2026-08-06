# Traceability Matrix

**Updated:** 2026-08-06 (Phases 0–6 complete)

| Requirement | Current files | New/changed files | Unit test | Integration/E2E | Status | Evidence |
|---|---|---|---|---|---|---|
| Normalized constraints | `src/lib/routing/*` | `src/lib/domain/routing/normalized-request.ts` | routing-semantics | real-router 5/5 | Done (Phase 1) | fc77562 |
| Eligibility before ranking | `planner.ts`, `route-quality.ts` | `src/lib/domain/routing/eligibility.ts` | routing-semantics | real-router | Done (Phase 1) | fc77562 |
| Segmented propagation | `planner.ts` | same | planner.test (constraints) | — | Done (Phase 1) | fc77562 |
| Timebox fallback wording | `planner.ts` | same | timeboxed-destination | live golden 3/3 | Done (Phase 0/1) | 0d67d9a |
| Sticky explicit selection | `planner-store.ts`, `PlannerShell.tsx` | same | planner-store (SB-005) | — | Done (Phase 1) | fc77562 |
| Must-road ordered traversal | `graphhopper.ts` | `expandMustLockWaypoints` | graphhopper-lock-request (SB-014) | road-lock e2e | Done (SB-014) | — |
| Prefer bounded bonus | `graphhopper.ts` | `buildPreferLockRules` (inside reward) | graphhopper-lock-request (SB-015) | road-lock e2e | Done (SB-015) | — |
| Road graph matching | — | `src/lib/roads/road-matching.ts`, `/api/road-matching`, `road-match-client.ts` | road-matching (4), road-match-client | live probe + road-lock e2e | Done (SB-013) | 01cef8f |
| Rematch/drift review | `road-locks.ts` (rematch exists) | UI wiring pending | road-locks | — | Partial (SB-016) | |
| Free Ride direction | `free-ride.ts` | same | free-ride-recommendation (SB-030) | free-ride e2e | Done (SB-030) | 537e2f3 |
| Free Ride synthetic claims | `handler.ts` | Phase 0 labels | free-ride tests | e2e | Contained (SB-012 copy) | 0d67d9a |
| Share redaction | `route-share.ts` | same | route-share (22) | — | Done (SB-008) | 01cef8f |
| Offline large download | `RegionDownloadsPanel.tsx` | same | — | — | Done (SB-009) | 1927a13 |
| Corridor rebuild / download controls | `RegionDownloadsPanel.tsx`, `PlannerShell.tsx` | `saveOfflinePack`, `handleBuildCorridor`; removed duplicate `DownloadModePicker` | region-downloads-panel (2) | — | Done (Phase 3 part 2) | |
| Offline reroute | `src/lib/offline/v2-router.ts` | — | offline tests | regional E2E pending | Partial | |
| Signed learning | `rider-preferences.ts` | same | rider-preferences (5) | — | Done (SB-010) | 08c7639 |
| Stable bike identity | `rider-settings.ts`, `rider-preference-library.ts` | same | rider-settings (4), route-comparison | — | Done (SB-011) | 08c7639 |
| Mobile flow | `PlannerDeck.tsx` | Phase 5 | planner-deck component tests | — | Done (SB-025) | 65deafb |
| Desktop editor | `MapStage.tsx` | Phase 5 | — | — | Not started (SB-026) | |
| Migration | `trip-plan-migration.ts` | Phase 4 | — | — | Partial | |
| Bounded SW caches | `public/sw.js` | same | service-worker (3) | PWA 2/2 | Done (SB-019) | 1927a13 |
| Offline readiness | — | `src/lib/offline/readiness.ts` | offline-readiness (4) | — | Done (SB-020) | 1927a13 |
| Planner lifecycle | `planner-state-machine.ts` | same | planner-state-machine (8) | — | Done (SB-022) | a59d427 |
| Unified export | `unified-export.ts` | same | unified-export (3) | — | Done (SB-024) | a59d427 |
| Destructive confirm | `RegionDownloadsPanel.tsx` | same | — | critical e2e | Done (SB-027) | 6c833ca |
| Diagnostics | `diagnostics.ts` + panel | same | diagnostics (3) | — | Done (SB-028) | f5e7a87 |
| Graph-backed Free Ride candidates | — | — | — | — | Deferred (SB-029) | |
| Physical iPhone | none | — | — | manual | Not started (SB-035) | |

## Phase status

| Phase | Status |
|---|---|
| 0 — Baseline/containment | Complete (0d67d9a) |
| 1 — Routing correctness | Complete (fc77562) |
| 2 — Road requirements + sharing | Complete (01cef8f + SB-014/015) |
| 3 — Offline/storage | Part 1 complete (1927a13); rebuild/suite wiring done (Phase 3 part 2); regional E2E open |
| 4 — Modularization | Part 1 (08c7639) + state machine/export (a59d427) complete; PlannerShell component split open |
| 5 — UX | SB-027 confirmations + SB-028 diagnostics done; mobile flow (65deafb) done; desktop editor open |
| 6 — Learning + Free Ride | SB-010 done (08c7639); SB-030 done (537e2f3); SB-031 done (d6d9046); graph-backed candidates (SB-029) open |
| 7 — Qualification | Not started |

**Commits:** `0d67d9a` → `fc77562` → `01cef8f` → `1927a13` → `d2b16f1` → `08c7639` → `537e2f3` → `6c833ca` → `30c897e` → `a59d427` → `f5e7a87` → `5c4d2fe` → `65deafb` → `d6d9046` (on top of `1a7fba6`).
