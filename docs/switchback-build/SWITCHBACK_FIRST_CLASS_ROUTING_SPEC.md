# Switchback First-Class Routing App Spec

## Product vision

Switchback becomes a full-featured mobile-first web/PWA motorcycle navigation app. It should feel as dependable as Google Maps for basic routing and navigation, but be purpose-built for riders: fun roads, twisties, scenic detours, gravel/adventure options, offline resilience, and a learning recommendation engine.

Core promise:

> Open Switchback, pick a destination or just start riding, and it continuously finds better roads nearby: twistier, prettier, less boring, safer, and more aligned with how this rider actually rides.

## Product modes

### Plan

- Search destinations and places.
- Build manual routes.
- Generate loops by time, distance, or direction.
- Import/export GPX.
- Compare Quick, Balanced, Twisty, Scenic, Adventure, Gravel, and Neural alternatives.
- Show route ribbons with score explanations.

### Ride

- Google Maps-style turn-by-turn navigation.
- Large maneuver banner.
- ETA, distance, current speed, speed limit where available.
- Voice cues.
- Rerouting.
- Traffic-aware ETA where provider supports it.
- Incidents and closures.
- Offline active-route fallback.
- Day/night mode.
- No typing or dense menus while moving.

### Free Ride / Neural Map

- Start riding without a destination.
- Snap position to road and infer heading.
- Passively learn preferences from accepted/rejected suggestions, road choices, detours, stops, time of day, and route completion.
- Actively suggest fun roads, turns, loops, overlooks, stops, scenic detours, traffic escapes, and route improvements.
- Show at most one actionable suggestion at a time.
- Convert accepted suggestions into guided navigation.

## Architecture target

```text
apps/web
  app shell, PWA, MapLibre rendering, planner UI, RideHUD, offline UI

packages/domain
  route contracts, scoring contracts, rider preference model, event schema

packages/map-core
  map adapters, tile sources, overlays, geometry utilities, snapping helpers

packages/routing
  GraphHopper adapter, Valhalla adapter, commercial traffic adapter, candidate generation

packages/recommendation
  road graph feature extraction, route scoring, neural/free-ride suggestion engine

packages/navigation
  maneuver model, guidance state machine, reroute logic, off-route detection, voice cue scheduler

packages/offline
  IndexedDB/Dexie persistence, route packs, tile packs, recorded tracks, sync queues

services/api
  route orchestration, map matching, traffic enrichment, road-feature cache, recommendation API

services/worker
  OSM/road-feature ingestion, precomputation, graph enrichment, ride-history learning jobs
```

## Domain contracts

```ts
export type RideProfile =
  | 'quick'
  | 'balanced'
  | 'twisty'
  | 'scenic'
  | 'adventure'
  | 'gravel'
  | 'avoid-highways'
  | 'neural';

export interface RouteRequest {
  origin: LatLng;
  destination?: LatLng;
  via?: LatLng[];
  loop?: { minutes?: number; miles?: number; directionBias?: number };
  profile: RideProfile;
  avoid?: {
    highways?: boolean;
    tolls?: boolean;
    ferries?: boolean;
    unpaved?: boolean;
    cityCenters?: boolean;
    heavyTraffic?: boolean;
  };
  desired?: {
    twistiness?: number;
    scenic?: number;
    elevation?: number;
    gravel?: number;
    pace?: 'relaxed' | 'normal' | 'spirited';
    maxDetourPct?: number;
  };
  temporal?: TemporalContext;
}

export interface TemporalContext {
  departureTime: string;
  timezone: string;
  daylight: 'day' | 'dawn' | 'dusk' | 'night';
  weather?: WeatherContext;
  traffic?: TrafficContext;
  season?: 'winter' | 'spring' | 'summer' | 'fall';
}

export interface CandidateRoute {
  id: string;
  provider: 'graphhopper' | 'valhalla' | 'mapbox' | 'google' | 'here' | 'synthetic';
  geometry: GeoJSON.LineString;
  distanceMeters: number;
  durationSeconds: number;
  confidence: number;
  maneuvers: Maneuver[];
  segments: RoadSegmentFeature[];
  score: RouteScore;
  warnings: RouteWarning[];
}

export interface RoadSegmentFeature {
  segmentId: string;
  geometry: GeoJSON.LineString;
  roadClass?: string;
  surface?: string;
  smoothness?: string;
  speedLimitKph?: number;
  curvature: number;
  elevationGainMeters?: number;
  scenicScore?: number;
  trafficPenalty?: number;
  signalPenalty?: number;
  stopDensity?: number;
  incidentPenalty?: number;
  funScore: number;
  safetyFlags: string[];
}

export interface RouteScore {
  total: number;
  fun: number;
  twistiness: number;
  scenic: number;
  elevation: number;
  gravel: number;
  traffic: number;
  simplicity: number;
  safety: number;
  novelty: number;
  confidence: number;
  explanation: string[];
}
```

## Fun ride algorithm

Use candidate generation plus scoring, not a single shortest-path weight.

### Candidate generation

1. Fast baseline route.
2. GraphHopper/Valhalla profile route.
3. Waypoint synthesis through high-value road clusters.
4. Loop generation with varied seeds.
5. Detour injection while riding.
6. Novelty candidate using roads not recently ridden.
7. Traffic escape candidate when it avoids congestion or does not materially worsen ETA.

### Road features

Precompute and cache:

- curvature from geometry bearing changes per km;
- curve density and severity;
- elevation gain/loss;
- OSM surface and track type;
- road class;
- speed profile;
- stop/signaled intersection density;
- bridge/tunnel/roundabout/ferry flags;
- scenic proxy from water, ridgelines, parks, forests, overlooks, POIs, protected land, low urban density;
- traffic and incident penalties;
- rider familiarity/novelty;
- legal/access flags.

### Scoring formula

```text
score =
  + twistinessWeight * normalizedCurvature
  + scenicWeight * scenicProxy
  + elevationWeight * elevationInterest
  + gravelWeight * gravelSuitability
  + noveltyWeight * novelty
  - etaPenaltyWeight * detourPenalty
  - trafficWeight * trafficPenalty
  - signalWeight * stopSignalDensity
  - safetyWeight * safetyPenalty
  - uncertaintyWeight * lowConfidencePenalty
```

Hard reject:

- illegal/private/no-access roads;
- roads unsafe for the selected profile;
- excessive detour outside rider tolerance;
- broken geometry or impossible maneuvers;
- suggestions requiring complex interaction during a high workload moment;
- free-ride suggestions too close to current position to act safely.

## Neural Map / Free Ride recommendation loop

Every 10–30 seconds:

1. Update snapped position and heading.
2. Determine horizon: 1–3 miles urban, 3–10 miles rural.
3. Fetch nearby candidate road clusters ahead and lateral to heading.
4. Score possible turns/detours against rider model and temporal context.
5. Suppress suggestions if maneuver workload is high.
6. Show at most one primary suggestion plus one subtle alternate.
7. Allow one-tap accept, ignore, or less-like-this.
8. If accepted, convert suggestion to guided navigation.

Suggestion copy examples:

- “Fun road ahead — right in 0.7 mi — +6 min”
- “Scenic ridge option — 9 mi loop — rejoin later”
- “Traffic escape — left in 0.4 mi — same ETA, twistier”
- “Overlook nearby — 2.1 mi detour”
- “Road you liked last month — 3 mi ahead”

## Rider preference model

```ts
export interface RiderPreferenceModel {
  version: number;
  profileWeights: {
    twistiness: number;
    scenic: number;
    gravel: number;
    elevation: number;
    novelty: number;
    lowTraffic: number;
    etaSensitivity: number;
    simplicity: number;
  };
  contextWeights: {
    daylightOnlyBias: number;
    rainAvoidanceBias: number;
    weekendLongRideBias: number;
    weekdayDirectBias: number;
  };
  learnedFromRideCount: number;
  confidence: number;
}
```

Start with an interpretable local model. Add ML/ranking only after deterministic suggestions work. ML may rank candidates, but must never override legal/access/safety gates.

## Temporal mapping

Implement time-aware routing through:

- live traffic speeds where provider allows;
- traffic incidents and closures;
- time-dependent ETA;
- rush-hour avoidance;
- daylight-aware scenic recommendations;
- weather-aware surface risk;
- seasonal road closures where available;
- traffic signal/stop density penalty;
- school-zone/time-dependent caution where data is available;
- predicted recommendation quality by time of day.

## Live traffic and lights

Traffic lights require tiers:

1. **OSM stop/signal density** — count traffic signals, stop signs, and intersections; use as baseline route penalty.
2. **Provider-enriched road attributes** — optional Mapbox/HERE/TomTom/Google style enrichment if licensed.
3. **Live signal phase/timing** — only available in limited agency or connected-vehicle feeds. Build an adapter but do not make MVP depend on it.

Live traffic strategy:

- use GraphHopper/Valhalla for geometry and fun scoring;
- add commercial traffic adapter for speed, incident, closure, and ETA enrichment;
- recalculate ETA using segment-level traffic penalties;
- reroute only when improvement clears a threshold;
- show “traffic unavailable” clearly when not available.

## RideHUD safety requirements

- Full-screen map.
- Huge next maneuver and distance.
- Bottom ETA/distance/speed/speed-limit strip.
- One suggestion slot only.
- Large accept/decline controls.
- No dense cards.
- No typing while moving.
- No multi-step menus while moving.
- Voice cues.
- High contrast day/night modes.
- Offline/degraded badge.
- Lock orientation support.
- PWA wake-lock support where browser allows.

## Google Maps practical parity checklist

- Address/place search.
- Current location.
- Destination routing.
- Route alternatives.
- Turn-by-turn navigation.
- Rerouting.
- Voice guidance.
- Traffic-aware ETA where provider supports it.
- Incidents/closures.
- Speed limit display where provider supports it.
- Route preview.
- Saved places.
- Recent searches.
- Offline route continuation.
- Offline map cache/region packs.
- GPX import/export.
- Route history.
- Favorites.
- Dark mode.

Do not prioritize Street View, deep business listings, reviews, transit, indoor maps, or Google’s full traffic corpus. They are not the differentiator.

## PWA requirements

- Installable manifest.
- Service worker for app shell and offline route assets.
- IndexedDB/Dexie persistence.
- Background sync where supported.
- Wake Lock API where supported.
- Geolocation permission recovery UI.
- iOS Safari limitations handled.
- Touch-first controls.
- 60 FPS map target.
- Chunk/simplify route rendering by zoom.
- Battery-aware GPS sampling.

## Backend API

```text
POST /api/route/candidates
POST /api/route/score
POST /api/route/choose
POST /api/navigation/reroute
POST /api/free-ride/suggestions
POST /api/map-match
POST /api/rides/import-gpx
POST /api/rides/export-gpx
POST /api/preferences/update
GET  /api/traffic/corridor
GET  /api/traffic/incidents
GET  /api/road-features/tile/:z/:x/:y
GET  /api/offline/packs
```

## Privacy and safety

- Default local-first ride history.
- Private mode.
- Home/work privacy zones with automatic redaction.
- No precise-location advertising.
- Clear consent before cloud sync.
- Delete/export all ride data.
- Suggestions are advisory.
- Never recommend illegal/private roads.
- Do not gamify speed or aggressive riding.

## Reality check

Matching Google Maps exactly is not realistic without Google-scale proprietary data and licensing. The right target is Google Maps-level navigation UX for your own riding use case, adapter-based traffic enrichment, and a much better motorcycle fun-road engine.
