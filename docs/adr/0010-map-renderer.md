# ADR 0010: MapLibre is the only renderer

## Status

Superseded by [ADR 0015](0015-mapbox-primary-renderer.md). The concrete
Mapbox-only capabilities this ADR asked to be named — integrated 3D environment,
runtime light presets, Standard Satellite, and Standard slots — are required by
the premium maps wave. MapLibre remains only as a migration rollback path.

## Decision

MapLibre GL JS remains the sole map renderer. Switchback does not depend on the
Mapbox SDK and does not build a renderer abstraction layer to keep a second
implementation available. If a specific Mapbox-only capability later becomes
required, reopen this ADR then, with the concrete capability named.

## Consequences

One rendering path, one visual-QA path, and no token or billing dependency in
the open-source core. Basemap and style choices are made within MapLibre.
