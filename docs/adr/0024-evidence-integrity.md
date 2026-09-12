# ADR 0024: Road evidence integrity rules

## Status

Extends [ADR 0004](0004-fun-road-scoring.md) and [ADR 0008](0008-recommendation-safety.md).

Recorded 2026-09-08. These rules were already enforced in code and asserted in
tests, but their reasoning lived only in the 2026-08 recovery/master spec
packages that the janitorial pass removed. This ADR is where they live now.

## Decision

Four rules govern what may become evidence about a road, and what OpenGravel is
allowed to claim as a result.

**A generated route is never evidence for itself.** Observations sourced from a
OpenGravel-generated route carry weight `0`
(`RIG_SOURCE_WEIGHTS["switchback-generated-route"]` in
`src/lib/roads/rig-evidence.ts`). A ranker that scored its own output would
manufacture confidence out of repetition and drift further from the road with
every ride planned.

**Absence is never negative evidence.** A road missing from an imported GPX
means the rider did not ride it on that trip — not that it is bad, closed, or
unsuitable. Only a positive observation moves a score.

**Community GPX is preference evidence, never legal authority.** Other riders'
tracks are good signal about which roads are enjoyable. They are not a source of
truth about access, surface legality, or closure. Legality comes from routing,
OSM, and survey sources with their own provenance label.

**Never claim "safe", "verified", "open", or "legal" without exact supporting
evidence.** Unknown stays unknown in rider-facing copy. An unavailable survey is
reported as unavailable, never collapsed into a confirmed zero
(`PA_UNPAVED_ROADS_SURFACE_BOUNDARY` in `src/lib/roads/types.ts`).

## Consequences

Evidence weighting stays auditable: every score traces to a positively observed
source with a declared provenance and weight. The rules bound what the Advisor
(ADR 0023) and the Free Ride engine (ADR 0008, 0020) may assert, and they are
the reason confidence can be low without the product pretending otherwise.

Adding a new evidence source means declaring its weight and its provenance label
in the same change — a source with neither cannot enter the graph.
