# ADR 0022: Route Policy V2 permits larger fun-driven detours

## Status

Extends [ADR 0004](0004-fun-road-scoring.md) and [ADR 0013](0013-default-route-mode.md).

## Decision

`PA_NJ_ROUTE_POLICY_V1` is frozen and stays in the repository for regression
comparison. A new immutable `PA_NJ_ROUTE_POLICY_V2` raises the fun-versus-time
balance: V1's 8% preferred detour band was right for conservative remediation
but conflicts with the stated product goal that Best Ride should choose
meaningfully better curvy roads even at real time cost.

Detour allowance becomes a property of the rider-facing role rather than a single
global band — Best Ride generous, Maximum Twisties largest, Fast & Fun moderate,
Fastest Now none — and traffic enters scoring as real evidence (ADR 0019)
instead of a neutral placeholder. Weights are starting coefficients validated
against a route corpus, not settled truth. Scoring stays deterministic and
explainable; no learned ranker (ADR 0004).

## Consequences

Best Ride can legitimately return a longer route, so the added minutes versus
Fastest Now must always be visible (ADR 0013). Keeping V1 intact means any
behavior change is attributable to the policy version, and timeboxed trips or an
explicit rider choice still override the role's default envelope.
