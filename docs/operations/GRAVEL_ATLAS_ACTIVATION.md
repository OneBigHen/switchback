# Gravel Atlas activation, validation, and rollback

This runbook activates SwitchBack's Gravel Atlas against real PA/NJ data after code and
release checks pass. The Atlas is derived from external surface evidence and must match
the exact routing graph **and** the exact traversability policy used to verify it.

## Safety model

The live GraphHopper motorcycle graph remains authoritative for route connectivity and
access. Gravel Atlas contributes source-backed surface evidence and bounded shaping
candidates only. A candidate must still route through the normal provider and prove
returned-route overlap before it may replace the baseline.

The current release contract is **traversability policy v2** and **runtime schema v2**.
Runtime reads fail closed unless the database metadata identifies the current schema,
policy, source fingerprint, and routing-graph fingerprint. Matching corridor rows alone
are not sufficient. Missing, malformed, stale, partially configured, or unavailable
Atlas data must leave ordinary routing functional.

Policy v2 publishes a reconciled corridor only when the running GraphHopper service
returns a non-degenerate endpoint-to-endpoint route satisfying all of these constraints:

- endpoint snap <= **60 m**;
- corridor/route match radius **20 m**;
- aligned corridor coverage >= **80%**;
- one continuous matching run >= **60%** of the corridor;
- direction agreement >= **85%** of proximity hits; and
- route/corridor detour ratio <= **1.5x**.

Do not reuse a pre-policy-v2 `gravel-atlas.sqlite` or an old
`gravel-atlas-verified-traversable.json`. A verifier-policy change requires regeneration.

PASDA's 2012 Pennsylvania unpaved-road source has reproduction/redistribution
restrictions. **`npm run gravel-atlas:sources` refuses `pa-pasda-2012` outright** — there is no
operator flag, because an acknowledgement is not a license grant. Enabling Pennsylvania
requires independently established production-use authorization, recorded in code
(`OPERATOR_INGESTIBLE_SOURCES` in `src/lib/roads/gravel-atlas/sources.ts`) and passed as the
snapshot's authorization reference, through a reviewed change. NJGIN activates independently.

## 1. Reconcile the repository first

Never operate from a pasted SHA or handoff summary without reconciling GitHub first.

```bash
cd /root/Vibe/switchback
git status --short
git fetch origin --prune
git rev-parse origin/main
git rev-parse origin/feat/pa-gravel-atlas-routing
git log --oneline --decorate -15 origin/feat/pa-gravel-atlas-routing
```

Confirm PR #123 still points to that branch, the worktree is clean, and you are not about
to operate on a superseded head.

## 2. Verify the code baseline

```bash
npm ci
npm run verify
```

Also require the repository's browser/release checks on the exact final head, including
critical rider journeys, PWA, road-lock, real-router, visual, and Mobile Core. Never
substitute an older green SHA.

## 3. Prove the active GraphHopper build

Bootstrap the exact routing inputs and verify the active cache stamp:

```bash
npm run data:bootstrap
npm run routing:fingerprint
```

The fingerprint must describe the current prepared OSM PBF, GraphHopper binary, canonical
config, and sorted custom models.

If the graph is unstamped or stale, build and validate a side-by-side candidate rather
than replacing the active cache in place:

```bash
NAME="gravel-atlas-$(date +%Y%m%d-%H%M%S)"
scripts/graphhopper.sh import-candidate "$NAME"
scripts/graphhopper.sh validate-candidate "$NAME"
```

Stop the production GraphHopper service with the host's normal service mechanism, swap
the validated cache, restart, verify health and all motorcycle profiles, then rerun:

```bash
scripts/graphhopper.sh swap "$NAME"
npm run routing:fingerprint
```

Keep `data/graph-cache-rollback-$NAME` until post-deploy validation is complete.

## 4. Back up the current Atlas runtime database

```bash
mkdir -p data/gravel-atlas-backups
if [ -f data/gravel-atlas.sqlite ]; then
  cp --reflink=auto data/gravel-atlas.sqlite \
    "data/gravel-atlas-backups/gravel-atlas-$(date +%Y%m%d-%H%M%S).sqlite"
fi
```

Builders use temporary files and atomic renames, but the explicit backup is still required
for operational rollback.

## 5. Regenerate official evidence with the current verifier

### NJ-only activation

```bash
npm run gravel-atlas:refresh:nj
```

This is the supported path. It performs source snapshot/staging, canonical graph export,
conservative reconciliation, policy-v2 live-router traversability verification, and then
runtime SQLite construction from `data/gravel-atlas-verified-traversable.json`.

A current release report must capture the fresh results rather than reusing the historical
September 11 diagnostic counts. Record:

- traversability policy version (**2**) and runtime schema version (**2**);
- source and source-snapshot fingerprints;
- active graph fingerprint;
- source fetched / accepted / rejected / duplicate counts;
- canonical segment count and reconciled corridor count;
- policy-v2 published and refused counts;
- quarantine totals grouped by reason;
- accepted aligned coverage: minimum, p5, median, mean;
- minimum accepted continuous coverage;
- minimum accepted direction agreement;
- maximum accepted detour ratio; and
- worst accepted endpoint snap.

If GraphHopper is unreachable, verification must fail closed and no new runtime database
may be published. If materially more corridors are refused under policy v2, investigate
the evidence; do not weaken the gate just to reproduce the historical 38-corridor result.

### PA + NJ activation

Not available. Pennsylvania ingestion is refused by the sources command until PASDA
production-use authorization is independently established and a reviewed change records it
(see the source-terms note above). If authorization is uncertain, PA stays unavailable.

Generated SQLite, PBF, graph-cache, reconciliation JSON, traversability JSON, and report
artifacts are runtime/build products and must not be committed.

## 6. Verify runtime database identity before activation

Inspect the generated SQLite metadata and prove it reports:

- runtime schema version 2;
- traversability policy version 2;
- the fresh source fingerprint;
- the active graph fingerprint; and
- the freshly generated corridor count.

Any older schema/policy database is stale even if its row fingerprints happen to match.

## 7. Configure the application runtime atomically

Configure **all three** variables together using values printed by the runtime builder:

```text
GRAVEL_ATLAS_DB_PATH=<absolute path to data/gravel-atlas.sqlite>
GRAVEL_ATLAS_GRAPH_FINGERPRINT=<fresh builder output>
GRAVEL_ATLAS_SOURCE_FINGERPRINT=<fresh builder output>
```

The Atlas is considered configured only when the complete triad is present. There must be
no implicit fallback to a default database path when the path variable is absent. An
incomplete triad must disable Atlas influence while ordinary routing remains healthy.

Restart/redeploy SwitchBack so route and map-feature APIs receive the same configuration.
Never rotate one fingerprint independently.

## 8. Validate real runtime behavior

Choose cases from corridors actually present in the freshly generated policy-v2 database.
For each representative ride compare Atlas OFF, Balanced, More, and Maximum using
Adventure or Gravel. Record route distance/duration, actual returned-route matched Atlas
distance, longest continuous run, candidate provenance, detour ratio, and whether rejected
candidates were rejected for the expected reason.

At minimum prove:

1. An A-to-B route where Atlas produces a useful bounded improvement.
2. A Free Ride/round-trip where Atlas can attract toward a verified corridor without
   violating the duration tolerance.
3. A route where Atlas correctly makes no change.
4. Incompatible profiles ignore Atlas.
5. Hiding `Known gravel roads` changes only map visibility; it does not disable an enabled
   `Favor known gravel` routing preference.
6. Enabling `Favor known gravel` can affect candidate generation even with the layer hidden.
7. Map requests remain viewport-bounded.
8. A deliberately wrong source fingerprint makes Atlas unavailable/inert while ordinary
   routing succeeds.
9. A deliberately wrong graph fingerprint does the same.
10. A missing `GRAVEL_ATLAS_DB_PATH` with the two fingerprints present does **not** activate
    route attraction.
11. Stale schema/policy metadata cannot be bypassed by matching corridor-row fingerprints.
12. Private/no-access or otherwise unroutable evidence cannot force a route.
13. Cancellation/request fencing still terminates Atlas shaping rather than returning a
    stale baseline result after an aborted request.

## 9. Application and UI smoke test

On desktop and a real phone-sized viewport verify:

- `Favor known gravel` appears only for compatible ride profiles and offers Balanced /
  More / Maximum;
- `Known gravel roads` can be toggled independently;
- tan dashed rendering is legible without obscuring the selected route;
- loading / empty / unavailable states are distinct and understandable;
- legacy saved settings/map packs still migrate; and
- ordinary planning remains healthy with Atlas disabled, absent, stale, or incompletely
  configured.

## 10. Rollback

If Atlas behavior is bad but the base app/router is healthy, choose one:

**Restore the previous Atlas build (as one unit).** The runtime database is validated against
`GRAVEL_ATLAS_GRAPH_FINGERPRINT` and `GRAVEL_ATLAS_SOURCE_FINGERPRINT`, so a restored database
only activates with the fingerprints it was built for:

1. restore the previous `gravel-atlas.sqlite` backup **and** set the graph and source
   fingerprints recorded for that build (its `gravel_atlas_metadata` row) together;
2. confirm that graph fingerprint still matches the active GraphHopper cache
   (`npm run routing:fingerprint`); otherwise use the disable-only rollback;
3. restart the app and verify Atlas-on routing, map features, and ordinary routing.

**Disable-only rollback.** Remove the complete Atlas runtime triad (`GRAVEL_ATLAS_DB_PATH`,
`GRAVEL_ATLAS_GRAPH_FINGERPRINT`, `GRAVEL_ATLAS_SOURCE_FINGERPRINT`), restart, and verify
ordinary routing and map features. Atlas influence is then zero and the Known gravel roads layer
reports unavailable.

If the GraphHopper build is the problem, restore the preserved
`data/graph-cache-rollback-<name>` using the host's graph-cache rollback procedure, then
restart and rerun health/profile checks and `npm run routing:fingerprint`.

Keep rollback assets until post-release validation is complete.

## 11. PR and merge gate

PR #123 must remain draft until current policy-v2 real-data activation has been regenerated,
validated, and documented. Before it may leave draft status:

- reconcile `origin/main`, PR head, and the host checkout again;
- prove generated data, secrets, and environment files are absent from the diff;
- replace historical pre-v2 counts in the PR's active-status section with the **fresh**
  policy-v2 fingerprints/counts/distributions;
- record representative current OFF/Balanced/More/Maximum and Free Ride evidence;
- require every protected check and Mobile Core to be green on the exact current head; and
- request independent code review / CodeRabbit and resolve Critical and Important findings.

Do **not merge PR #123 without explicit owner authorization**, even after all gates are green.
If merge is later authorized, use the expected PR head SHA so a moving branch cannot be
merged accidentally, then repeat post-deploy production validation.
