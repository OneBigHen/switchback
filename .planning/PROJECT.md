# Switchback

## Product

Switchback is a map-first motorcycle route planner for riders who care more about the road than the shortest ETA. It combines legal-road routing with motorcycle-specific profiles, curvature intelligence, route comparison, GPX portability, and a focused on-bike mode.

The first operational region is Pennsylvania and the surrounding Northeast because the workspace already contains a validated GraphHopper graph and an indexed road-curvature dataset for that area. The architecture must expand to other extracts without changing product code.

## Core value

A rider can choose two places, compare genuinely different motorcycle routes, understand why each route is worth riding, save the choice, export a valid GPX file, and open a distraction-minimized ride view.

## Current milestone: v0.2 Rider Workbench

Switchback now moves from a capable regional planner to a full motorcycle route workbench. The competitive target is not feature-count parity with one app. It is a coherent combination of:

- Scenic-grade route shaping on an iPhone
- Gaia-grade map and overlay control
- onX-grade access, surface, and trail confidence
- REVER/calimoto-grade motorcycle discovery, without surrendering exact route control

The signature interaction is **show Switchback the ride you mean**: describe it, sketch a rough corridor directly on the map, import a route or reference map, then let the router turn that intent into legal road-following geometry while keeping every shaping decision editable.

The milestone remains local-first and usable without an account. Optional sync, sharing, and model-backed interpretation must add capability without becoming a gate to planning, exporting, or riding.

## Stack decision

- Next.js 16 and React 19 for one deployable web/PWA surface
- MapLibre GL JS for map rendering
- OpenFreeMap vector tiles by default, replaceable through configuration
- Self-hosted GraphHopper 11 as the primary legal-road router, instruction source, and motorcycle-profile engine
- Optional Valhalla through a pinned, loopback-only PA/NJ Compose runtime as a supplemental alternative and supported-request fallback, never as a silent replacement for GraphHopper-only Adventure or native round-trip behavior
- Optional Valhalla elevation enrichment through `/height`, independent of whether Valhalla routing is enabled
- App-owned route scoring and SQLite curvature data so the product is not limited to car-routing heuristics
- Google Places Text Search for destination precision when a server-only key is configured, with location-biased Photon fallback when Google is unavailable or unconfigured
- IndexedDB for local-first saved routes and ride history

Mapbox and Google routing remain optional future providers. Neither is the routing core because Mapbox exposes no motorcycle routing profile and Google two-wheeler routing has regional/product constraints and does not provide the custom curvy/scenic model needed here. Google Places may improve destination lookup without changing that routing decision.

## Principles

1. The map is the product surface, not a decorative panel.
2. A route is never drawn as a straight-line fake when routing is unavailable.
3. Provider failures are named and actionable.
4. Route quality is visible through road mix, turn density, curvature, and tradeoffs.
5. Planner state and high-frequency location state stay separate.
6. Desktop planning and handlebar-mounted mobile use have distinct information density.
7. No sign-in gate, ads, feed-first engagement loop, or subscription machinery is allowed to obstruct core planning.
8. Intelligence proposes and explains; the rider can inspect, edit, lock, undo, or reject every route-shaping choice.
9. A road layer must disclose its source, freshness, coverage, and limitations before it influences route confidence.

## Reuse boundary

Reuse contracts, algorithms, fixtures, and proven infrastructure ideas. Do not copy an old application tree, generated build output, dependency directory, giant React context, stale provider credentials, or old branding.
