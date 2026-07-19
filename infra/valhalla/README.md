# Valhalla supplemental router

This runtime is optional. GraphHopper remains Switchback's primary motorcycle
router; Valhalla contributes independently generated A-to-B candidates,
fallback for requests it supports, and elevation sampling.

The compose contract pins the exact image verified with Valhalla 3.8.2, binds
only to loopback, and imports the same Pennsylvania/New Jersey normalized OSM
extract as GraphHopper. The named volume makes the expensive tile build
explicit and keeps it separate from older Pennsylvania-only caches.

Build the shared OSM extract first, then start Valhalla:

```bash
npm run data:bootstrap
docker compose -f infra/valhalla/compose.yml up -d
docker compose -f infra/valhalla/compose.yml ps
curl --fail http://127.0.0.1:8002/status
```

The first start builds tiles and can take several minutes. Preload Skadi
elevation tiles under `/data/valhalla/elevation` before the first healthy start
if `/height` should return real terrain rather than null samples. Set both
`VALHALLA_URL` and `VALHALLA_ELEVATION_URL` only after `/status`, `/route`, and
`/height` pass locally.

Changing the image, OSM extract, costing configuration, or tile format requires
a new named volume or an intentional rebuild. Do not silently reuse a cache
from a different region or engine version.
