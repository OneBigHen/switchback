# Switchback roadmap

## v0.1 Operational Planner - complete

## Phase 1: Foundation and routing contracts

Define the provider-neutral domain, scoring, GraphHopper adapter, GPX serializer, config validation, and test fixtures.

## Phase 2: Live routing and curvature

Connect the pinned GraphHopper 11 runtime, expose normalized route APIs, query bounded curvature data, and prove distinct live profile results.

## Phase 3: Map-first planner

Build the responsive planner, point selection, geocoding, map layers, alternative comparison, explicit loading/error/empty states, and route camera behavior.

## Phase 4: Save, export, and ride

Add local-first route library, GPX download, a focused ride view, geolocation boundaries, wake lock handling, and installable metadata.

## Phase 5: Product verification

Run live provider checks, unit/integration coverage, lint, typecheck, production build, and desktop/mobile browser interaction tests with screenshots.

## v0.2 Rider Workbench

### Phase 6: Draw the road you mean

**Status: partial.** Touch-first rough-corridor sketching, bounded simplification, legal-road conversion, editable shaping points, route-edit history, stop reordering, reversal, avoid areas, and per-segment ride character exist. Must-use road/corridor locks and automatic line extraction from reference images remain open. This is the signature differentiator and must remain excellent on iPhone Safari.

### Phase 6.1: Core planner and routing hardening - current gate

Stabilize the route-to-a-place path before adding more breadth: robust free-form intent, explicit GPS acquisition for a fresh browser, a modular waypoint resolver, Google Places Text Search with location-biased Photon fallback, distinct same-profile alternatives, and GraphHopper-primary hybrid routing with optional Valhalla alternatives/fallback, elevation, provenance, provider health, and focused contract tests. Implementation is present in the working tree; refreshed full-suite, build, live-provider, and public-browser evidence are required before this gate is complete.

### Phase 7: Rider Map Studio

**Status: partial.** A layer catalog, named Map Packs, styles, and several planning overlays exist. Complete licensed semantics, provenance/freshness, and decision-grade coverage for public/private land, MVUM/access, closures, traffic, weather, services, and cell coverage remain open.

### Phase 8: Navigation that does not fight the rider

**Status: partial.** Explicit rejoin controls and browser ride recovery exist. Manifest-driven regional graph tiles, atomic browser installation, and a directed/turn-aware offline router now exist; generated PA/NJ artifacts, randomized production-graph comparison, offline basemap/overlay packaging, a physical airplane-mode drill, full completed-waypoint lifecycle, closure detours, overnight recovery, and companion-display validation remain release gates until each has current evidence.

### Phase 9: Multi-day ride command center

**Status: partial.** Some route weather, stop discovery, and editable waypoint foundations exist. A coherent multi-day stage model, fuel envelopes, daylight/weather windows, lodging/camping plans, alternate plans, checklists, and timeline are not complete.

### Phase 10: Portable rider library

**Status: partial.** Local routes, Worker-backed GPX/KML/KMZ import, explicit road matching that preserves source tracks, track/route/cue GPX exchange, filtering, and reference-image overlay foundations exist. Automatic reference-line extraction, recorded-ride media, sync, privacy zones, collaboration, and live safety sharing remain open.

### Phase 11: Personal road intelligence

**Status: partial.** Some route scoring and explicit preferences exist, but durable per-rider/per-motorcycle learning is incomplete and community road reports (`LEARN-02`) are not implemented.

### Phase 12: Suite hardening and regional expansion

Expand routing and decision-support data beyond Pennsylvania, test provider fallbacks, enforce cache and privacy boundaries, run offline and recovery drills, measure map/render/battery performance, and complete a real-device iPhone matrix before a wider release.
