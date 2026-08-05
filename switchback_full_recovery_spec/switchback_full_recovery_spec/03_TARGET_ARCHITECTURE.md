# Target Architecture

## Principles

1. Domain logic is independent from React.
2. Providers cannot bypass normalized constraints.
3. Every user-visible claim has evidence.
4. State transitions are explicit.
5. Local data has schemas, migrations, export, and restore.
6. Offline is a product mode, not miscellaneous caches.
7. Experimental intelligence is removable.
8. Mobile and desktop share domain controllers but may use different layouts.

## Suggested boundaries

```text
src/
  app/api/
  domain/
    bikes/
    constraints/
    routing/
    scoring/
    road-requirements/
    free-ride/
    sharing/
    preferences/
    offline/
  providers/
    graphhopper/
    valhalla/
    geocoding/
    weather/
    evidence/
  application/
    planner/
    navigation/
    recording/
    free-ride/
    offline/
    settings/
    library/
  infrastructure/
    indexeddb/
    local-storage/
    service-worker/
    diagnostics/
  components/
    mobile/
    desktop/
    shared/
```

## NormalizedRouteRequest

```ts
interface NormalizedRouteRequest {
  requestId: string
  planningId: string
  shape: "destination" | "loop"
  points: Waypoint[]
  profile: CoreRouteProfile
  bike: BikeRoutingPolicy
  constraints: RouteConstraints
  roadRequirements: MatchedRoadRequirement[]
  target?: {
    durationMinutes?: number
    maximumDetourPercent?: number
  }
  candidateSet: "primary" | "alternatives"
  source: "manual" | "intent" | "replan" | "offline-recovery" | "free-ride"
}
```

## Route eligibility

```ts
interface RouteEligibility {
  eligible: boolean
  failures: EligibilityFailure[]
  warnings: RouteWarning[]
  evidence: EligibilityEvidence
}
```

Hard failures are never converted to ranking penalties.

## Controllers

### PlannerSessionController
Request lifecycle, cancellation, previous route, alternatives, selection source, editing lifecycle, draft recovery, and errors.

### RouteEditorController
Points, leg styles, avoid areas, road requirements, undo/redo, reversal, and dirty state.

### RideSessionController
Guidance, GPS, wake lock, progress, rerouting, offline recovery, recording linkage, and interruption recovery.

### FreeRideController
Suggestion polling, expiration, heading/workload gates, feedback, and transition to guidance.

### OfflineDataController
Manifests, jobs, pause/resume, verification, activation, rollback, storage, freshness, and readiness.

### RiderSettingsController
Named bikes, defaults, units, voice, theme, map preference, learning, migration, and export.

## State machines

Planner:

```text
idle → resolving-origin → interpreting → geocoding → routing-primary
→ loading-alternatives → ready → editing → failed/cancelled
```

Ride:

```text
inactive → starting → gps-acquiring → active → off-route
→ rerouting/offline-recovery → paused → completed/failed
```

Offline download:

```text
not-installed → checking → awaiting-confirmation → downloading
→ paused → verifying → activating → ready/stale
→ failed/rolling-back
```

No component should infer these states from combinations of unrelated booleans.
