# P03 — Dead complexity removal

**Status:** complete for the P03/G1 gate.

**Phase:** P03 — Dead complexity removal

**Current SHA:** `5632af2ea7109ae860d608069b8c4364d6f80273` before the
uncommitted P02/P03 worktree changes.

## Before behavior

- The home page mounted a lazy Spotify player, with OAuth callback and
  auth-complete routes, five API route families, encrypted session/token
  helpers, browser playback helpers, CSP allowances, environment settings,
  tests, and product documentation.
- The Free Ride endpoint converted curvature-only rows into route candidates
  while assigning synthetic road class, traffic, scenic, access, novelty, and
  confidence fields.
- The Free Ride HUD root region was labelled “Free Ride neural map,” despite
  the surface being explicitly experimental.

## After behavior

- Spotify is no longer a production surface. The home page renders only the
  planner; Spotify routes, callback/auth page, player, helpers, tests, CSP and
  environment settings are deleted.
- Current product docs, security scope, mockup brief, navigation types, and
  browser assertions no longer advertise Spotify. Obsolete Spotify screenshots
  and the generated design checksum entry are deleted. Historical audit and
  handoff prose remains unchanged as historical evidence.
- Free Ride request validation remains at the API boundary, but the endpoint
  returns typed `503 FREE_RIDE_UNAVAILABLE` until P25 supplies graph-backed,
  ahead/reachable candidates and real detour/rejoin evidence. It cannot invent
  route, access, surface, or confidence facts.
- Pure Free Ride ranking behavior over supplied candidates remains covered;
  the production endpoint no longer fabricates those candidates.
- The HUD region is now announced simply as “Free Ride.” Existing recording,
  routing, local storage, offline, and ride paths remain in place.

## Files changed

- `src/app/page.tsx`, `src/lib/client/app-navigation.ts`,
  `src/components/shell/FreeRideHud.tsx`.
- `src/app/api/free-ride/suggestions/{handler,route}.ts`,
  `src/lib/domain/feature-flags.ts`, and `tests/unit/free-ride-api.test.ts`.
- `next.config.ts`, `.env.example`, `README.md`, `SECURITY.md`,
  `docs/MOCKUP-BRIEF.md`, `design/generated/v1/SHA256SUMS`.
- `tests/e2e/planner.spec.ts`, `tests/unit/app-navigation.test.ts`, and
  `tests/unit/cloudflare-https.test.ts`.

## Files deleted

- All Spotify API routes, OAuth callback/auth-complete page, player component,
  Spotify client/server helpers, and eleven Spotify-focused tests.
- Ten tracked Spotify screenshots and the generated mobile Spotify design
  frame.

## Migrations

None. No IndexedDB schema, saved route, GPX, runtime database, or user data was
changed or deleted.

## Tests

The P03 gate ran in the sanitized, isolated Megaplex `docker-stable` LXC 109
(`192.168.1.175`) using Node 24.15.0. The checkout did not receive
`.env.local`, Git metadata, production routing data, or runtime databases; no
production Switchback service was restarted or reconfigured.

## Commands

- `npx vitest run tests/unit/free-ride-api.test.ts tests/unit/app-navigation.test.ts tests/unit/cloudflare-https.test.ts tests/components/free-ride-hud.test.tsx --reporter=dot`
- `npm run verify`
- `npm run test:e2e`
- `npm run test:e2e:critical`
- `npm run test:e2e:pwa`
- `GRAPHHOPPER_URL=http://127.0.0.1:8998 npm run test:e2e:real-router`
- `npm run test:e2e:memory-soak`
- Current-tree Spotify scans, `git diff --check`, and fixture-router cleanup

## Results

| Command/evidence | Result |
|---|---|
| targeted Vitest regression set | 4 files / 13 tests passed locally |
| `npm run verify` | lint passed; typecheck passed; 167 files / 1,159 tests passed, 1 skipped; production build passed |
| `npm run test:e2e` | 24/24 passed across desktop Chromium, mobile Safari, and both landscape projects |
| `npm run test:e2e:critical` | 30/30 passed across Chromium and WebKit |
| `npm run test:e2e:pwa` | 2/2 passed |
| `GRAPHHOPPER_URL=http://127.0.0.1:8998 npm run test:e2e:real-router` | 5/5 passed, including honest fixture refusals; fixture stopped and port 8998 was clear afterward |
| `npm run test:e2e:memory-soak` | 10/10 cycles passed in 53.8s; 35.1 MB used heap, 50.4 MB total heap, one map instance each cycle |
| current source/config/docs Spotify scan | no matches in `src`, `tests`, CSP, env template, README, security scope, or mockup brief |

The current soak output is the ignored generated artifact at
`artifacts/quality/memory-soak.json`.

## Memory/performance evidence

P03 removes the Spotify player, SDK, timers, and network surface from the
production shell. The ten-cycle lifecycle evidence remains bounded after the
cut. This is not a two-hour plateau, WebKit heap measurement, physical GPS
test, or production-scale concurrency result.

## Routing quality evidence

No planner or router algorithm changed. The real-router suite still passes
5/5. Free Ride now refuses unsupported production suggestions rather than
presenting curvature-only rows as fully characterized routes; P25 owns the
graph-backed replacement.

## Known limitations

- Historical audit, handoff, and prior phase reports still mention Spotify by
  design; they describe the earlier state and are not runtime/config surfaces.
- The Free Ride recording surface remains available, but suggestions are
  intentionally unavailable until P25 — Free Ride graph engine.
- The known non-failing mobile MapLibre fit warning remains in the broad E2E
  output.

## Deferred

- P25 — Free Ride graph engine: ahead/reachable RIG candidate generation plus
  real detour/rejoin.
- Historical audit/handoff wording is retained rather than rewritten; it is
  not part of the active product tree.

## Rollback

Before phase close, the worktree baseline is `main` at
`5632af2ea7109ae860d608069b8c4364d6f80273` plus the uncommitted P02 changes.
Rollback is an inverse of this P03 patch, preserving overlapping P02 edits;
do not use a broad reset that would discard P02 or user work.

## Next dependency

P04 — Error/health/provenance. P25 later owns the graph-backed Free Ride
engine and is the dependency for restoring production suggestions.
