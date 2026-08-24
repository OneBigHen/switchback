# UX Interaction System Requirements

## Core shell concept

Switchback becomes a **Map Workspace** with context-dependent surfaces.

### Phone portrait
Layer order:
1. Map canvas — full available application surface.
2. Top search / current task control.
3. Right-side compact map controls.
4. Bottom `ContextSheet`.
5. Temporary alerts / prompts above the sheet.
6. Bottom navigation only when not in immersive ride mode.

### Phone landscape
- Preserve map visibility.
- Prefer a compact side/edge sheet over a tall bottom sheet.
- Ride HUD has its own landscape layout.
- No control may be hidden behind browser/PWA safe areas.

### Tablet landscape
- Persistent left workspace: target 360–420 px; default target **384 px**.
- Map takes remaining width.
- Optional right inspector: target 300–360 px, appears only for selected route/road/place/layer detail.
- Do not permanently show both side panels if the remaining map viewport becomes too narrow.
- The map must account for panel occlusion using dynamic padding/insets.

### Tablet portrait
- Use a planning rail / half-width context panel where practical.
- Do not render a centered phone UI with unused tablet margins.
- Map remains visible while editing route details.

## ContextSheet

Create one interaction abstraction for planning/details instead of independent drawers that each invent behavior.

Suggested states:

```ts
type ContextSheetDetent =
  | "peek"
  | "half"
  | "full"
  | "immersive"
  | "closed"
```

Suggested content:

```ts
type ContextSheetContent =
  | { type: "home" }
  | { type: "search" }
  | { type: "route-summary"; routeId: string }
  | { type: "alternatives" }
  | { type: "route-editor" }
  | { type: "layers" }
  | { type: "place"; placeId: string }
  | { type: "road"; segmentId: string }
  | { type: "library" }
  | { type: "weather" }
  | { type: "free-ride-setup" }
```

This is a conceptual contract. The agent may adapt names to existing conventions, but must not create multiple unrelated sheet implementations.

## Detent behavior

Phone portrait targets:
- `peek`: roughly 100–130 CSS px visible content.
- `half`: roughly 45–55% of application content height.
- `full`: roughly 85–92% of application content height.
- `immersive`: no planner sheet; ride HUD or specific full-map state.
- `closed`: used only where the workflow still has an obvious way to restore context.

Do not hardcode `vh`. Use available container measurements.

### Peek content examples
Route:
- route name / profile badge,
- time,
- miles,
- elevation,
- one rider-character line,
- primary Go button or chevron.

Free Ride:
- status,
- one current opportunity if any.

Home:
- `Free Ride`
- `Round Trip`
- `Destination`
- recent route chip/card.

### Expanded content
Half/full may include:
- alternatives,
- route explanation,
- elevation profile,
- surface composition,
- curves / flow,
- towns / intersections / traffic controls,
- weather timeline,
- fuel,
- warnings,
- stops,
- road details,
- route editing.

## Dynamic map padding

Map camera fitting and follow mode must understand occlusion.

Examples:
- phone peek sheet: bottom padding includes peek height;
- phone half sheet: selected route is fitted into visible map region above sheet;
- tablet left panel: left map padding equals panel width + map gutter;
- temporary right inspector: right padding adjusts while inspector is open;
- ride HUD: camera focal point favors road visibility ahead.

Never fit a route to the entire DOM map box when a sheet covers half of it.

## Primary phone home

Default map-first composition:
- top search pill: “Where to — or describe a ride”
- full map
- compact weather/conditions indicator only if relevant
- bottom peek with:
  - Free Ride
  - Round Trip
  - Destination
  - recent route / recent ride
- map layers and locate controls remain secondary.

Do not open with a large form.

## Route result presentation

The selected route must communicate:
- route label: `Best Match`, `Twistiest`, `Flowiest`, `Scenic`, etc.
- ride time,
- miles,
- elevation gain,
- relative detour,
- road character.

Example:

```text
BEST MATCH
1h 47m · 82 mi · +3,420 ft
Twisty · Scenic · Flow

31 mi great curves
18 mi uninterrupted back roads
96% paved
4 traffic lights
+11 min vs fastest
```

### Alternative route cards
Alternatives must differ meaningfully and state why:
- `TWISTIEST`
- `FLOWIEST`
- `SCENIC`
- `FASTEST` only when useful as baseline.

Do not produce three nearly identical cards with a generic star score.

## Detail density

Route detail is expandable, not absent.

Full detail should be able to show:
- elevation chart,
- curve intensity by distance,
- surface by distance,
- town/urban portions,
- stop/signal density,
- route warnings,
- weather along route by expected arrival,
- fuel opportunities,
- road closures/incidents,
- confidence/data quality,
- route-lock status,
- road-by-road highlights,
- optional raw scoring breakdown.

## Waypoint semantics

Move toward explicit semantics:
- `STOP` — must visit.
- `SHAPE` — influences geometry, may auto-skip after reasonable pass.
- `ROAD` — expresses “use this corridor/road.”
- `OPTIONAL` — visit only if convenient.

Do not collapse every routing intent into an identical waypoint.

This requirement may be staged if the current contract needs careful evolution.

## Touch and accessibility

- 44x44 CSS px minimum target for primary interactive controls.
- Critical controls should generally be larger in ride mode.
- No hover-only functionality.
- Clear focus states.
- Text remains legible over map imagery.
- Sheet handles and drag interactions require tap alternatives.
- Respect reduced motion.
- Do not encode route states using color only.

## Motion

Use motion to explain:
- sheet detent changes,
- selected route changes,
- map camera transitions,
- temporary prompt entry/exit.

Do not:
- bounce controls,
- continuously animate route glows,
- fly camera unnecessarily,
- use ornamental parallax in ride mode.
