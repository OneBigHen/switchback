# Route Library Separation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make My Rides strictly rider-owned while turning the existing GPX atlas into the canonical Route Library with trustworthy metadata, lightweight catalog loading, real route previews, and explicit save-to-My-Rides behavior.

**Architecture:** Keep personal persistence in `RouteLibrary`/IndexedDB and shared discovery in the existing `/gpx-library` atlas/catalog. Remove project routes from the personal normalization path instead of hiding them with filters. Reuse shared display/geometry helpers, but keep catalog records read-only until a deliberate copy creates a `SavedRoute` with provenance.

**Tech Stack:** Next.js 16.3.3, React 19.2.7, TypeScript 6.0.3, Dexie 4.4.4, Vitest 4.1.11, Playwright 1.61.1.

**Spec:** `docs/superpowers/specs/2026-09-11-route-library-my-rides-import-export-design.md`

## Global Constraints

- `main` is the baseline; do not build this on stale PR #110.
- My Rides counts/search/delete/empty-state must never include project/catalog routes.
- Opening a catalog route must never implicitly save it.
- Unknown duration is unknown; never render `0 min` as a truthful duration.
- Catalog list payload stays lightweight and must not include full geometry.
- Full catalog geometry is fetched only for detail/open/save/export.
- Preview-only geometry cannot be persisted as a real owned route.
- Keep duplicate-family collapsing.
- Do not depend on PR #119.
- Run RED before GREEN for every behavior.

---

### Task 1: Add explicit saved-route provenance and catalog-copy lookup

**Files:**
- Modify: `src/lib/storage/route-library.ts`
- Create: `tests/unit/route-library-provenance.test.ts`

**Interfaces:**
- Produces:
  - `SavedRouteSourceFormat = "gpx" | "kml" | "kmz"`
  - `SavedRouteProvenance`
  - `RouteLibrary.save(route, notes?, provenance?)`
  - `RouteLibrary.findCatalogCopy(sourceCatalogRouteId)`

- [ ] **Step 1: Write the failing persistence/provenance test**

```ts
it("persists catalog-copy provenance and finds the owned copy", async () => {
  const library = new RouteLibrary(`test-${crypto.randomUUID()}`)
  const saved = await library.save(plannedRoute(), "", {
    kind: "catalog-copy",
    sourceCatalogRouteId: "atlas-42"
  })
  expect(saved.provenance).toEqual({ kind: "catalog-copy", sourceCatalogRouteId: "atlas-42" })
  expect((await library.findCatalogCopy("atlas-42"))?.id).toBe(saved.id)
  await library.destroy()
})
```

Also create a v2-shaped legacy row without `provenance`, reopen using the v3 schema, and assert its route id/geometry are unchanged and `provenance.kind === "planned"`.

- [ ] **Step 2: Run the focused test and confirm RED**

Run: `npx vitest run tests/unit/route-library-provenance.test.ts`
Expected: FAIL because provenance and `findCatalogCopy` do not exist.

- [ ] **Step 3: Implement the additive model and Dexie migration**

```ts
export type SavedRouteSourceFormat = "gpx" | "kml" | "kmz"

export type SavedRouteProvenance =
  | { kind: "planned" }
  | { kind: "imported-file"; sourceFormat: SavedRouteSourceFormat; sourceFileName: string; importedAt: string; fingerprint?: string }
  | { kind: "catalog-copy"; sourceCatalogRouteId: string }
  | { kind: "recording-derived" }
  | { kind: "trip-derived" }

export interface SavedRoute extends PlannedRoute {
  // existing fields
  provenance: SavedRouteProvenance
}
```

Add Dexie v3 and migrate missing provenance only:

```ts
this.version(3)
  .stores({ routes: "&id, name, profile, folder, *tags, visible, provenance.kind, createdAt, updatedAt" })
  .upgrade(async (tx) => {
    await tx.table("routes").toCollection().modify((route) => {
      if (!route.provenance) route.provenance = { kind: "planned" }
    })
  })
```

`save()` must preserve existing provenance unless a new provenance is supplied, and default new routes to `{ kind: "planned" }`.

- [ ] **Step 4: Add catalog-copy lookup**

Implement a deterministic scan/indexed query returning the newest visible copy whose `provenance.kind === "catalog-copy"` and `sourceCatalogRouteId` matches.

- [ ] **Step 5: Re-run tests, typecheck, commit**

Run:
`npx vitest run tests/unit/route-library-provenance.test.ts && npm run typecheck`

Commit: `feat(rides): add explicit saved-route provenance`

---

### Task 2: Remove shared catalog ownership from My Rides

**Files:**
- Modify: `src/components/rides/rides-view-model.ts`
- Modify: `src/components/rides/RidesDestination.tsx`
- Modify: `src/components/rides/RidesSurface.tsx`
- Modify: `src/components/rides/ride-library-classification.ts`
- Modify: `tests/unit/rides-view-model.test.ts`
- Create: `tests/unit/rides-personal-ownership.test.tsx`

**Interfaces:**
- `NormalizeRidesInput` contains only `savedRoutes`, `recordedRides`, and `trips`.
- `RideLibraryItemKind` contains only `saved-route | recorded-ride | trip-plan`.

- [ ] **Step 1: Write RED tests proving 537 catalog routes cannot inflate My Rides**

```ts
expect(normalizeRideLibrary({ savedRoutes: [], recordedRides: [], trips: [] })).toEqual([])
```

Render `RidesSurface` with no personal items and assert `No rides yet.` and `0` personal rides. Add a compile-time/component fixture demonstrating `RidesDestination` has no `projectRoutes` prop.

- [ ] **Step 2: Run focused RED tests**

Run: `npx vitest run tests/unit/rides-view-model.test.ts tests/unit/rides-personal-ownership.test.tsx`

- [ ] **Step 3: Delete the project-GPX branch from personal normalization**

Remove:
- `ProjectGpxRouteSummary` import from the rides view model/destination;
- `projectRoutes` input/prop;
- `onLoadProject` dispatch;
- `project-gpx` item kind;
- project-specific fallback copy such as `Project library`.

Keep imported personal saved routes classified from explicit provenance, with a temporary compatibility fallback to `routingSource === "imported"` for legacy rows.

- [ ] **Step 4: Rename rider-facing surface copy to My Rides**

Use:
- eyebrow: `Your roads`
- title: `My Rides`
- description: `Plans, recordings, trips, and files you saved — your own ride history and ideas.`

Do not call shared catalog items “imported” in My Rides because they are no longer there.

- [ ] **Step 5: Verify and commit**

Run focused tests + `npm run typecheck`.
Commit: `feat(rides): keep My Rides rider-owned`

---

### Task 3: Make catalog metadata truthful and reusable

**Files:**
- Create: `src/lib/gpx/catalog-presentation.ts`
- Modify: `src/lib/gpx/catalog.ts`
- Modify: `src/app/api/gpx-library/handler.ts`
- Modify: `src/app/gpx-library/atlas-browse.ts`
- Modify: `src/app/gpx-library/page.tsx`
- Modify: `src/app/gpx-library/[routeId]/page.tsx`
- Create: `tests/unit/catalog-presentation.test.ts`
- Modify: `tests/unit/atlas-browse.test.ts`
- Add/modify the existing GPX catalog API test file used by the repo.

**Interfaces:**
- Produces:
  - `cleanCatalogRouteName(name: string): string`
  - `knownDurationMinutes(value: unknown): number | null`
  - `CatalogArea { region: string | null; ridingArea: string | null }`

- [ ] **Step 1: Write RED name/duration tests**

```ts
expect(cleanCatalogRouteName("000 Armstrong County Loops - created by 54warrior on ADVHub.net"))
  .toBe("Armstrong County Loops")
expect(knownDurationMinutes(0)).toBeNull()
expect(knownDurationMinutes(91)).toBe(91)
```

- [ ] **Step 2: Implement deterministic cleanup only**

Strip leading ordering numbers, trailing `created by ... on ADVHub.net` boilerplate, filename extensions, and repeated whitespace. Never infer a nicer geographic name that is not present.

Treat non-finite and `<= 0` imported durations as `null` at the public/view-model boundary.

- [ ] **Step 3: Port only the useful #110 geographic filing logic**

Use route bbox/centroid to assign broad PA regions and known riding areas as filing aids, not authoritative GIS claims. Keep this pure/client-safe.

- [ ] **Step 4: Make `PublicAtlasRoute.durationMinutes` nullable**

The list/detail UI must render duration only when non-null. Update `buildRouteStory` callers so unknown duration cannot accidentally produce time claims.

- [ ] **Step 5: Prove the default API listing stays lightweight**

API test assertions:

```ts
expect(route).not.toHaveProperty("geometry")
expect(route).not.toHaveProperty("waypoints")
expect(route).not.toHaveProperty("instructions")
expect(route).not.toHaveProperty("sourceFile")
```

The detail request `?id=<route>` remains the full allow-listed geometry path.

- [ ] **Step 6: Verify and commit**

Run focused tests + typecheck.
Commit: `feat(route-library): make catalog metadata truthful`

---

### Task 4: Rebrand and refine the atlas into Route Library

**Files:**
- Modify: `src/app/gpx-library/page.tsx`
- Modify: `src/app/gpx-library/AtlasBrowser.tsx`
- Modify: `src/app/gpx-library/atlas-browse.ts`
- Modify the existing atlas/global CSS file that owns `.atlas-*` classes
- Modify: `tests/unit/atlas-browse.test.ts`
- Add component test for `AtlasBrowser`

**Interfaces:** Existing `/gpx-library` URL remains valid; rider-facing name becomes `Route Library`.

- [ ] **Step 1: RED component tests**

Assert a route card shows cleaned name, distance, known duration only, real preview path when present, region/riding-area text, and never `0 min` for unknown duration.

- [ ] **Step 2: Update information hierarchy**

Header copy:
- `Route Library`
- `Find roads worth riding — browse the shared collection by what is near you, how long you want to ride, and how twisty you want it.`

Keep Near Me, search, length, corners, and region controls, but move catalog totals to secondary metadata.

- [ ] **Step 3: Implement adaptive browse/detail behavior without #119**

At wide/tablet widths, selecting/focusing a card may expose a sticky detail/preview rail using already-loaded summary/art data; on phone, retain drill-in navigation. Do not fetch full geometry merely to populate the browse rail.

- [ ] **Step 4: Verify responsive/a11y behavior**

Run component tests and the repo visual/responsive lanes relevant to tablet portrait/landscape and mobile.

- [ ] **Step 5: Commit**

Commit: `feat(route-library): build rider-first catalog browser`

---

### Task 5: Add explicit Save to My Rides for catalog routes

**Files:**
- Create: `src/components/route-library/RouteLibraryActions.tsx`
- Create: `src/lib/gpx/catalog-client.ts`
- Modify: `src/app/gpx-library/[routeId]/page.tsx`
- Modify the planner/app composition point that owns the browser `RouteLibrary` instance
- Create: `tests/unit/catalog-save.test.ts`
- Create/modify component tests for `RouteLibraryActions`

**Interfaces:**
- `fetchCatalogRoute(id): Promise<PlannedRoute>` validates full detail geometry and rejects preview-only/missing geometry.
- `saveCatalogRoute(library, route, sourceCatalogRouteId): Promise<SavedRoute>` writes provenance `{ kind: "catalog-copy", sourceCatalogRouteId }`.

- [ ] **Step 1: RED domain tests**

Assert:
- save fetches real full geometry;
- preview-only/missing geometry rejects;
- first save creates one `catalog-copy`;
- second save returns/points to the existing copy rather than creating a second owned route.

- [ ] **Step 2: Implement the catalog client validator**

Validate id, geometry >= 2 finite coordinates, required route fields, and `previewOnly !== true` before exposing it as `PlannedRoute`.

- [ ] **Step 3: Implement explicit actions**

Actions on detail:
- `Open in Planner`
- `Save to My Rides`
- after saved: `Open saved copy`

Opening in Planner must not call save.

- [ ] **Step 4: Verify and commit**

Run focused unit/component tests + typecheck.
Commit: `feat(route-library): save shared routes explicitly`

---

### Task 6: Real-browser ownership journey and PR gate

**Files:**
- Create: `tests/e2e/route-library-ownership.spec.ts`
- Modify visual snapshots only after human review if intentional.

- [ ] **Step 1: Write the browser journey**

Cover:
1. populated catalog + empty personal DB => My Rides empty;
2. Route Library browse does not mutate IndexedDB routes;
3. Open in Planner does not save;
4. Save to My Rides creates exactly one personal route;
5. refresh preserves exactly one copy;
6. personal delete does not touch catalog availability.

- [ ] **Step 2: Run exact focused E2E RED/GREEN**

Run `npx playwright test tests/e2e/route-library-ownership.spec.ts --project=desktop-chromium --project=mobile-safari`.

- [ ] **Step 3: Run full gates**

Run:
- `npm run lint`
- `npm run typecheck`
- `npm test`
- `npm run test:e2e:critical`
- `npm run build`
- relevant visual/mobile/PWA lanes in CI.

- [ ] **Step 4: Open a focused draft PR from a fresh current-main implementation branch**

PR description must explicitly state that PR #110 is superseded for ownership/library UX and list any #110 pieces deliberately not ported.
