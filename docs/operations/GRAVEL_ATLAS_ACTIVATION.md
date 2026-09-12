# Gravel Atlas activation, validation, and rollback

This runbook activates SwitchBack's Gravel Atlas against real PA/NJ data after the code has passed CI. It is intentionally stricter than a normal application deploy because the runtime database is derived from external surface evidence and must match the exact active motorcycle routing graph.

## Safety model

The live GraphHopper motorcycle graph remains authoritative for route connectivity and access. Gravel Atlas contributes source-backed surface evidence and bounded shaping candidates only. A candidate must still route successfully through the normal provider and prove actual returned-route overlap before it may replace the baseline route.

Runtime Atlas reads fail closed unless both the source fingerprint and active graph fingerprint match the runtime database. Missing, malformed, stale, or unavailable Atlas data must not break ordinary routing.

PASDA's 2012 Pennsylvania unpaved-road source has reproduction/redistribution restrictions. The `--accept-pasda-terms` flag is an explicit operator acknowledgement gate; it is **not** a license grant. Do not ingest or deploy the PASDA source unless the operator has independently confirmed that the intended use is authorized. NJGIN can be activated independently.

## 1. Reconcile the repository first

Do not operate from a pasted SHA or handoff summary.

```bash
cd /root/Vibe/switchback
git status --short
git fetch origin --prune
git rev-parse origin/main
git rev-parse origin/feat/pa-gravel-atlas-routing
git log --oneline --decorate -12 origin/feat/pa-gravel-atlas-routing
```

Confirm PR #123 still points at the expected branch and that GitHub required checks are green for the exact head you intend to deploy. Do not continue with an uncommitted working tree or a superseded branch head.

## 2. Verify the code baseline

```bash
npm ci
npm run verify
```

Also require the repository's browser/release checks for the exact PR head, including `critical-e2e`, `pwa`, `road-lock`, `real-router`, `visual`, and Mobile Core. Do not substitute an older green SHA.

## 3. Ensure the active GraphHopper cache is fingerprinted and current

Bootstrap the exact PA+NJ routing inputs first:

```bash
npm run data:bootstrap
npm run routing:fingerprint
```

If `routing:fingerprint` succeeds, the active cache stamp matches the current prepared `data/pa-nj-motorcycle.osm.pbf`, GraphHopper binary, canonical config, and sorted custom models.

If it reports an unstamped or stale graph, build and validate a side-by-side candidate rather than replacing the active cache in place:

```bash
NAME="gravel-atlas-$(date +%Y%m%d-%H%M%S)"
scripts/graphhopper.sh import-candidate "$NAME"
scripts/graphhopper.sh validate-candidate "$NAME"
```

Stop the production GraphHopper service with the host's normal service mechanism, then:

```bash
scripts/graphhopper.sh swap "$NAME"
```

Restart GraphHopper, verify its health and all four motorcycle profiles, then prove the active cache stamp again:

```bash
npm run routing:fingerprint
```

Keep `data/graph-cache-rollback-$NAME` until the entire application release has passed post-deploy checks.

## 4. Back up the current Atlas runtime database

Before replacing a live Atlas database, preserve the previous file outside the active pathname. For example:

```bash
mkdir -p data/gravel-atlas-backups
if [ -f data/gravel-atlas.sqlite ]; then
  cp --reflink=auto data/gravel-atlas.sqlite \
    "data/gravel-atlas-backups/gravel-atlas-$(date +%Y%m%d-%H%M%S).sqlite"
fi
```

The builders use temporary files and atomic renames, but this backup is still required for operational rollback.

## 5. Build official source evidence

### NJ-only activation

NJGIN does not require the PASDA acknowledgement gate. The supported one-command path is:

```bash
npm run gravel-atlas:refresh:nj
```

That command performs source snapshot/staging, bounded canonical graph export, conservative reconciliation, and runtime SQLite construction. Capture its output, including accepted source rows, source fingerprint, graph fingerprint, retained canonical segment count, reconciled corridor count, and quarantine count.

### PA + NJ activation

Only use this path after authorization for the PASDA source has been established outside this script:

```bash
npm run gravel-atlas:sources -- \
  --sources=pa-pasda-2012,njgin-ng911 \
  --accept-pasda-terms
npm run gravel-atlas:graph
npm run gravel-atlas:reconcile
npm run gravel-atlas:runtime -- --input=data/gravel-atlas-verified.json
```

Do not treat `--accept-pasda-terms` as permission. If authorization is uncertain, activate NJ only and report PA as intentionally unavailable.

Generated SQLite, PBF, graph-cache, `data/gravel-atlas-graph.json`, and `data/gravel-atlas-verified.json` artifacts are runtime/build products and must not be committed.

## 6. Configure the application runtime

`gravel-atlas:runtime` prints the exact values required by the application. Configure all three together:

```text
GRAVEL_ATLAS_DB_PATH=<absolute path to data/gravel-atlas.sqlite>
GRAVEL_ATLAS_GRAPH_FINGERPRINT=<builder output>
GRAVEL_ATLAS_SOURCE_FINGERPRINT=<builder output>
```

Restart/redeploy SwitchBack so the route API and map-feature API receive the same database path and fingerprints. Never update only one fingerprint.

## 7. Validate the real runtime data

Select validation cases from the runtime Atlas itself rather than inventing arbitrary test roads. Query several high-confidence corridors in each activated state/region, then build rides whose start/finish envelopes genuinely intersect those corridors.

For each representative ride, compare Atlas OFF against Balanced, More, and Maximum using Adventure or Gravel. Record:

- baseline and selected route distance/duration;
- actual returned-route Atlas matched distance;
- longest continuous Atlas run;
- candidate source/provenance;
- detour ratio versus baseline;
- whether a candidate was correctly rejected when it did not improve real overlap.

At minimum prove all of the following:

1. An A-to-B route where Atlas produces a useful, bounded gravel improvement.
2. A Free Ride/round-trip case where Atlas can attract toward a verified corridor without violating duration tolerance.
3. A case where Atlas correctly makes no change because useful evidence is absent or the detour is unreasonable.
4. Atlas is unavailable/fail-closed for incompatible routing profiles.
5. `Known gravel roads` layer visibility changes only the map; hiding it does not disable an enabled routing preference.
6. Enabling `Favor known gravel` can change candidate generation even when the layer is hidden.
7. Map requests are viewport bounded and do not ship statewide source geometry to the browser.
8. A deliberately wrong source fingerprint returns no Atlas evidence while ordinary routing still succeeds.
9. A deliberately wrong graph fingerprint returns no Atlas evidence while ordinary routing still succeeds.
10. Private/no-access or otherwise unroutable graph evidence cannot force a route.

The canonical exporter derives stable OSM-directed segments from the exact prepared PBF and the hard motorcycle routing rules used for the GraphHopper build. It does not introspect every internal GraphHopper edge after import. Therefore, sample representative retained corridors against the running GraphHopper service. If meaningful discrepancies appear because of parser/subnetwork/import behavior, strengthen reconciliation before release rather than weakening the fingerprint gate.

## 8. Application and UI smoke test

On desktop and a real phone-sized viewport verify:

- `Favor known gravel` appears only where appropriate and offers Balanced / More / Maximum;
- the quick `Known gravel roads` layer can be toggled independently;
- tan dashed rendering is legible without obscuring the selected route;
- layer loading/empty/error states are understandable;
- legacy saved map settings/map packs migrate without breaking the planner;
- planning remains normal with Atlas disabled or runtime data absent.

Run the repository release gates again against the exact final code head after any activation-related code change.

## 9. Rollback

If Atlas behavior is bad but the base app/router is healthy:

1. restore the previous `gravel-atlas.sqlite` backup or remove the Atlas runtime environment variables;
2. restart SwitchBack;
3. verify ordinary routing and map features are healthy.

If the new GraphHopper build is the problem, stop GraphHopper and restore the preserved `data/graph-cache-rollback-<name>` cache using the host's normal graph-cache rollback procedure, then restart and re-run health/profile checks plus `npm run routing:fingerprint` against the restored routing inputs.

Do not delete rollback assets until post-merge production validation is complete.

## 10. Merge gate

PR #123 may leave draft status only after real-data activation has been validated and documented. Before merge:

- reconcile `origin/main`, PR head, and local checkout again;
- ensure generated data, secrets, and environment files are absent from the diff;
- require every protected check to be green for the exact current PR head;
- add the activated source scope (`NJ-only` or authorized `PA+NJ`), fingerprints, corridor/quarantine counts, and real-route validation evidence to the PR;
- review the complete PR diff for unrelated changes;
- merge with the repository's normal policy using the expected head SHA so a moving branch cannot be merged accidentally.

After merge, fetch `origin/main`, prove it contains PR #123, deploy through the normal SwitchBack release path, and repeat the production smoke/Atlas OFF-vs-ON checks. Roll back rather than patching production blindly if the post-merge validation fails.
