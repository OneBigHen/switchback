# OpenGravel Recon V1 — reconciled implementation plan

Status: approved product direction. Repository `/root/Vibe/switchback`, reconciled against
`origin/main` @ `44393de8` on 2026-09-13. Owner: Zac. Execution: phased run with deterministic
gates; PR stays unmerged for owner review.

## 1. Purpose and product boundary

Recon is an experimental visual exploration environment inside switchback: it turns recorded rides,
GPX routes, the Route Library, map intelligence and existing gravel data into something riders
explore for fun. It is not a route planner, not a road-database admin surface and not an analytics
dashboard. The reference feel is Google Maps Immersive View × Strava Flyby × Relive × onX terrain ×
Apple Maps spatial hierarchy × a high-end motion piece.

Recon is a **new Labs experience**: preferred surfaces `/labs/recon` and
`/labs/recon/replay/[rideId]`, source root `src/features/recon/`. It consumes trusted data and
presents it. It never edits route geometry, never duplicates planning/GPX intelligence/ownership
authority, and never adds state or animation to `PlannerMapStage.tsx`.

## 2. What exists today (do not re-derive)

| Concern | Current authority |
| --- | --- |
| Planner rendering | `src/components/planner/PlannerMapStage.tsx`, `planner-map-renderer.ts`, `planner-map-layers.ts`, `map-stage-sources.ts`, `MapStage.tsx` |
| Map style | `src/lib/client/map-style.ts`, `src/lib/map-features/` |
| Design tokens | `src/app/styles/tokens.css`, `src/app/styles/a11y-tokens.ts` |
| Ride history | `src/lib/storage/ride-journal.ts` |
| Route library | `src/lib/storage/route-library.ts` |
| GPX/intelligence | `src/lib/gpx/intelligence.ts`, `corpus-ingest.ts`, `catalog-client.ts` |
| Routes | `src/app/` (`api/`, `gpx-library/`, `routes/`, `styles/`); no `labs/` yet |
| Tests | `tests/unit/*.test.ts` (vitest), `tests/e2e/**` (playwright, `criticalMainMatch` allowlist) |

Installed: Next 16.3.3, React 19.2.7, MapLibre 6.8.0, mapbox-gl 3.28.1, zustand 5.0.14,
`@turf/{along,bearing,distance,boolean-point-in-polygon}`, dexie. Absent until added: deck.gl, three,
R3F, drei. Do not touch the in-flight map-first mobile worktree `/root/Vibe/wt/og-mobile`.

## 3. Recon data model (presentation adapter layer)

One adapter layer so no component has to understand RecordedRide, PlannedRoute, catalog payloads and
GPX internals at once:

- `ReconTrackKind = "recorded-ride" | "saved-route" | "catalog-route"`
- `ReconPlaybackKind = "recorded" | "preview"`
- `ReconTrackPoint { coordinate, recordedAt?, speedMph?, altitudeMeters?, headingDegrees?, accuracyMeters? }`
- `ReconTrack { id, name, sourceKind, playbackKind, geometry, points, distanceMeters, startedAt?,
  endedAt?, routeId?, facts { durationMinutes, ascentMeters, descentMeters, surfaceKnown,
  matchPercent, confidence } }`
- `ExplorationSegment { fromIndex, toIndex, distanceMeters, status }`

Adapt to the real current source types when reading the modules above. Conversion is pure and
unit-tested; source objects are never mutated; invalid geometry fails closed; no persistence is
duplicated; production never substitutes fixture data (fixtures are test-only).

## 4. Replay mechanics

`sampleReplay(track, position): ReplayFrame` with
`ReplayFrame { progress, elapsedMs, coordinate, bearingDegrees, speedMph, altitudeMeters }`.
Recorded rides interpolate on real timestamps (normalized to start at zero so GPU layers never see
absolute epoch values); previews interpolate on distance-normalized progress and return
`elapsedMs: null, speedMph: null`. Timestamps are validated: source order is never silently sorted
when it is semantically meaningful, and impossible sequences fail safely instead of being
invented. Display geometry is deterministically decimated for rendering (endpoints, order, shape,
facts preserved); the stored original is untouched.

## 5. Camera direction

A small deterministic director owns high-frequency camera state outside React rendering. Modes:
Overview (keeps meaningful upcoming geometry visible; default on mobile), Chase (behind the
direction of travel with enough lookahead to read the road ahead and no motion-sickness bearing
churn), Lead (used sparingly), Orbit (paused/interesting moments only, never spinning while riding),
Free (manual). Manual interaction suspends automatic control and exposes Resume Follow. Center,
bearing, pitch and zoom are interpolated deliberately; recorded heading is used only where
trustworthy, otherwise heading comes from adjacent geometry. Bearing must cross north without a
359°→0° spin. `flyTo()` is never called per frame and camera state never flows through React at
60 Hz.

## 6. New-to-you intelligence

Track-history comparison, not road discovery. Resample historical traces to 25–50 m; build a
lightweight spatial bucket index; resample the selected ride; classify a sample as previously
ridden when history exists within a conservative 40–60 m tolerance (direction-independent);
convert adjacent classifications into contiguous ranges; estimate distance from segment lengths.
Copy must say "new to you" and must never claim newly discovered roads, and V1 makes no
authoritative exploration-denominator claims. Allowed metrics: recorded miles, rides recorded, time
recorded, new-to-you distance within a recorded ride, previously traversed distance, routes
represented in ride history, geographic regions containing history.

## 7. Evidence and surface rules

Recorded Ride requires real `recordedAt` points. Geometry without timestamps is a Route Preview:
distance-based animation only, no observed speed, no invented elapsed time, never called a replay.
Unknown surface remains unknown with a deliberate neutral treatment; surface bands render only from
existing Gravel Atlas/evidence that actually intersects the route. Route intelligence (curvature,
elevation, gaps, match confidence) reuses existing OpenGravel computations — no forked
`analyzeGeometry`, no competing twistiness formula, no false zeroes when a provider is missing.

## 8. Renderer responsibilities

MapLibre owns geography (terrain, pitch, atmosphere, basemap, route hierarchy). deck.gl owns large
geospatial replay animation, interleaved with MapLibre so 3D depth ordering is correct, with no
second map camera. R3F owns optional art-directed 3D for Ultra Cinematic only, lazily loaded behind
a capability/config guard (`NEXT_PUBLIC_RECON_3D_TILES_URL` plus separately configurable provider
credentials) and falling back to baseline Cinematic on any failure — never a black canvas.
DOM/SVG owns application UI, including X-Ray series (no charting dependency). OpenGravel owns facts.

## 9. Cinematic direction

Baseline Cinematic must feel substantially more authored than normal map navigation using only the
existing map scene: terrain, choreographed camera, progressive route reveal, reduced UI, ride facts,
atmosphere and a subtle colour treatment. Shot vocabulary: Establish, Dive, Track, Chase, Reveal,
Orbit, Pull-away — deterministic recipes over ride facts, adapted to ride length so every ride is
not identical. Honour reduced motion (no autoplay, dive or continuous orbit) and allow exit to the
exact selected ride. Ultra is an enhancement layered on top, never a prerequisite.

## 10. Performance, lifecycle and failure semantics

Targets: desktop 55–60 FPS during ordinary camera movement/replay; recent iPhone-class ≥30 FPS
(45+ preferred in Explorer); Ultra 45–60 desktop / stable 30 mobile. Avoid rendering every raw GPS
point (cap rendered replay vertices around 2000–4000 with deterministic decimation). Lifecycle: no
permanent second WebGL context, dispose Three resources and deck overlays, remove listeners, cancel
frames, abort requests, dispose map objects on exit; at least ten Replay enter/exit cycles must
leave no leak. Every enhancement fails independently: terrain down → flat map; gravel evidence
missing → ride still renders; recorded speed absent → speed UI says unavailable or disappears; 3D
tiles down → baseline Cinematic; R3F error → baseline Cinematic; intelligence unavailable →
geometry still works. Provider absence never becomes a false zero, and terrain errors never trigger
retry storms.

## 11. Privacy

Recorded ride history is personal location data. Recon must not upload ride history to a new third
party, must not post ride geometry to tile providers beyond ordinary tile requests, must not add
analytics containing raw GPS tracks, and must not commit credentials. Any browser-exposed key must
be designed for browser exposure and appropriately restricted. Instrumentation is local and
development-only.

## 12. Acceptance

`/labs/recon` exists and is polished on real data; recorded vs preview semantics are truthful;
recorded timestamps drive Replay; Explorer has working terrain with graceful fallback; history is
visually explorable; Replay is smooth on phone and desktop; new-to-you distance works from ride
history; surface/evidence rendering never invents facts; every enhancement fails independently
without false zeroes; performance and lifecycle budgets hold on desktop and mobile Safari; privacy
boundaries hold; lint, typecheck, unit tests and the deterministic verification gates pass.

## 13. Execution

Phased run with deterministic gates; each phase lands on the run branch and the PR stays unmerged
for owner review. Phase 0 — Truth and adapters — opens the feature root: `src/features/recon/types.ts`,
`data/recorded-ride-adapter.ts`, `data/catalog-route-adapter.ts`, `data/recon-track.ts`,
`replay/replay-sampler.ts`, and a minimal polished `/labs/recon` page (recorded history, picker,
flat map, empty state). RED tests first: `tests/unit/recon-data-adapter.test.ts`,
`tests/unit/recon-replay-timeline.test.ts`. Phase 0 gates: `npm run lint`, `npm run typecheck`,
`npx vitest run tests/unit/recon-data-adapter.test.ts tests/unit/recon-replay-timeline.test.ts`.
Phase 1 — Gorgeous Explorer — delivers the pitched, terrain-backed Explorer:
`src/features/recon/map/{ReconMap.tsx,create-recon-map.ts,recon-map-style.ts,terrain.ts}`,
`layers/{ride-history-layer.ts,selected-route-layer.ts,gravel-evidence-layer.ts}`,
`ui/{ReconShell.tsx,ReconHud.tsx,ReconRidePicker.tsx}`, `recon.css`, and the
`src/app/labs/recon/replay/[rideId]/page.tsx` focused-view route, with the Recon critical
Playwright spec named in `criticalMainMatch`. Phase 1 gates add `npm run build` and the
Recon critical e2e spec to the Phase 0 set.

## 14. Renderer decisions for Recon (run authority, 2026-09-13)

These two decisions govern Recon and supersede any pointer to a roadmap/ADR set as Recon's
authority; `ROADMAP-WAVES.md` contains no Recon, Labs, deck.gl or R3F content and ADRs
0015–0022 predate this work.

1. **Primary renderer: MapLibre, now.** On `origin/main` @ `44393de8` the app's map code is
   MapLibre-only (7 modules import `maplibre-gl`, 0 import `mapbox-gl`); the Mapbox Standard
   rollout of ADR 0015 has not landed. Recon builds on MapLibre and keeps renderer coupling
   shallow: map creation, style assembly and layer registration live in
   `src/features/recon/map/` behind one factory so an eventual Mapbox swap stays contained.
   Never introduce a second primary renderer and never render two primary canvases at once.

2. **Ultra Cinematic: out of V1 scope; if ever built it follows ADR 0016.** Baseline
   Cinematic (MapLibre terrain scene + choreographed camera) is the required deliverable and
   must stand on its own. A raw 3D-Tiles world is explicitly not used: ADR 0016 (Accepted)
   states "Raw Photorealistic 3D Tiles and Cesium are not used." An optional photorealistic
   preview, if built at all, is the lazy-loaded, capability-gated Google Maps JavaScript 3D
   (`maps3d`) element of ADR 0016, disposed on close, never co-rendering with the primary
   renderer. Consequence: `three`, `@react-three/fiber`, `@react-three/drei`,
   `@react-three/postprocessing` and `3d-tiles-renderer` are **not** installed for Recon
   (removing them from the original approved dependency list is a deliberate scope
   reduction). `deck.gl` remains approved for Replay (large geospatial animation) in a later
   phase.

## 15. Out of scope for V1

Road registry; recommendation engine; social feed; achievements/leaderboards; GPX import
rewrite; map-matching rewrite; AI narration; road-condition inference; image recognition;
custom terrain hosting/tile server; video export; photo upload; 3D world editor; multiplayer
replay; CarPlay; native iOS rewrite. A missing capability is documented, not worked around
with a new dependency outside the approved set.
