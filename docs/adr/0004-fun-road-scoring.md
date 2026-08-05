# ADR 0004: Explainable deterministic fun-road scoring first

## Decision

Generate multiple provider/waypoint/detour candidates, reject illegal,
private, closed, unsafe, invalid, low-confidence, or over-detour candidates,
then rank the remainder with measured curvature, elevation, scenic, surface,
traffic, intersection, novelty, safety, confidence, simplicity, and ETA
features. Every accepted result emits explanations derived from those values.

## Consequences

The recommendation system is testable and useful before any learned ranker is
introduced. A future model may reorder valid candidates only.
