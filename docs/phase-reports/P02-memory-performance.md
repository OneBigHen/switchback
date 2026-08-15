# P02 — Memory and performance observability

**Status:** complete for the P02 gate.

## Scope

P02 adds bounded runtime diagnostics and a reproducible browser soak without
creating a second ownership system. The existing health endpoint, diagnostics
panel, map, route, GPS, and worker paths now expose their live resource state.

## Implementation

- Added one shared client runtime registry for timers, GPS watches, workers,
  map metrics, route/geometry metrics, browser heap, storage, Cache Storage,
  and service-worker registrations.
- Added server RSS/heap metrics plus route queue and route-cache counts to
  `/api/health`.
- Added cleanup instrumentation to the persistent map, route-import worker,
  GPS sessions, recording timer/watch, and navigation timer paths.
- Added a `memory-soak` Playwright project and `npm run test:e2e:memory-soak`.
  The default test executes ten plan/clear/replan cycles and asserts one map
  instance plus bounded measurable Chromium heap.

## Verification

The complete gate ran in an isolated checkout on Megaplex's `docker-stable`
LXC 109 (`192.168.1.175`) using Node 24.15.0. The temporary checkout did not
receive `.env.local`, the Git directory, production routing data, or runtime
databases. The fixture-only Java/osmium packages and Playwright browser
revisions were installed in the test LXC; no Switchback production service was
restarted or reconfigured.

| Command/evidence | Result |
|---|---|
| `npm run verify` | lint passed; typecheck passed; 178 files / 1,212 tests passed, 1 skipped; production build passed |
| `npm run test:e2e` | 24/24 passed across desktop Chromium, mobile Safari, and both landscape projects |
| `npm run test:e2e:critical` | 30/30 passed across Chromium and WebKit |
| `npm run test:e2e:pwa` | 2/2 passed |
| `GRAPHHOPPER_URL=http://127.0.0.1:8998 npm run test:e2e:real-router` | 5/5 passed, including honest fixture refusals |
| `npm run test:e2e:memory-soak` | 10/10 cycles passed in 47.6s; used JS heap stayed at 33.1 MB, total heap at 50.4 MB, and map instances stayed at 1 |
| focused P02 Vitest run | 4 files / 33 tests passed |

The soak artifact is `artifacts/quality/memory-soak.json` (ignored generated
output). The browser matrix emitted two non-failing MapLibre fit warnings on
mobile cases; no test failed or timed out.

## Honest limits

This is bounded observability and a ten-cycle browser regression, not proof of
a two-hour ride plateau, WebKit heap behavior, long-task absence, physical GPS
behavior, or production-scale routing load. Chromium heap metrics are nullable
on browsers that do not expose `performance.memory`; the implementation keeps
that absence honest.

No RIG/segment graph, offline-airplane-mode, physical-device, or model-quality
claim is made by P02.

## Next dependency

P03 — remove dead complexity and superseded Spotify/runtime paths while
preserving the verified rider flow.
