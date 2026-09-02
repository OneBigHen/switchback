# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Switchback serves motorcycle riders planning, comparing, preparing, riding, and reviewing road trips. Riders may be planning deliberately at a desk, making a quick choice on a phone, or glancing at guidance while stopped or moving. Advanced riders need powerful controls without making a new rider confront provider or diagnostic complexity.

## Product Purpose

Switchback is a motorcycle trip decision engine. It helps a rider choose the road they will actually want to ride, understand the tradeoffs before committing, navigate safely, and retain a useful record afterward.

## Positioning

Ordinary map products answer which route is practical. Switchback answers which eligible route best fits the rider, bike, road character, surface, time budget, conditions, and safety constraints. Providers propose candidates; Switchback evaluates and explains them.

## Operating Context

The core journey is Plan, Decide, Prepare, Ride, and Review. Plan, route editing, recording, guided riding, and Free Ride Live share one persistent map workspace. Rides and Discover are dedicated destinations. Settings is secondary. Phone, tablet, and desktop share state and actions but use device-appropriate compositions. Riding surfaces must remain glanceable in sunlight, safe areas, gloves, degraded GPS, offline coverage, and recovery states.

## Capabilities and Constraints

- Preserve GraphHopper as the self-hosted routing baseline and the current optional provider, traffic, incident, weather, GPX, road-lock, offline, privacy, identity, sync, recording, and sharing contracts.
- Preserve Mapbox Standard, Terrain, Satellite, lighting, route ribbons, follow camera, and the MapLibre rollback boundary. Do not add Mapbox Directions.
- Primary destinations are Plan, Rides, and Discover. Record is a map activity; Settings is secondary.
- Advanced capability remains reachable through progressive disclosure. Curated customization is bounded and validated; there is no arbitrary dashboard builder.
- The product remains local-first and account-optional for planning, saving, GPX work, riding, and offline use.
- One authoritative map instance remains alive during normal planner and riding transitions.
- Missing providers or keys disable only their capability and must produce honest unavailable or degraded states.

## Brand Commitments

The name is Switchback and the approved mark and owner-supplied brand boards remain binding assets. The product voice is concise, practical, rider-literate, and honest. It must feel like a purpose-built motorcycle route instrument rather than a generic SaaS product. The detailed active visual authority is `design/DESIGN-CONTRACT.md`.

## Evidence on Hand

- Owner-approved V2 planning package normalized under `/root/.hermes/runs/20260830-042301-6d0994c4/package/` with a SHA-256 manifest.
- Brand boards in `design/reference/v2/`.
- Existing deterministic unit, integration, critical browser, PWA, mobile QA, and visual suites.
- Existing live product states and committed screenshots are engineering evidence, not visual authority for the replacement world.
- Real-iPhone riding and offline acceptance cannot be fabricated and remains a physical evidence boundary.

## Product Principles

1. The map and rider session are the product center.
2. Every visible element must earn its space through a decision, action, essential status, or orientation.
3. Route power stays available without dominating the ordinary rider path.
4. Preserve truthful capability and uncertainty; never decorate missing data into confidence.
5. Moving-state safety and glanceability outrank decorative expression.

## Accessibility & Inclusion

Target WCAG 2.2 AA, 44px touch targets, visible keyboard focus, reduced motion, safe-area support, textual equivalents for map meaning, and status announcements for routing, GPS, recovery, and recording. Route or warning meaning may not rely on color alone.
