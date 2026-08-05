# Baseline Audit

**Date:** 2026-08-05
**Branch/commit:** `main` @ `1a7fba6` (post quality-gate merge)
**Spec:** `switchback_full_recovery_spec` (SHA256-verified)

## Repository state

- Branch `main` checked out, clean working tree (only the untracked recovery spec).
- No open PRs; CI green on `main` (`1a7fba6`, quality workflow all jobs success).
- Inventory: 224 `src` TS/TSX files, 179 test files, 21 CSS files, 20 API routes, 1 service worker.
- Test suite at baseline: 1,149 unit tests passing; critical 30/30; real-router 5/5; PWA 2/2; live smoke 8/8 (local).

## Verification of spec defect claims

Every claim in `02_CURRENT_STATE_ASSESSMENT.md` was checked against the live tree. All are confirmed:

| # | Defect | Evidence | Verdict |
|---|---|---|---|
| 1 | Road requirements: manual taps not graph-snapped, straight geometry, no edge IDs, "exact" confidence, Must zeroes priority outside thin polygon | `src/components/planner/map-drawing.ts:232-250` (snap returns tap unchanged, `edgeIds: []`), `src/components/planner/MapStage.tsx:224-234`, `src/lib/roads/road-locks.ts:215` (`confidence: "exact"`), `src/lib/routing/graphhopper.ts:165-170` (`!in_<area>` → `multiply_by: "0"`) | CONFIRMED |
| 2 | Segmented routing drops bike profile, road locks, toll policy, avoid areas per leg | `src/lib/routing/planner.ts:209-219` (`planSegmentedTrip` forwards only `{profile, points, avoidHighways, avoidAreas}`) | CONFIRMED |
| 3 | Timeboxed fallback: failed-gate candidate selected by closest duration, called "safe" | `src/lib/routing/planner.ts:706-738` (`closestDurationCandidate` after `filter(passedGates)`; warning "showing the closest safe route") | CONFIRMED |
| 4 | Free Ride synthesizes road class, scenic, elevation, traffic, novelty, legal access, confidence | `src/app/api/free-ride/suggestions/handler.ts:67-92` (constants: roadClass "secondary", scenicProxy 0.5, legalAccess "permitted", novelty 0.75, confidence 0.75); heading parsed but never enforced (`free-ride.ts:104-149`) | CONFIRMED |
| 5 | Privacy sharing redacts geometry/waypoints only; instructions and street names leak; metrics/interval indices not rebased | `src/lib/share/route-share.ts:72-85` | CONFIRMED |
| 6 | Preference learning averages dislikes into affinity; identity by mutable name; late alternatives override selection | `src/lib/intelligence/rider-preferences.ts:84-93`, `src/lib/storage/rider-preference-library.ts:22-46`, `src/components/planner/PlannerShell.tsx:264-278` | CONFIRMED |
| 7 | Settings stored but not applied; bike config duplicated | `src/components/shell/ProfilePanel.tsx:9-19` (7 of 9 fields never read), `src/components/planner/BikeProfilePicker.tsx` vs persisted `BikeProfile` | CONFIRMED |
| 8 | Service worker: cache-first, unbounded tile cache | `public/sw.js:1-52` (single `switchback-route-shell-v2` cache; tiles cached with no eviction) | CONFIRMED |
| 9 | PlannerShell god component | `src/components/planner/PlannerShell.tsx`: 1,440 lines, 28 `useState`, 14 `useEffect`, ~73 imports | CONFIRMED |
| 10 | Misleading copy: "safe", "verified", "Premium", "Neural Map", "snaps to the nearest routable edge" | `src/components/planner/MapStage.tsx:1402`, `src/components/shell/FreeRideHud.tsx:41,43,94,125,147,149`, `src/components/shell/AppNavigation.tsx:32`, `src/lib/routing/planner.ts:737` | CONFIRMED |
| 11 | Offline: large-download confirm recurses; suite/rebuild/highlight controls no-op; Wi-Fi update unverified | `src/components/planner/RegionDownloadsPanel.tsx:310-349`, `src/components/planner/RegionSuitePicker.tsx` (presentational), `PlannerShell.tsx:1371-1374` (`onDownloadModeChange` never passed), `RegionDownloadsPanel.tsx:439-442` (`onBuildCorridor` never passed) | CONFIRMED |

## Additional findings

- No `/api/road-matching` route exists; matching is client-side (`src/lib/planner/road-match-request.ts`) into the generic `/api/routes`.
- The road-lock **domain model** (`RoadLock`, satisfaction, rematch, ordered anchors) is sound — the defect is plumbing (browser cannot snap; Must zero-priority rule; hardcoded "exact" on manual locks).
- The `confidence: "exact"` claim on manual locks with empty `edgeIds` is the worst offender: an empty match is labeled exact.
- Route profiles include `gravel`, `avoid-highways`, and `neural` as separate top-level profiles — per spec these should be policies, not profiles.
- `src/lib/routing/planner.ts:737` "closest safe route" wording must be replaced with feasibility wording.

## Suite state at baseline

| Suite | Result |
|---|---|
| `npm run lint` | PASS |
| `npm run typecheck` | PASS |
| `npm test` (Vitest) | 1,149 passed (at merge) |
| `npm run build` | PASS |
| `npm run test:e2e:critical` | 30/30 |
| `npm run test:e2e:real-router` | 5/5 |
| `npm run test:e2e:pwa` | 2/2 |
| `npm run test:live-smoke` | 8/8 (local providers) |

## Traceability

See `TRACEABILITY.md` for the spec requirement → code → test matrix. Feature classification in `FEATURE_DISPOSITION.md`. Ongoing progress in `WORKLOG.md`.
