# Switchback release freeze and rollback

## Freeze inputs

Record these values together before tagging:

- app release tag and exact image digest
- database schema version and backup timestamp
- active GraphHopper build/version and rollback graph
- offline manifest/data build ids
- policy/privacy version
- provider model/version and configured budget
- artifact SHA-256 inventory

## Release order

1. Take and checksum community, sync, and artifact backups.
2. Build the candidate image with an immutable tag.
3. Run migrations against a copy, then run golden routes and health checks.
4. Activate the staged graph/manifest only after the candidate is healthy.
5. Start web and worker, verify the public health path, then expose Caddy.
6. Retain the previous image, database backup, graph, and manifest.

## Rollback

1. Stop public traffic at Caddy.
2. Restore the previous image and environment version.
3. Restore the last known-good database backup only if the migration is not
   backward-compatible.
4. Repoint the previous GraphHopper graph and offline manifest.
5. Run health, golden-route, and smoke checks before reopening traffic.

Never delete user GPX, saved routes, recorded rides, or opaque sync objects as
part of a failed release.
