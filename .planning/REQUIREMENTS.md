# Switchback v0.1 requirements

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
- [x] RIDE-02: Use browser geolocation without pushing every update through the full React tree
- [x] RIDE-03: Request a screen wake lock when supported and release it cleanly
- [x] RIDE-04: Maintain 48px minimum primary touch targets

## Operations and quality

- [x] OPS-01: Pin the GraphHopper engine/cache compatibility contract
- [x] OPS-02: Expose app and routing-provider health
- [x] OPS-03: Keep map, geocoder, and router endpoints configurable
- [x] OPS-04: Cover routing/scoring/export behavior with automated tests
- [x] OPS-05: Pass production build plus desktop and mobile browser smoke tests

## Later milestones

- Offline regional map packs and reroute
- GPX/KML/KMZ import worker and route matching
- Recorded rides, history, replay, and photos
- Weather radar, fuel/rest POIs, and hazard context
- Share links, groups, live tracking, and social discovery
- Native shells only after the PWA routing and ride flows are stable
