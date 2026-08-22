# P08 — Worker RPC and lifecycle

**Phase:** P08 — Worker RPC + leak cleanup
**Current SHA:** `5632af2ea7109ae860d608069b8c4364d6f80273` HEAD plus the
uncommitted P02–P08 worktree changes.

## Before behavior

- The route-import worker protocol carried a request ID but no generation or
  typed cancel message, and the client accepted a returned route without
  runtime validation at the worker boundary.
- The client terminated the worker on ordinary completion/error, but had no
  caller cancellation signal, active-worker bound, message-error cleanup, or
  idempotent handler/listener cleanup.
- MapStage's curvature, PA unpaved-road, and rider-feature effects aborted
  requests, but a response could still race into a replaced map or disposed
  effect unless every post-fetch mutation was guarded.

## After behavior

- Import requests and responses carry a positive generation. The protocol now
  has a typed cancel request and validates version, IDs, generation, buffers,
  sizes, error messages, route metadata, and finite geometry before trust.
- The client rejects malformed active responses, ignores stale request IDs or
  generations, accepts an optional `AbortSignal`, allows one active import at a
  time, removes event handlers/listeners exactly once, releases its worker
  diagnostic, and terminates the worker on every completion path.
- The worker validates incoming messages, allows one active parse, tracks
  cancellation, suppresses canceled delivery, and returns generation-aware
  typed failures. Client termination is the authoritative stop for the
  synchronous GPX parser.
- The three MapStage overlay effects now guard source/state mutations with
  disposed state, map identity, and a local request generation. Move listeners,
  abort controllers, map probes, and style replacement cleanup remain bounded
  to the owning map instance.

## Files changed

- `src/lib/routing/import-worker-protocol.ts` — typed request/cancel/result
  envelopes and runtime validators.
- `src/lib/client/route-import-client.ts` — signal cancellation, stale gates,
  worker bound, handler cleanup, and termination.
- `src/workers/route-import.worker.ts` — validated messages, active-parse bound,
  cancellation state, and typed errors.
- `src/components/planner/MapStage.tsx` — overlay request generations and map
  lifecycle guards/cleanup.
- `tests/unit/route-import-client.test.ts` — generation, cancellation, late
  response, malformed response, and cleanup regressions.
- `docs/recovery/WORKLOG.md`.

## Files deleted

None.

## Migrations

None. No route algorithm, provider selection, IndexedDB/localStorage schema,
persisted route data, runtime database, or production service changed.

## Tests

The complete final gate ran in the isolated the validation host `dedicated test LXC` LXC 109
(`<private-test-host>`) checkout at `/tmp/switchback-validation-test.LDEtb5`, using
Node 24.15.0. The checkout excluded Git metadata, `.env*`, dependencies,
production routing data, runtime databases, and generated source artifacts.
The real-router run used only the isolated GraphHopper jar and prepared fixture
PBF on port 8998; the router was stopped after the run.

## Commands

- `npx vitest run tests/unit/route-import-client.test.ts tests/components/map-stage.test.tsx tests/components/map-stage-sources.test.ts tests/unit/runtime-diagnostics.test.ts --reporter=dot`
- `npm run lint`
- `npm run typecheck`
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
| focused import/MapStage/runtime tests | 4 files / 15 tests passed locally |
| local lint and typecheck | passed |
| the validation host `npm run verify` | lint and typecheck passed; 171 files / 1,173 tests passed, 1 skipped; production build passed |
| `npm run test:e2e` | 24/24 passed across desktop Chromium, mobile Safari, and both landscape projects |
| `npm run test:e2e:critical` | 30/30 passed across Chromium and WebKit |
| `npm run test:e2e:pwa` | 2/2 passed |
| `GRAPHHOPPER_URL=http://127.0.0.1:8998 npm run test:e2e:real-router` | 5/5 passed, including honest fixture refusals |
| `npm run test:e2e:memory-soak` | 1 test / 10 of 10 planner cycles passed |
| fixture cleanup | PID file absent; port 8998 closed |
| `git diff --check` | passed |

## Memory/performance evidence

The final ten-cycle browser soak measured 33.1 MB used JS heap, 50.4 MB total
heap, and one map instance on every cycle. The captured result is
`artifacts/quality/memory-soak.json`, generated at
`2026-08-11T18:17:43.169Z`. This is bounded automated lifecycle evidence, not
a two-hour ride plateau, physical-device result, or production-concurrency
benchmark.

## Routing quality evidence

No routing algorithm, provider selection, route geometry, or legality behavior
changed. The critical browser suite exercised valid GPX import, and the
isolated real GraphHopper suite passed 5/5, including private,
motorcycle-closed, and disconnected refusal fixtures.

## Known limitations

- `AbortSignal` remains optional for existing callers. Every active import is
  still terminated and cleaned up on completion, failure, or caller abort; the
  client also sends the typed cancel envelope before termination.
- The parser itself is synchronous. A cancel message alone cannot preempt its
  CPU work; the client-side worker termination is the authoritative cancellation
  path. There is no direct browser-worker handler test beyond the client,
  protocol validation, and full integration matrices.
- One global active-import slot is intentional bounded behavior; a worker pool
  is deferred until throughput needs are measured.
- The three overlay effects keep small local lifecycle guards because each owns
  a different map source, listener, status state, and abort controller.
- The known non-failing mobile MapLibre fit warning remains in broad E2E.
- Automated checks do not prove physical-device, authenticated-browser, or
  production-load behavior.

## Deferred

- P09 — segment graph and route-editing ownership.
- Later Geo/IO worker and offline-client migration work, including the planned
  offline boundary in P29.

## Rollback

Remove the generation/cancel validators, worker lifecycle bound, and MapStage
request guards; restore the prior request/result envelopes and preserve the
existing P02–P07 changes. Do not use a broad reset.

## Next dependency

P09 — segment graph and route-editing ownership.
