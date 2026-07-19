# Switchback requirements

## v0.1 operational planner - complete

## Routing

- [x] RTE-01: Plan a route between two or more geographic points using live GraphHopper geometry
- [x] RTE-02: Offer Quick, Twisty, Scenic, and Adventure motorcycle profiles
- [x] RTE-03: Compare profile alternatives with distance, duration, road mix, and twistiness
- [x] RTE-04: Return turn instructions and snapped waypoints
- [x] RTE-05: Validate provider coverage and show actionable provider errors
- [x] RTE-06: Never substitute straight-line geometry for a failed route

## Planner and map

- [x] MAP-01: Render an interactive MapLibre map with correct attribution
- [x] MAP-02: Search for places and also allow start/finish selection from the map
- [x] MAP-03: Render selected and comparison route geometries distinctly
- [x] MAP-04: Fit the camera to the active route
- [x] MAP-05: Toggle a viewport-bounded curvature overlay without loading the full dataset
- [x] MAP-06: Work as a desktop sidebar and a touch-safe mobile bottom sheet

## Rider data

- [x] DATA-01: Save and delete planned routes locally without an account
- [x] DATA-02: Restore saved route geometry and metadata
- [x] DATA-03: Export a standards-compliant GPX 1.1 track
- [x] DATA-04: Reject malformed or oversized imports before parsing

## Ride mode

- [x] RIDE-01: Open a high-contrast ride surface with next instruction and route progress
- [x] RIDE-02: Use browser geolocation without pushing every update through the full React tree. Navigation frames now publish through a dedicated external store, so GPS updates do not re-render the planner root.
- [x] RIDE-03: Request a screen wake lock when supported and release it cleanly
- [x] RIDE-04: Maintain 48px minimum primary touch targets

## Operations and quality

- [x] OPS-01: Pin the GraphHopper engine/cache compatibility contract
- [x] OPS-02: Expose app and routing-provider health
- [x] OPS-03: Keep map, geocoder, and router endpoints configurable
- [x] OPS-04: Cover routing/scoring/export behavior with automated tests
- [x] OPS-05: Pass production build plus desktop and mobile browser smoke tests

## Core planner hardening - implemented, final release gate pending

- [x] CORE-01: Parse concise destinations, full street addresses, city/state pairs, explicit start/destination commands, route style, and highway-avoidance modifiers from free-form ride text
- [x] CORE-02: Resolve free-form geographic intent through a modular planner resolver that is independent of React and planner-store mutation
- [x] CORE-03: On a fresh browser, request current location when no start is known, then bias destination lookup from the actual route origin and surface actionable location/search errors
- [x] CORE-04: Use server-side Google Places Text Search when `GOOGLE_MAPS_API_KEY` is configured, with location bias and Photon fallback for no-key, empty-result, and provider-failure cases
- [x] CORE-05: Preserve genuinely distinct same-profile alternatives instead of collapsing all variety into one candidate per route personality
- [x] CORE-06: Keep GraphHopper primary while optionally merging supported Valhalla alternatives, falling back to Valhalla when GraphHopper fails, and retaining GraphHopper-only behavior for Adventure and native round trips
- [x] CORE-07: Return route-level provider/version provenance and expose GraphHopper and optional Valhalla health independently without making an optional Valhalla outage fail GraphHopper readiness
- [x] CORE-08: Cover free-form parsing, destination-provider fallback, GPS acquisition, modular waypoint resolution, route diversity, hybrid merge/fallback/provenance, provider health, and Valhalla request/response normalization with automated tests

## v0.2 Rider Workbench

### Intent and route shaping

- [x] SHAPE-01: Let a rider trace a rough corridor with a finger, stylus, or mouse and convert it into a legal road-following route
- [x] SHAPE-02: Bound and simplify sketch input into stable shaping points without exceeding the routing-provider waypoint contract
- [x] SHAPE-03: Keep route endpoints, loop intent, and existing ride preferences intact when applying a sketch
- [x] SHAPE-04: Provide undo and redo for waypoint add, remove, reorder, drag, and sketch operations
- [x] SHAPE-05: Allow per-segment routing character such as Quick to here, Twisty through here, and Adventure after here
- [ ] SHAPE-06: Let riders lock must-use roads or corridors and mark roads or drawn areas to avoid
- [ ] SHAPE-07: Accept reference-map or screenshot input, align it to the live map, and turn an extracted line into an editable route proposal. A reference image can be overlaid and traced manually; automatic line extraction is not implemented

### Mobile editing and route exchange

- [ ] EDIT-01: Make all primary planner and edit actions usable with one hand on current iPhone portrait and landscape sizes
- [ ] EDIT-02: Reorder stops, skip a stop, reverse a route, split stages, and restore a saved route for continued editing
- [x] EDIT-03: Import GPX, KML, and KMZ through a bounded worker and distinguish tracks from routable plans. The versioned import-worker protocol parses files off the main thread and returns normalized routes.
- [x] EDIT-04: Match imported tracks to legal roads without silently replacing intentional off-road or straight-line sections. Matching is an explicit action that creates a separate routing request, preserves the original library track, and rejects disconnected imported geometry instead of inventing connectors.
- [x] EDIT-05: Export route, track, waypoints, cues, and compatibility-safe GPX variants. Track, route, and cue exports are available from route comparison, retain waypoints, and have GPX fixture coverage.

### Map intelligence

- [x] LAYER-01: Provide a layer catalog with named presets plus visibility, order, and opacity controls
- [ ] LAYER-02: Add topo, satellite, terrain/hillshade, public land, private land, MVUM/legal access, and seasonal closure context where licensed data is available
- [ ] LAYER-03: Add traffic/closure, weather/radar, fuel, food, camping, lodging, repair, and cell-coverage planning context
- [x] LAYER-04: Show source, update time, coverage, legend, and confidence for every decision-support layer
- [ ] LAYER-05: Keep viewport requests bounded, cached, cancellable, and independently degradable
- [x] LAYER-06: Save named Rider Map Packs with layer order, opacity, and route-visibility settings

### Routing and navigation intelligence

- [ ] NAV-01: Explain why each candidate was chosen with curvature, surface, access, traffic, weather, and preference evidence
- [x] NAV-02: Support explicit rejoin policies: nearest safe rejoin, next shaping point, skip point, or preserve original line
- [ ] NAV-03: Handle missed turns, fuel detours, pauses, overnight stops, and app restarts without sending the rider back to completed waypoints
- [ ] NAV-04: Download a corridor pack containing basemap, active overlays, route, cues, and offline routing data. Current packs preserve route/cue data only; offline tiles, overlays, and routing data are not included
- [ ] NAV-05: Detect route deviation and closures while preserving a recoverable copy of the planned route
- [ ] NAV-06: Validate a distraction-minimized companion-display path before choosing PWA, CarPlay/Android Auto, or native-shell delivery. No companion-display validation has been completed

### Trip suite, library, and trust

- [ ] TRIP-01: Plan multi-day stages around time, fuel range, food, lodging/camping, daylight, and weather windows
- [ ] TRIP-02: Organize routes, tracks, waypoints, areas, reference maps, and map packs with folders, tags, filters, and bulk visibility
- [ ] TRIP-03: Offer privacy-preserving share links, collaborative trip copies, live safety sharing, and start/end privacy zones
- [ ] TRIP-04: Record and replay rides with photos, notes, deviations, and route-versus-actual comparison
- [ ] LEARN-01: Learn rider preferences from explicit ratings and edits, separated by motorcycle/profile
- [ ] LEARN-02: Surface community road reports with freshness, corroboration, moderation, and easy dismissal. Community reports are not implemented
- [ ] TRUST-01: Keep planning and GPX portability available without account or model-provider dependency
- [ ] TRUST-02: Pass production, offline, recovery, accessibility, and real-device iPhone verification gates for each shipped phase
