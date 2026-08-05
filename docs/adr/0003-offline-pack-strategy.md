# ADR 0003: Validated local regional packs

## Decision

Regional offline data is installed as checksummed, versioned graph/feature/tile
packs with atomic activation. The active route can continue from the cached
geometry and maneuvers; a new offline reroute is attempted only when a valid
installed graph covers the request.

## Consequences

Corrupt or partial downloads cannot replace an active pack. The UI must expose
coverage and feature limitations instead of claiming universal offline routing.
