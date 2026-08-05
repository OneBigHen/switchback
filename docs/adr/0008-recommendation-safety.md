# ADR 0008: Advisory, workload-aware Free Ride suggestions

## Decision

Free Ride suggestions are advisory, deterministic, legal/access/safety-gated,
and limited to one primary actionable suggestion. The engine suppresses
suggestions during uncertain GPS, complex maneuvers, excessive workload, or an
active cooldown. Ignore is always safe and requires no interaction; acceptance
creates a normal guided route.

## Consequences

The recommendation loop cannot invent geometry, encourage speed, or compete
with maneuver guidance. Explanations and confidence remain visible.
