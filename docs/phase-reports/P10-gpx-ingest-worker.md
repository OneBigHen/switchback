# P10 — Streaming GPX ingest and duplicate families

**Phase:** P10 — GPX ingest worker, normalization, map-match boundary, and
exact/near-duplicate families
**Current SHA:** `5632af2ea7109ae860d608069b8c4364d6f80273` HEAD plus the
uncommitted P10 worktree changes.

## Before behavior

- `scripts/import-project-gpx.ts` loaded each GPX file into memory, retained
  only the longest track/route segment, and discarded source originals after a
  destructive output-directory replacement.
- Exact raw-file hashes were counted, but measured near-duplicate geometry
  families, segment boundaries, timestamps, elevation, teleport/gap evidence,
  and map-match status were not retained.
- No explicit map-matching adapter existed; imported geometry could be treated
  as a route without a provider result.

## After behavior

- `GpxStreamParser` incrementally tokenizes chunked UTF-8 XML with bounded
  bytes, points, segments, waypoints, token size, and cancellation checks. It
  preserves multiple tracks, routes, segments, waypoints, point timestamps,
  and elevation.
- `normalizeGpxDocument` removes only consecutive exact coordinate duplicates,
  keeps one flattened geometry plus `segmentStarts`, measures distance,
  duration, ascent/descent, invalid points, and gaps, and never creates a
  connector across a segment boundary in the normalized metrics.
- The owner-corpus importer streams and hashes every source, groups exact raw
  duplicates, preserves accepted and rejected originals, stages the complete
  catalog, and swaps it into place only after successful generation. Previous
  generated output is moved to a timestamped sibling instead of being silently
  deleted.
- Bounded geometry fingerprints use measured length, endpoints, segment count,
  and sampled point distances to form deterministic near-duplicate families.
  Family metadata is available in the catalog API and library view-model.
- `mapMatchGpxStream` is an explicit GraphHopper `POST /match` adapter. A real
  valid path response is the only way to emit `matched`; missing configuration,
  empty paths, provider errors, timeouts, and cancellation remain distinct
  statuses.

## Files changed

- `src/lib/gpx/streaming-parser.ts` — bounded incremental GPX XML parser.
- `src/lib/gpx/corpus-ingest.ts` — normalization, metrics, segment boundaries,
  and measured geometry fingerprints.
- `src/lib/gpx/map-matching.ts` — streaming GraphHopper map-match adapter.
- `scripts/import-project-gpx.ts` — streamed owner-corpus import, source
  preservation, staging, exact hashes, and duplicate-family assignment.
- `src/lib/gpx/catalog.ts` — optional family and map-match metadata.
- `src/app/api/gpx-library/handler.ts` — public family/status metadata and
  aggregate family counts without filesystem paths.
- `src/lib/gpx/library-view-model.ts` — measured family grouping before name
  heuristics.
- `tests/unit/gpx-streaming-ingest.test.ts` — chunk parsing, normalization,
  gaps, metrics, and near-duplicate checks.
- `tests/unit/gpx-map-matching.test.ts` — not-configured, matched, unmatched,
  and provider-failure states.
- `tests/unit/gpx-library-view-model.test.ts` — measured family grouping.
- `docs/recovery/WORKLOG.md`.

## Owner-corpus evidence

The real `/root/Vibe` corpus was read into a temporary output directory without
modifying source files:

| Evidence | Result |
|---|---:|
| Scanned GPX files | 778 |
| Unique raw files | 420 |
| Exact duplicate files | 358 |
| Imported routes | 412 |
| Preserved rejected files | 8 |
| Duplicate families | 125 |
| Near-duplicate families | 113 |
| Routes in near-duplicate families | 387 |
| Map-match status | not-configured; track-only |

The eight rejected originals were retained. They are malformed XML, a zero-byte
file, or degenerate one-point/duplicate-point tracks; the importer does not
invent a route by joining unrelated waypoints to make them appear valid.

## Megaplex verification

The isolated checkout on `192.168.1.175`, Megaplex `docker-stable` LXC 109,
used Node 24.15.0 and the synced P10 source:

| Command/evidence | Result |
|---|---|
| `npm run verify` | lint/typecheck/build passed; 174 test files, 1,187 tests passed, 1 skipped |
| `npm run test:e2e` | 24/24 across desktop Chromium, mobile Safari, and both landscape projects |
| `npm run test:e2e:critical` | 30/30 across Chromium and WebKit |
| `npm run test:e2e:pwa` | 2/2 |
| Megaplex real-router gate | 5/5; private, motorcycle-closed, and disconnected refusals remained honest |
| `npm run test:e2e:memory-soak` | 1 test; 10/10 planner cycles passed |
| post-router cleanup | PID file absent and port 8998 closed |
| local/remote scoped source hashes | equal for parser, normalizer, matcher, importer, and focused tests |

## Known limitations

- No live GraphHopper map-match endpoint was configured for the owner corpus;
  imported routes therefore remain explicitly `not-configured`/track-only. The
  adapter has provider-response tests, not a claim of live matched data.
- The browser's existing interactive GPX upload worker remains on its DOM
  parser path for compatibility. The superseded whole-file path was removed
  only from the owner-corpus importer, which now owns corpus ingestion.
- `segmentStarts` is persisted, but downstream route drawing, navigation, and
  later GPX intelligence must consume those boundaries before treating a
  multi-segment trace as one continuous road line.
- No OSM-backed canonical segment assignment is emitted here. That requires a
  real map-match/provider result and remains a later P27/P29 integration.
- Automated checks do not prove authenticated-browser behavior,
  physical-device behavior, production concurrency, or field/model quality.

## Deferred

- P11/P12 — intrinsic road features and RIG evidence.
- P27 — map-match intelligence, unmatched spans, surface/road facts, and
  grounded GPX descriptions.
- P28 — join/export semantics that honor segment boundaries and provenance.
- P29 — offline Geo Worker ownership and canonical graph integration.

## Rollback

Remove the streaming owner-corpus modules and restore the prior importer only
if needed; do not reset the worktree because it contains earlier phase and
user changes. Generated output is recoverable from the timestamped previous
catalog and preserved source/rejected directories.

## Next dependency

P11 — intrinsic route/road features and evidence ownership.
