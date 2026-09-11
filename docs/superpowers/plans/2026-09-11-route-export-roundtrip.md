# GPX Export and Round-Trip Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give planned, imported, recorded, catalog, and representable trip routes one trustworthy GPX export path whose output round-trips through Switchback’s real importer without changing route geometry materially.

**Architecture:** Convert each exportable source into a canonical segment/waypoint document, serialize that document with one deterministic GPX serializer, and keep browser download mechanics separate from serialization. Route Library export must fetch full detail geometry first; thumbnails/posters/bboxes are never export sources.

**Tech Stack:** TypeScript, browser Blob/object URL APIs, shared import contract from the route-import plan, Vitest, Playwright.

**Spec:** `docs/superpowers/specs/2026-09-11-route-library-my-rides-import-export-design.md`

## Global Constraints

- GPX is the only export format in this phase.
- Export must use real source geometry, never preview art or bounding boxes.
- Missing/preview-only/invalid geometry disables or rejects export explicitly.
- Preserve segment boundaries when known.
- Preserve coordinate order.
- Escape XML metadata safely.
- Import/export round trip is a release gate.
- KML/KMZ export is out of scope.

---

### Task 1: Define canonical export document adapters

**Files:**
- Create: `src/lib/export/route-export.ts`
- Create: `tests/unit/route-export-adapters.test.ts`

**Interfaces:**

```ts
export interface RouteExportDocument {
  name: string
  description?: string
  segments: Array<{ coordinates: Coordinate[] }>
  waypoints: Array<{ coordinate: Coordinate; name?: string }>
}

export function exportDocumentFromPlannedRoute(route: PlannedRoute): RouteExportDocument
export function exportDocumentFromSavedRoute(route: SavedRoute): RouteExportDocument
export function exportDocumentFromRecordedRide(ride: RecordedRide): RouteExportDocument
export function exportDocumentFromTrip(trip: TripPlan): RouteExportDocument
```

- [ ] **Step 1: RED adapters**

Assert planned route uses `geometry`; imported saved route prefers retained imported source segments when present; recorded ride uses actual recording track geometry; trip export rejects when stages cannot be represented without inventing a connector.

- [ ] **Step 2: Implement validation-first adapters**

Every adapter calls the shared geometry validator and throws a typed `RouteExportError` with a rider-safe message if no usable route exists.

- [ ] **Step 3: GREEN + commit**

Commit: `feat(export): normalize exportable ride geometry`

---

### Task 2: Implement the deterministic GPX serializer

**Files:**
- Create: `src/lib/export/gpx-serializer.ts`
- Create: `tests/unit/gpx-serializer.test.ts`

**Interfaces:**
- `serializeRouteToGpx(document: RouteExportDocument): string`
- `safeGpxFilename(name: string): string`

- [ ] **Step 1: RED serializer tests**

Cover:
- XML declaration and GPX 1.1 root;
- `<metadata><name>` escaping for `& < > " '`;
- one `<trkseg>` per canonical segment;
- `<trkpt lat="..." lon="...">` preserves order;
- waypoint `<wpt>` output;
- no NaN/Infinity;
- safe filename strips path separators/control chars and ends `.gpx`;
- empty geometry rejects.

- [ ] **Step 2: Implement serializer**

Use a dedicated XML escape helper. Serialize coordinates with stable decimal precision sufficient for sub-meter fidelity (at least 6 decimal degrees); do not sort/reverse points.

- [ ] **Step 3: GREEN + commit**

Commit: `feat(export): serialize trustworthy GPX`

---

### Task 3: Add mandatory import/export round-trip tests

**Files:**
- Create: `tests/unit/gpx-roundtrip.test.ts`
- Reuse `parseGpxRouteFile` / `parseKmlRouteText` infrastructure from the import plan.

- [ ] **Step 1: RED round-trip helper**

Create a helper that serializes a `RouteExportDocument`, wraps it in a GPX `File`, parses it through `parseGpxRouteFile`, then compares segment count, point count/order, names, and coordinate deltas <= serializer precision.

- [ ] **Step 2: Qualify three required sources**

Fixtures:
- planned route with multiple bends;
- recorded ride with actual track points;
- imported route with two source segments.

- [ ] **Step 3: GREEN + commit**

Commit: `test(export): prove GPX import export round trip`

---

### Task 4: Browser download helper and My Rides actions

**Files:**
- Create: `src/lib/client/download-route.ts`
- Modify: `src/components/rides/RideListRow.tsx`
- Modify: `src/components/rides/RidesDestination.tsx`
- Add component tests for export actions.

**Interfaces:**
- `downloadGpx(document: RouteExportDocument): void`

- [ ] **Step 1: RED browser helper test**

Mock `URL.createObjectURL`, anchor click, and `URL.revokeObjectURL`; assert MIME `application/gpx+xml;charset=utf-8`, safe filename, one click, and cleanup.

- [ ] **Step 2: Implement helper**

Generate a Blob from the serializer; create/click/remove anchor; revoke URL after the click. Serialization errors happen before any object URL is created.

- [ ] **Step 3: Add explicit Export GPX in personal management UI**

Only show/enable when the underlying personal source can provide full geometry. Error state belongs to that ride row/action.

- [ ] **Step 4: GREEN + commit**

Commit: `feat(rides): export owned rides as GPX`

---

### Task 5: Route Library export uses full catalog detail

**Files:**
- Modify: `src/lib/gpx/catalog-client.ts`
- Modify: `src/components/route-library/RouteLibraryActions.tsx`
- Add `tests/unit/catalog-export.test.ts`

- [ ] **Step 1: RED test forbids preview-art export**

Supply a catalog summary with poster paths but no fetched full detail and assert export is unavailable. Then return a full geometry detail and assert serializer receives those coordinates exactly.

- [ ] **Step 2: Implement `fetchCatalogExportDocument(id)`**

Fetch the same validated detail endpoint used by Open/Save; build export document only from detail geometry/waypoints.

- [ ] **Step 3: Add `Export GPX` action**

Show progress while fetching. On missing geometry show `Full route geometry is unavailable for this library route.` and create no download.

- [ ] **Step 4: GREEN + commit**

Commit: `feat(route-library): export full catalog geometry`

---

### Task 6: Recorded rides and trips are truthful

**Files:**
- Inspect/modify: `src/lib/storage/ride-journal.ts`
- Inspect/modify: `src/lib/trip/trip-plan.ts`
- Modify export adapters/tests from Task 1

- [ ] **Step 1: Prove the recording source**

Write a test from a real `RecordedRide` fixture asserting exported points equal the recording’s actual track rather than the planned route fallback. If the current schema does not retain actual points, disable recorded export with an explicit reason and document that gap instead of exporting the plan under a recording label.

- [ ] **Step 2: Prove trip representability**

If every stage has full route geometry, export separate GPX segments in stage order. If any stage lacks geometry, disable trip export; do not invent straight-line connectors or partial success.

- [ ] **Step 3: GREEN + commit**

Commit: `feat(export): keep recording and trip GPX truthful`

---

### Task 7: Real-browser downloaded-file verification

**Files:**
- Create: `tests/e2e/route-export.spec.ts`
- Reuse import/export fixtures.

- [ ] **Step 1: Personal download journey**

Save/import a personal route, trigger `Export GPX`, capture Playwright `download`, read the downloaded text, parse it through the real GPX parser, and assert geometry/name.

- [ ] **Step 2: Catalog download journey**

Open a Route Library route, export it, and prove downloaded geometry equals the full detail route rather than the mini poster representation.

- [ ] **Step 3: Error journey**

For unavailable full geometry, assert the action is disabled or returns visible error and Playwright observes no download.

- [ ] **Step 4: Full gates**

Run lint, typecheck, unit suite, critical E2E, focused export E2E, build, and applicable PWA/mobile/visual CI lanes.

- [ ] **Step 5: Open focused PR**

Keep it dependent only on the import contract and ownership/provenance PRs, not on unrelated #109/#119 work.
