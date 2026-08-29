# ADR 0020: Free Ride is two modes — Discovery and Live

## Status

Extends [ADR 0008](0008-recommendation-safety.md).

## Decision

Free Ride splits into Discovery and Live, sharing routing, scoring, and evidence
infrastructure but keeping separate API contracts and rider surfaces.

Discovery answers "I have 90 minutes, find me a ride": from an origin, a time
budget, a riding intent, bike and surface rules, and a departure time, it returns
at most three materially different closed loops, each within the target duration
tolerance and past the same hard eligibility gates as destination routes. Loop
quality is scored mostly on the core ride, so unavoidable suburban egress and
return miles do not dominate the result.

Live keeps ADR 0008's model unchanged in spirit: ahead-only, workload-aware,
GPS-quality-aware, cooldown-limited, at most one concise suggestion, never a
U-turn to chase score. It gains traffic and closure evidence and
movement-driven rather than purely timer-driven polling. The RIG graph remains a
core evidence source for both modes.

## Consequences

The strongest no-destination use case becomes a first-class product surface
instead of a side effect of live scanning. Two contracts mean `/suggestions`
does not grow a second meaning, and Discovery's heavier candidate generation
cannot slow the in-motion path. Without premium providers, Discovery still works
from GraphHopper and RIG alone.
