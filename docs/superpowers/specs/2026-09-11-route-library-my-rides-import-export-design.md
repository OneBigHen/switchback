# Route Library, My Rides, and Import/Export Design

Date: 2026-09-11

Status: approved design, implementation pending

Baseline: `main` at `c649214e4729c76649b38300422d1c8a4758ba4c`

## Purpose

Switchback currently mixes rider-owned items and project/catalog routes in the same Rides destination. That creates the false impression that hundreds of shared GPX routes belong to the rider, weakens trust in counts and delete/open behavior, and makes import/export ownership unclear.

This change separates personal ownership from shared discovery while reusing common route presentation and geometry primitives. It also makes import and export explicit, validated, round-trippable, and tested across personal routes, recordings, trip plans, Route Library routes, and road-lock imports.

The product outcome is simple:

- **My Rides** answers: “What belongs to me?”
- **Route Library** answers: “What interesting roads and routes can I discover?”
- **Import** answers: “What should Switchback do with this file?”
- **Export** answers: “Give me the real geometry I am looking at or own.”

## Current-state constraints

At the baseline commit:

- `RidesDestination` accepts `SavedRoute[]`, recorded rides, trip plans, and `ProjectGpxRouteSummary[]`, then normalizes them into one mixed collection.
- `ImportFlow` advertises GPX, KML, and KMZ and offers two distinct outcomes: open as a route, or import the geometry as a `prefer`/`must` road lock.
- The dedicated streaming parser in `src/lib/gpx/streaming-parser.ts` is GPX-specific and enforces size, point, segment, waypoint, and token limits.
- Personal saved routes live in IndexedDB through `RouteLibrary` and are represented as `SavedRoute extends PlannedRoute`.
- Shared project/catalog summaries already expose lightweight route metadata including distance, duration, twistiness, turn count, duplicate-family metadata, confidence, and optional bounding boxes.
- Road locks deliberately support only `must` and `prefer`; this design does not invent additional road-lock modes.

The implementation must reconcile the user-facing GPX/KML/KMZ claim with actual parser support. A format may only remain in the file picker if a deterministic parser/adapter and regression coverage exist for it.

## Product architecture

### 1. My Rides is rider-owned only

My Rides contains only items created, recorded, imported, or explicitly saved by the rider:

- saved planned routes;
- recorded rides;
- trip plans;
- personally imported route files that have been accepted into the local library.

Project/catalog routes do not enter My Rides merely because they exist in Switchback’s route corpus. Shared routes are excluded from My Rides counts, search results, delete behavior, empty-state logic, and persistence semantics.

The current `projectRoutes` ownership leak in `RidesDestination` is removed rather than hidden behind a filter.

### 2. Route Library owns shared discovery

The existing route-atlas/catalog subsystem becomes the canonical shared Route Library. It is not a second personal library and not a social feed.

A Route Library item supports these explicit actions:

- **Open in Planner** — load the catalog route for planning/inspection without making it personal.
- **Save to My Rides** — create an owned local copy with provenance.
- **Export GPX** — export the route’s full real geometry when available.

Opening a catalog route must never silently save it. Saving the same catalog route repeatedly must not create accidental duplicates; provenance is used to detect the already-saved case and offer “Open saved copy” or an intentional duplicate flow if one is ever added later.

### 3. Shared primitives, separate ownership

My Rides and Route Library reuse presentation and geometry infrastructure where it is truly common:

- route thumbnail/mini-geometry rendering;
- distance/duration formatting;
- route-character labels;
- route-name cleanup;
- geometry validation;
- GPX serialization;
- safe filename generation;
- map-fit helpers;
- search token normalization.

They do not share mutation authority. Catalog records are read-only discovery data. Personal records are mutable local data.

## Domain model changes

### Personal route provenance

Owned saved routes need explicit provenance rather than inferring origin from names.

The saved-route persistence model should gain a small additive provenance block, for example:

```ts
interface SavedRouteProvenance {
  kind: "planned" | "imported-file" | "catalog-copy" | "recording-derived" | "trip-derived"
  sourceFormat?: "gpx" | "kml" | "kmz"
  sourceFileName?: string
  sourceCatalogRouteId?: string
  importedAt?: string
}
```

Exact field placement may follow the project’s existing storage conventions, but the semantics are fixed:

- ownership is explicit;
- original source is retained where useful;
- catalog-copy identity can be checked without parsing the name;
- imported-file metadata is not confused with route geometry.

A Dexie schema migration must preserve all existing routes. Existing rows default to `kind: "planned"` unless deterministic evidence says otherwise. The migration must not rewrite route IDs or geometry.

### Catalog summary truth

Unknown values must remain unknown. The implementation must not render `0 min` as a valid duration when the catalog does not actually know duration.

If the existing API uses numeric sentinels, normalize them at the server/view-model boundary into an optional/null value before presentation. The UI must distinguish:

- known zero, if such a domain value is ever valid;
- unknown;
- unavailable due to missing geometry or enrichment.

## My Rides experience

My Rides remains the fast personal workspace. It should show personal content density, not catalog volume.

Required behavior:

- personal count excludes catalog routes;
- empty state is genuinely empty when the rider owns nothing;
- saved plans, recordings, trips, and imports remain discoverable through existing filters/search;
- import is prominent but not dominant;
- destructive actions apply only to rider-owned records;
- “Match roads” remains an explicit action for imported geometry and does not silently replace the imported shape;
- imported original geometry remains available for export even after a matched/planned derivative exists, unless the rider explicitly replaces it in a future feature.

A personal imported route should surface a lightweight provenance note such as “Imported GPX” or “Saved from Route Library” when it helps explain behavior, without turning cards into metadata dumps.

## Route Library experience

Route Library is a discovery surface optimized for choosing a ride.

### Mobile

Use a browse-first card/list flow with drill-in detail. Each route card should prioritize:

- cleaned rider-facing name;
- real mini-route geometry when available;
- distance;
- duration only when known;
- route character such as twistiness/turn count where trustworthy;
- broad region/riding area;
- confidence or missing-data warning only when it affects the decision.

### Tablet and desktop

Use an adaptive browse/detail workspace:

- route results/cards on one side;
- selected route preview, larger geometry, grounded description, metrics, and actions on the other.

This must integrate cleanly with the broader adaptive-workspace direction but cannot require PR #119 to merge first. The Route Library must remain independently shippable on current `main`.

### Naming and descriptions

Catalog names should be cleaned deterministically. Remove known import noise such as numeric ordering prefixes and source-site boilerplate while retaining meaningful rider names.

Descriptions must be grounded in stored route facts. No generated sentence may invent road surface, difficulty, closures, amenities, or geography not supported by data.

## Catalog API and performance contract

Opening Route Library must not transfer full geometry for hundreds of routes.

The default catalog/list response is lightweight. It may include:

- id;
- cleaned/raw name as appropriate;
- distance;
- optional duration;
- twistiness/turn count;
- broad region/riding area;
- duplicate-family metadata;
- confidence;
- bounding box;
- a compact precomputed preview-art reference or bounded preview representation.

Full route coordinates are fetched only when needed for:

- detail/open;
- planner load;
- save to My Rides;
- export.

If current poster/atlas infrastructure already provides bounded precomputed route art, reuse it. Do not ship hundreds of full SVG paths or coordinate arrays in the initial library payload.

The implementation must preserve duplicate-family collapsing and avoid reintroducing hundreds of near-identical variants.

## Import architecture

### Supported formats

The target import contract is GPX, KML, and KMZ because the current UI already advertises all three.

Each supported format must have a deterministic adapter into one canonical internal import document. A format is not “supported” merely because the file picker accepts its extension.

Canonical import output should represent:

- one or more ordered route/track segments;
- waypoints when present;
- source name/description when present;
- validated coordinates;
- source format;
- warnings such as dropped invalid points;
- stable geometry suitable for saving, viewing, road matching, and export.

### GPX

Reuse and extend the current streaming GPX parser rather than adding a second GPX parser. Preserve its resource limits and abort behavior.

### KML

Parse only the route-relevant subset required for motorcycle route files:

- `LineString` coordinate sequences;
- `MultiGeometry` containing supported line strings;
- names/descriptions where safely available;
- placemark points as waypoints when practical.

Unsupported KML constructs fail clearly or are ignored with a visible warning; they must never be silently converted into bogus route geometry.

### KMZ

KMZ handling must safely extract the contained KML document with strict compressed/uncompressed size limits and no filesystem/path semantics. Reject malformed archives, nested archive bombs, or KMZs with no usable KML route geometry.

Do not add a large general-purpose archive subsystem. Use the smallest audited implementation/dependency that satisfies the browser/runtime constraints.

### Validation

Before persistence or road-lock creation, all formats pass the same validator:

- supported MIME/extension combination;
- file-size limit;
- finite longitude/latitude;
- longitude in `[-180, 180]`;
- latitude in `[-90, 90]`;
- bounded point/segment/waypoint counts;
- at least one usable line with enough points to form route geometry;
- no NaN/Infinity;
- no empty half-created record on failure.

Validation errors are rider-readable and format-specific where useful.

### Duplicate imports

Reimporting the same personal file must not silently delete, merge, or replace an owned ride.

Use a deterministic content/geometry fingerprint to detect a likely duplicate and warn. The rider may then cancel or intentionally create another copy. Duplicate detection is advisory for personal data, not destructive automation.

## Import outcomes

The file chooser supports two semantically different workflows.

### Open/save as route

“Open as a route” means the imported shape becomes rider-owned route content. The original imported geometry is preserved as the source shape.

If the app currently opens before saving, the implementation may keep that interaction, but persistence semantics must be explicit: the route appears in My Rides only once it has actually been accepted/saved according to the established product flow.

### Import as road knowledge

“Prefer these roads” and “Require these roads” remain separate road-lock actions using the existing `prefer` and `must` modes.

Road-lock import uses the same normalized geometry parser/validator as route import, then passes geometry into the road-lock matching pipeline. It must not maintain a second parser with divergent format behavior.

A failed road-lock match must surface the failure and must not create a misleading successful lock.

## Export architecture

GPX is the canonical interchange export format for this phase.

Every export action must serialize the real geometry represented by the source object:

- planned route → planned route geometry;
- recorded ride → actual recorded track geometry;
- imported personal route → retained imported source geometry unless the user explicitly chooses a routed derivative;
- Route Library route → full catalog geometry fetched for that route, never poster/preview art;
- trip plan → stage geometry or a combined route only when the existing trip model can represent it without inventing missing legs.

No export button may generate a file from thumbnail geometry, bounding boxes, placeholder coordinates, or an unavailable route.

### GPX serializer requirements

Use one shared serializer with deterministic behavior.

It must:

- emit valid UTF-8 XML;
- escape XML text safely;
- preserve coordinate order;
- preserve segment boundaries where the source model contains them;
- include name/description metadata when present and trustworthy;
- include waypoints when the source model owns them;
- use safe bounded filenames;
- use correct GPX MIME/download semantics;
- reject export when usable geometry is unavailable rather than emitting an empty or fabricated file.

### Round-trip invariant

The release gate for import/export is a geometry round trip:

1. serialize a known route to GPX;
2. parse that GPX through the real import path;
3. compare segment count, point order, coordinate values within serializer precision, and retained name metadata;
4. fail if geometry changes materially.

This round-trip test is mandatory for planned routes, at least one recorded-ride representation, and one imported-route fixture.

KML/KMZ export is not part of this phase. Do not add it merely for format symmetry.

## Save from Route Library

Saving a catalog route to My Rides is a controlled copy operation:

1. fetch/validate full catalog geometry;
2. build an owned `SavedRoute` using the existing route model;
3. attach `catalog-copy` provenance with `sourceCatalogRouteId`;
4. persist only if geometry is not preview-only and passes normal saved-route invariants;
5. update the Route Library action to reflect that the route already has a saved copy.

If the catalog route is missing full geometry, saving is disabled with a clear explanation.

## Error handling and trust rules

The rider must never receive a confident success state when geometry was not actually parsed, fetched, saved, matched, or exported.

Required rules:

- parsing failure creates no personal ride;
- storage failure does not pretend save succeeded;
- catalog geometry fetch failure leaves the catalog item unsaved;
- export failure produces no bogus download;
- road-lock match failure does not claim a valid lock;
- unknown duration is shown as unknown, not `0 min`;
- preview-only geometry cannot cross into saved/planned/export truth as if it were full geometry;
- user-visible file-format claims exactly match tested parser support.

## Accessibility and interaction

All new actions must preserve Switchback’s existing mobile-first accessibility floor:

- minimum practical touch targets;
- keyboard access on desktop/tablet;
- labeled file input and action buttons;
- progress state for parsing/fetching/saving/exporting that does not block unrelated navigation;
- errors associated with the import/export action that caused them;
- no icon-only critical action without accessible labeling.

## Testing strategy

Implementation is test-driven. Each behavior begins with a failing test that demonstrates the user-visible or domain-level contract.

### Unit tests

Cover:

- ownership normalization excludes project routes from My Rides;
- provenance migration and catalog-copy lookup;
- catalog name cleanup and unknown-duration formatting;
- GPX parsing limits and invalid coordinates;
- KML supported line-string cases and unsupported/malformed cases;
- KMZ valid archive and rejection limits;
- canonical geometry validation;
- duplicate-import fingerprinting;
- GPX serializer XML escaping, ordering, metadata, segment boundaries, and filenames;
- GPX export/import round trip;
- catalog-save provenance and duplicate-save protection.

### API tests

Cover:

- Route Library list payload remains lightweight;
- list response does not include full route geometry;
- full geometry endpoint returns only the requested route;
- missing/unknown duration remains unknown;
- malformed route id and missing geometry fail cleanly;
- catalog filesystem paths remain redacted from anonymous/public responses.

### Component tests

Cover:

- My Rides count with 537 catalog routes and zero personal items is zero;
- personal imports appear exactly once;
- catalog cards never expose personal delete actions;
- save-to-My-Rides changes action state;
- unknown duration does not render `0 min`;
- import chooser only lists formats that real adapters support;
- road-lock import and route import remain visibly distinct.

### E2E tests

Required real browser flows:

1. Start with an empty personal library and a populated catalog; My Rides is empty.
2. Open Route Library and browse catalog routes without mutating My Rides.
3. Open a catalog route in Planner without saving it.
4. Save a catalog route to My Rides once; refresh; verify exactly one owned copy.
5. Import a valid GPX personal route; refresh; verify persistence and geometry.
6. Import valid KML and KMZ fixtures through the same user flow.
7. Reject malformed/oversized GPX/KML/KMZ without creating partial rides.
8. Import a supported file as `prefer` and `must` road knowledge and verify the created lock outcome.
9. Export a personal route, parse the downloaded GPX, and verify geometry.
10. Export a Route Library route and verify it uses full route geometry rather than preview art.
11. Exercise recorded-ride export if the current recording model has usable geometry.
12. Verify phone, tablet portrait, tablet landscape, and desktop layouts for both My Rides and Route Library.

No E2E may rely on inert map rendering, missing worker bundles, or mocked success that bypasses the parser/serializer being qualified.

## Migration and compatibility

This is an additive migration for personal storage. Existing rider-owned routes, notes, folders, tags, timestamps, and IDs must survive unchanged.

The implementation must not migrate project/catalog routes into personal IndexedDB merely to preserve the old mixed UI. Shared routes remain shared.

Existing deep links into Route Atlas/Route Library should continue resolving or receive a deliberate redirect if the route surface is renamed.

## Relationship to PR #110

PR #110 contains useful product work but is not the integration vehicle for this architecture because it is stale against current `main` and has merge conflicts.

The implementation should selectively reapply or recreate the valuable behaviors on a fresh branch from current `main`, including where still correct:

- deterministic route-name cleanup;
- grounded route summaries;
- hiding unknown duration rather than presenting zero;
- real geometry previews;
- Pennsylvania region/riding-area classification;
- duplicate-family collapsing;
- lightweight catalog contract improvements.

Once equivalent or better behavior is proven on the new current-main branch, #110 should be closed/superseded rather than force-merged.

## Non-goals

This project does not add:

- social ownership, likes, followers, or public profiles;
- cloud sync redesign;
- billing or entitlements;
- KML/KMZ export;
- automatic arbitrary-map-image route extraction;
- new road-lock modes;
- a generic plugin/provider framework;
- a second permanent routing or map architecture;
- Route Library writes back into the source GPX corpus from the browser.

## Release acceptance

The feature is complete only when all of the following are true:

- My Rides contains only rider-owned content and existing personal data survives migration;
- Route Library remains fast with the full shared corpus and does not ship full geometry in its initial list payload;
- catalog items can be opened without being saved;
- catalog items can be explicitly saved exactly once with provenance;
- GPX, KML, and KMZ import claims are backed by real adapters and tests;
- both route import and road-lock import use the same canonical geometry validation;
- GPX export works for every supported source type that has real geometry;
- GPX export/import round-trip tests pass;
- unknown metrics remain unknown;
- malformed and oversized imports leave no partial personal state;
- export never uses preview-only/fabricated geometry;
- phone/tablet/desktop component and E2E coverage passes;
- existing required `main` quality gates remain green;
- a fresh browser run verifies import, save, refresh, reopen, and export behavior end-to-end.

## Implementation boundary

This design intentionally creates one architectural boundary: **ownership is separate; route primitives are shared**.

The implementation should prefer small focused modules over expanding `RidesDestination` or `RidesSurface` into orchestration hubs. Parsing, validation, serialization, catalog ownership, and personal persistence should each have a single clear authority and be independently testable.
