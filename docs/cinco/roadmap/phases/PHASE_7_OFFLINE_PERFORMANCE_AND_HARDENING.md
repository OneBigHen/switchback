# Phase 7 — Offline, Performance, and Hardening

## Goal
Make the new UX resilient: renderer fallback, offline verification, device-level map quality, and performance budgets.

## Offline routing verification

Before modifying:
- trace where `offline-routing.worker.ts` and offline-v2 contracts are actually instantiated;
- document current call path;
- identify whether planner routing, region downloads, and route UI consume v2 in production.

Do not claim offline routing works end-to-end based on file existence.

## Offline map behavior

Mapbox GL JS web rendering must not silently become an offline requirement.

Define:
- what map experience is available offline,
- what renderer is used,
- what cached tiles/style resources are permitted,
- what happens when no basemap is available,
- whether route line/navigation still renders on a minimal fallback canvas.

Do not violate third-party map licensing/cache terms.

## Shared road-character graph direction

Longer-term offline Free Ride requires routing/offline edges to know rider characteristics.

Candidate edge enrichments:
- curvature,
- curve density,
- flow,
- scenic proxy,
- elevation,
- urban penalty,
- signal/stop density,
- surface,
- novelty,
- rider utility,
- data confidence.

Do not duplicate RIG and offline attributes without documenting source-of-truth rules.

## Performance budgets

Establish measurable budgets rather than “feels smooth.”

Track:
- map initialization,
- first useful route render,
- pan/zoom responsiveness,
- source update rate,
- React render counts in high-frequency navigation,
- memory growth during long ride simulation,
- layer count,
- route replan latency separate from map rendering.

## Map detail tiers

Support:
- reduced,
- standard,
- premium.

Reduced mode may:
- lower 3D decoration,
- lower pitch,
- simplify noncritical overlays,
- reduce expensive visual effects.

It may not:
- hide selected route,
- hide critical hazards,
- reduce maneuver readability.

## Renderer fallback drill

Test:
1. Mapbox configured and online.
2. Mapbox token absent.
3. Mapbox style network failure.
4. MapLibre selected.
5. network offline after initial load.
6. route/navigation state survives renderer fallback where technically feasible.

## PWA
Preserve:
- application shell,
- saved routes,
- correct refusal to fake-cache dynamic API success.

## Soak
Use the existing memory-soak infrastructure where appropriate.

## Acceptance criteria
- no uncontrolled memory growth in representative navigation simulation;
- renderer failure is intentional;
- route state survives nonfatal map failures;
- reduced tier remains functional;
- offline route code path is documented honestly;
- critical PWA tests remain green.
