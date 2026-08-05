# Switchback Implementation Roadmap

## Highest leverage first PRs

1. `docs/current-architecture.md` plus route contract inventory.
2. `packages/domain` route/scoring/preference contracts.
3. deterministic `scoreRoute(candidate, context, riderModel)` with tests.
4. Road-feature extraction from existing route geometry/path details.
5. Planner route ribbons showing score explanation.
6. RideHUD state machine and mobile visual tests.
7. Free Ride suggestion service skeleton with fake provider fixtures.
8. Traffic provider abstraction with mocked degraded/unavailable states.

## Phase 0 — repo stabilization

Goal: make the current app safe to extend.

Tasks:

- Run lint/typecheck/tests/build.
- Document current route contracts and provider behavior.
- Split overloaded planner/ride shells into smaller modules.
- Add strict TypeScript contracts for RouteRequest, CandidateRoute, RouteScore, Maneuver, RoadSegmentFeature.
- Add fixture routes and golden tests.
- Add Playwright mobile RideHUD tests.
- Add provider-failure tests.

Acceptance:

- Existing planner still works.
- Current routing providers still work.
- No regression in GPX/import/export.
- Mobile route preview works on iPhone viewport.

## Phase 1 — real route scoring foundation

Goal: route quality scoring becomes explicit and testable.

Tasks:

- Implement road feature extraction from route geometry and path details.
- Add curvature/elevation/surface/scenic/traffic/signal scoring fields.
- Add route explanation labels.
- Add alternative route diversity and overlap rejection.
- Add score visualizations in planner route ribbons.

Acceptance:

- Same origin/destination can produce Quick, Balanced, Twisty, Scenic, Adventure/Gravel candidates.
- Each route has visible score breakdown.
- Bad routes are rejected with warning reason.

## Phase 2 — Google Maps-grade RideHUD MVP

Goal: safe, usable navigation mode.

Tasks:

- Build deterministic guidance state machine.
- Add off-route detection and reroute request.
- Add voice cue scheduler.
- Add big maneuver banner.
- Add ETA/distance/current-speed/speed-limit slots.
- Add day/night mode.
- Add no-typing-while-moving lockout.
- Add offline continuation for active route.

Acceptance:

- Rider can start a planned route and follow turn-by-turn cues.
- If off-route, app reroutes or falls back to nearest-route guidance.
- UI remains readable on phone mount.

## Phase 3 — temporal traffic layer

Goal: time-aware ETA and incident-aware routing.

Tasks:

- Add `TrafficProvider` abstraction.
- Add traffic capability flags.
- Add incident/closure overlay.
- Add traffic-adjusted ETA.
- Add traffic-aware reroute threshold.
- Add stop/signal/intersection density from OSM as baseline.

Acceptance:

- App displays traffic status as available/unavailable/degraded.
- Route ETA changes when traffic data exists.
- App avoids closures/incidents where possible.

## Phase 4 — Free Ride / Neural Map v1

Goal: passive and active fun-road suggestions while riding.

Tasks:

- Add Free Ride mode.
- Add local ride event telemetry.
- Add preference model v1.
- Add nearby fun-road candidate search.
- Add suggestion ranking.
- Add safe suggestion UI.
- Add accept/ignore/less-like-this feedback.
- Add post-ride learning summary.

Acceptance:

- Starting Free Ride shows map, speed, heading, and subtle road-quality overlay.
- App suggests no more than one actionable detour/turn at a time.
- Accepting a suggestion converts it into guided navigation.
- Preferences change route rankings after repeated accept/reject events.

## Phase 5 — offline regional packs

Goal: robust riding without cell service.

Tasks:

- Region picker with storage estimates.
- Offline map tiles/vector tiles.
- Offline route graph packs where feasible.
- Offline saved routes.
- Offline reroute fallback.
- Sync queue for ride history/preferences.

Acceptance:

- Rider can download a region and follow saved routes without network.
- App clearly shows what features are offline vs unavailable.

## Phase 6 — ML/ranking v2

Goal: improve personalization without compromising safety.

Tasks:

- Add pairwise ranking dataset from accepted/rejected suggestions.
- Train lightweight route ranking model.
- Run model locally or server-side depending on deployment mode.
- Keep deterministic hard gates.
- Add evaluation harness with held-out rides.

Acceptance:

- ML changes ranking only, not legality/safety.
- Explanation still names human-readable reason for each suggestion.
- Model can be reset/exported.
