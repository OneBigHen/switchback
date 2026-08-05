# Switchback Master Build Prompt

You are the lead engineer for Switchback, a self-hosted motorcycle routing and ride discovery web app in the `OneBigHen/switchback` repository. Transform it into a first-class routing app that matches the practical navigation baseline of Google Maps while exceeding it for motorcycle ride quality.

## Primary outcome

Build a mobile-first PWA with three modes:

1. **Plan** — create routes manually, by prompt, by destination, by loop length, or by route profile.
2. **Ride** — Google Maps-style turn-by-turn navigation with large, glove-friendly UI, rerouting, ETA, traffic, speed, cues, and offline fallback.
3. **Free Ride / Neural Map** — rider starts riding with no fixed destination; Switchback passively learns road preferences and actively suggests nearby fun roads, turns, overlooks, stops, scenic detours, and route modifications without becoming distracting or unsafe.

## Hard constraints

- Preserve provider abstraction for GraphHopper and Valhalla.
- Keep OSM/MapLibre/self-hosted compatibility.
- Add commercial data only through adapter interfaces with capability flags.
- Do not lock core routing to Google/Mapbox.
- Keep local-first/offline-friendly ride history and preferences.
- Do not build unsafe autonomous behavior. Suggestions are advisory and must obey legal/access/safety gates.
- Prioritize phone-mount visibility and safety over dense UI.
- Do not add social/sharing/account bloat unless needed later.

## Execution plan

Start by auditing the current repository. Identify the existing app structure, route providers, planner shell, ride HUD, storage, tests, and build commands. Then implement the roadmap incrementally.

### Phase 0 — repo stabilization

Run lint, typecheck, tests, and build. Document failures. Add `docs/current-architecture.md`. Extract or define stable domain contracts for `RouteRequest`, `CandidateRoute`, `RouteScore`, `RoadSegmentFeature`, `Maneuver`, `TrafficProvider`, and `RiderPreferenceModel`. Add fixtures and golden tests.

### Phase 1 — deterministic fun-route scoring

Implement a deterministic fun-route scoring engine. Score curvature, elevation interest, scenic proxies, surface/gravel suitability, stop/signal density, traffic/incidents if available, novelty, ETA penalty, safety, and confidence. Use hard gates for illegal/private/unsafe/excessive-detour routes. Add explanation labels.

### Phase 2 — planner upgrade

Upgrade the planner UI to compare Quick, Balanced, Twisty, Scenic, Adventure/Gravel, and Neural route candidates using map-first route ribbons. Keep UI simple and mobile-first.

### Phase 3 — RideHUD MVP

Build a Google Maps-grade RideHUD MVP: large maneuver banner, route line, ETA, remaining distance, speed, speed limit when available, voice cues, off-route detection, rerouting, offline active-route fallback, day/night modes, and no-typing-while-moving behavior.

### Phase 4 — temporal mapping

Add departure-time-aware ETA, live traffic adapter abstraction, incidents/closures overlay, traffic-adjusted ETA, OSM stop/signal/intersection density, weather/daylight context, and provider capability flags. Make degraded/unavailable states explicit.

### Phase 5 — Free Ride / Neural Map v1

While riding without a destination, snap position to road, identify nearby fun-road clusters ahead of the rider, score them with the route scoring engine and rider preference model, and show at most one safe actionable suggestion at a time. Suggestions must be one-tap accept/ignore and convert into guided navigation when accepted.

### Phase 6 — passive learning

Implement passive learning from accepted/rejected suggestions, roads chosen, roads skipped, detours, stops, ride completion, time-of-day, and detour tolerance. Store locally. Provide private mode, reset, export, and redaction zones.

### Phase 7 — offline regional packs

Add offline regional packs for map tiles, route assets, saved rides, road-feature tiles, and active-route continuation. Add a region picker with storage estimates.

### Phase 8 — optional ML ranking

Only after deterministic Free Ride works, add optional ML route ranking. ML may rank candidates but must not override hard legality/safety gates. Keep explanations human-readable.

## Definition of done

- `npm run lint`, `npm run typecheck`, `npm test`, and `npm run build` pass, or failures are documented with exact root cause.
- Playwright mobile tests cover planner, RideHUD, and Free Ride suggestion states.
- Route scoring has golden tests.
- Provider failure/degraded mode is tested.
- App works as a PWA on iPhone/iPad-sized viewports.
- Free Ride mode can suggest a fun road safely and convert it into guided navigation.
