# ADR 0009: Trip decision engine scope and integration gate

## Decision

Switchback is a motorcycle trip decision engine, not a multi-layer map. Google
Maps answers "what is the practical route?"; Switchback answers "which route
will I actually want to ride, and what should I know before committing to it?"
Every feature must help a rider choose a route, understand a route, prepare for
a trip, or ride more safely. A new provider or data adapter is admissible only
when it changes one of those rider decisions; a map overlay alone is not
sufficient justification. Each external source stays a small adapter behind a
clean interface — no generic provider framework, no microservices.

## Consequences

Feature and integration PRs must name the rider decision that improves. Product
breadth is added as derived intelligence inside route comparison, not as a wall
of map toggles.
