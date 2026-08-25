# Phase 1 — Map Workspace Architecture

## Goal
Create the structural seams required for the CINCO UI without changing routing/navigation semantics.

## Primary files currently implicated
- `src/components/planner/PlannerShell.tsx`
- `src/components/planner/MapStage.tsx`
- `src/components/planner/PlannerComposition.tsx`
- `src/components/planner/PlannerDeck.tsx`
- `src/stores/planner-store.ts`
- `src/stores/navigation-store.ts`
- `src/app/styles/*`

## Target component boundaries

Names may adapt to repository conventions, but responsibilities may not collapse back into the monolith.

### `MapWorkspace`
Owns composition around the map:
- map canvas,
- map chrome,
- viewport insets,
- context surface connection.

### `MapCanvas`
Owns renderer container lifecycle only.

### Map controllers/hooks
Split current behavior into focused units such as:
- route renderer,
- navigation renderer,
- rider feature layer controller,
- route editing interaction,
- road lock interaction,
- viewport/follow camera.

Do not force all of these names if current extracted modules already exist.

### `ContextSheet`
Owns:
- detent,
- active content,
- open/close/expand intent,
- drag/tap accessibility,
- responsive adaptation.

It must not own routing business logic.

### `PlannerWorkspace`
Owns:
- search,
- plan mode,
- route summary,
- alternatives,
- route preferences,
- editing entry points.

### `RideWorkspace`
Owns ride-mode UI composition only.

### `FreeRideWorkspace`
Owns Free Ride UI composition only.

## State rule

Do not perform a risky full store rewrite.

However, new state must be grouped by responsibility. Avoid adding unrelated fields to a single planner store.

Preferred direction:
- planner session,
- route editor,
- map view,
- rider preferences,
- ride session,
- Free Ride session.

Existing store migration can be incremental.

## Map viewport insets

Introduce a tested value object:

```ts
interface MapViewportInsets {
  top: number
  right: number
  bottom: number
  left: number
}
```

Requirements:
- calculated from workspace state;
- fed into fit/follow logic;
- no DOM-query spaghetti across unrelated components;
- changes do not reset route selection or map state.

## Context sheet state

Minimum:
```ts
type ContextSheetDetent = "peek" | "half" | "full" | "immersive" | "closed"
```

Do not use viewport percentages scattered across CSS and JS. Centralize the model.

## Compatibility strategy

During migration:
- old planner content may render inside new ContextSheet,
- existing MapStage behavior may be extracted one concern at a time,
- every extraction gets regression tests.

## Acceptance tests

### Unit/component
- sheet state transitions,
- viewport inset calculation,
- route fit uses insets,
- tablet panel uses left inset,
- ride immersive state hides planner sheet,
- explicit route selection preserved across sheet transitions.

### E2E
- phone: select route → expand → collapse → map remains usable.
- phone: plan route → start ride.
- tablet: panel open → route visible in unobscured map area.
- dragging map in ride mode still exits follow state.
- restoring follow remains obvious.

## Acceptance criteria
- no routing provider rewrite;
- no navigation engine rewrite;
- no Free Ride ranking rewrite;
- `PlannerShell.tsx` and/or `MapStage.tsx` responsibility count is measurably reduced;
- no new mega-component > roughly 500 lines without explicit justification;
- all deterministic gates pass.

## Suggested PR split if necessary
1. `refactor: add map workspace and viewport inset model`
2. `refactor: extract map rendering controllers`
3. `refactor: introduce shared context sheet`

Do not combine unrelated design polish into these PRs.
