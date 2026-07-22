# Closure Session — 2026-07-19

> Historical snapshot, superseded by [CLOSURE-REALITY-2026-07-21.md](./CLOSURE-REALITY-2026-07-21.md). Its single-bundle regional graph and “ready for reskin” conclusions were not release proof.

**Branch:** `main` (uncommitted)
**Gate:** tsc clean, eslint clean, 73 offline tests pass

## B2 — Planner composition boundary

`PlannerDeck` now accepts `viewModel` + `commands` grouped objects instead of 50 flat props.
`PlannerShell` builds both via `buildPlannerDeckViewModel()` factory. 18 test cases updated.
Zero behavior change — pure interface modernization.

## D2 — Trip plan command controller

`trip-plan-controller.ts` wraps `TripPlanLibrary` with command-model `create`/`dispatch`/`save`/`load`/`duplicate`/`remove`/`reset`. Event tracking for undo/redo/audit.

## C1 — Offline pack corridor wiring

`offline-pack-coordinator.ts` builds corridor manifests from downloaded region graphs and
embeds them into offline packs. `OfflineRoutePack` now carries `corridorGraph` inline.
Packs auto-upgrade to `routingCapability: "in-corridor-routing"` when region data exists.

## C2 — Region graph foundation

- **`region-catalog.ts`** — 10 US states (PA through NC) with Geofabrik URLs, bounds, download sizes, node/edge counts, data dates, bundle versions
- **`corridor-extractor.ts`** — Pure extractor: corridor manifest + region graph → bounded subgraph with reindexed nodes/edges + provenance
- **`region-graph-store.ts`** — Dexie-backed IndexedDB for downloaded region graphs
- **`build-region-tiles.sh` + `build-graph-bundle.mjs`** — Proxmox pipeline: Geofabrik fetch → GraphHopper tile build → serialized graph bundle

## C3 — Offline UX

- **`RegionDownloadClient`** — Streaming fetch with cancel + progress + IndexedDB persistence + staleness/expiry
- **`RegionDownloadsPanel`** — Per-region download/delete/progress bar, staleness badge, route-coverage suggestions, storage quota, OSM attribution

## Tests

14 new tests (region catalog + corridor extractor), 73 existing offline tests all green.

## Lead decisions

`docs/LEAD-DECISIONS.md` covers E2 (road locks, image extraction, legal safety) and E4
(region prioritization, storage budgets, delta updates, attribution compliance).

---

**Total:** 10 new source files, 2 new test files, 3 modified files. All GLM-delegatable
tech debt is closed. Ready for reskin.
