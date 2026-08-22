# P29 — Offline Geo Worker

**Status:** implemented; generated-tile parity gate open

## Result

- Added a bounded `ByteLru` and binary-framed `SBG2` tile codec.
- Added `OfflineGeoWorkerClient`, which selects only active spatially
  intersecting tile metadata, loads tile bytes lazily, caps requests by tile,
  byte, and cache budgets, and cleans up worker listeners on cancellation or
  dispose.
- Reused `RegionDownloadClient` as the single active-version source. It now
  exposes manifest references and validates checksum/size/schema before a tile
  enters the worker cache.
- Offline routing returns an explicit cancelled failure and never fabricates
  access, surface, or route facts.

## Verification

- Focused P29 audit: 8 files / 49 tests passed, including regional offline
  route selection and the explicit missing-region failure.
- the validation host full unit: 202 test files / 1,285 passed / 1 skipped.
- the validation host lint, typecheck, build, standard browser 32/32, critical browser
  30/30, PWA 2/2, memory soak 10/10 cycles, and real-router 5/5 passed.
- The isolated test router shut down cleanly with no PID file and port 8998
  closed.
- Real generated-tile parity audit: 208 PA/NJ pairs (204 random plus four
  golden) against the full-bbox GraphHopper oracle produced 187/208 (89.9%)
  distance/outcome parity successes and exited non-zero; legality remained
  clean across 45,769 returned edges, with 12 comparisons above 25% and zero
  GraphHopper oracle errors. The oracle now uses the matching
  Street/Dual-Sport request model; the active GraphHopper graph was rebuilt
  with the required `smoothness` encoded value.

## Boundary

The worker and cache unit/browser tests are green, but generated-tile parity
is not a release pass yet. The audit samples routable road nodes inside the
shared GraphHopper bounds and uses the production five-kilometre tile window;
the remaining misses are corridor/outcome, search-budget, and distance
divergences rather than oracle failures. No claim is made for iPhone
airplane-mode rerouting, storage eviction behavior, or outdoor GPS quality.

## Rollback

Keep the existing corridor-pack recovery path and disable worker-backed
regional reroute at its caller. IndexedDB active pointers and legacy corridor
entries remain readable.
