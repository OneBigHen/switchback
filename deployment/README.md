# Self-host deployment

1. From this directory, copy `.env.example` to `.env` and set a long random
   `SWITCHBACK_SESSION_SECRET`, an immutable `SWITCHBACK_TAG`, and the exact
   HTTPS WebAuthn values for the public hostname.
2. Provision `SWITCHBACK_GRAPH_DATA_ROOT` with the prepared GraphHopper data
   layout: `pa-nj-motorcycle.osm.pbf` and `graph-cache/`. The compose image
   builds the pinned 11.0 JAR from this repository; it does not download or
   bake multi-gigabyte map data into the image.
3. Put this stack behind the operator's HTTPS edge. If the hostname is
   internet-facing, require Cloudflare Access or an equivalent Zero Trust
   policy before the origin is reachable; Caddy TLS alone is not an access
   policy.
4. Keep GraphHopper, SQLite, the region queue, and `/data` private to the
   compose network/host. Only Caddy publishes ports 80/443.
5. Run `docker compose -f docker-compose.production.yml up -d`.
6. Verify `/api/health`, a golden route, backup output, and the active offline
   manifest before inviting riders.

The `worker` consumes one bounded JSON region job at a time and atomically
publishes only after the existing region build validation. Failed jobs remain
as `.failed` files for operator review.

The checked-in Caddy file provides transport/security headers, not identity
access control. Do not expose it publicly until the edge policy is active.
