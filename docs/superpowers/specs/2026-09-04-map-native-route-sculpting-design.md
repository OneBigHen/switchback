# Map-native route sculpting design

## Goal

Let riders shape an already-planned route directly on the map without creating a second routing system. Existing Switchback road locks, avoid areas, planner store, graph matching, and `handlePlan()` remain authoritative.

## Deterministic boundaries

- A selected-route map gesture proposes an edit; it never mutates route geometry directly.
- `RoadLockMode` remains exactly `must | prefer`. “Avoid” invokes the existing avoid-area workflow; this PR does not invent a fake road-lock mode the router cannot enforce.
- All Must/Prefer corridors go through the existing graph-match path before an enforceable lock is saved.
- Failed Must matching remains unresolved/unsaved; no edge IDs or access facts are invented.
- A successful saved sculpt triggers one ordinary planner replan through the existing `handlePlan()` boundary.
- Cancelling a gesture produces no lock and no route request.

## Interaction

### Tap / touch

Tapping the selected route opens a compact contextual palette at that map point:
- **Must use** — seeds the first road-lock anchor and asks for the corridor end.
- **Prefer** — same, but seeds Prefer mode.
- **Avoid nearby** — hands off to the existing avoid-area drawing surface.

The palette is also reachable by a long-press/context-menu event on touch-capable maps. There is no hover-only requirement.

### Drag

Pointer-down on the selected route starts a transient sculpt gesture. Small movement remains a tap. Once movement crosses the drag threshold:

`idle → shaping → proposed road corridor`

Releasing seeds both graph-snapped road-lock anchors and opens the existing road-lock draft at its review/naming step. The rider can switch Must/Prefer, name it, and Save. Save graph-matches, commits, then performs exactly one ordinary replan.

No route request is made during pointer movement.

### Cancellation

Escape, pointer cancellation, route replacement, entering ride mode, or another map-edit owner cancels transient sculpt state. A partially completed road-lock draft is never silently committed.

## State model

Pure presentation state:

`idle → pressed → shaping → menu/proposed → idle`

The state carries only existing route ID, start/current map coordinates, and screen anchor. It is not persisted. The actual committed edit is still a `RoadLock` or `AvoidArea` in the planner store.

## Accessibility

- Palette is a labelled region/dialog with ordinary buttons and Escape support.
- Touch can tap the selected route; desktop can tap or drag.
- Must/Prefer semantics are text-labelled, not color-only.
- Existing road-lock draft remains the accessible review surface and focus target.

## Non-goals

- continuous live rerouting while dragging
- direct geometry mutation
- a third `avoid` road-lock mode
- AI-authored road locks or edge IDs
- broad planner form redesign
