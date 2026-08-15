# P16 — Candidate generator

**Phase:** P16 — direct/native/RIG/loop/community candidates with bounded search
**Current SHA:** `5632af2ea7109ae860d608069b8c4364d6f80273` HEAD plus the
uncommitted P16 worktree changes.
**Release gate:** G3

## Before behavior

- Corridor anchor requests were assembled inline in `planner.ts`.
- Loop retries used a planner-local seed list, with no shared source metadata
  or deterministic heading-sector generator.
- Provider routes had names that implied direct/alternative behavior, but no
  explicit candidate-source field.
- RIG-shaped corridor input was not available at the bounded anchor seam.

## After behavior

- Added one bounded `candidate-generator.ts` owner for corridor requests and
  loop seed/heading requests. It preserves the normalized request and creates
  no topology; only verified anchors become waypoints.
- Corridor generation caps output at four candidates and three anchors per
  candidate, deduplicates point sequences, maps curvature to road-character,
  GPX/adviser hints to community, and accepts optional graph-backed RIG
  anchors.
- Loop generation caps output at seven deterministic candidates, preserves the
  requested seed first, then varies seed and heading sectors without random
  waypoint soup.
- GraphHopper and Valhalla normalized routes expose direct/native/loop source
  labels. Planner-routed corridor candidates carry their generated source.
- Malformed optional anchors are skipped at the trust boundary; invalid
  generator limits and wrong route shapes fail explicitly.

## Files changed

- `src/lib/routing/candidate-generator.ts` — bounded corridor and loop
  candidate request generation.
- `src/lib/routing/destination-corridors.ts` — optional verified RIG anchor
  source and source type.
- `src/lib/routing/planner.ts` — uses the generator for loop retries and
  corridor routing.
- `src/lib/routing/types.ts` — candidate-source contract on routes.
- `src/lib/routing/graphhopper.ts`, `src/lib/routing/valhalla.ts` — direct,
  native, and loop source labels.
- `tests/unit/candidate-generator.test.ts` — bounds, source mapping,
  malformed-anchor handling, deterministic loops, and invalid inputs.
- `docs/recovery/WORKLOG.md`.

## Files deleted

None. The planner-local fallback seed array and inline corridor request
construction were superseded by the shared generator; no route geometry or
persisted user data was deleted.

## Migrations

None. Candidate source metadata is optional and existing saved routes remain
readable.

## Tests

- Local focused suites: 5 files / 60 tests passed.
- Megaplex full `npm run verify`: 180 test files / 1,211 passed / 1 skipped;
  lint, typecheck, and production build passed.
- Megaplex broad browser matrix: 24/24.
- Megaplex critical Chromium/WebKit: 30/30.
- Megaplex PWA: 2/2.
- Megaplex real-router fixture: 5/5, including private,
  motorcycle-closed, and disconnected refusals.
- Megaplex memory soak: 1/1 test; 10/10 planner cycles.
- Scoped local/remote SHA parity matched for all 7 P16 source/test files.
- Router cleanup: PID file absent and port 8998 closed.
- `git diff --check` passed.

## Commands

- `npx vitest run tests/unit/candidate-generator.test.ts tests/unit/destination-corridors.test.ts tests/unit/planner.test.ts tests/unit/graphhopper.test.ts tests/unit/valhalla.test.ts`
- Megaplex `npm run verify`
- Megaplex `npm run test:e2e`
- Megaplex `npm run test:e2e:critical`
- Megaplex `npm run test:e2e:pwa`
- Megaplex `GRAPHHOPPER_URL=http://127.0.0.1:8998 npm run test:e2e:real-router`
- Megaplex `npm run test:e2e:memory-soak`
- `git diff --check`

## Memory/performance evidence

P16 adds no worker, listener, timer, persistent cache, or geometry store.
Generator output is bounded before provider calls; corridor routing remains at
most two provider calls concurrently and uses the existing cancellation
signal. The Megaplex browser memory soak remained green at 10/10 cycles.

## Routing quality evidence

The real GraphHopper fixture remained green at 5/5, including honest refusals
for private, motorcycle-closed, and disconnected fixture paths. Browser
journeys continued to complete direct, native-alternative, corridor, and loop
planning flows.

## Known limitations

- RIG input is an explicit graph-backed anchor seam, but the current server
  resolver returns no canonical-segment geometry-backed RIG anchors; corridor
  bounds alone are intentionally not converted into route waypoints.
- Current GPX/adviser/community candidates still become routable only after the
  provider confirms the anchor request; source evidence does not grant legality
  or surface certainty.
- Heading sectors and seed spacing are deterministic engineering defaults, not
  calibrated search parameters.
- Automated tests do not prove authenticated-browser behavior,
  physical-device behavior, production concurrency, owner-corpus map matching,
  or field/model quality.

## Deferred

- P17 — canonical directed-segment overlap, MMR diversity, and factual route
  explanations.
- P18 — owner-reviewed PA/NJ golden corpus and policy tuning.
- Canonical graph-backed RIG geometry and offline graph candidate integration —
  P29/P30.

## Rollback

Remove `candidate-generator.ts`, its focused test, optional RIG anchor support,
and source-label fields; restore the prior inline planner loops and anchor
requests. No data migration or user-data deletion is required.

## Next dependency

P17 — diversity and explanations.
