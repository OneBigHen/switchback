# ADR 0019: Protect the Ride is the default traffic policy

## Decision

Traffic informs route choice; it does not win by default. `protect-ride` is the
default traffic preference: small time savings do not replace a substantially
better motorcycle road, mid-sized delays become a real tradeoff, and large
delays increasingly favor the less congested candidate. Closures, blocked roads,
illegal access, bike incompatibility, and delays that invalidate a rider's
timebox remain hard eligibility failures regardless of how good the riding is.

This is implemented as a pure, tested traffic cost fed into the versioned
deterministic scorer (ADR 0004) — not as a threshold rule hidden in the UI. Cost
scales with delay, severity, evidence freshness, whether the evidence applies to
the planned departure, and the route's role. Fast & Fun is more traffic
sensitive; Fastest Now is the traffic-duration reference every card compares to.

## Consequences

Route behavior under traffic is asserted by a fixture corpus rather than judged
by eye, and unavailable traffic scores as unknown with reduced confidence
instead of as good traffic. Riders always see the added minutes versus Fastest
Now, so protecting a ride is a visible, explained choice.
