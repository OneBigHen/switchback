# P04 — Error, health, and route provenance

**Status:** complete for the P04/G1 gate.

**Phase:** P04 — Error/health/provenance

**Current SHA:** `5632af2ea7109ae860d608069b8c4364d6f80273` before the
uncommitted P02–P04 worktree changes.

## Before behavior

- The route handler accepted the normalized request ID internally, but did
  not return a correlation ID or an actionable error action on the wire.
- Health reported optional Valhalla degradation as a boolean only.
- Live routes exposed provider/version compatibility fields and fallback text,
  but no structured fallback provenance.

## After behavior

- Route and rate-limited health responses carry a bounded `x-request-id`.
  Route success and error bodies echo the same ID; a valid body `requestId`
  remains the provider request ID when supplied.
- Route errors keep existing codes and now include `action` and `requestId`.
  The shared action catalog covers the P04 error catalog plus current route
  codes, without inventing a success or safety claim.
- Health returns `degradedProviders` while preserving the existing readiness
  semantics: GraphHopper remains the required router and Valhalla remains an
  optional fallback provider.
- Each live route now carries structured provider, version, and fallback
  provenance. Valhalla fallback routes explicitly identify GraphHopper as the
  failed primary; normal GraphHopper routes are marked non-fallback.
- The browser routing client preserves server action and correlation metadata
  on `RoutingClientError`.

## Files changed

- `src/lib/server/api-contract.ts` — request IDs, action catalog, JSON errors.
- `src/app/api/routes/handler.ts`, `src/app/api/health/{route,service}.ts`,
  `src/lib/server/rate-limiter.ts` — route/health wire contract.
- `src/lib/client/routing-client.ts` — client error metadata.
- `src/lib/routing/{types,planner,hybrid}.ts` — structured route provenance.
- `tests/unit/api-contract.test.ts`, `tests/unit/api-handlers.test.ts`,
  `tests/unit/hybrid-routing.test.ts`, `tests/unit/routing-client.test.ts`.
- `docs/recovery/WORKLOG.md`.

## Migrations

None. No saved route, GPX, IndexedDB schema, runtime database, provider
configuration, or user data was changed.

## Tests

The complete gate ran in an isolated checkout on the validation host's `dedicated test LXC`
LXC 109 (`<private-test-host>`) using Node 24.15.0. The checkout excluded
`.env.local`, Git metadata, production routing data, runtime databases,
dependencies copied from the workstation, and generated artifacts. No
production Switchback service was restarted or reconfigured.

## Commands

- `npx vitest run tests/unit/api-contract.test.ts tests/unit/api-handlers.test.ts tests/unit/hybrid-routing.test.ts tests/unit/routing-client.test.ts --reporter=dot`
- `npm run lint`, `npm run typecheck`, `npm run build`
- `npm run verify`
- `npm run test:e2e`
- `npm run test:e2e:critical`
- `npm run test:e2e:pwa`
- `GRAPHHOPPER_URL=http://127.0.0.1:8998 npm run test:e2e:real-router`
- `npm run test:e2e:memory-soak`
- `git diff --check`

## Results

| Command/evidence | Result |
|---|---|
| focused P04 Vitest run | 4 files / 32 tests passed locally |
| local lint, typecheck, and build | passed |
| the validation host `npm run verify` | lint and typecheck passed; 168 files / 1,161 tests passed, 1 skipped; production build passed |
| `npm run test:e2e` | 24/24 passed across desktop Chromium, mobile Safari, and both landscape projects |
| `npm run test:e2e:critical` | 30/30 passed across Chromium and WebKit |
| `npm run test:e2e:pwa` | 2/2 passed |
| `GRAPHHOPPER_URL=http://127.0.0.1:8998 npm run test:e2e:real-router` | 5/5 passed, including honest fixture refusals; fixture stopped and port 8998 was clear afterward |
| `npm run test:e2e:memory-soak` | 10/10 cycles passed in 52.1s; used JS heap 33.1 MB, total heap 50.4 MB, one map instance each cycle |
| `git diff --check` | passed |

The soak output is the ignored generated artifact at
`artifacts/quality/memory-soak.json`.

## Memory/performance evidence

P04 adds no new long-lived resource path. The existing ten-cycle browser
regression remains flat at the measured Chromium values above. This is not a
two-hour plateau, physical GPS result, or production-concurrency benchmark.

## Routing quality evidence

The route algorithm and provider selection semantics are unchanged. The
real-router fixture passes 5/5, and fallback provenance is only set on the
actual Valhalla fallback branch. No route geometry, access, safety, or
coverage fact is synthesized.

## Known limitations

- The shared contract is applied to the route endpoint, health endpoint, and
  rate-limit wrapper. Other API handlers still have their pre-P04 response
  envelopes; broadening them belongs in a separately scoped contract pass.
- The browser matrices retain the known non-failing mobile MapLibre fit
  warning at `map-stage-navigation.ts:38`.
- Automated checks do not prove authenticated-browser behavior, physical GPS,
  or production load.

## Deferred

- P05 — shell and ownership cleanup.
- A repo-wide migration of legacy non-route API error envelopes, if the
  contract phase later requires every endpoint to expose the shared action
  catalog.

## Rollback

Before phase close, the worktree baseline is `main` at
`5632af2ea7109ae860d608069b8c4364d6f80273` plus the uncommitted P02/P03
changes. Rollback is the inverse of this P04 patch, preserving overlapping
P02/P03 edits; do not use a broad reset that would discard user work.

## Next dependency

P05 — shell and ownership cleanup.
