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
  -> live-router end-to-end traversability verification (policy v2)
  -> traversability quarantine
  -> verified corridors retaining source-feature + canonical-segment provenance
  -> runtime SQLite schema v2 stamped with source + graph + traversability-policy identity
  -> bounded viewport/planning-region queries
```

Important properties:

- Statewide ArcGIS services are never fetched at route-request time.
- Generated statewide/intermediate geometry is never sent wholesale to the browser.
- GraphHopper edge IDs are transient and never persisted as stable Atlas identity.
- Runtime reads fail closed if schema, traversability policy, graph fingerprint, or source fingerprint is stale.
- Runtime activation requires the complete `GRAVEL_ATLAS_DB_PATH` + graph fingerprint + source fingerprint triad; there is no implicit database-path fallback.
- Runtime DB replacement is atomic.
- Generated SQLite/PBF/graph JSON/reconciliation/traversability JSON are build artifacts, not repository content.

## Traversability policy v2

The current release contract is `GRAVEL_ATLAS_TRAVERSABILITY_POLICY_VERSION = 2` and runtime schema version 2. A reconciled corridor is publishable only when the running GraphHopper service provides complete end-to-end evidence satisfying all of these conditions:

- non-degenerate endpoint-to-endpoint route;
- both endpoint snaps <= 60 m;
- route/corridor matching radius 20 m;
- aligned corridor coverage >= 80%;
- one continuous matching run >= 60% of the corridor;
- direction agreement >= 85% of proximity hits; and
- route/corridor detour ratio <= 1.5x.

Changing those semantics requires a policy-version bump and a fresh Atlas build. Pre-policy-v2 verification output or SQLite must not be treated as current release evidence.

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
- route caching separates Atlas OFF/Balanced/More/Maximum semantics and namespaces enabled results by the active source/graph build;
- stale/missing/incompletely configured Atlas data degrades to ordinary routing rather than failing the route request;
- cancellation is propagated through Atlas shaping rather than being swallowed as an ordinary candidate failure.

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

The canonical segment exporter consumes the same prepared PBF and hard motorcycle-access/one-way rules, bounds extraction to official-source vicinity, and emits stable OSM way/from-node/to-node/direction identities. It does not introspect every GraphHopper internal edge after import, which is why policy-v2 live-router traversability verification is a mandatory publication step rather than an optional smoke test.

## Operator commands

NJ-only supported path:

```bash
npm run gravel-atlas:refresh:nj
```

Equivalent explicit pipeline:

```bash
npm run gravel-atlas:sources -- --sources=njgin-ng911
npm run gravel-atlas:graph
npm run gravel-atlas:reconcile
npm run gravel-atlas:verify-routability
npm run gravel-atlas:runtime -- --input=data/gravel-atlas-verified-traversable.json
```

For PA + NJ, use the same pipeline only after independent PASDA authorization and add `pa-pasda-2012` plus the acknowledgement flag at source-ingestion time.

Full activation, rollback, environment variables, policy-v2 evidence requirements, and real-route validation are documented in `docs/operations/GRAVEL_ATLAS_ACTIVATION.md`.

## Release status

The feature code and deterministic/offline pipeline are implemented on PR #123. CI exercises code contracts, map/routing regressions, real-router fixtures, PWA, visual, rider-journey, and mobile suites.

Historical September 11 NJ verification numbers were generated before policy v2 and are retained only as diagnostic history in `docs/reports/GRAVEL_ATLAS_TRAVERSABILITY_VERIFICATION.md`. They are **not current release evidence**.

What remains outside synthetic CI is current real-data activation evidence:

1. reconcile the live host and exact PR head;
2. ensure the active GraphHopper cache is stamped/current;
3. regenerate the NJ Atlas under policy v2, and PA only if PASDA use is authorized;
4. configure `GRAVEL_ATLAS_DB_PATH`, `GRAVEL_ATLAS_GRAPH_FINGERPRINT`, and `GRAVEL_ATLAS_SOURCE_FINGERPRINT` together;
5. prove the runtime metadata reports schema v2 and traversability policy v2;
6. test actual runtime corridors with Atlas OFF/Balanced/More/Maximum plus Free Ride;
7. prove stale graph/source/policy, missing DB path, and access-conflict cases fail closed;
8. run exact-head required checks after the final code/docs head is stable;
9. update PR #123 with fresh policy-v2 counts and route evidence;
10. mark ready for review, resolve concrete review findings, and merge only when the release gates and owner authorization permit it.

## Merge criteria

Do not merge merely because synthetic/CI fixtures pass. Merge requires all of the following:

- exact current PR head passes all protected checks and Mobile Core;
- generated data/secrets are absent from the diff;
- live source scope is recorded as NJ-only or explicitly authorized PA+NJ;
- the runtime DB is freshly generated under policy v2/schema v2;
- current published/refused/quarantine counts and fingerprints are recorded rather than copied from the pre-v2 diagnostic;
- at least one Atlas-improved A-to-B case, one Free Ride case, and one correct no-change case are validated from the current runtime database;
- detour/duration bounds and returned-route overlap are measured, not inferred from shaping requests;
- missing DB path, stale source/graph/policy, and cancellation behavior are explicitly verified fail-closed;
- map-layer/routing-preference independence is verified;
- independent UX/release review is completed and actionable findings are resolved; and
- rollback assets are preserved through post-merge production smoke.

The detailed operational procedure is the release authority for this feature: `docs/operations/GRAVEL_ATLAS_ACTIVATION.md`.
