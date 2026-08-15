# P01 — Baseline and provenance

**Status:** complete for the P01 gate; the working tree contains the small
P01 validation fixes listed below.

## Phase

P01 — Baseline & provenance.

## Current SHA

`5632af2ea7109ae860d608069b8c4364d6f80273` (`main`, before the uncommitted
P01 changes).

Authoritative production input was the user-supplied
`switchback-production-master-spec-2026-08-10.zip`, SHA-256
`afa6d5af1926d60dbbcd11e2db1f5bd6d48bbd9176b249077a1287a16fcc3743`.

## Before behavior

- The live validator expected `compare: true` to return three routes in one
  response, while the production API returns a primary route first and
  alternatives through a bounded follow-up request.
- The road-match API returned `{ matched, matchedAt }`, while the browser
  client looked for `edgeIds` at the response root; the road-lock path could
  therefore fail after a successful match.
- Several browser checks used stale copy or fixed portrait coordinates that
  could land on the map toolbar.
- The repository still has broad `PlannerShell` ownership, two client workers,
  Spotify production code, and no canonical RIG/segment-graph subsystem.

## After behavior

- `scripts/validate-live.mjs` proves the progressive primary/alternatives
  contract and four distinct GraphHopper base-model geometries while
  preserving the deliberate eight-profile alias map.
- `requestRoadMatch` unwraps the live success envelope and retains honest
  error handling for malformed or unsuccessful responses.
- The current browser matrix uses semantic UI copy and viewport-relative
  sketch input; current screenshots were refreshed as P01 evidence.

## Files changed

- `scripts/validate-live.mjs`
- `src/lib/client/road-match-client.ts`
- `tests/unit/road-match-client.test.ts`
- `tests/e2e/planner.spec.ts`
- `tests/e2e/road-lock.spec.ts`
- `docs/quality/LIVE_PROVIDER_RESULTS.md`
- `docs/recovery/WORKLOG.md`
- `artifacts/screenshots/e2e-*.png` (17 refreshed tracked evidence images)
- this report

No files were deleted. No migration or runtime data mutation was performed.
The untracked production-spec ZIP remains preserved.

## Tests and commands

| Command/evidence | Result |
|---|---|
| `npm run verify` | lint passed; typecheck passed; 177 files / 1,211 tests passed; production build passed |
| `npx vitest run tests/unit/road-match-client.test.ts tests/unit/road-matching.test.ts --reporter=dot` | 5/5 passed |
| `SWITCHBACK_E2E_PORT=3138 npm run test:e2e` | 24/24 passed |
| `SWITCHBACK_E2E_PORT=3131 npm run test:e2e:critical` | 30/30 passed |
| isolated fixture `npm run test:e2e:real-router` | 5/5 passed |
| `npm run test:e2e:pwa` | 2/2 passed |
| `npm run test:live-smoke` | 8/8 passed |
| `SWITCHBACK_URL=http://127.0.0.1:3100 GRAPHHOPPER_URL=http://127.0.0.1:8989 node scripts/validate-live.mjs` | passed: 8 rider profiles, 4 distinct base-model shapes, 3 progressive free-form choices, access-detour checks |
| `node --check scripts/validate-live.mjs` and `git diff --check` | passed |

## Runtime contract

- `switchback-cloudflare`: active; current checkout; production app on
  `127.0.0.1:3100`.
- App health: HTTP 200, app/router/GraphHopper/Valhalla healthy.
- GraphHopper: 11.0, loopback `:8989`, four base profiles, PA/NJ-area graph.
- Valhalla: 3.8.2, loopback `:8002`.
- Fixture hashes are frozen by the repository copies:
  `graphhopper-test.yml` `709785179379cb592751ece2b38135939f7c956d6499c5e8b0b0732de2e63143`,
  `switchback-test.osm` `723a5a657b7de4fdf6873f79e838c0929e86e902d6015306ad4a349c29308554`,
  and `golden.ts` `f829fd02b4dc5e246e4a738d9a95f41c8310485f9ae5bec46b93c6223c6a0236`.

## Memory/performance evidence

P01 records the current service and test baseline only. It does not claim
memory SLO compliance, a settled browser heap, a two-hour ride plateau, or
long-task absence. Those measurements are P02 work.

## Routing quality evidence

Live validation returned real road geometry and provider provenance for all
eight rider-visible profiles. The current profile contract intentionally maps
Gravel to Adventure and Neural to Twisty; the validator therefore requires at
least four distinct base-model geometries. The isolated real-router suite
passed its five fixture checks, including honest rejection cases.

## Known limitations

- No canonical RIG/segment graph exists yet.
- Planner, navigation, map, GPX, offline, and ride ownership remain broader
  than the target architecture.
- Automated browser evidence is not physical iPhone, authenticated-browser,
  offline-airplane-mode, or model-quality proof.
- Runtime health is not proof of a physical device or user-account path.

## Deferred

P02 memory/performance observability is the next dependency. P03 dead-complexity
removal and P04 error/health/provenance remain behind the G1 gate; P05–P36 are
not started by this report.

## Rollback

No runtime or data rollback is required. Remove/revert only the listed
uncommitted P01 files if the phase is rejected; preserve the user-supplied ZIP
and existing runtime data.

## Next dependency

P02 — instrument browser, server, router, store, map, and worker memory with a
reproducible bounded soak.
