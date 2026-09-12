# TomTom Traffic Presentation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Surface TomTom traffic evidence on selected routes and as an opt-in live traffic map layer without changing route authority.

**Architecture:** Route evidence stays behind `POST /api/route-traffic` and is consumed by a focused client component with request cancellation and deterministic geometry sampling. Map traffic is federated through the existing `/api/map-features` GeoJSON path, where TomTom joins OSM/NWS as an optional server-side provider and explicit partial-provider failures remain visible to the client.

**Tech Stack:** Next.js App Router, React 19, TypeScript, Vitest, MapLibre/Mapbox-compatible GeoJSON rider layers.

**Spec:** `docs/superpowers/specs/2026-09-12-tomtom-traffic-presentation.md`

## Global Constraints

- `TOMTOM_API_KEY` remains server-only; no `NEXT_PUBLIC_TOMTOM_*` variable.
- TomTom traffic must never become planner/ranker authority in this slice.
- Missing/failed traffic must never be represented as confirmed clear traffic.
- Route planning must continue to work when TomTom is missing or failing.
- `live-traffic` is opt-in and disabled by default.

---

### Task 1: Lock selected-route traffic client semantics

**Files:**
- Create: `tests/unit/route-traffic-client.test.ts`
- Create: `src/lib/client/route-traffic-client.ts`

**Interfaces:**
- Consumes: `PlannedRoute.geometry`, `RouteTrafficEvidence`.
- Produces: `sampleTrafficRoutePoints(geometry, maxPoints?)`, `fetchRouteTrafficEvidence(points, options?)`, `summarizeRouteTrafficEvidence(evidence)`.

- [ ] **Step 1: Write failing tests**

Cover endpoint preservation at 400 points, no false-clear summary for `unknown`/`degraded`, closure precedence, and `AbortSignal` forwarding.

- [ ] **Step 2: Run RED**

Run: `npm test -- tests/unit/route-traffic-client.test.ts`
Expected: FAIL because `@/lib/client/route-traffic-client` does not exist.

- [ ] **Step 3: Implement the minimum client module**

Use deterministic evenly spaced sampling that always includes geometry index 0 and the final index. Reject malformed API payloads with an exception so the component can render unavailable rather than trust an invented shape.

- [ ] **Step 4: Run GREEN**

Run: `npm test -- tests/unit/route-traffic-client.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

`git commit -m "feat: add route traffic client semantics"`

### Task 2: Surface selected-route traffic in PlannerDeck

**Files:**
- Create: `src/components/planner/RouteTrafficSummary.tsx`
- Create: `src/app/styles/route-traffic.css`
- Modify: `src/components/planner/PlannerDeck.tsx`
- Test: `tests/unit/route-traffic-summary.test.tsx`

**Interfaces:**
- Consumes: `PlannedRoute | null`.
- Produces: `<RouteTrafficSummary route={selectedRoute} />` with request cancellation on route identity/geometry changes.

- [ ] **Step 1: Write failing component tests**

Cover loading, available/no-incidents, closure, degraded, unavailable, and stale-request replacement.

- [ ] **Step 2: Run RED**

Run: `npm test -- tests/unit/route-traffic-summary.test.tsx`
Expected: FAIL because the component does not exist.

- [ ] **Step 3: Implement component and compose it into PlannerDeck**

Render the strip directly after the compact current-route context and before stage content. Import the dedicated stylesheet from the component.

- [ ] **Step 4: Run GREEN**

Run the component test plus existing PlannerDeck tests.

- [ ] **Step 5: Commit**

`git commit -m "feat: surface live traffic on selected routes"`

### Task 3: Add first-class live traffic map layer contract

**Files:**
- Modify: `src/lib/client/map-layers.ts`
- Modify: `src/components/planner/MapStageLayerControl.tsx`
- Modify: `src/components/planner/map-stage-sources.ts`
- Test: existing/new map-layer catalog tests.

**Interfaces:**
- Produces RiderLayerId `live-traffic` with conditions category, TomTom provenance, live freshness, min zoom 8, feature runtime.

- [ ] **Step 1: Write failing map catalog tests**

Assert `live-traffic` is in the catalog/feature runtime, disabled by default, and the old `road-controls` layer remains separate.

- [ ] **Step 2: Run RED**

Expected: catalog/runtime assertions fail.

- [ ] **Step 3: Implement catalog/control/source styling**

Put `live-traffic` in the quick layer set. Give it distinct traffic-red rendering. Do not change defaults to visible.

- [ ] **Step 4: Run GREEN**

Run focused map-layer tests.

- [ ] **Step 5: Commit**

`git commit -m "feat: add live traffic rider map layer"`

### Task 4: Federate TomTom incidents through map-features

**Files:**
- Modify: `src/lib/traffic/tomtom.ts`
- Modify: `src/lib/map-features/osm.ts`
- Modify: `src/app/api/map-features/route.ts`
- Modify: `src/components/planner/workspace/use-rider-feature-layers.ts`
- Test: `tests/unit/tomtom-traffic.test.ts`
- Test: map-feature provider tests.

**Interfaces:**
- Produces: `getTomTomTrafficForBounds(bounds, options)` returning explicit `available | unknown` status plus normalized incidents.
- Extends `RiderFeatureCollection.unavailable` with `traffic`.

- [ ] **Step 1: Write failing provider tests**

Cover successful incident GeoJSON, missing key => `unavailable: ["traffic"]`, TomTom failure alongside successful OSM => OSM features preserved plus traffic unavailable, and zero-incident success => empty but available.

- [ ] **Step 2: Run RED**

Expected: missing exports/provider behavior.

- [ ] **Step 3: Implement bounded TomTom bbox query and federation**

Reuse the existing Orbis v2 URL, headers, attribute list, timeout, and normalizer. Query exactly one validated viewport box per map refresh.

- [ ] **Step 4: Propagate provider outage to map layer status**

When `collection.unavailable` includes `traffic`, mark `live-traffic` as `error`; do not mark it empty.

- [ ] **Step 5: Run GREEN**

Run TomTom, map-feature, and layer-controller tests.

- [ ] **Step 6: Commit**

`git commit -m "feat: federate TomTom incidents into map features"`

### Task 5: Verify branch and keep activation guarded

**Files:**
- Update docs only if verification reveals behavior worth recording.

- [ ] **Step 1: Run targeted unit tests**
- [ ] **Step 2: Run `npm run typecheck`**
- [ ] **Step 3: Run `npm run lint`**
- [ ] **Step 4: Run `npm test`**
- [ ] **Step 5: Run `npm run build`**
- [ ] **Step 6: Inspect GitHub required checks on exact branch head**

Do not merge or claim production readiness until the final branch head is green and a real-key smoke check proves the TomTom contract outside fixtures.
