# PA/NJ Gravel Atlas Routing — implemented architecture and release plan

Date: 2026-09-11  
Branch: `feat/pa-gravel-atlas-routing`  
PR: #123

## Objective

Give Adventure/Gravel riders an explicit **Favor known gravel** routing preference and an independent **Known gravel roads** map layer, using bounded official surface evidence without treating raw GIS geometry as routing topology, legal-access truth, or a replacement routing graph.

The feature defaults OFF. The live motorcycle router remains authoritative for connectivity/access and every Atlas-attracted candidate must still route successfully and prove actual returned-route overlap before it can beat the baseline.

## Source model

### Pennsylvania — PASDA 2012

- `Pa Unpaved Roads 2012`, ArcGIS polyline layer.
- Historic unpaved-surface evidence; access remains unknown.
- State and National Forest roads are excluded from that inventory.
- Service maximum is 1,000 records per page; the snapshot collector honors the effective service cap.
- Reproduction/redistribution terms are restrictive. Fetching requires explicit `--accept-pasda-terms`, which is an operator acknowledgement only and **not** a license grant. PA activation must not occur until the intended use is independently authorized.

### New Jersey — NJGIN NG911 road centerlines

The Atlas admits only:

```sql
SURFACETYP = 'U' AND STATUSTYP = 'A' AND ACCESSSTYP = 'N'
```

This contributes official unimproved-surface plus active/non-restricted access evidence. It still does not promise field passability or current conditions.

## Implemented data pipeline

```text
official ArcGIS sources
  -> bounded deterministic snapshots
  -> normalized source observations + source fingerprint
  -> staging SQLite
  -> exact prepared PA+NJ motorcycle OSM build inputs
  -> GraphHopper input fingerprint + graph-cache stamp
  -> bounded canonical OSM segment export near source evidence
  -> conservative geometry/direction reconciliation
  -> unmatched / ambiguous evidence quarantine
  -> verified corridors retaining source-feature + canonical-segment provenance
  -> runtime SQLite stamped with source + graph fingerprints
  -> bounded viewport/planning-region queries
```

Important properties:

- Statewide ArcGIS services are never fetched at route-request time.
- Generated statewide/intermediate geometry is never sent wholesale to the browser.
- GraphHopper edge IDs are transient and never persisted as stable Atlas identity.
- Runtime reads fail closed if graph or source fingerprints are stale.
- Runtime DB replacement is atomic.
- Generated SQLite/PBF/graph JSON/reconciliation JSON are build artifacts, not repository content.

## Implemented routing behavior

Request contract:

```ts
gravelAtlas: {
  enabled: boolean
  intensity: "balanced" | "more" | "maximum"
}
```

Behavior:

- default OFF and malformed values fail closed;
- only Adventure/Gravel profiles can activate Atlas attraction;
- selector caps Atlas shaping corridors at 1 / 2 / 3 for Balanced / More / Maximum;
- ordinary A-to-B and Free Ride/round-trip planning can seek verified Atlas corridors;
- shaping anchors come from verified source geometry rather than synthetic lateral swings;
- every candidate is still routed by the ordinary provider;
- a returned candidate must improve measured Atlas overlap and remain within intensity-specific detour/duration limits;
- continuity is rewarded and fragment soup is penalized;
- route caching separates Atlas OFF/Balanced/More/Maximum semantics;
- stale/missing Atlas data degrades to ordinary routing rather than failing the route request.

## Implemented rider UI and map behavior

- Ride options expose `Favor known gravel` for compatible profiles.
- Enabled preference exposes Balanced / More / Maximum.
- The Layers sheet exposes `Known gravel roads` as a quick layer.
- Map visibility and routing preference are intentionally independent.
- Legacy `unpaved` rider-layer state/map packs migrate to the new Atlas layer semantics.
- Verified runtime corridors render as a distinct tan dashed road treatment.
- The viewport API is bounded and can report Atlas unavailable separately from successful OSM/weather feature providers.

## Graph-build contract

The GraphHopper import is stamped with a deterministic fingerprint derived from:

- exact prepared `data/pa-nj-motorcycle.osm.pbf` bytes;
- GraphHopper binary bytes;
- canonical GraphHopper config;
- sorted custom-model files.

`npm run routing:fingerprint` compares current routing inputs to the active graph-cache stamp and fails if the active graph is stale or unstamped.

The canonical segment exporter consumes the same prepared PBF and hard motorcycle-access/one-way rules, bounds extraction to official-source vicinity, and emits stable OSM way/from-node/to-node/direction identities. It does not introspect every GraphHopper internal edge after import, so live release validation must sample retained corridors against the running GraphHopper service. Route-time provider routing plus actual overlap measurement remains the final safety fence.

## Operator commands

```bash
npm run gravel-atlas:sources
npm run gravel-atlas:graph
npm run gravel-atlas:reconcile
npm run gravel-atlas:runtime -- --input=data/gravel-atlas-verified.json
```

For authorized NJ-only deployment:

```bash
npm run gravel-atlas:refresh:nj
```

Full activation, rollback, environment variables, and real-route validation are documented in `docs/operations/GRAVEL_ATLAS_ACTIVATION.md`.

## Release status

The feature code and deterministic/offline pipeline are implemented on PR #123. CI exercises the code contracts, map/routing regressions, real-router fixture, PWA, visual, rider-journey, and mobile suites.

What remains intentionally outside CI is **real production-data activation**:

1. reconcile the live host and exact PR head;
2. ensure the active GraphHopper cache is stamped/current, rebuilding via a side-by-side candidate if necessary;
3. build the real NJ Atlas, and PA only if PASDA use is actually authorized;
4. configure `GRAVEL_ATLAS_DB_PATH`, `GRAVEL_ATLAS_GRAPH_FINGERPRINT`, and `GRAVEL_ATLAS_SOURCE_FINGERPRINT` together;
5. test routes derived from actual runtime corridors with Atlas OFF/Balanced/More/Maximum;
6. sample canonical matches against the running GraphHopper service;
7. prove stale-fingerprint and access-conflict fail-closed behavior;
8. run exact-head required checks again if activation work changes code;
9. document live evidence on PR #123, mark ready, and merge only then.

## Merge criteria

Do not merge merely because synthetic/CI fixtures pass. Merge requires all of the following:

- exact current PR head passes all protected checks;
- generated data/secrets are absent from the diff;
- live source scope is recorded as NJ-only or explicitly authorized PA+NJ;
- real runtime build yields nonzero useful corridors or the limitation is explicitly understood;
- at least one Atlas-improved A-to-B case, one Free Ride case, and one correct no-change case are validated;
- detour/duration bounds and returned-route overlap are measured, not inferred from shaping requests;
- map-layer/routing-preference independence is verified;
- rollback assets are preserved through post-merge production smoke.

The detailed operational procedure is the release authority for this feature: `docs/operations/GRAVEL_ATLAS_ACTIVATION.md`.
