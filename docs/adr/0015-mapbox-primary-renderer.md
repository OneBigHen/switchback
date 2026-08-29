# ADR 0015: Mapbox Standard is the primary online renderer

## Status

Accepted for the premium maps + routing wave. Supersedes [ADR 0010](0010-map-renderer.md).

## Decision

Mapbox GL JS v3 replaces MapLibre as the primary online renderer, with Mapbox
Standard and Standard Satellite as the basemap family. ADR 0010 asked that it be
reopened only when a concrete Mapbox-only capability became required; the
premium planning and ride experience names them: one integrated 3D environment
(terrain, buildings, landmarks, trees, facades), runtime `lightPreset`
dawn/day/dusk/night, Standard Satellite, and the `bottom`/`middle`/`top` slot
model for custom layers.

This is a rendering decision only. Routing stays GraphHopper-primary under
ADR 0001; Mapbox Directions is not adopted. Custom layers are placed by slot,
never by referencing an internal Standard layer id. Switchback does not build a
generic multi-renderer framework: MapLibre survives only as a migration rollback
path behind a rollout flag and is removed once Mapbox passes acceptance.

## Consequences

A browser-scoped public `pk` token (URL-restricted, not the account default
token) becomes a deployment requirement for the premium map, and the renderer
gains a hosted dependency with a 50k map-loads/month free tier — comfortable for
this deployment only if style and mode changes reuse the same `Map` instance
rather than recreating it. Standard's cartography updates continuously, so
whole-screen pixel snapshots are the wrong visual contract (ADR 0011-era visual
QA asserts Switchback overlays instead). WebGL cost and battery must be
validated on a real iPhone, not on desktop screenshots. Deployments without a
token fall back to the basic renderer rather than an empty map.
