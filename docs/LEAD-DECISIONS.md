# Remaining Lead Decisions — E2 (Road Locks) & E4 (Region Expansion)

**Status: closed.** The lead decisions for E2 and E4 are resolved and implemented as
data, types, libraries, and tests. The only explicitly deferred item is fully automatic
route extraction from arbitrary map images. OSM attribution placement is already
watermarked on every map surface, so it is not a remaining decision.

## E2 — Must-Use Road Locks & Reference-Image Extraction

Implementations live in `src/lib/roads/road-locks.ts`, `src/lib/roads/road-access.ts`,
and `src/lib/roads/lock-precedence.ts` (tests under `tests/unit/road-locks.test.ts`,
`tests/unit/road-access.test.ts`, `tests/unit/lock-precedence.test.ts`).

| Decision | Outcome |
| --- | --- |
| Lock granularity | Contiguous corridor selected between two ordered anchors. Never a named road. |
| Lock strength | Two modes only: `must` and `prefer`. |
| Failed lock | Never silently dropped. `evaluateRoadLockSatisfaction` returns an unresolved status with a reason and, for `must` locks, exposes the four recovery options (`try-wider-match`, `convert-to-prefer`, `remove-lock`, `restore-previous-route`). |
| Lock rematch | `rematchRoadLock` walks stored geometry and ordered anchors against the current graph, refuses to slide onto an adjacent parallel road when anchors fall out of order, and sets `source: "rematched"` on the updated lock. |
| Access precedence | 7-tier fixed ordering: legal access → active closures → bike compatibility → must-use → required stops → prefer → route-profile scoring. A manually selected road does not override `motorcycle=no` or an active closure. |
| Provenance | `manual | gpx | image-trace | rematched`. Provenance controls presentation only, never legal priority. |
| Phase one inputs | Manual corridor drawing, GPX import, and image-overlay trace are all first-class creators. The image-overlay state type captures position, scale, rotation, opacity, two control points, an optional verify point, and the trace polyline. |
| Image extraction | Assisted overlay only. The accuracy statement constant `IMAGE_TRACE_ACCURACY_STATEMENT` is exposed for the UI. Automatic computer-vision extraction is deferred. |
| Match states | `exact`, `approximate`, `unresolved`. The route result surfaces these as green / amber / red. |

`RouteRequest.roadLocks` (added to `src/lib/routing/types.ts`) carries the active lock
set so the planner always receives the rider's intent.

## E4 — Regions and offline routing

Implementations live under `src/lib/offline/` and `src/lib/routing/`.

| Decision | Outcome |
| --- | --- |
| Catalog regions | PA, NJ, NY, MD, WV, DE (optional), VA, OH, VT, NC remain independently selectable. |
| Selection presets | `REGION_SUITES` in `src/lib/offline/region-suites.ts` ships Home Territory, Appalachia, and Northeast. Suites are selection presets, not separate bundles; regions remain independent and never duplicated. |
| Download modes | `src/lib/offline/download-mode.ts` exposes routing-only, full offline region, and saved-ride corridor. Saved-ride defaults are 10 / 20 / 30 miles for street / adventure / multi-day. |
| Storage policy | `src/lib/offline/storage-quota.ts` reads `navigator.storage.estimate()` and `persist()`, classifies normal / warn / strong-warn, and blocks only when the new package overflows quota or leaves <500 MB free. |
| Performance | Corridor graphs continue to be extracted on save (corridor-manifest + corridor-extractor) inside the existing Web Worker. Ride start never blocks on a large region-graph extraction. |
| Delta updates | Not implemented. Full package replacement only — easiest to validate, easiest to roll back. |
| Server cadence | Existing weekly Proxmox pipeline (`scripts/build-region-tiles.sh`) retains the latest versions per Geofabrik extract. |
| Staleness | `src/lib/offline/region-staleness.ts` returns current (0–30d), aging (31–60d), stale (61–90d), very-stale (>90d), unsupported (schema mismatch). Routing is never blocked on age alone. |
| Universal graph schema | One graph schema (`src/lib/offline/graph.ts`); region behaviour is tuned via overlays. |
| Bike profiles | `src/lib/routing/bike-profiles.ts` ships Street, Touring, Adventure, Dual-Sport with surface / smoothness / tracktype rules. |
| Access tags | `src/lib/roads/road-access.ts` models `motorcycle`, `access`, `surface`, `smoothness`, `tracktype`, `maxweight`, seasonal flags, and conditional restrictions. |
| Route data quality | `src/lib/roads/route-data-quality.ts` computes access / surface / condition coverage percentages, unknown-surface mileage, seasonal uncertainty, and rider-facing caveats per route. |
| Attribution | OSM attribution is already watermarked on every map surface. No additional work item. |

## Deferred work

* Fully automatic route extraction from arbitrary map images.
* Europe / Canada region catalog entries (architecture supports them; no trip yet requires them).
* Delta updates for region bundles, gated on measured download size or update time.

