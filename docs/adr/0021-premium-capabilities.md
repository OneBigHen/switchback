# ADR 0021: Premium capabilities are server-declared and identity-gated

## Decision

Premium provider features are declared by the server, not decided by client
flags. A capability resolver combines the deployment default, which provider
keys are configured, an optional stable-identity allowlist, and current provider
health into a small boolean payload (`mapboxPremium`, `googleCinematic`,
`tomtomTraffic`, `tomtomRouting`, `advancedFreeRide`). A missing key forces the
capability false even for an entitled identity, and email addresses are never
the entitlement key.

The browser receives booleans plus browser-authorized public map configuration
only; server secrets stay server-side. Self-imposed daily call budgets and a
short circuit breaker degrade a capability temporarily rather than failing
routing. This is entitlement gating for a tiny trusted audience — not billing,
not plans, and the UI says nothing about upgrading.

## Consequences

The same codebase serves the owner's enriched instance and a future public
deployment that runs GraphHopper and the basic map with every premium capability
off. Unavailable features are hidden rather than shown disabled, so a basic
deployment stays coherent instead of looking broken. `/api/health` distinguishes
required from optional providers: an optional outage is `degraded`, not `ok:
false`.
