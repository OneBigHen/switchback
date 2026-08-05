# ADR 0001: GraphHopper-primary normalized routing providers

## Decision

Keep GraphHopper as the primary self-hosted router and preserve Valhalla as an
optional alternative/fallback and map-matching-capable provider. Provider
responses must be normalized into Switchback route contracts before reaching
the UI.

## Consequences

Core routing works without a commercial key. Provider-specific details stay in
adapters, while provider provenance and capability/degraded warnings remain
visible to the product.
