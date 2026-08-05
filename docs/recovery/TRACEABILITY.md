# Traceability Matrix

**Updated:** 2026-08-05 (Phases 0–3 part 1 complete)

| Requirement | Current files | New/changed files | Unit test | Integration/E2E | Status | Evidence |
|---|---|---|---|---|---|---|
| Normalized constraints | `src/lib/routing/*` | `src/lib/domain/routing/normalized-request.ts` | routing-semantics | real-router 5/5 | Done (Phase 1) | fc77562 |
| Eligibility before ranking | `planner.ts`, `route-quality.ts` | `src/lib/domain/routing/eligibility.ts` | routing-semantics | real-router | Done (Phase 1) | fc77562 |
| Segmented propagation | `planner.ts` | same | planner.test (constraints) | — | Done (Phase 1) | fc77562 |
| Timebox fallback wording | `planner.ts` | same | timeboxed-destination | live golden 3/3 | Done (Phase 0/1) | 0d67d9a |
| Sticky explicit selection | `planner-store.ts`, `PlannerShell.tsx` | same | planner-store (SB-005) | — | Done (Phase 1) | fc77562 |
| Must-road traversal | — | — | — | — | Not started (SB-014, flagged off) | feature-flags |
| Prefer bounded bonus | — | — | — | — | Not started (SB-015, flagged off) | feature-flags |
| Road graph matching | — | `src/lib/roads/road-matching.ts`, `/api/road-matching` | road-matching (4) | live probe | Done (SB-013) | 01cef8f |
| Rematch/drift review | `road-locks.ts` (rematch exists) | UI wiring pending | road-locks | — | Partial (SB-016) | |
| Free Ride direction | `free-ride.ts` | Phase 6 | — | — | Not started | |
| Free Ride synthetic claims | `handler.ts` | Phase 0 labels | free-ride tests | e2e | Contained (SB-012 copy) | 0d67d9a |
| Share redaction | `route-share.ts` | same | route-share (22) | — | Done (SB-008) | 01cef8f |
| Offline large download | `RegionDownloadsPanel.tsx` | same | — | — | Done (SB-009) | 1927a13 |
| Offline reroute | `src/lib/offline/v2-router.ts` | — | offline tests | regional E2E pending | Partial | |
| Signed learning | `rider-preferences.ts` | Phase 6 | — | — | Not started (SB-010) | |
| Stable bike identity | `rider-preference-library.ts` | Phase 4 | — | — | Not started (SB-011) | |
| Mobile flow | `PlannerDeck.tsx` | Phase 5 | — | — | Not started (SB-025) | |
| Desktop editor | `MapStage.tsx` | Phase 5 | — | — | Not started (SB-026) | |
| Migration | `trip-plan-migration.ts` | Phase 4 | — | — | Partial | |
| Bounded SW caches | `public/sw.js` | same | service-worker (3) | PWA 2/2 | Done (SB-019) | 1927a13 |
| Offline readiness | — | `src/lib/offline/readiness.ts` | offline-readiness (4) | — | Done (SB-020) | 1927a13 |
| Physical iPhone | none | — | — | manual | Not started (SB-035) | |

## Phase status

| Phase | Status |
|---|---|
| 0 — Baseline/containment | Complete (0d67d9a) |
| 1 — Routing correctness | Complete (fc77562) |
| 2 — Road requirements + sharing | Part 1 complete (01cef8f); SB-014/015 open |
| 3 — Offline/storage | Part 1 complete (1927a13); suite/rebuild wiring + regional E2E open |
| 4 — Modularization | Not started |
| 5 — UX | Not started |
| 6 — Learning + Free Ride | Not started |
| 7 — Qualification | Not started |

**Commits:** `0d67d9a` → `fc77562` → `01cef8f` → `1927a13` (on top of `1a7fba6`).
