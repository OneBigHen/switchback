# P27 — GPX intelligence

**Phase:** P27 — analysis, confidence, unmatched spans, and grounded description  
**Current SHA:** `5632af2ea7109ae860d608069b8c4364d6f80273` HEAD plus the
uncommitted P25–P27 worktree changes  
**Release gate:** G6

## Before behavior

- The streaming GPX parser and normalizer already preserved track/route
  segments, timestamps, elevation, duplicate counts, gaps, and fingerprints.
- The matcher returned only a provider-level status and matched distance; route
  detail had no bounded intelligence report, unmatched span model, or grounded
  GPX description.
- Imported GPX routes kept empty road and surface mix maps, but the UI had no
  explicit distinction between unavailable GPX evidence and a measured clean
  result.

## After behavior

- Added one bounded `GpxIntelligenceReport` to imported route artifacts and the
  compatibility-facing `PlannedRoute` contract. It stores measured distance,
  timestamp duration, elevation, curvature, ingest counts, gap spans, match
  evidence, confidence basis, creator notes, and a deterministic description.
- Gap and segment-boundary spans retain point indices and measured distances;
  no connector geometry is invented. A provider no-path response creates one
  explicit track-only unmatched span with `Track guidance — road data
  unavailable`.
- GraphHopper snapped-waypoint counts may produce a **provider waypoint
  coverage** percentage. A provider path without that count leaves match and
  unmatched percentages unquantified; it is never mislabeled as route-distance
  coverage.
- Surface, road classes, MVUM overlap, community overlap, and fuel gaps remain
  explicit unknowns until their own provenance-backed datasets exist. No file
  name or route label is promoted to a measured surface/access fact.
- Metadata creator descriptions are streamed, decoded, normalized, and capped
  at 2,000 characters. Report lists, text, and matcher path arrays are bounded.
- Project GPX detail reads validate the report shape before returning it. The
  existing artifact geometry remains the sole geometry owner; the report uses
  indices and scalar facts rather than copying the route line.
- Route details now show the report, unknown evidence labels, track-only
  handling, confidence level, and creator notes without adding another planner
  or storage path.

## Files changed

- `src/lib/gpx/streaming-parser.ts` — bounded metadata description capture.
- `src/lib/gpx/corpus-ingest.ts` — normalized creator-note provenance.
- `src/lib/gpx/intelligence.ts` — report computation, bounded spans, grounded
  description, and runtime validation.
- `src/lib/gpx/catalog.ts` and `src/app/api/gpx-library/handler.ts` — bounded
  catalog intelligence summaries and detail trust boundary.
- `src/lib/routing/types.ts` and `src/lib/routing/gpx-import.ts` — optional
  route attachment for local and project GPX imports.
- `scripts/import-project-gpx.ts` — artifact/report generation and manifest
  summary fields; generated catalog version is now 3.
- `src/components/planner/GpxIntelligencePanel.tsx`,
  `src/components/planner/RouteComparison.tsx`, and
  `src/app/styles/route-comparison.css` — route-detail presentation.
- `tests/unit/gpx-intelligence.test.ts`,
  `tests/components/gpx-intelligence-panel.test.tsx`,
  `tests/unit/gpx-streaming-ingest.test.ts`, and the existing GPX API/matcher
  suites — measured facts, unknowns, no-path behavior, validation, and UI
  regressions.

## Files deleted

None. The prior parser, normalizer, matcher, and catalog paths remain the
single ownership path; no compatibility shim or duplicate importer was added.

## Migrations

No destructive migration is required. `gpxIntelligence` is optional on the
route contract, so existing saved routes and old generated artifacts remain
loadable. A new project import writes manifest version 3 and includes the
report; no owner corpus re-import was run during this phase.

## Tests

- Final Megaplex focused GPX audit: 5 files / 16 tests passed.
- Final Megaplex `npm run verify`: 187 test files / 1,238 passed / 1 skipped;
  lint, typecheck, and production build passed.
- Megaplex broad browser matrix: 28/28 passed.
- Megaplex critical Chromium/WebKit matrix: 30/30 passed.
- Megaplex PWA/offline matrix: 2/2 passed.
- Megaplex memory soak: 1/1 test, 10/10 planner cycles.
- Megaplex real GraphHopper fixture: 5/5 passed; router PID and port 8998
  cleanup were clear.
- `git diff --check` passed before documentation edits.

## Commands and environment

The acceptance runs used `/tmp/switchback-megaplex-test.LDEtb5` in the
Megaplex LXC at `root@192.168.1.175`, with Node 24.15.0 at
`/tmp/node-v24.15.0-linux-x64`. The final full verification log is
`/tmp/switchback-p27-final-verify.log` on that LXC.

## Memory/performance evidence

The streaming parser retains its existing 5 MiB, 50,000-point, 256-segment,
10,000-waypoint, and 128 KiB token ceilings. Intelligence spans and report
text have independent caps; no new listener, worker, cache, or persistent raw
GPS trail was introduced. The ten-cycle browser memory soak passed.

## Routing and data-quality boundary

P27 proves deterministic analysis of the original GPX and honest provider
status handling. It does not prove that a production matcher is configured,
that a provider path covers every road distance, that surface/access/legal
facts exist, that MVUM/community/fuel datasets are current, or that the
generated owner corpus has been re-imported with current map data. Confidence
is an evidence-basis level, not a calibrated probability.

## Known limitations

- A no-path provider response is represented as one whole-track unmatched span;
  per-span split matching awaits a matcher response containing matched geometry
  or point-level ranges.
- Local browser GPX import can attach the report without road matching; it
  correctly remains `not-evaluated` rather than claiming a map match.
- The known MapLibre narrow-viewport canvas-fit warning appeared during broad
  browser runs and did not fail or alter any test outcome.
- Automated tests do not prove authenticated-browser behavior, physical iPhone
  GPS, outdoor track-following ergonomics, or production route/model quality.

## Deferred

- P28 — GPX join, continuous session, and export variants.
- Production matcher/RIG/data-provider deployment and field/device gates remain
  later release requirements.

## Rollback

Remove the optional `gpxIntelligence` attachment, report panel, catalog summary
fields, and metadata description capture. Existing route geometry and legacy
GPX artifacts remain usable; no data rollback is needed.

## Next dependency

P28 — GPX join/export.
