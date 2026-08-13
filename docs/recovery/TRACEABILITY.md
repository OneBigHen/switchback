# Traceability Matrix

**Updated:** 2026-08-12 (Phases 0–6 and P25–P36 implementation; automated unit/browser gates green; regional parity and manual gates open)

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
| Offline reroute | `src/lib/offline/v2-router.ts` | — | offline tests | generated parity 187/208 (89.9%); 0 oracle errors; regional E2E pending | Partial | `artifacts/offline-parity-evidence.json` |
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
| Graph-backed Free Ride candidates | `free-ride.ts`, `free-ride-graph.ts`, `/api/free-ride/suggestions` | same + graph loader/provider adapter | free-ride-graph, free-ride-api, free-ride-recommendation | Free Ride 4/4; broad 24/24; critical 30/30; real-router 5/5 | Done (P25 / SB-029) | `docs/phase-reports/P25-free-ride-graph-engine.md` |
| Free Ride interruption, learning, Head Home | `free-ride.ts`, `PlannerShell.tsx`, `FreeRideHud.tsx`, `planner-location.ts` | same + bounded prompt budget/Home transition | free-ride-recommendation, free-ride-api, free-ride-hud | Free Ride 8/8; broad 28/28; critical 30/30; PWA 2/2; memory 10/10 | Done (P26) | `docs/phase-reports/P26-free-ride-interruption-learning.md` |
| GPX intelligence and grounded detail | streaming parser, corpus normalizer, route import | `src/lib/gpx/intelligence.ts`, `GpxIntelligencePanel.tsx`, catalog/API report fields | gpx-intelligence, gpx-streaming-ingest, gpx-map-matching, gpx-catalog-api; 16 focused | broad 28/28; critical 30/30; PWA 2/2; memory 10/10; real-router 5/5 | Done (P27 / G6) | `docs/phase-reports/P27-gpx-intelligence.md` |
| GPX join, continuous track, and export variants | `RouteComparison.tsx`, route exchange, navigation engine | `src/lib/gpx/join.ts`, GPX export variants, track-only/continuous-track session boundaries | gpx, gpx-join, route exchange, navigation, RideHud, RouteComparison; 68 focused | broad 28/28; critical 30/30; PWA 2/2; memory 10/10; real-router 5/5 | Done (P28 / G6) | `docs/phase-reports/P28-gpx-join-export.md` |
| Offline Geo Worker | offline routing/storage | `ByteLru`, `tile-codec`, `OfflineGeoWorkerClient`, lazy active tile source | 8 focused files / 49 tests | standard 32/32; critical 30/30; PWA 2/2; memory 10/10; real-router 5/5; generated parity 187/208; 0 oracle errors | Implemented; parity open (P29 / G6) | `docs/phase-reports/P29-offline-geo-worker.md` |
| Region/Ride packs | region catalog/downloads | atomic v2 pointer/version install and suite selection | region v2, route-pack, readiness suites | standard 32/32; critical 30/30; PWA 2/2; memory 10/10; real-router 5/5; generated parity 187/208; 0 oracle errors | Implemented; parity open (P30 / G6) | `docs/phase-reports/P30-region-ride-packs.md` |
| Community backend | none | `src/lib/community/*`, community route handlers | community-backend | automated boundary green; authenticated browser/external riders open | Implemented (P31 / G7) | `docs/phase-reports/P31-community-backend.md` |
| Passkey identity/privacy | none | `src/lib/identity/*`, identity API routes, browser adapter, `privacy-preview.ts` | passkey/privacy, identity registration/authentication, CSRF | options/API browser boundary green; real authenticator and authenticated browser open | Implemented server boundary (P32 / G7) | `docs/phase-reports/P32-passkey-privacy.md` |
| Encrypted sync | none | `src/lib/sync/*`, `/api/sync` | encrypted-sync | multi-device recovery open | Implemented (P33 / G7) | `docs/phase-reports/P33-encrypted-sync.md` |
| Grounded AI | ride intent/corridor adviser | strict intent export, grounded descriptions, spatial-first search | grounded-ai | provider/community prompt-injection open | Implemented (P34 / G7) | `docs/phase-reports/P34-grounded-ai.md` |
| Security/ops/field beta | Caddy/systemd | Docker/Caddy, region worker, backup/restore, native decision record | targeted boundary suites | field beta open | Artifacts (P35 / G8) | `docs/phase-reports/P35-security-ops-field-beta.md` |
| Production release | none | freeze/rollback runbook | automated release gates green | production/provider/physical gates open | Prepared (P36 / G8) | `docs/phase-reports/P36-production-release.md` |
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
| 6 — Learning + Free Ride | SB-010 done (08c7639); SB-030 done (537e2f3); SB-031 done (d6d9046); graph-backed candidates (SB-029) done in P25; interruption/learning/Home done in P26 |
| 7 — Qualification | Not started |
| Master G6 — P27/P28 GPX qualification | P27/P28 automated acceptance green; P29/P30 generated parity open |
| Master G7/G8 — offline/community/identity/sync/AI/release | Unit/browser acceptance green; generated offline parity, authenticated, field, external-rider, and production gates remain |

**Commits:** `0d67d9a` → `fc77562` → `01cef8f` → `1927a13` → `d2b16f1` → `08c7639` → `537e2f3` → `6c833ca` → `30c897e` → `a59d427` → `f5e7a87` → `5c4d2fe` → `65deafb` → `d6d9046` (on top of `1a7fba6`).
