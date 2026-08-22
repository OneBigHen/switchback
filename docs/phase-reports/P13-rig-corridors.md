# P13 — RIG corridor clustering and spatial index

**Phase:** P13 — contiguous high-value corridors and spatial tile/index build
**Current SHA:** `5632af2ea7109ae860d608069b8c4364d6f80273` HEAD plus the
uncommitted P13 worktree changes.
**Release gate:** G3

## Before behavior

- P12 produced bounded per-segment RIG aggregates, but no builder grouped
  connected high-value segments into usable corridors.
- There was no RIG spatial index from canonical segment UIDs to geographic
  tiles.
- Existing offline corridor manifests describe route-download geometry
  envelopes; they are not RIG evidence corridors and remain separate.

## After behavior

- `src/lib/roads/rig-corridors.ts` builds deterministic corridors from verified
  canonical segments and P12 aggregates. Candidates require minimum utility and
  evidence strength, so weak or generated-only evidence cannot form a corridor.
- Segment links use exact directed endpoint topology or a bounded measured
  endpoint-proximity lookup, and require coherent ride-character dimensions.
  Disconnected snippets and incompatible nearby segments are not joined.
- Corridor output contains canonical segment UIDs, entry/exit node IDs, length,
  utility, confidence, dimensions, bounds, and provenance. It does not copy
  route geometry.
- The spatial index emits bounded Web Mercator tile-to-UID references only;
  geometry remains owned by the canonical segment graph.
- P12 now exposes a runtime aggregate validator for this trust boundary.

## Files changed

- `src/lib/roads/rig-corridors.ts` — bounded corridor clustering and UID-only
  spatial index construction.
- `src/lib/roads/rig-evidence.ts` — runtime validation for P12 aggregate input.
- `tests/unit/rig-corridors.test.ts` — contiguous corridor, character/topology
  breaks, UID-only index, and invalid/oversized input coverage.
- `docs/recovery/WORKLOG.md`.

## Migrations

None. P13 adds an in-memory build seam and does not alter persisted route,
library, or offline payloads.

## Verification

| Command/evidence | Result |
|---|---|
| Focused P13 Vitest suite | 2 files, 9 tests passed locally |
| the validation host `npm run verify` | lint/typecheck/build passed; 177 test files, 1,199 passed, 1 skipped |
| the validation host broad Playwright | 24/24 |
| the validation host critical Chromium/WebKit | 30/30 |
| the validation host PWA | 2/2 |
| the validation host real-router fixture | 5/5, including private, motorcycle-closed, and disconnected refusals |
| the validation host memory soak | 1/1 test; 10/10 planner cycles |
| Local/remote scoped SHA parity | equal for both P13 modules and both focused tests |
| Router cleanup | PID file absent and port 8998 closed |

## Memory/performance evidence

The build bounds input at 50,000 segments, each corridor at 4,096 segments,
the output at 4,096 corridors, and the tile index at 100,000 tiles. Endpoint
proximity uses bounded spatial cells rather than an all-pairs comparison.
Corridors and tiles retain UID references, not copied route geometry. The
browser memory soak remained green at 10/10 cycles.

## Routing quality evidence

The real GraphHopper fixture remained green at 5/5, but P13 does not change
provider routing or route topology. No live owner-corpus map-match or field
ride evidence is claimed.

## Known limitations

- Utility currently uses an explicit equal-weight dimension proxy; it is not
  calibrated against a golden corpus.
- The tile build assigns UIDs from canonical geometry points and does not yet
  interpolate long line spans between vertices.
- P13 assumes its canonical segment inputs passed the P09 graph/hash trust
  boundary; it does not rehash every input asynchronously.
- P13 does not decide legality, closures, motorcycle compatibility, or current
  access. P14 owns eligibility and precedence.
- Offline RIG tile packaging, live map-match enrichment, physical-device
  behavior, authenticated-browser behavior, production concurrency, and
  field/model quality remain unproven.

## Deferred

- P14 — legality, closure, bike compatibility, surface, and coverage gates.
- Later offline RIG packaging and live intelligence integration — P27/P29.

## Rollback

Remove `rig-corridors.ts`, its focused tests, the P12 validator extension, and
the P13 worklog/report sections. No persisted data migration or user-data
deletion is required.

## Next dependency

P14 — route eligibility and legality precedence.
