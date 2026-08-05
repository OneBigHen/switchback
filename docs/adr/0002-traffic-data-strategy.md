# ADR 0002: Optional traffic enrichment with explicit capability states

## Decision

Use OSM signal/stop/intersection density as the deterministic baseline and add
live traffic, incidents, closures, speed limits, and signal feeds only through
optional provider adapters. Each adapter reports capability and freshness;
missing data is rendered as unavailable or degraded rather than inferred live.

## Consequences

Route quality remains useful without commercial services, and rerouting can be
conservative when traffic data is stale or absent.
