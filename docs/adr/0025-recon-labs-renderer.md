# ADR 0025: Recon Labs renderer, replay overlay and terrain

## Status

Accepted 2026-09-13. Scoped to the Recon Labs surface (`/labs/recon`,
`src/features/recon/`). Does not amend [ADR 0015](0015-mapbox-primary-renderer.md)
or [ADR 0016](0016-google-3d-cinematic.md) for the planner.

## Context

Recon replays rides the rider already recorded: an Explorer of ride history, a
Replay on the real GPS timeline, an X-Ray breakdown and an authored Cinematic
film. It needs pitched terrain, a trail that animates at 60 fps, and a
choreographed camera, without disturbing any planner, routing or recording
authority.

ADR 0015 makes Mapbox Standard the primary planner renderer, but on main it is
flag-gated (`NEXT_PUBLIC_SWITCHBACK_PREMIUM_MAPBOX`) and not enabled in
production, which still renders OpenFreeMap on MapLibre.

## Decision

**MapLibre is Recon's renderer.** Recon builds one MapLibre map per surface
(`map/ReconMap.tsx`) on the same OpenFreeMap style the production planner uses,
so Labs costs nothing and needs no key. Map creation, layers, sky and terrain
live only in `src/features/recon/map/`, so a later move to Mapbox is contained
there. Recon never renders a second primary canvas.

**deck.gl owns the moving replay, interleaved.** `@deck.gl/maplibre`'s
`MapLibreOverlay` in interleaved mode draws the travelled trail and rider
beacon into MapLibre's own WebGL context and camera — no second context, no
second camera. It is reached only by dynamic import from the ride view, so the
Explorer never downloads it. Because deck.gl renders z = 0 at sea level even
with MapLibre terrain on, trail vertices are lifted to
`map.queryTerrainElevation` and refreshed as DEM tiles stream in.

**Terrain defaults to Mapterhorn.** `NEXT_PUBLIC_RECON_TERRAIN_TILEJSON`
selects a raster-DEM TileJSON; unset uses Mapterhorn's public terrarium tiles
(`tiles.mapterhorn.com`), `off` disables terrain. One DEM feeds both 3D
terrain and a quiet hillshade. Any terrain failure removes it once and never
retries. The production CSP adds `https://tiles.mapterhorn.com` to
`connect-src`/`img-src`; only ordinary tile requests leave the browser, never
ride geometry.

**Baseline Cinematic only; Ultra is deferred.** The film is authored from the
existing scene (terrain, sky, ride line) with a deterministic shot plan.
`three`, `@react-three/*` and `3d-tiles-renderer` are not installed. A future
photoreal mode, if any, follows ADR 0016 (Google `maps3d`, lazy, disposed on
close) and is not a V1 deliverable.

**Recon presents; it does not decide.** Ride history stays in the browser's
IndexedDB journal. New-to-you is a track-history comparison (never "new road"),
curvature is the planner's `analyzeGeometry`, and surface comes only from Gravel
Atlas corridors that run along the ride. Unknown stays unknown.

## Consequences

- Recon adds three runtime dependencies (`@deck.gl/core`, `@deck.gl/layers`,
  `@deck.gl/maplibre`, all 9.4.0), loaded only on the ride view.
- Recon's look follows MapLibre until the planner's Mapbox rollout is enabled
  in production; switching is a change inside `features/recon/map/`.
- Terrain depends on a free public tile host; its absence degrades to a flat
  map, not an error.
