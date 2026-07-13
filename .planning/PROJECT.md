# Switchback

## Product

Switchback is a map-first motorcycle route planner for riders who care more about the road than the shortest ETA. It combines legal-road routing with motorcycle-specific profiles, curvature intelligence, route comparison, GPX portability, and a focused on-bike mode.

The first operational region is Pennsylvania and the surrounding Northeast because the workspace already contains a validated GraphHopper graph and an indexed road-curvature dataset for that area. The architecture must expand to other extracts without changing product code.

## Core value

A rider can choose two places, compare genuinely different motorcycle routes, understand why each route is worth riding, save the choice, export a valid GPX file, and open a distraction-minimized ride view.

## Stack decision

- Next.js 16 and React 19 for one deployable web/PWA surface
- MapLibre GL JS for map rendering
- OpenFreeMap vector tiles by default, replaceable through configuration
- Self-hosted GraphHopper 11 for legal-road geometry, instructions, and motorcycle profiles
- App-owned route scoring and SQLite curvature data so the product is not limited to car-routing heuristics
- IndexedDB for local-first saved routes and ride history

Mapbox and Google remain optional future providers. Neither is the core because Mapbox exposes no motorcycle routing profile and Google two-wheeler routing has regional/product constraints and does not provide the custom curvy/scenic model needed here.

## Principles

1. The map is the product surface, not a decorative panel.
2. A route is never drawn as a straight-line fake when routing is unavailable.
3. Provider failures are named and actionable.
4. Route quality is visible through road mix, turn density, curvature, and tradeoffs.
5. Planner state and high-frequency location state stay separate.
6. Desktop planning and handlebar-mounted mobile use have distinct information density.
7. No sign-in gate, ads, social feed, AI copilot, or subscription machinery in the first milestone.

## Reuse boundary

Reuse contracts, algorithms, fixtures, and proven infrastructure ideas. Do not copy an old application tree, generated build output, dependency directory, giant React context, stale provider credentials, or old branding.
