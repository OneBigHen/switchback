# P09 — Canonical segment graph

**Phase:** P09 — Canonical segment graph and migration lineage
**Current SHA:** `5632af2ea7109ae860d608069b8c4364d6f80273` HEAD plus the
uncommitted P02–P09 worktree changes.

## Before behavior

- Switchback had no canonical OSM-directed segment UID or graph admission
  boundary.
- Road matching and road locks carried GraphHopper edge IDs and provider graph
  versions for current routing compatibility. Those IDs are ephemeral and the
  current GraphHopper detail payload does not provide trusted OSM way/node
  endpoints from which a canonical UID could be derived.
- There was no conservative exact/same-way/spatial migration plan, split/merge
  lineage record, or quarantine result for ambiguous graph-build changes.

## After behavior

- `canonicalSegmentUid` computes exactly
  `SHA256(osm_way_id | from_osm_node_id | to_osm_node_id | direction)`.
- Canonical segments retain OSM snapshot, topology version, way ID, ordered
  endpoint node IDs, direction, geometry hash, geometry, and measured length.
- Graph admission performs structural validation, duplicate-UID rejection, and
  asynchronous UID/geometry-hash verification before accepting a graph.
- Migration verifies every input segment, then considers exact identity,
  same-way directional geometry coverage, and directional spatial coverage in
  that order. It emits the required build lineage fields, supports
  one-to-many and many-to-one changes, and quarantines indistinguishable
  candidates instead of moving evidence silently.
- The provider-neutral `RoadSegmentFeature` contract can carry an optional
  canonical UID. Existing route-scoped IDs, GraphHopper edge IDs, road locks,
  provider requests, and offline v2 edge IDs remain unchanged and explicitly
  non-canonical until a trusted OSM-backed matcher supplies the identity.

## Files changed

- `src/lib/roads/canonical-segments.ts` — canonical identity, geometry
  validation/hash, graph admission, overlap matching, lineage, and quarantine.
- `src/lib/domain/contracts.ts` — optional canonical UID on a normalized road
  segment feature without changing existing segment IDs.
- `src/lib/roads/road-matching.ts` — documents provider edge IDs as ephemeral
  matching data.
- `tests/unit/canonical-segments.test.ts` — identity, tamper, graph,
  directional overlap, exact migration, split/merge, and ambiguity coverage.
- `docs/recovery/WORKLOG.md`.

## Files deleted

None.

## Migrations

None. No existing road locks, route data, IndexedDB schema, offline v2 graph,
provider payload, or runtime database was rewritten. Assigning invented
canonical IDs to current provider edge IDs would corrupt lineage, so the
existing compatibility path remains intact until its OSM-backed owner exists.

## Tests

The final gates ran in the isolated the validation host `dedicated test LXC` LXC 109
(`<private-test-host>`) checkout at `/tmp/switchback-validation-test.LDEtb5`, using
Node 24.15.0. The checkout preserved its dependencies and fixture data while
excluding Git metadata, `.env*`, production routing data, runtime databases,
and generated source artifacts. The real-router run used only the isolated
GraphHopper jar and fixture PBF on port 8998.

## Commands and results

| Command/evidence | Result |
|---|---|
| `npx vitest run tests/unit/canonical-segments.test.ts --reporter=dot` | 7/7 passed locally; included in the final remote full suite |
| the validation host `npm run verify` | lint and typecheck passed; 172 test files / 1,180 tests passed, 1 skipped; production build passed |
| the validation host `npm run test:e2e` | 24/24 passed across desktop Chromium, mobile Safari, and both landscape projects |
| the validation host `npm run test:e2e:critical` | 30/30 passed across Chromium and WebKit |
| the validation host `npm run test:e2e:pwa` | 2/2 passed |
| the validation host real-router gate | 5/5 passed, including private, motorcycle-closed, and disconnected refusal fixtures |
| the validation host `npm run test:e2e:memory-soak` | 1 test / 10 of 10 planner cycles passed |
| final router cleanup | PID file absent; port 8998 closed |

## Memory/performance evidence

The final ten-cycle browser soak measured 33.1 MB used JS heap, 50.4 MB total
heap, and one map instance on every cycle. The captured result is
`artifacts/quality/memory-soak.json`, generated at
`2026-08-11T19:22:23.392Z`. This is bounded automated lifecycle evidence, not
a long-duration ride plateau, physical-device result, or production-load
benchmark.

## Known limitations

- Current GraphHopper and road-lock paths still use provider edge IDs for
  runtime matching. They are not silently relabeled as canonical segments.
- No OSM way/node extraction or GPX map-matching producer was invented in P09;
  later matcher/ingest work must provide those trusted fields before the
  optional canonical UID is populated.
- Migration matching is an in-memory pairwise build-time operation. Large
  corpus indexing/worker ownership belongs to the later ingest/Geo Worker
  phases and should be added only with measured SLO evidence.
- `migrationConfidence` is exact identity or measured source-geometry coverage,
  not a calibrated probability or a claim about legal access, surface, or
  route quality.
- Automated checks do not prove physical-device, authenticated-browser,
  production-concurrency, or field-data quality behavior.

## Deferred

- P10/P27 — trusted GPX ingest and OSM-backed map matching that can populate
  canonical segment references.
- P11/P12 — intrinsic features and RIG evidence built on canonical segments.
- P29 — offline Geo Worker graph ownership and its canonical edge migration.

## Rollback

Remove the canonical segment module, optional contract field, and focused tests;
preserve the existing provider edge-ID road matching and lock path. Do not use
a broad reset because the worktree contains earlier phase and user changes.

## Next dependency

P10 — GPX ingest worker and canonical route import boundary.
