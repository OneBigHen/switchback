# TomTom traffic presentation

**Status:** Approved for implementation

**Date:** 2026-09-12

**Depends on:** `2026-09-12-tomtom-traffic-evidence.md`

## Goal

Turn the existing server-only TomTom traffic evidence boundary into rider-visible product value without giving TomTom route-planning authority.

This slice adds two guarded surfaces:

1. route-specific traffic evidence for the currently selected planned route; and
2. an opt-in `Live traffic` map layer inside the existing Rider Map Studio.

Both surfaces must fail open. Missing TomTom configuration, provider errors, partial coverage, and stale requests must never block route planning or appear as confirmed clear traffic.

## Product behavior

### Selected-route traffic

When a route is selected, Switchback requests traffic evidence for a bounded sampling of that route geometry from `POST /api/route-traffic`.

The planner shows a compact traffic strip only after a route exists:

- loading: `Checking live traffic…`;
- available with no incidents: `No reported incidents on this route`;
- available with delay: show delay and incident count;
- closure: lead with `Closure reported` rather than a numeric delay;
- degraded: show known incidents with `Partial traffic coverage`;
- unknown/unavailable: collapse the strip entirely; never claim the route is clear. Key-less deployments are a supported configuration (ADR 0021), so a permanent provider-availability card would add noise to every route choice. Explicitly requested `live-traffic` map layers still surface provider failure through Rider Map Studio.
- going offline pauses the check; evidence fetched before a disconnect is discarded, so reconnecting shows `Checking live traffic…` until a fresh answer arrives.

A new route identity or geometry aborts the previous request. Late responses may not repaint a newer route.

Route geometry sent to the API is deterministically sampled to at most 400 points while always preserving the first and last points.

### Live traffic map layer

Add `live-traffic` to the existing rider map layer catalog. It is off by default and appears in the quick layer picker.

When enabled, `/api/map-features` may combine TomTom incident geometry with existing OSM/NWS features. TomTom remains server-only; the browser never receives the API key or a TomTom URL containing credentials.

Provider semantics remain explicit:

- a successful TomTom response with zero incidents is an empty live-traffic layer;
- missing configuration or provider failure marks traffic unavailable, not empty;
- successful OSM/NWS features may still render when TomTom fails;
- the map layer status UI must show the traffic layer as failed/unavailable when TomTom did not answer.

## Architecture

### Client route evidence

Create a focused client module that:

- samples `PlannedRoute.geometry` to the route-traffic contract;
- performs the same-origin request with an `AbortSignal`;
- validates the minimum evidence shape before returning it;
- exposes pure summary formatting for unit tests.

`RouteTrafficSummary` owns request lifecycle for the selected route and renders only traffic state. `PlannerDeck` composes it; no traffic state is added to the planner store.

### Map feature federation

Keep `/api/map-features` as the single map-feature boundary.

- `src/lib/traffic/tomtom.ts` gains a bounded single-box incident query for map use, reusing the same normalization/auth/version rules as route traffic.
- `src/lib/map-features/osm.ts` remains the feature federation module but may now fan out to three provider families: OSM, NWS, and TomTom.
- TomTom incidents are converted to normal `RiderFeature` GeoJSON with `layerId: "live-traffic"`.
- `RiderFeatureCollection.unavailable` gains `traffic` so partial provider failure is preserved to the browser.
- the client map-layer controller maps that unavailable provider back to the `live-traffic` layer's error state.

## Security and quota constraints

- `TOMTOM_API_KEY` remains server-only.
- No `NEXT_PUBLIC_TOMTOM_*` variable is introduced.
- Map traffic is requested only when the rider explicitly enables `live-traffic`.
- Existing map viewport bounds and rate limits continue to cap fan-out.
- TomTom map incident calls use one bounded viewport box per refresh, not tile-by-tile proxying.
- Traffic calls use short timeouts and no-store/private semantics at the provider boundary; `/api/map-features` may retain its short shared cache because map incident data is advisory and refreshed on viewport changes.

## Explicit non-goals

- TomTom basemap replacement;
- raw TomTom traffic raster/vector tile proxying;
- TomTom route generation or `PlannedRoute.provider = "tomtom"`;
- automatic rerouting from traffic;
- traffic-derived route scoring;
- future departure prediction.

Those remain separate bakeoff/scoring slices.

## Acceptance criteria

1. Selected-route traffic appears without changing route generation.
2. Route traffic requests are aborted/replaced when the selected route changes.
3. Client requests never exceed 400 route points and preserve route endpoints.
4. `live-traffic` is a first-class Rider Map Studio layer and is off by default.
5. Enabling `live-traffic` queries TomTom only server-side.
6. Missing API configuration/provider failure cannot render as an empty-success traffic layer.
7. TomTom failure does not suppress successful OSM/NWS map features.
8. Traffic incident geometries render through the existing rider-feature GeoJSON source/layers.
9. Unit tests cover sampling, route-summary semantics, map incident normalization/federation, no-key behavior, and partial provider failure.
10. Existing GraphHopper/Valhalla planner behavior remains unchanged.
