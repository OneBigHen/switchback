# Route Import Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make GPX, KML, and KMZ import real, deterministic, resource-bounded, and shared by personal-route import and road-lock import.

**Architecture:** Parse every supported file into one canonical `ImportedRouteDocument`, validate it once, and let route-save and road-lock consumers operate on normalized geometry instead of maintaining independent parsers. Reuse the existing streaming GPX parser. Add a deliberately small KML subset and safe KMZ extraction rather than a generic document/archive framework.

**Tech Stack:** TypeScript 6.0.3, browser File APIs, existing GPX streaming parser, Vitest, Playwright. If ZIP extraction requires a dependency, use `fflate` as the single small ZIP/deflate dependency and pin the version in `package-lock.json`; no JSZip/general archive layer.

**Spec:** `docs/superpowers/specs/2026-09-11-route-library-my-rides-import-export-design.md`

## Global Constraints

- UI may advertise only formats whose real parser + browser flow passes.
- Existing GPX byte/point/segment/waypoint/token bounds remain effective.
- KML/KMZ must use comparable bounds.
- Failed parse/validation creates no personal route and no road lock.
- All coordinates are `[lon, lat]`, finite, lon `[-180,180]`, lat `[-90,90]`.
- Road-lock modes remain only `prefer` and `must`.
- Personal duplicate detection warns; it never silently replaces/deletes.
- Preserve source geometry independently of later road matching.

---

### Task 1: Define the canonical imported-route contract and validator

**Files:**
- Create: `src/lib/import/route-import.ts`
- Create: `src/lib/import/route-import-validation.ts`
- Create: `tests/unit/route-import-validation.test.ts`

**Interfaces:**

```ts
export type RouteImportFormat = "gpx" | "kml" | "kmz"
export interface ImportedRouteWaypoint { coordinate: Coordinate; name?: string }
export interface ImportedRouteSegment { coordinates: Coordinate[] }
export interface ImportedRouteDocument {
  format: RouteImportFormat
  name: string | null
  description: string | null
  segments: ImportedRouteSegment[]
  waypoints: ImportedRouteWaypoint[]
  warnings: string[]
  sourceFileName: string
}
export function validateImportedRouteDocument(value: ImportedRouteDocument): ImportedRouteDocument
export function flattenImportedSegments(value: ImportedRouteDocument): Coordinate[]
```

- [ ] **Step 1: RED validation tests**

Cover valid multi-segment geometry, NaN/Infinity, out-of-range lon/lat, one-point-only documents, empty segments, excessive points/segments/waypoints, and preservation of segment order.

- [ ] **Step 2: Run RED**

`npx vitest run tests/unit/route-import-validation.test.ts`

- [ ] **Step 3: Implement bounded validation**

Use the GPX parser's existing default limits as the canonical defaults unless the import format has a stricter safe cap. Validation must return a sanitized clone, not mutate the caller.

- [ ] **Step 4: GREEN + commit**

Commit: `feat(import): define canonical route document`

---

### Task 2: Adapt the existing GPX streaming parser into the canonical contract

**Files:**
- Modify: `src/lib/gpx/streaming-parser.ts` only if a small missing public helper is required
- Create: `src/lib/import/gpx-import.ts`
- Create: `tests/unit/gpx-route-import.test.ts`

**Interfaces:**
- `parseGpxRouteFile(file: File, signal?: AbortSignal): Promise<ImportedRouteDocument>`

- [ ] **Step 1: RED fixture tests**

Use GPX with multiple tracks/segments, route points, waypoints, metadata name/description, invalid points, and an oversized fixture. Assert normalized segment order and warning for dropped invalid points.

- [ ] **Step 2: Implement adapter without a second XML parser**

Stream `file.stream()` chunks through `GpxStreamParser`; convert parsed tracks/routes into canonical segments. Prefer actual track segments; retain route segments too when they are independent usable geometry. Preserve valid waypoints.

- [ ] **Step 3: Verify cancellation and resource-limit errors remain rider-readable**

- [ ] **Step 4: GREEN + commit**

Commit: `feat(import): normalize GPX through streaming parser`

---

### Task 3: Add the supported KML subset

**Files:**
- Create: `src/lib/import/kml-import.ts`
- Create: `tests/unit/kml-route-import.test.ts`

**Interfaces:**
- `parseKmlRouteText(text: string, sourceFileName: string): ImportedRouteDocument`
- `parseKmlRouteFile(file: File): Promise<ImportedRouteDocument>`

- [ ] **Step 1: RED KML cases**

Fixtures must cover:
- one `Placemark > LineString`;
- `MultiGeometry` with multiple LineStrings preserving order;
- altitude-bearing `lon,lat,alt` coordinates (alt ignored, lon/lat preserved);
- point placemark waypoint;
- XML namespaces;
- malformed coordinate token;
- polygon-only/no-line KML => clear no-route error;
- point/byte limit rejection.

- [ ] **Step 2: Implement the smallest safe parser**

Use the repo's existing XML-capable dependency/runtime (`linkedom` is already installed) rather than regex-parsing XML. Only consume `Placemark`, `LineString`, `MultiGeometry`, `Point`, `name`, `description`, and `coordinates`.

- [ ] **Step 3: Unsupported constructs become warnings or explicit failure, never invented lines**

- [ ] **Step 4: GREEN + commit**

Commit: `feat(import): support route-focused KML`

---

### Task 4: Add bounded KMZ extraction

**Files:**
- Modify: `package.json` / lockfile only if required for `fflate`
- Create: `src/lib/import/kmz-import.ts`
- Create: `tests/unit/kmz-route-import.test.ts`

**Interfaces:**
- `parseKmzRouteFile(file: File): Promise<ImportedRouteDocument>`

- [ ] **Step 1: RED archive safety tests**

Cover:
- normal `doc.kml` archive;
- alternate single `.kml` entry;
- no KML entry;
- multiple KML entries chooses `doc.kml` deterministically, otherwise rejects ambiguity;
- nested `.kmz`/`.zip` ignored/rejected;
- compressed bytes over input cap;
- uncompressed KML over configured cap;
- excessive entry count;
- malformed ZIP.

- [ ] **Step 2: Implement in-memory extraction only**

Never interpret entry names as filesystem paths. Extract only the chosen KML entry, enforce size before parsing, decode UTF-8, then delegate to `parseKmlRouteText`.

- [ ] **Step 3: GREEN + dependency audit**

Run focused tests, `npm audit --omit=dev` if the environment permits, lint/typecheck.

- [ ] **Step 4: Commit**

Commit: `feat(import): safely support KMZ routes`

---

### Task 5: One format dispatcher and duplicate fingerprint

**Files:**
- Create: `src/lib/import/import-route-file.ts`
- Create: `src/lib/import/import-fingerprint.ts`
- Create: `tests/unit/import-route-file.test.ts`
- Create: `tests/unit/import-fingerprint.test.ts`

**Interfaces:**
- `detectRouteImportFormat(file: Pick<File, "name" | "type">): RouteImportFormat`
- `parseRouteImportFile(file: File, signal?: AbortSignal): Promise<ImportedRouteDocument>`
- `fingerprintImportedRoute(document: ImportedRouteDocument): Promise<string>`

- [ ] **Step 1: RED format-truth tests**

Reject unsupported/contradictory extensions instead of passing arbitrary XML to a parser. Accept common empty MIME on mobile when the extension is one of the three tested formats.

- [ ] **Step 2: Implement dispatcher**

Extension is authoritative among `.gpx`, `.kml`, `.kmz`; MIME is a supporting sanity signal, not required when browsers omit it.

- [ ] **Step 3: RED/GREEN fingerprint tests**

Hash a stable canonical string containing segment separators and coordinates rounded only to a documented precision. Same geometry/name-independent reimport should match; reversed or materially different geometry should not.

- [ ] **Step 4: Commit**

Commit: `feat(import): centralize format detection and duplicates`

---

### Task 6: Route import uses the canonical parser and provenance

**Files:**
- Modify the current app/planner import handler that receives `RidesDestination.onImport`
- Modify: `src/components/rides/ImportFlow.tsx`
- Modify: `src/lib/storage/route-library.ts` if imported-source geometry needs an additive persisted field
- Create/modify import component tests

**Interfaces:**
- Imported personal save uses provenance `{ kind: "imported-file", sourceFormat, sourceFileName, importedAt, fingerprint }`.

- [ ] **Step 1: RED component/domain tests**

Assert valid GPX/KML/KMZ reaches the same normalized save/open path; malformed files create no saved route; a duplicate fingerprint yields a warning/confirmation state instead of replacement.

- [ ] **Step 2: Wire the shared parser into the route-import action**

Build a `PlannedRoute` with `routingSource: "imported"`, real flattened geometry, a deterministic imported id, distance derived by existing route geometry utilities, and unknown duration represented truthfully. Preserve canonical segments/source data required by export.

- [ ] **Step 3: Make ImportFlow stateful and truthful**

Show `Parsing…`, error text, duplicate warning, and only advertise GPX/KML/KMZ now that all three have real coverage.

- [ ] **Step 4: Commit**

Commit: `feat(rides): import GPX KML and KMZ through one path`

---

### Task 7: Road-lock import consumes the same parsed document

**Files:**
- Modify the current `onImportAsLock` implementation / road-lock GPX import helper
- Modify: `src/components/rides/RidesDestination.tsx`
- Modify/add tests beside road-lock import tests
- Modify: `tests/e2e/road-lock.spec.ts`

- [ ] **Step 1: RED cross-format road-lock tests**

For one equivalent GPX and KML fixture, assert the lock matcher receives identical ordered normalized coordinates. Test `prefer` and `must` separately. Malformed inputs must create zero locks.

- [ ] **Step 2: Remove any independent GPX-only parsing from road-lock import**

Call `parseRouteImportFile()` once, flatten the canonical geometry, then invoke existing road-lock matching.

- [ ] **Step 3: Preserve matching truth**

A match failure stays a failure; no lock is persisted as successful unless existing matching invariants pass.

- [ ] **Step 4: GREEN + commit**

Commit: `feat(road-lock): share validated route imports`

---

### Task 8: Browser qualification and full gates

**Files:**
- Create: `tests/e2e/route-import.spec.ts`
- Add small fixtures under the existing test fixture convention: valid/invalid GPX, KML, KMZ.

- [ ] **Step 1: E2E journey**

Qualify:
- valid GPX -> personal route;
- valid KML -> personal route;
- valid KMZ -> personal route;
- malformed/oversized each -> visible error, no partial ride;
- duplicate import -> warning, no silent replacement;
- GPX/KML/KMZ road-lock import uses the same chooser and produces expected `prefer`/`must` behavior.

- [ ] **Step 2: Run focused browser lanes**

`npx playwright test tests/e2e/route-import.spec.ts tests/e2e/road-lock.spec.ts --project=desktop-chromium --project=mobile-safari`

- [ ] **Step 3: Full repo gates**

Run lint, typecheck, Vitest, critical E2E, PWA if import persistence/offline behavior changed, build, and CI visual/mobile lanes.

- [ ] **Step 4: Open a focused PR stacked only after the ownership/library PR if it consumes provenance from that train**
