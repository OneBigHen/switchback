# Open-source native navigation stack review

**Date:** 2026-10-06  
**Target:** SwitchBack / OpenGravel  
**Status:** research + implementation recommendation

## Executive decision

Do **not** fork Organic Maps as the application base and do **not** make MapLibre Navigation iOS the default new native stack.

For a future thin native iOS shell, the strongest fit is:

1. **Ferrostar** for navigation session state, route progress, deviation handling, native voice guidance, and composable iOS UI.
2. **MapLibre SwiftUI DSL / MapLibre Native** for the native map surface and OpenGravel-owned overlays.
3. **Existing OpenGravel routing/scoring APIs** remain authoritative. GraphHopper/Valhalla/TomTom continue to propose candidates and OpenGravel continues to decide which route the rider receives.
4. **Organic Maps** is a source of selectively reusable Apache-2.0 implementation ideas and reference behavior, especially CarPlay, GPX/track recording, offline UX, bookmarks, search, and background-location behavior. Do not import the entire C++ application core unless a later benchmark proves that replacing OpenGravel's existing stack is worth the complexity.
5. Keep the current PWA as production until the repository's native decision gate is explicitly reopened. This work is a bounded spike, not a silent architecture replacement.

This preserves ADR 0017's central rule: **providers propose; OpenGravel decides**.

---

## Important correction: MapLibre Navigation does exist on iOS

There are now two MapLibre navigation paths worth distinguishing.

### maplibre/maplibre-navigation-ios

Repository:

- https://github.com/maplibre/maplibre-navigation-ios

What it provides:

- native iOS turn-by-turn navigation;
- Swift Package Manager installation;
- MapLibre map rendering;
- route progress / maneuver guidance;
- custom route styling;
- MIT + ISC licensing.

Why it is **not** the first choice for new OpenGravel native work:

- it descends from the old Mapbox Navigation SDK v0.21 architecture;
- it still carries older Mapbox-era naming and assumptions;
- its own README recommends **Ferrostar for new projects**, specifically calling out easier integration with GraphHopper / Valhalla and better SwiftUI support;
- OpenGravel already has substantial route-selection and browser navigation logic, so importing another older full navigation stack creates more duplication than leverage.

Use it as:

- a behavior/reference implementation;
- a fallback candidate if Ferrostar fails a concrete acceptance criterion;
- a source for specific navigation UI patterns that are permissively licensed.

Do not start by porting OpenGravel onto it.

### maplibre/maplibre-navigation-android

Repository:

- https://github.com/maplibre/maplibre-navigation-android

Despite the repository name, the v5 core has moved to Kotlin Multiplatform and supports Android, iOS, JVM, JS, and Wasm targets.

This is worth tracking, but it is still a weaker immediate fit than Ferrostar for OpenGravel because the native iOS product surface, SwiftUI integration, and GraphHopper-focused extension story are already stronger in Ferrostar.

---

## Best fit: stadiamaps/ferrostar

Repository:

- https://github.com/stadiamaps/ferrostar
- Guide: https://stadiamaps.github.io/ferrostar/

License:

- BSD-3-Clause.

Why this matches OpenGravel unusually well:

- native iOS and Android bindings;
- SwiftUI and Jetpack Compose UI;
- MapLibre-based map components;
- native TTS / voice guidance;
- route progress and deviation handling;
- custom route providers;
- explicit support for GraphHopper and Valhalla;
- ability to replace routing, location, deviation, and UI components independently;
- no required vendor telemetry;
- route generation is intentionally separate from navigation.

That last point is critical. OpenGravel should **not** let Ferrostar become the route-selection brain.

The desired ownership boundary is:

```
OpenGravel planner
  |
  |  rider intent + preferences
  v
candidate generation
  |
  |  GraphHopper / Valhalla / TomTom
  v
OpenGravel eligibility + evidence + scoring + role selection
  |
  |  chosen route + instructions + metadata
  v
OpenGravel native route adapter
  |
  v
Ferrostar navigation session
  |
  +--> MapLibre SwiftUI map
  +--> native location
  +--> native TTS
  +--> route progress / off-route state
  +--> future CarPlay shell
```

Ferrostar should execute a route that OpenGravel has already chosen.

---

## Highest-value low-hanging integrations

### P0 — OpenGravel route -> Ferrostar adapter

**Effort:** S  
**Risk:** low  
**Value:** very high

Create a small native adapter that converts the existing OpenGravel planned-route contract into Ferrostar's route model.

The adapter must preserve:

- route geometry;
- maneuver locations;
- maneuver type/modifier;
- street name;
- leg distance/duration;
- route duration;
- route metadata needed by the HUD;
- stable OpenGravel route/candidate ID.

Do not re-request a different route from Ferrostar after OpenGravel has already selected one.

If Ferrostar's public model cannot ingest all required route metadata directly, implement a custom route provider rather than changing the OpenGravel routing API around the SDK.

**Acceptance:** a route selected by the current OpenGravel API can be replayed in an iOS simulator with matching geometry and maneuver sequence.

### P0 — MapLibre SwiftUI native map spike

Repository:

- https://github.com/maplibre/swiftui-dsl

**Effort:** S  
**Risk:** low  
**Value:** high

Use the MapLibre SwiftUI DSL for a native map proof instead of writing a large UIKit bridge.

Spike only:

- OpenGravel route line;
- rider puck;
- next maneuver;
- current OpenGravel rider overlays;
- camera follow / overview;
- portrait and landscape content insets.

The package already supports overlays, polylines, gestures, camera control, dynamic styling, and direct Ferrostar integration.

Do **not** build a second permanent renderer abstraction in the web application. This belongs only inside the native shell experiment.

### P0 — Native guidance parity harness

**Effort:** S  
**Risk:** low  
**Value:** high

OpenGravel already has:

- `navigation-engine.ts`;
- route matching;
- spatial indexing;
- weak-signal handling;
- ambiguity handling;
- off-route state;
- route progress;
- instruction advancement;
- reroute state;
- navigation camera math.

Do not throw this work away without evidence.

Build a recorded-fix replay fixture that feeds identical GPS traces to:

1. current OpenGravel navigation logic;
2. Ferrostar.

Compare:

- matched progress;
- next maneuver;
- off-route transition;
- recovery;
- arrival;
- noisy/weak GPS behavior.

The goal is to discover what Ferrostar can safely replace rather than assuming replacement.

### P1 — Native voice guidance

**Effort:** S  
**Risk:** low-medium  
**Value:** high

Ferrostar already exposes platform-native TTS.

Use this instead of rebuilding browser speech behavior in Swift.

OpenGravel still owns:

- what route is being ridden;
- safety/workload policy;
- whether an OpenGravel Free Ride suggestion is allowed.

Ferrostar owns normal maneuver speech.

### P1 — Native background location

**Effort:** S-M  
**Risk:** medium  
**Value:** very high

This directly attacks one of the unresolved native-decision measurements: continuity through app/screen state changes.

Measure:

- screen locked;
- application backgrounded;
- long stationary stop;
- Bluetooth audio active;
- reconnect after app suspension.

Do not claim native is necessary until this is compared against the tuned PWA using the existing field protocol.

### P1 — CarPlay research seam

Do **not** make CarPlay dependent on Organic Maps internals.

Use Organic Maps as a reference implementation because it has a real CarPlay integration and years of edge-case history. Study:

- template lifecycle;
- maneuver presentation;
- route overview;
- phone / CarPlay synchronization;
- connection and disconnection behavior;
- background navigation ownership;
- regression tests / issue history.

Implement OpenGravel's CarPlay surface around the chosen native navigation state model.

Apple entitlement availability remains an external gate.

---

## Organic Maps: what is worth borrowing

Repository:

- https://github.com/organicmaps/organicmaps

License:

- application code: Apache-2.0;
- binary map data has separate licensing;
- Organic Maps requests visible project attribution when its source/UI is reused.

Organic Maps is excellent engineering reference material but a poor low-friction base for SwitchBack.

Why not fork it wholesale:

- large C++ core;
- Objective-C / Swift iOS layers;
- its own map-data format and generation pipeline;
- its own routing engine assumptions;
- its own search/indexing model;
- major overlap with OpenGravel's existing GraphHopper, offline, GPX, storage, and route-decision work.

### Pieces worth studying or selectively porting

#### 1. CarPlay

High value as a reference for:

- Apple CarPlay navigation templates;
- lifecycle;
- trip start/stop;
- reconnect;
- route UI;
- maneuver UI;
- phone/car state synchronization.

Treat it as reference code and copy only isolated Apache-licensed implementation where doing so is materially simpler than writing the equivalent small component.

#### 2. Track recording

Organic Maps already handles:

- background GPS;
- GPX track recording;
- altitude/speed-related ride data;
- track persistence/export.

Compare its behavior against OpenGravel's recording session. Borrow tests, state transitions, and algorithms where useful.

#### 3. GPX / KML / GeoJSON import-export behavior

Use its edge cases and test corpus as a compatibility reference.

OpenGravel should keep its own route/ride domain model.

#### 4. Offline UX

Study:

- download state;
- partial/offline state;
- storage pressure;
- region management;
- offline search behavior;
- recovery when data is missing.

This is more valuable than copying Organic Maps' `.mwm` pipeline.

#### 5. Offline search

Organic Maps' local search is strategically interesting, but integrating its complete indexing engine is **not** low-hanging.

First determine whether OpenGravel actually needs full offline POI search versus a compact ride-focused offline POI index generated alongside the existing regional packs.

#### 6. Bookmarks / tracks

Useful interaction model for:

- folders/collections;
- imported GPX;
- saved tracks;
- quick map visibility toggles.

Again, port behavior and small algorithms, not the whole persistence subsystem.

---

## Organic Maps API for iOS is not an embeddable SDK

Repository:

- https://github.com/organicmaps/api-ios

Despite its name, this is primarily an **inter-app URL/deep-link API**.

It is useful if OpenGravel ever wants an "Open in Organic Maps" escape hatch, but it is not a route to embedding Organic Maps' renderer/navigation engine inside OpenGravel.

Do not spend implementation time on this for the native shell.

---

## Repo shortlist

| Priority | Repository | Use | License | Decision |
|---|---|---|---|---|
| 1 | `stadiamaps/ferrostar` | Native navigation core + SwiftUI/Compose UI + voice | BSD-3-Clause | **Adopt for spike** |
| 2 | `maplibre/swiftui-dsl` | Native iOS map UI | BSD-3-Clause | **Adopt for spike** |
| 3 | `organicmaps/organicmaps` | CarPlay/offline/GPX/reference + selective code | Apache-2.0 | **Mine selectively** |
| 4 | `maplibre/maplibre-navigation-ios` | Alternate iOS navigation/reference | MIT + ISC | **Benchmark fallback** |
| 5 | `maplibre/maplibre-navigation-android` | KMP navigation core | MIT | **Watch / benchmark later** |
| 6 | `organicmaps/api-ios` | Deep-link into Organic Maps | BSD-2-Clause | **Not core integration** |

---

## What should *not* be copied

Do not copy:

- CalTopo proprietary APK code;
- Goat Maps proprietary application code unless separately licensed;
- proprietary Mapbox Navigation SDK internals;
- Organic Maps binary map files without separately satisfying their data license;
- UI branding/assets from other navigation products.

Every imported source file must have:

- upstream repository;
- upstream commit/tag;
- license;
- local modifications;
- attribution requirement.

Add a third-party provenance ledger before the first copied source file lands.

---

## Proposed native spike structure

This is deliberately isolated from the production web app.

```
native/
  ios/
    OpenGravel/
      App/
      Navigation/
        OpenGravelRouteAdapter.swift
        OpenGravelNavigationStore.swift
        NavigationReplayFixture.swift
      Map/
        RideMapView.swift
        OpenGravelOverlayContent.swift
      Voice/
      CarPlay/          # later gated slice
      Tests/
  fixtures/
    navigation/
      clean-route.json
      noisy-gps.json
      missed-turn.json
      resume-mid-route.json
```

No routing engine is moved into the client.

The app requests the same OpenGravel-selected route contract used by the current product.

---

## First implementation slices

### Slice A — zero-product-risk proof

- add a minimal iOS test app;
- add Ferrostar through SwiftPM;
- add MapLibre SwiftUI;
- hard-load one checked-in OpenGravel route fixture;
- render route + puck;
- replay synthetic GPS;
- show next maneuver and distance;
- no network routing;
- no production API changes.

### Slice B — existing OpenGravel API

- request one selected route from OpenGravel;
- convert via `OpenGravelRouteAdapter`;
- navigate it;
- preserve route ID and OpenGravel metadata;
- compare maneuver sequence against browser output.

### Slice C — device evidence

Run the native decision measurements already listed in `docs/operations/NATIVE_DECISION.md`:

- GPS continuity;
- screen lock/background;
- voice/media coexistence;
- wake/mounted ride;
- offline retention;
- Bluetooth;
- battery;
- termination/recovery.

Only after this evidence should the project decide whether native becomes a product path.

### Slice D — motorcycle-specific differentiation

Once the shell is proven, wire existing OpenGravel features rather than inventing generic nav UI:

- three-slot ride telemetry;
- route-ahead gravel/surface evidence;
- Free Ride suggestion "Take" action;
- closures/access warnings;
- rider-selected map layers;
- route recovery;
- ride recording;
- route checkpoint/resume.

---

## Acceptance gates

The spike is successful only if all are true:

- OpenGravel-selected GraphHopper route can be navigated without a second routing request.
- Maneuver ordering matches OpenGravel's source route.
- Rerouting remains under OpenGravel policy control.
- The map can host OpenGravel overlays without forking Ferrostar.
- Navigation state is observable by OpenGravel UI.
- Native TTS can coexist with media playback.
- Background location materially improves reliability relative to the PWA.
- License/provenance is clean.
- The integration does not require adopting a commercial routing dependency.

If these fail, keep the PWA and use the failed spike to identify the exact native capability that needs a thinner bridge.

---

## Recommended conclusion

The lowest-regret path is **not Organic Maps vs. MapLibre Navigation**.

It is:

**OpenGravel routing intelligence + Ferrostar navigation execution + MapLibre SwiftUI rendering**, with Organic Maps used as a mature source of specific navigation/offline/CarPlay patterns.

This gives OpenGravel a credible path to native iOS without surrendering the parts of the product that are actually differentiated.
