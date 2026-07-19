# Current state

- Milestone: v0.2 Rider Workbench
- Current phase: 6.1, Core planner and routing hardening
- Status: hardening implementation is present in the working tree; lint, typecheck, focused/full automated runs, production build, service restart, and public health have been refreshed. A fresh complete public-browser matrix remains required before the 6.1 release gate can close.
- Routing decision: GraphHopper 11 primary + optional Valhalla supplemental/fallback + optional Valhalla elevation; MapLibre + OpenFreeMap rendering
- Default routing coverage: Pennsylvania plus New Jersey in GraphHopper; any Valhalla coverage is independently determined by its installed tiles
- Non-negotiable gate: no completion claim without live routing and browser evidence

## Current hardening target

Make a typed place or address reliably become a route from either the selected origin or explicitly acquired browser location. Destination search uses Google Places Text Search when configured and location-biased Photon otherwise. The geographic flow lives in a modular resolver rather than being embedded entirely in the planner component.

GraphHopper remains authoritative and primary. Eligible point-to-point requests may also receive distinct Valhalla alternatives; Valhalla can preserve a supported route when GraphHopper fails. Adventure and native round-trip requests remain GraphHopper-only. The optional pinned Valhalla runtime imports the same normalized Pennsylvania/New Jersey extract and stays on loopback. Route candidates identify their provider/version, and optional Valhalla elevation enrichment must never discard valid geometry when unavailable.

## Competitive thesis

- Beat route generators by combining instant suggestions with exact manual control.
- Reach Gaia-class map confidence through composable, sourced layers rather than a single opaque basemap.
- Beat current motorcycle navigation pain by making rejoin, skip, detour, pause, and resume policies explicit.
- Keep the route portable, local-first, and useful when model services, accounts, or connectivity are unavailable.

## Verification evidence

- The latest full-suite count is intentionally not frozen here because hardening tests were added after the previous complete run; the parent verification pass must refresh lint, typecheck, tests, build, and browser evidence together
- Focused automated coverage exists for free-form parsing, Google/Photon fallback, GPS acquisition, modular waypoint resolution, same-profile diversity, GraphHopper round-trip headings, hybrid merge/fallback/provenance, Valhalla normalization, elevation degradation, and independent provider health
- Prior live validation established four distinct GraphHopper profiles and a 142.1-meter detour around the pinned `motorcycle=no` regression segment; that evidence predates the current hybrid/free-form build and is not public-deployment proof for it
- The current live `switchback-cloudflare` app service binds Next to `0.0.0.0:3100`; GraphHopper and Valhalla router ports remain loopback-only
- The current modularization slice passed lint, typecheck, the full Vitest suite, production build, desktop planner E2E, and `validate:live`. On 2026-07-18, live validation confirmed distinct Quick/Twisty/Scenic/Adventure routes, a 142.1-meter restricted-road detour for every profile, and six hybrid candidates for the free-form New Hope flow. `switchback-cloudflare` was restarted; local health and `ride.henning.rodeo` returned healthy responses. Mobile Safari, poor-network, recovery, and companion-display evidence remain required before release.

## Delivery truth for phases 6-11

- Phase 6 is partial: sketch/edit history, stop editing, avoid areas, and per-segment character exist; must-use locks and reference-image line extraction remain open
- Phase 7 is partial: named Map Packs and multiple overlays exist; several data layers still approximate the required semantics, freshness, and provenance
- Phase 8 is partial: explicit rejoin behavior exists; corridor packs contain route/cues only, and companion-display validation is missing
- Phase 9 is partial: weather/stops/waypoint foundations exist, not a complete multi-day command center
- Phase 10 is partial: local routes and GPX/reference foundations exist; bounded GPX/KML/KMZ parsing now runs in a Worker, while automatic reference-line extraction, richer exchange, collaboration, and sync remain open
- Phase 11 is partial: route scoring/preferences exist; durable rider learning is incomplete and community reports are missing

## Known requirement corrections

- `RIDE-02` is complete: navigation frames use a dedicated external store rather than root planner state
- `SHAPE-07` is open because reference images require manual alignment/tracing; line extraction is absent
- `EDIT-03` is complete: bounded import parsing uses a versioned Web Worker protocol
- `NAV-04` is open because current packs do not contain offline tiles, overlays, or routing data
- `NAV-06` and `LEARN-02` are not implemented
