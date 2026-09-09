# Frontend boundary wave 1

Date: 2026-09-08
Baseline: `main` @ `b53c177c1620098bfa00883257eae245411a6f5c`

## Goal

Start the frontend replatform inside the existing Switchback application without creating a second frontend, replacing the backend, or opening another mega-refactor.

This wave establishes durable boundaries that later work can migrate into incrementally:

- planner presentation becomes one `model + commands` contract;
- route-detail workspace state/rendering leaves `PlannerComposition`;
- planning-session mutation exposes one bounded command facade;
- legacy call sites remain compatible until their lifecycle is extracted.

No rider-facing behavior is intentionally changed in this wave.

## Sequencing

This branch deliberately starts from the current clean `main`, but it is not intended to jump the convergence queue.

Required integration order remains:

1. dependency/security lane;
2. PR #86 janitorial cleanup;
3. PR #82 canonical map presentation;
4. PR #85 beta control plane;
5. rebase and exact-head verify this frontend wave;
6. continue lifecycle extraction.

The branch does not touch `package.json`, `package-lock.json`, MapLibre/Mapbox renderer code, backend routes, routing providers, canonical planner state, or `PlannerShell.tsx`, so those earlier lanes can settle without a competing authority.

## Architecture contract

### Preserve

- Next.js / React / TypeScript application;
- Zustand canonical planner state;
- `RideIntent` / history / revision semantics;
- routing, scoring, evidence and provider modules;
- local-first storage and migrations;
- API contracts and server infrastructure;
- current visual, browser, real-router and PWA gates.

### Do not introduce

- a second frontend repository/app;
- Redux, XState, event bus or service container;
- a second planner state model;
- new backend endpoints for presentation convenience;
- new global CSS override authority;
- product features or UI modes.

## Boundary 1 — planner presentation

`PlannerPresentationBoundary` is the canonical contract presented to composition code:

```text
model
  deck
  comparison
  planWarnings
  advisorOrigin

commands
  deck
  addAdvisorStop?
  planAdvisorRide?
```

The existing flat `PlannerComposition` props remain as a compatibility adapter. New orchestration should construct the boundary rather than append more flat props.

The boundary holds references to existing authoritative models and commands. It does not clone them into new state.

## Boundary 2 — route details

Route detail workspace identity is now a pure deterministic contract:

- details are bound to the exact candidate-set identity that opened them;
- changing the canonical selected route invalidates the detail workspace;
- replanning into a different candidate set invalidates the detail workspace;
- the actual `RouteComparison` preparation surface is rendered by a dedicated workspace component.

This preserves the existing safety rule that Save/Export/Start actions never remain aimed at a route the rider is no longer looking at.

## Boundary 3 — planning session commands

`PlanningSessionController` keeps its current legacy methods and adds one stable `commands` facade containing the same function identities:

- `run`;
- `invalidate`;
- `cancel`.

No duplicate lifecycle model is added. The canonical lifecycle remains in planner state / `PlannerDeckViewModel`.

Important: `runLatestTripPlan()` returns after primary routing while progressive alternatives may still be using the same abort controller. Do not clear request ownership merely because the primary promise settled; doing so would weaken cancellation fencing for alternatives.

## Tests

Wave-1 tests protect:

- the new planning command facade and existing Cancel semantics;
- presentation-boundary reference identity and optional-command honesty;
- route detail invalidation when selection changes;
- route detail invalidation when the candidate set changes;
- current-route resolution when the workspace remains valid.

Existing planner composition / advisor-grounding browser-component tests remain the behavior regression layer.

## Exit criteria

After the prerequisite integration sequence lands, this wave may become merge-ready only when the same exact rebased head passes the repository-required lint, typecheck, unit, build, rider-journey, PWA, road-lock, real-router and visual gates.

Physical-device beta qualification is not closed by this architecture-only wave.

## Next extraction after merge

Extract planning orchestration from `PlannerShell` behind a React controller that owns request construction, request fencing/cancellation, previous-route retention, history-triggered replans and recovery replanning, while exposing only typed presentation model + commands to the shell.
