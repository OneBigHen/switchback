# P30 — Region and Ride Packs

**Status:** implemented; pack integrity green, regional parity open

## Result

- Kept one manifest/version/pointer model in `RegionDownloadClient`.
- Manifest, tile size, checksum, gzip/schema, quota, and active-pointer
  boundaries are validated before use.
- Downloads stage a `pending` version and activate it only in the final
  IndexedDB transaction; a corrupt update leaves the previous active version
  intact, while verified pending tiles remain resumable.
- `RegionSuite` is a selection preset over independent state packages, not a
  duplicated mega-file. The existing catalog and selector cover Home
  Territory, Appalachia, and Northeast choices.
- Active graph references support border/spatial lazy loading; route packs
  remain the smaller selected-ride recovery path.

## Verification

The v2 region suite, readiness, route-pack migration, and atomic-install tests
cover activation, corrupt updates, resume, and active tile validation. The
the validation host run passed 202 test files / 1,285 tests, lint, typecheck, build,
standard browser 32/32, critical browser 30/30, PWA 2/2, memory soak 10/10
cycles, and real-router 5/5. The real generated PA/NJ offline parity audit
remains open: 208 pairs (204 random plus four golden) produced 187/208
(89.9%) against the full-bbox GraphHopper oracle, with zero oracle errors and
clean legality.

## Boundary

No claim is made that every state PBF, territory build, or physical device
storage policy has been exercised. Build output and provider freshness remain
operator-owned release inputs.
