# ADR 0017: Federated route candidates, Switchback keeps ranking authority

## Status

Extends [ADR 0001](0001-routing-provider-architecture.md).

## Decision

Route candidates may come from GraphHopper, Valhalla, TomTom, or Switchback's
own corridor-shaped paths, but no provider's recommendation reaches the rider
unchanged. A bounded coordinator requests a capped candidate pool under one
deadline, and every candidate then passes the same pipeline: normalize, hard
legal/access/bike/safety eligibility, enrichment, traffic evidence, deterministic
scoring, diversity and dedupe, then rider-facing role assignment.

GraphHopper remains the self-hosted baseline that must be able to answer alone.
Provider identity is provenance and diagnostics; route cards name rider
decisions (Best Ride, Fast & Fun, Maximum Twisties, Fastest Now), not vendors.

## Consequences

The search space widens without a second competing decision model, and the first
usable route still arrives from the primary provider while federation continues
in the background. Provider call budgets and deadlines are mandatory so premium
candidate generation never makes planning feel slower, and a hosted provider's
outage removes candidates rather than producing an error.
