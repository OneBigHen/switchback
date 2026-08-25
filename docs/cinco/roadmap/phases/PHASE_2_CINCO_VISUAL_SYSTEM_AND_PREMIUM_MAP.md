# Phase 2 — CINCO Visual System and Premium Map

## Goal
Deliver the map-first phone/tablet experience and validate Mapbox Standard as a premium online renderer without sacrificing fallback behavior.

## Part A — Visual design system

### Required semantic tokens
Create/normalize tokens for:
- route primary,
- alternatives,
- traversed,
- navigation,
- rider location,
- fun-road highlight,
- unpaved/gravel,
- warning,
- closure,
- weather risk,
- floating surface,
- sheet surface,
- selected surface,
- muted map data.

### Typography
Preserve DM Sans/Sora unless a deliberate design review chooses otherwise.

Create roles:
- display,
- maneuver,
- route title,
- primary metric,
- secondary metric,
- label,
- metadata,
- warning.

### Spacing
Use existing spacing tokens where possible.
Do not invent independent 13px/17px/23px paddings per component.

### Surface hierarchy
Avoid “card soup.”
Use cards only for meaningful grouping.

## Part B — Responsive shell

### Phone home
- full map;
- search pill;
- compact map controls;
- ContextSheet peek with Free Ride / Round Trip / Destination;
- recent route;
- bottom nav when appropriate.

### Tablet landscape
- 384px target left workspace;
- full remaining map;
- optional contextual right inspector;
- map camera uses panel insets.

### Tablet portrait
- planning rail / split layout;
- map remains visible;
- no stretched-phone center column.

## Part C — Premium Mapbox experiment

### Dependency
Add Mapbox GL JS only in this phase, not earlier.

### Feature flag
Support:
```text
NEXT_PUBLIC_MAP_RENDERER=maplibre|mapbox
NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN=...
```

### Required styles
- Mapbox Standard
- Mapbox Standard Satellite

### Required Standard capabilities to validate
- terrain,
- 3D objects,
- day/dusk/night lighting,
- custom route layers,
- rider layers,
- custom layer slots,
- route selection,
- navigation,
- camera padding.

### Fallback
If:
- token missing,
- style fails,
- renderer initialization fails,
then application must either:
1. use MapLibre fallback automatically, or
2. surface a clear recoverable map error and allow fallback.

Preferred: automatic fallback with a non-blocking diagnostics signal.

## 3D map rules
- planning may pitch 35–55° when useful;
- navigation pitch is conservative and route-focused;
- user can return to north-up / flatter view;
- alternatives remain legible;
- route line contrast holds on vector and satellite;
- dusk/night route still dominates terrain.

## Performance
Do not use React state for every high-frequency map frame.
Keep map source/layer updates imperative behind focused controllers.

## Acceptance criteria
- Phone portrait matches written hierarchy.
- Phone landscape is usable.
- Tablet layouts use available width.
- Mapbox and MapLibre both initialize under their configured paths.
- Missing Mapbox token does not break planner.
- selected/alternative routes are clearly differentiated.
- light/dark/dusk/night checks pass.
- visual states are captured at defined viewports.
- no route/provider behavior changed.
