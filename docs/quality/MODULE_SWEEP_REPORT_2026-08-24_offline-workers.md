# Module quality sweep — Offline & workers

**Area:** `src/lib/offline/`, `src/workers/`, `src/lib/gpx/`
**Date:** 2026-08-24
**Scope note:** this is a per-area file, not the brief's originally-named
shared report — 9 areas ran in parallel isolated worktrees. A follow-up pass
consolidates all per-area files into one report after they land.

## Prior audit check

Checked `docs/phase-reports/` (`P08-worker-rpc-lifecycle.md`,
`P10-gpx-ingest-worker.md`, `P29-offline-geo-worker.md`,
`P30-region-ride-packs.md`), `AUDIT-SUPPLEMENT.md`, `AUDIT-EVALUATION.md`,
`UX-AUDIT.md`, `docs/audit-deepseek-v4-pro.md`, `docs/audit-mimo-v2.5-pro.md`,
`docs/recovery/BASELINE_AUDIT.md`, `docs/reviews/2026-08-21/*`, and
`PLAN_TONIGHT.md` for anything already covering this area.

- `docs/recovery/BASELINE_AUDIT.md` item 8 (unbounded service-worker tile
  cache, `public/sw.js`) and item 11 (offline UI no-op controls) are about
  `public/sw.js` and `src/components/planner/RegionDownloadsPanel.tsx` — out
  of this area's assigned paths (that's the "App shell & routes" / planner
  component surface), so not re-litigated here, but see the cross-cutting
  finding below which touches the same download flow from the library side.
- `P29-offline-geo-worker.md` / `P30-region-ride-packs.md`: the real
  generated-tile PA/NJ parity audit (`scripts/verify-offline-parity.ts`) is
  documented as still open (187/208 = 89.9%, below the 98% gate). Re-ran the
  script's logic by reading it, not by executing it (needs a live GraphHopper
  instance + multi-GB regional data not present in this environment). No
  claim that the gate has moved; this remains **still not fixed**, not a new
  finding.
- No prior doc mentions `scripts/build-offline-v2.mjs` output format vs.
  runtime consumption, or the specific dead-code / cross-module drift items
  below — these are new.

## Findings

### [offline] Dead SBG2 binary tile codec, never wired into the pipeline
**File:** `src/lib/offline/tile-codec.ts` (deleted), `tests/unit/offline-tile-codec.test.ts` (deleted)
**Severity:** low
**Evidence:** `grep -rn "tile-codec\|encodeOfflineGraphTileBinary\|decodeOfflineGraphTileBinary" src tests` before the fix returned only the module's own file and its own test. Traced the real tile pipeline end to end: `scripts/build-offline-v2.mjs` writes `gzip(JSON.stringify(tile))` as `<tileId>.json.gz` (line ~456-462); `src/app/api/offline/regions/[regionId]/tiles/[tileId]/route.ts` → `src/lib/server/offline-region-files.ts` serves those bytes verbatim; `src/lib/storage/region-download-client.ts:99-100` decodes with `DecompressionStream("gzip")` + `JSON.parse`. The SBG2 binary frame (`MAGIC` header + length + JSON payload) that `tile-codec.ts` implements is a different wire format that no producer ever emits and no consumer ever calls, despite `docs/phase-reports/P29-offline-geo-worker.md` describing it as delivered work.
**Fix:** deleted `src/lib/offline/tile-codec.ts` and its test. No other file referenced it (verified after deletion with a repo-wide grep).

### [offline] `findRegionsContaining` and `getRegionById` — unreferenced exports
**File:** `src/lib/offline/region-catalog.ts` (was lines 152-167)
**Severity:** low
**Evidence:** static cross-reference across `src/`, `tests/`, `scripts/` found each name only in its own test block (`tests/unit/region-catalog.test.ts`), never in production code (component, API route, or another lib module). No dynamic/string-keyed dispatch touches `region-catalog.ts`'s exports (it's a plain data module), so this isn't a false positive from indirect access.
**Fix:** removed both functions and their four dedicated test cases from `tests/unit/region-catalog.test.ts`. `suggestRegionsForRoute` and `formatRegionBytes`, which are genuinely used (`src/lib/client/offline-pack-coordinator.ts`, `src/lib/client/regional-offline-route.ts`, `RegionDownloadsPanel.tsx`, `StorageQuotaMeter.tsx`, `RegionSuitePicker.tsx`), are untouched.

### [offline] `resolveRegionsByCode` — dead export with a false docstring claim
**File:** `src/lib/offline/region-suites.ts` (was lines 58-66)
**Severity:** low (dead code) / drift note below
**Evidence:** the function's own docstring claimed: *"Used by the storage-quota estimator to project the bytes a suite selection would occupy once installed."* `grep -n "resolveRegionsByCode" src/lib/offline/storage-quota.ts src/components/planner/StorageQuotaMeter.tsx` returned nothing — neither file calls it. `StorageQuotaMeter`'s `pendingPackageBytes` prop is fed a single region's `estimatedDownloadBytes` from `RegionDownloadsPanel.tsx:456`, not a suite-wide sum. Suite selection in the UI is a filter/badge over individually-clicked region downloads (`RegionDownloadsPanel.tsx:617`, one region per click), not a bulk suite-download action, so nothing ever needed this helper's multi-region projection. Static cross-reference confirmed zero callers outside its own test.
**Fix:** removed the function and its test case. Left the docstring's claim moot by deleting the code it described; if a bulk suite-download / bulk quota-projection feature is built later, this is the function to reintroduce.

### [offline] `OFFLINE_ROUTING_STALE_REQUEST_SENTINEL` — exported, described, never used
**File:** `src/lib/offline/worker-protocol.ts` (was lines 20-30)
**Severity:** low
**Evidence:** the exported `unique symbol`'s docstring says "callers... may use this symbol on a side channel to discard the result," but no file anywhere (`grep -rn "OFFLINE_ROUTING_STALE_REQUEST_SENTINEL" src tests`) referenced it outside its own definition and its own test's `typeof` assertions. The `"stale"` status string itself is used correctly elsewhere (`buildOfflineRoutingWorkerFailure`); only the extra sentinel symbol was inert.
**Fix:** removed the constant and its two dedicated test assertions/describe block.

### [gpx] Dead ternary always returns the same value
**File:** `src/lib/gpx/route-geometry.ts:41` (before fix)
**Severity:** low
**Evidence:** `label: parsed.id === routeId ? label : label` — both branches of the conditional are the identical expression `label`, so the condition `parsed.id === routeId` has no effect on the result under any input. This is a correctness smell (the check was clearly meant to do something) even though it happens to be harmless today.
**Fix:** simplified to `label: label` (i.e. `label`) — behavior-preserving, since both branches were already identical.

### [offline] v2-contracts.ts specifies a migration/lifecycle contract that no consumer implements
**File:** `src/lib/offline/v2-contracts.ts:594-677` (`classifyLegacyOfflineBundle`, `LegacyOfflineBundleClassification`, `OfflineV2ClassificationFailureCode`, `CLASSIFY_LEGACY_COMPATIBLE_SCHEMA_VERSIONS`) and `:166-190,556-588` (`InstalledRegionVersion`, `InstalledRegionVersionSlot`, `InstalledRegionLifecycle`, `validateInstalledRegionVersion`)
**Severity:** medium
**Evidence:**
- `classifyLegacyOfflineBundle`'s module docstring (line 5) says it is "the legacy-bundle classifier used by the migration shim." `grep -rn "migration shim\|legacy_corridor\|update_required\|classifyLegacyOfflineBundle" src/` outside `v2-contracts.ts` returns nothing — there is no migration shim anywhere in the tree. The function is exercised only by its own unit test (`tests/unit/offline-v2-contracts.test.ts`).
- `validateInstalledRegionVersion` and its `InstalledRegionVersion`/`InstalledRegionVersionSlot`/`InstalledRegionLifecycle` types model a 4-state lifecycle (`pending`/`active`/`previous`/`orphaned`). The actual persisted-version bookkeeping lives in `src/lib/storage/region-download-client.ts:46` as an independent, unrelated `StoredVersion` type with a 3-state `status: "pending" | "active" | "previous"` — no `orphaned` state, and `validateInstalledRegionVersion` is never called from it or anywhere else (`grep -rn "validateInstalledRegionVersion" src tests` → only the definition and its own test).
**Fix:** flagged, not fixed — `NEEDS YOUR DECISION`. These are two `export`ed public "contract" surfaces (not simple leaf utilities like the ones removed above), each with a full dedicated test suite, describing migration/lifecycle behavior that either hasn't been built yet or was built differently. Deleting them is a bigger, more architecturally-loaded call than removing an unused leaf function — it's plausible this is intentionally-ahead-of-need scaffolding for a real future migration, and `src/lib/storage/region-download-client.ts` is out of this area's assigned paths (it's the "Sync & identity" row's territory) and may be under concurrent edit in that row's own parallel sweep PR.
**Recommended default:** keep the code as-is for now (zero runtime risk since unused), but either (a) wire `validateInstalledRegionVersion` into `region-download-client.ts`'s actual version bookkeeping so the "contract" is real, or (b) delete it and consolidate on `StoredVersion`. Whoever owns `src/lib/storage/` should make that call together with this row's owner, since it spans both.

### [workers] Worker's v1 "route" dispatch is unreachable from any real caller
**File:** `src/workers/offline-routing.worker.ts:123-197`, `src/lib/offline/worker-protocol.ts` (`OfflineRoutingWorkerRouteRequest`, `"route"` branch of `parseOfflineRoutingWorkerRequest`)
**Severity:** medium
**Evidence:** the only production caller of the worker, `OfflineGeoWorkerClient.route()` (`src/lib/offline/geo-worker-client.ts:205-215`), always sends `kind: "route_v2"`. `grep -rn 'kind: "route"' src tests` (excluding `"route_v2"`) shows `kind: "route"` messages are only constructed by `offline-routing.worker.ts` itself (as a fallback failure default) and by `tests/unit/offline-worker-protocol.test.ts` — no application code ever sends one. The real v1 corridor-recovery feature (`src/lib/client/offline-route-recovery.ts`) bypasses the worker entirely: it statically imports `@/lib/offline/graph` and `@/lib/offline/a-star` and calls `findOfflinePath` directly on the main thread. So the worker's `"route"` case — which dynamically imports those same two modules with a `/* @vite-ignore */` comment claiming "the worker can compile before the file exists" — is dead in production; both files have existed on disk the whole time, and this project's bundler is Next.js's Turbopack/webpack, which doesn't recognize Vite's magic comment at all (it's inert either way, but the comment's own justification no longer applies).
**Fix:** flagged, not fixed — `NEEDS YOUR DECISION`. This sits inside the offline-routing implementation surface that `PLAN_TONIGHT.md`'s stop-and-ask list explicitly protects ("Deleting the offline routing implementation"), and removing it requires non-trivial edits to `tests/unit/offline-worker-protocol.test.ts` (dozens of assertions built around the `"route"` kind). It's zero-cost dead code today (no runtime bug, just an unreachable branch), so there's no urgency to remove it.
**Recommended default:** leave it in place. If a future case needs a worker-dispatched v1 corridor route (rather than the current main-thread path), this is already there; otherwise it's reasonable to prune in a dedicated follow-up PR that also rewrites the affected protocol tests.

### [offline/cross-cutting] Saved-route offline packs can never get a routing graph — `RegionDownloadClient.getGraph()` always returns null
**File:** `src/lib/client/offline-pack-coordinator.ts` (calls `client.getGraph(region.id)`), `src/lib/storage/region-download-client.ts:311-321` (`getGraph`)
**Severity:** high
**Evidence:** `buildOfflinePackCorridor()` (used by `PlannerShell.tsx`'s "save offline route pack" flow) calls `RegionDownloadClient.getGraph(regionId)` for each region the route's waypoints fall in, expecting back a full regional `OfflineGraph` (the v1 shape from `src/lib/offline/graph.ts`) to extract a corridor from via `extractCorridorGraph`. `getGraph`'s implementation only returns non-null when a Dexie `graphs` table entry exists with `kind === "corridor"` (`region-download-client.ts:314-315`). A repo-wide search — `grep -rn "\.graphs\.\(put\|add\|bulkPut\)" src/` — found **zero** writes to that table anywhere in the codebase; only `getGraph` (read) and `remove()` (delete) touch it. The actual installed region data lives entirely in the v2 tile store (`listActiveTileReferences`/`loadActiveTile`/`getActiveGraphTiles`), which `buildOfflinePackCorridor` never queries. Concretely: a rider downloads Pennsylvania (fully, verified present via the v2 tile APIs), saves a route inside PA as an offline pack, and `offline-pack-coordinator.ts:102-109` always returns `{ graph: null, warning: "No offline region data downloaded. Download regions to enable offline routing." }` — `PlannerShell.tsx:688-696` then shows "Offline route pack saved, but offline routing isn't available for it yet" every single time, regardless of what's actually installed. There is no test file for `offline-pack-coordinator.ts` and no test anywhere references `getGraph`, which is consistent with this having gone uncaught.
**Fix:** flagged, not fixed — `NEEDS YOUR DECISION`. The bug's evidence trail runs through this area's files (`corridor-manifest.ts`, `corridor-extractor.ts`, `download-mode.ts`, `graph.ts` are all correct and correctly consumed), but the actual defect and its fix live in `src/lib/storage/region-download-client.ts` (assigned to the parallel "Sync & identity" sweep) and `src/lib/client/offline-pack-coordinator.ts` (not assigned to any row). Fixing it here risks a merge conflict with that row's own PR on the same file.
**Recommended default:** either (a) make `buildOfflinePackCorridor` source region data from `getActiveGraphTiles`/the v2 tile store and run corridor extraction against v2 tiles instead of the v1 `OfflineGraph` shape (larger change — `extractCorridorGraph`/`corridor-manifest.ts` are built around `OfflineGraph`, not `OfflineGraphTileV2`), or (b) actually populate the `graphs` table when appropriate. Given the user-facing severity, this is worth prioritizing in a follow-up PR with test coverage added for `offline-pack-coordinator.ts` (currently zero).

### [offline] Generated-tile parity gate remains open (not new, still not fixed)
**File:** `scripts/verify-offline-parity.ts`, `docs/phase-reports/P29-offline-geo-worker.md`, `docs/phase-reports/P30-region-ride-packs.md`
**Severity:** medium (documented, unchanged)
**Evidence:** both phase reports already record 187/208 (89.9%) PA/NJ parity against the live GraphHopper oracle, below the script's own 98% gate (`PAIR_COUNT` default 200, `successGatePct: 98`), with zero GraphHopper oracle errors and clean legality. Re-read the script; its gate logic and thresholds are unchanged from what the phase reports describe. This environment has no live GraphHopper instance or the multi-GB PA/NJ regional data needed to re-run it, so this is confirmed by document-and-code reading, not re-execution.
**Fix:** not applicable — this is an operator/data-quality gate (routing corridor/search-budget/distance divergences against real OSM data), not a code defect in this area's paths. Restating it here only so the rollup below is honest about what's still open.

## Rollup

| Severity | Count | Fixed | Flagged |
|---|---|---|---|
| High | 1 | 0 | 1 |
| Medium | 3 | 0 | 3 |
| Low | 5 | 5 | 0 |
| **Total** | **9** | **5** | **4** |

- **Fixed (5, all low severity, all verified by the full `npm run verify` gate — lint, typecheck, 1,387 unit tests across 226 files, and `next build` all passed after the changes):**
  1. Deleted dead SBG2 tile codec (`tile-codec.ts` + its test).
  2. Removed dead `findRegionsContaining`/`getRegionById` exports + their tests.
  3. Removed dead `resolveRegionsByCode` export + its test.
  4. Removed dead `OFFLINE_ROUTING_STALE_REQUEST_SENTINEL` + its test coverage.
  5. Fixed the dead `label: x ? label : label` ternary in `route-geometry.ts`.
- **Flagged, `NEEDS YOUR DECISION` (4):**
  1. (medium) `v2-contracts.ts`'s legacy-migration and installed-version-lifecycle contracts have no real consumer — decide whether to wire them up or delete them, jointly with whoever owns `src/lib/storage/`.
  2. (medium) Worker's v1 `"route"` dispatch branch is unreachable dead code inside the protected offline-routing surface — safe to leave, but a candidate for a dedicated future cleanup PR.
  3. (high) `buildOfflinePackCorridor`/`RegionDownloadClient.getGraph()` — saved-route offline packs can never get a routing graph because the code path reads a Dexie table (`graphs`) that nothing ever writes to. This is the most actionable item in this report; recommend prioritizing a fix in a follow-up PR (touches `src/lib/storage/` and `src/lib/client/`, both outside this area's assigned paths).
  4. (medium, informational) The real generated-tile PA/NJ parity gate remains open per `P29`/`P30` — not new, no code fix available from this area alone.

### Are any prior audit docs now resolved/archivable?

No. `docs/recovery/BASELINE_AUDIT.md` item 8 and item 11 are about `public/sw.js` and `RegionDownloadsPanel.tsx`/`PlannerShell.tsx` — outside this area's paths, unaddressed by this pass, and (per this report's own findings) apparently still live: the offline-pack save flow is even more broken than "no-op controls" suggested, since the underlying corridor-graph plumbing behind it never had a working data path. `P29-offline-geo-worker.md` and `P30-region-ride-packs.md`'s open parity-gate item is also still open — confirmed unchanged, not resolved. No audit doc in the "don't duplicate" list can be marked archivable from this pass.
