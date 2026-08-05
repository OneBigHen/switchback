# Routing Correctness Specification

## Core invariant

Every route returned to the UI passes the same normalized eligibility pipeline regardless of source: destination, loop, timeboxed, segmented, alternatives, GraphHopper, Valhalla, fallback, offline, reroute, Free Ride, or imported matching.

## Constraint propagation

Create `normalizeRouteRequest(input): NormalizedRouteRequest`.

Provider adapters receive only normalized requests. No mode manually constructs a partial provider request.

Tests must confirm propagation of:

- bike category;
- surface and unknown-surface policy;
- rough-track policy;
- highway avoidance;
- toll policy;
- avoid areas;
- must/prefer roads;
- closure policy;
- request/planning IDs;
- cancellation.

## Eligibility before ranking

Hard failures:

- invalid geometry;
- no legal motorcycle access;
- active closure;
- unresolved must-use road;
- incompatible surface/smoothness/track type;
- outside routing coverage;
- preview-only geometry used for guidance;
- corrupt/incomplete offline graph;
- hard backtracking/self-overlap violation;
- missing evidence required for a safety-critical claim.

Warnings:

- bounded unknown surface;
- stale but usable data;
- optional evidence unavailable;
- preferred road skipped;
- target-duration miss;
- no live traffic;
- user-approved approximate rematch.

Soft ranking:

- profile fit;
- time/distance;
- twistiness;
- scenic evidence;
- surface preference;
- traffic proxy;
- elevation;
- novelty;
- rider preference;
- detour;
- confidence.

## Timeboxed destination

1. Produce an eligible direct baseline.
2. If direct exceeds target, return it with feasibility wording.
3. If within tolerance, return it.
4. Generate bounded shaped candidates.
5. Evaluate eligibility.
6. Rank eligible candidates.
7. If none eligible, return eligible baseline.
8. Never call failed candidates safe.

## Segmented routing

Each leg inherits all global constraints. Per-leg differences alter only route character unless explicitly supported.

When composing:

- deduplicate endpoints;
- rebase instructions;
- aggregate provenance and warnings;
- normalize distributions;
- evaluate the final route;
- preserve leg metadata;
- maintain road-requirement order.

## Alternatives

- Reject ineligible candidates first.
- Require meaningful difference.
- Track `selectionSource: "automatic" | "user"`.
- Never replace a user selection with late alternatives.
- Expose provider and confidence differences.

## Fallback

Fallback is allowed only where provider semantics match. Return structured missing capabilities rather than silently degrading.

## Required tests

- All modes propagate constraints.
- Street bike rejects gravel in segmented routing.
- Must road survives timeboxed routing.
- Avoid areas apply to alternatives/fallback.
- User selection remains selected.
- No ineligible candidate reaches comparison.
- Explanations are evidence-backed.
