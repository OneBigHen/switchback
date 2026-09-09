# Compatibility register

Every legacy shim Switchback still carries, and the exact condition under which
it may be deleted. Switchback stores rider data **on the rider's own device** —
IndexedDB and local libraries, no server copy to re-derive from — so deleting a
migration silently destroys someone's saved rides, trips, packs, or in-progress
ride. That is why these survive a cleanup pass that deletes almost everything
else old-looking.

Rules for this register:

- Legacy concepts must not leak back into current UI or domain code. A shim
  reads an old shape and returns the canonical one; nothing downstream of it
  should know the old shape exists.
- New code must never *write* a legacy form unless a row below says otherwise
  and says why.
- Adding a shim means adding a row here, including its deletion condition.

Last reviewed 2026-09-08.

## Persisted rider data

| Shim | Old form accepted | Canonical output | Can new code still write the old form? | Delete when |
|---|---|---|---|---|
| `lib/trip/trip-plan-migration.ts` — `migrateTripPlanToCurrent` | Trip plans with no `version`, or `version` < 3, and partial/absent `constraints` | `TripPlan` at `TRIP_PLAN_VERSION`, constraints filled from `DEFAULT_TRIP_STAGE_CONSTRAINTS` | No. Saves always write the current version. `version >= 3` that is not current throws rather than guessing | Saved trips predating the versioned shape can no longer exist on any rider device. Not knowable remotely — treat as permanent |
| `lib/trip/trip-plan-migration.ts` — `migrateTripPlanStageActions` | Plans carrying `commandModelVersion` but no `actions` | Same plan with `actions: []` | No | Same as above |
| `lib/storage/offline-route-pack.ts` — Dexie v1→v2 upgrade hook, `deriveLegacyExpiry` | v1 packs with no `schemaVersion`, `freshness`, or `estimatedBytes` | Pack at `OFFLINE_ROUTE_PACK_SCHEMA_VERSION` (3) with backfilled expiry/TTL/size | No. New saves write version 3 | A rider cannot still hold a v1 pack. Packs expire (30 days) but the record can outlive the data, so keep the hook |
| `lib/client/map-layers.ts` — `migrateRiderLayerId` / `RENAMED_LAYER_IDS` | Saved layer id `traffic` | `road-controls` | No. The catalog only exposes the current id | No saved map pack can carry `traffic`. The rename exists because dropping the id would silently reset a rider's saved pack rather than fail loudly |
| `lib/client/map-experience.ts` — `legacyMapStyleFor`, consumed by `lib/storage/map-pack-library.ts` | — | — | **Yes, deliberately.** A pack saved by current code also writes the legacy `mapStyle` (`clean`/`explorer`/`night`) so a pack written now stays readable by an older installed PWA that has not updated | Every rider's installed service worker is known to be past the experience/light-preference model. Realistically: at MapLibre retirement (ROADMAP-WAVES phase 11) |
| `lib/storage/region-download-client.ts` — `LegacyGraphEntry`, Dexie `version(1)` `graphs` table | v1 single-bundle regional graphs | Read-only; superseded by `regions`/`versions`/`tiles` (v2+) | No | The v1 `graphs` table is empty on every device. Keeping the declaration is what lets Dexie open a v1 database at all |
| `lib/offline/v2-contracts.ts` — `classifyLegacyOfflineBundle` | v1 corridor packs | Classified as `legacy_corridor` (preserved, not discarded); v2+ passed to this classifier is an explicit error (`v2_bundle_passed_to_legacy_classifier`) | No | v1 corridor packs cannot exist on a rider device |
| `lib/storage/ride-checkpoint.ts` — `version !== 1` → `incompatible` | Any checkpoint whose version is not 1 | Refuses to restore and reports `incompatible` rather than restoring a mismatched in-progress ride | No | Never delete the check. It is a *guard*, not a migration: a wrong-shape restore would resume a ride from bad state |

## Protocol and API compatibility

| Shim | Old form accepted | Canonical output | Can new code still write the old form? | Delete when |
|---|---|---|---|---|
| `lib/offline/worker-protocol.ts` | Parser accepts any `version >= 1` for forward compatibility | Worker rejects `> OFFLINE_ROUTING_WORKER_PROTOCOL_VERSION` (2) as `unsupported_version` | No | Not a rider-data shim. Keep: main thread and worker can be different builds across a service-worker update |
| `lib/planner/route-sketch.ts` — `routePointsFromSketch` | Sketch input with caller-supplied anchors, old strict validation (throws without start, or without finish in destination mode) | `RoutePointSnapshot` via `routeIntentFromSketch` | n/a — it is an API adapter, not a stored format | `lib/planner/road-match-request.ts`, its one production caller, moves to `routeIntentFromSketch`. That is a behavior change: the V2 entry point infers start/finish and loop intent instead of throwing, so it needs its own test, not a janitorial edit |
| `lib/recommendation/route-candidate.ts` | `PlannedRoute` provider wire shape, which carries no segment ids | Provider-neutral `RouteCandidate` | n/a | Providers emit segment-identified geometry (ROADMAP-WAVES phase 7, candidate federation) |

## Retired in the 2026-09-08 janitorial pass

- `src/components/planner/LibraryDrawer.tsx` — a re-export alias for
  `RidesDestination` left over from the V2 modal→destination migration. It
  protected no data; `PlannerShell` now imports the canonical component.
- `src/app/styles/switchback-v1.css` — the V1 presentation authority. It had
  been out of the live cascade since V2 and
  `tests/unit/global-class-coverage.test.ts` proves no rendered class needed it.
- `@fontsource-variable/sora`, `@fontsource-variable/dm-sans` — the V1 font
  pair. No stylesheet named either family; both shipped as unused payload.
