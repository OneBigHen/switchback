# Switchback requirements traceability

Status values: `Not started`, `In progress`, `Implemented`, `Verified`,
`Blocked`, and `Deferred with reason`.

This handoff traceability reflects the implementation slice in the current
working tree. `Implemented` means the code and focused tests are present;
`Verified` additionally requires matching runtime/device evidence.

| Requirement | Implementation location | Test/evidence | Status |
| --- | --- | --- | --- |
| Build/package extraction and source specs | `docs/switchback-build/` | ZIP listing and full document reads | Verified |
| Current architecture and execution trail | `docs/current-architecture.md`, `EXECUTION_PLAN.md`, `STATUS.md` | Current-tree audit and baseline commands | Verified |
| GraphHopper primary provider | `src/lib/routing/graphhopper.ts`, `routes/route.ts` | `tests/unit/graphhopper.test.ts`, `routes-api-wiring.test.ts` | Verified |
| Optional Valhalla provider | `src/lib/routing/valhalla.ts`, `hybrid.ts` | `tests/unit/valhalla.test.ts`, `hybrid-routing.test.ts` | Verified |
| Normalized route request/planned route contract | `src/lib/routing/types.ts`, `src/lib/domain/contracts.ts` | `tests/unit/api-handlers.test.ts`, `tests/unit/route-score-domain.test.ts` | Implemented |
| Full named domain contracts | `src/lib/domain/contracts.ts` | `tests/unit/route-score-domain.test.ts`, recommendation tests | Implemented |
| Quick/Twisty/Scenic/Adventure profiles | `src/lib/routing/profiles.ts` | profile, planner, provider tests | Implemented |
| Balanced/Gravel/Avoid Highways/Neural profiles | `src/lib/routing/profiles.ts`, provider adapters, offline router | `tests/unit/first-class-route-profiles.test.ts`, profile/planner tests | Implemented |
| Geometry curvature and route overlap | `src/lib/routing/scoring.ts` | `tests/unit/scoring.test.ts`, curvature tests | Verified |
| Destination relevance, duration, toll, backtracking gates | `src/lib/routing/route-quality.ts`, `planner.ts` | `tests/unit/route-quality.test.ts`, planner tests | Verified |
| Transparent feature-based score and hard gates | `src/lib/recommendation/route-score.ts`, `route-candidate.ts` | `tests/unit/route-score-domain.test.ts`, candidate tests | Implemented |
| Meaningfully diverse alternatives | `src/lib/routing/planner.ts`, `hybrid.ts` | `tests/unit/planner.test.ts`, routing fixtures | Implemented |
| Address/place/current-location planning | `PlannerDeck`, geocode/place clients, route API | planner/geocoding/API tests | Verified |
| Multi-stop, draggable/sketched routes | planner components/store/sketch state | component and route-edit tests | Verified |
| Loops by time and GPX import/export | `planner.ts`, GPX modules | loop, GPX, integration tests | Implemented |
| Saved routes/favorites/recents | planner store and Dexie libraries | storage and component tests | Implemented |
| Ride turn-by-turn HUD | `RideHud`, `navigation-engine`, session controller | navigation and Ride HUD tests | Implemented |
| Off-route detection/rerouting | navigation engine/recovery/reroute | navigation/reroute tests | Implemented |
| Voice, wake lock, day/night, degraded states | Ride HUD/controller/styles | navigation and Ride HUD focused coverage | Implemented |
| Temporal traffic/incidents/closures | `src/lib/domain/contracts.ts`, route-score capability fields | domain score tests; live adapters remain optional | In progress |
| Free Ride / Neural Map entry and horizon | `FreeRideHud`, `PlannerShell`, free-ride API/reducer | `tests/unit/free-ride-recommendation.test.ts`, Free Ride E2E | Implemented |
| One-suggestion suppression and safe acceptance | `src/lib/recommendation/free-ride.ts`, Free Ride HUD | recommendation/API/HUD tests | Implemented |
| Preference learning and human explanations | `rider-preferences.ts`, `rider-route-ranking.ts`, RouteComparison | preference/ranking/route comparison tests | Implemented |
| Private mode/reset/export/deletion/redaction | Profile controls, local event store, route-share redaction | profile, preference, and share tests | Implemented |
| PWA manifest/service worker/app shell | `src/app/manifest.ts`, `public/sw.js` | build output and service-worker source | Implemented |
| IndexedDB local persistence | `src/lib/storage`, offline libraries | storage/offline tests | Implemented |
| Offline saved route/graph continuation | `src/lib/client/offline-route-recovery.ts`, `useNavigationSessionController` | `tests/unit/offline-route-recovery.test.ts`, offline router tests | Implemented |
| Regional pack status/update/deletion | region catalog/download client | region download/API tests | Implemented |
| Airplane-mode iPhone drill | Not captured in current checkout | physical-device evidence required | Blocked |
| Responsive Plan/Ride/Free Ride visual states | Free Ride HUD/CSS and existing responsive surfaces | Free Ride Playwright evidence in `artifacts/screenshots/` | Implemented |
| Security, privacy, input/rate limits | route API limiters, GPX validation, SECURITY.md | security/API tests | In progress |
| Final build report and release instructions | `docs/switchback-build/FINAL_REPORT.md` | final handoff verification matrix | In progress |

## Evidence rule

A row moves to `Verified` only when the implementation, focused test, and
user-facing/runtime evidence cover the same scope. Passing the existing suite
does not by itself verify missing product modes or device behavior.
