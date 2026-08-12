# P35 — Security, operations, and field beta

**Status:** operational artifacts added; field beta remains open

## Result

- Added pinned production Docker/Caddy topology, an immutable-tag compose
  contract, loopback/private GraphHopper placement, bounded region-build queue
  worker, and backup/restore scripts for community/sync SQLite plus artifacts.
- Session secrets, provider keys, and runtime databases remain deployment
  inputs and are excluded from the image/build context.
- Added the native decision record below with the required field evidence
  table; it deliberately starts as unmeasured instead of guessing.
- Final Megaplex acceptance is green: 202 test files / 1,285 passed / 1
  skipped, plus lint, typecheck, and production build.
- The self-hosted Compose/Caddy stack is live in the LXC: `/api/health` is
  non-degraded, all eight routing profiles return live GraphHopper routes,
  Caddy validates, and web/worker/GraphHopper/Caddy remain up with no worker
  restarts. Final container gates are standard browser 32/32, critical browser
  30/30, PWA 2/2, memory soak 10/10, and real-router 5/5. The writable
  prepared GraphHopper cache mount is
  intentional because GraphHopper writes its runtime lock there; the service
  remains private behind Caddy.

## Open gate

`docs/operations/NATIVE_DECISION.md` must be completed after real iPhone rides,
weak/no-signal runs, battery/thermal measurement, and external-rider tests.
