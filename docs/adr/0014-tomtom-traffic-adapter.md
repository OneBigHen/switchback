# ADR 0014: TomTom as the hosted traffic and incident adapter

## Status

The traffic decision stands. The deferred thrilling / traffic-aware routing
benchmark is advanced to an adopted candidate source by
[ADR 0018](0018-tomtom-premium-adapters.md).

## Decision

The hosted instance uses TomTom for live traffic under ADR 0002's optional-
adapter model: Traffic Flow vector tiles for the overlay (off in the clean map,
on in Trip and Traffic modes) and Traffic Incident Details queried only against
a buffered corridor around the planned route, summarised as delay, closures,
and roadworks on that route. Traffic is an input to route comparison, never a
replacement for the GraphHopper/Valhalla routing engine. Incident polling stays
conservative to respect the small free allowance. A missing key, exhausted
quota, or provider error removes traffic and leaves routing intact.

## Consequences

The open-source core is fully usable with no `TOMTOM_API_KEY`; the traffic
toggle is hidden when no key is present. TomTom's own thrilling / traffic-aware
routing is a future A/B benchmark (ADR 0001, Wave 7), not adopted here.
