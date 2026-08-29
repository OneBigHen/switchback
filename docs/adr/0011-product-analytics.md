# ADR 0011: Minimal, PII-free product analytics

## Decision

The hosted instance uses PostHog with roughly fifteen deliberate product events
(app opened, route planned, alternative selected, free ride started,
route saved, route shared, shared route viewed, navigation started, gpx
imported, gpx exported, traffic enabled, traffic incident opened, layer
enabled, offline mode used, provider failed). Properties are bucketed only
(distance band, waypoint band, route mode, provider, device class, installed
PWA, success). No `identify()` calls, no user profiles, no session replay, no
autocapture. Self-hosters get `TELEMETRY_ENABLED=false` by default and supply
their own key and host.

## Consequences

Never send GPS coordinates, route polylines, origin/destination, home/work
addresses, search text, waypoint names, share tokens, passkey data,
user-written route names, email, or name. Analytics answers aggregate usage
questions ("how many people planned a route this week") and nothing about where
an individual rode.
