# Map Rendering and 3D Strategy

## Decision

Adopt a **renderer strategy**, not a one-way rewrite.

### Near-term target
- **Mapbox GL JS + Mapbox Standard / Standard Satellite**: premium online rendering experiment and likely online default if acceptance gates pass.
- **Existing MapLibre path**: preserved fallback and offline-compatible direction.
- Switchback routing, route scoring, road intelligence, Free Ride, navigation, and live road conditions remain application-owned.

## Why Mapbox is attractive

As of 2026-08-22, official Mapbox documentation describes Mapbox Standard as its recommended modern style family, with:
- terrain,
- 3D buildings,
- 3D landmarks,
- 3D trees,
- elevated structures,
- dynamic dawn/day/dusk/night lighting,
- Standard Satellite,
- custom-layer slots (`bottom`, `middle`, `top`).

This fits the desired cinematic road-and-terrain presentation.

Official reference:
- https://docs.mapbox.com/map-styles/reference/standard/
- https://docs.mapbox.com/map-styles/guides/standard-styles/
- https://docs.mapbox.com/map-styles/reference/standard-satellite/
- https://docs.mapbox.com/style-spec/reference/slots/

## Important Mapbox Standard limitation

Mapbox Standard is **not** the same as a fully editable Classic style:
- layer customization is intentionally constrained;
- interactions use featuresets for built-in Standard features;
- custom data layers should use documented slots;
- built-in layer querying/customization differs from current MapLibre-style assumptions.

Therefore:
- do not mechanically port `MapStage.tsx`;
- inventory every current custom source/layer/interaction first;
- map Switchback-owned data onto custom layers;
- isolate base-map-specific behaviors.

## Renderer abstraction goal

Do not over-engineer a universal GIS framework.

Create the smallest boundary that isolates:
- map creation,
- style selection,
- route data source updates,
- route line layers,
- navigation line / puck,
- rider feature layers,
- camera fitting,
- follow camera,
- padding/insets,
- basic feature interactions,
- terrain/pitch support where available.

Possible shape:

```ts
type MapRendererId = "maplibre" | "mapbox"

interface SwitchbackMapRuntime {
  readonly renderer: MapRendererId
  setViewportInsets(insets: MapViewportInsets): void
  fitRoute(routeId: string, options?: FitRouteOptions): void
  followNavigation(frame: NavigationFrame): void
  setRoutes(data: RouteMapPresentation): void
  setRiderLayers(layers: RiderLayerPresentation[]): void
  setTheme(theme: MapTheme): void
  destroy(): void
}
```

Do not copy this interface blindly if existing code already has a better seam. Its purpose is responsibility isolation.

## Environment flags

Recommended concept:

```text
NEXT_PUBLIC_MAP_RENDERER=maplibre|mapbox
NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN=...
```

Rules:
- token is never committed;
- app must show an intentional fallback if the premium renderer cannot initialize;
- no secret token is placed into test fixtures;
- public Mapbox token restrictions should be configured outside the repo.

## Map styles

Online premium modes:
1. `CINCO` — Standard-based vector style, rider-oriented.
2. `SATELLITE` — Standard Satellite.
3. `NIGHT` — dark/dusk/night lighting configuration, not merely a CSS overlay.

Fallback/legacy modes may remain during migration.

## 3D camera

### Planning / route preview
Allow:
- moderate pitch,
- route-relative bearing only when useful,
- terrain emphasis,
- user-controlled reset to north-up / 2D.

### Navigation
Camera is functional:
- route ahead occupies the upper visible map area,
- pitch varies conservatively,
- camera motion is damped,
- re-centering is predictable,
- dragging exits follow state explicitly.

### Do not
- spin camera during route selection;
- use dramatic pitch where labels/route line become unreadable;
- hide alternatives behind terrain;
- make 3D mandatory on weak devices.

## 3D quality tiers

Create a simple capability/performance strategy:

```ts
type MapDetailTier = "reduced" | "standard" | "premium"
```

Example intent:
- `reduced`: lower pitch, fewer decorative 3D objects, simpler rider layers;
- `standard`: terrain + normal rider layers;
- `premium`: richer Standard 3D objects, dynamic lighting, satellite option.

Tier may be selected from capability + user setting. Do not constantly auto-switch while riding.

## Route visual hierarchy

Centralize semantic colors and widths.

Required semantic concepts:
- selected route,
- alternative route,
- traversed route,
- navigation route,
- original route during recalculation,
- free-ride suggestion,
- curvature highlight,
- gravel/unpaved,
- incident/closure,
- weather hazard,
- road lock.

Do not let components hard-code unrelated oranges/blues.

Suggested tokens:
```css
--sb-route-primary
--sb-route-alternative
--sb-route-traversed
--sb-navigation
--sb-location
--sb-road-fun
--sb-road-gravel
--sb-road-risk
--sb-warning
--sb-closure
--sb-weather-risk
--sb-map-surface
--sb-floating-surface
```

Exact colors should be visually validated, not guessed by the agent.

## Mapbox custom layer slots

When using Standard:
- base context overlays: `bottom`
- roads / route support layers that belong with transportation lines: usually `middle`
- primary active route and rider-relevant interactive overlays: `top` or intentionally above all, based on label legibility
- inspect against Standard + Standard Satellite + day/dusk/night.

## Premium visuals for marketing / “touting”

The in-app renderer should create views worthy of screenshots:
- pitched 3D terrain,
- route line with restrained highlight,
- terrain shadows / lighting,
- elevation-aware perspective,
- selected road corridor highlight,
- clean POI density,
- scenic photo/route cards only in non-moving contexts.

Do not create a separate fake visual system just for marketing if the actual product can render the same experience.

## Pricing note

Mapbox pricing changes over time and must not be hard-coded into product behavior.

At preparation time, Mapbox publicly listed a free web GL JS map-load tier up to 50,000 monthly loads, with paid tiers above it.

Reference:
- https://www.mapbox.com/pricing

Implementation must include:
- usage observation,
- renderer feature flag,
- no dependence on paid routing APIs unless separately approved.

## Acceptance gate before Mapbox becomes default

Mapbox may become online default only if:
- route overlays are at least as clear as current MapLibre;
- all required Switchback-owned layers work;
- map initialization failure falls back intentionally;
- critical mobile flows pass;
- camera + sheet insets work;
- night/dusk legibility passes;
- performance is acceptable on target phones/tablets;
- no required offline behavior is removed;
- cost/usage can be monitored.
