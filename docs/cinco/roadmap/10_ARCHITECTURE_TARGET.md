# Target Architecture

This is a direction, not a mandate to rename every file.

## UI

```text
AppShell
└─ MapWorkspace
   ├─ MapCanvas
   │  ├─ MapRuntime
   │  ├─ RouteRenderer
   │  ├─ NavigationRenderer
   │  ├─ RiderLayerController
   │  ├─ RouteEditController
   │  └─ ViewportController
   ├─ MapChrome
   ├─ PlannerWorkspace
   ├─ ContextSheet
   ├─ RideWorkspace
   └─ FreeRideWorkspace
```

## Domain/service flow

```text
UI
 ├─ Planner session
 ├─ Route editor
 ├─ Map presentation
 ├─ Ride session
 └─ Free Ride session
       │
       v
Application/domain services
 ├─ Routing providers
 ├─ Route scoring/recommendation
 ├─ Road intelligence/RIG
 ├─ Navigation engine
 ├─ RoadConditionsService
 ├─ Offline routing
 └─ Persistence/preferences
       │
       v
Map presentation adapters
 ├─ MapLibre
 └─ Mapbox
```

## Critical boundary

The map renderer receives *presentation-ready route and rider data*.

It must not:
- decide which route is legal,
- rank routes,
- fetch traffic for business decisions,
- decide Free Ride candidate utility,
- mutate rider preferences.

## Map runtime events
Prefer normalized events:
- map ready,
- map failed,
- user panned,
- user selected feature,
- route point moved,
- camera follow changed.

Do not leak provider-specific event types deeply into planner UI.

## State
Do not migrate all state at once.

New state should have clear ownership:
- workspace/sheet state,
- map view state,
- route editor state,
- ride UI state,
- Free Ride session UI state.

Business/domain state remains in established stores/services where appropriate.

## CSS
Move toward:
- semantic tokens,
- workspace CSS,
- sheet CSS,
- map chrome CSS,
- ride HUD CSS,
- route result CSS.

Avoid adding another all-purpose `planner-shell.css` section with hundreds of unrelated rules.
