# ADR 0013: Best Ride is the default route mode

## Decision

Switchback defaults to the Best Ride route, not the fastest route. Fastest and
Balanced are always offered as one-tap alternatives, and the time delta versus
fastest is shown prominently on every non-fastest route. The route-intelligence
score (ADR 0004) is tuned so ride quality outranks raw ETA, subject to the
existing hard legal, access, safety, and confidence gates.

## Consequences

The scoring model needs an explicit, tunable ride-quality-versus-time weight
and must always surface the ETA cost of its recommendation. Fastest remains a
first-class, unmodified option. This ADR sets the default; the weighting design
is Wave 4 (Route Intelligence v1).
