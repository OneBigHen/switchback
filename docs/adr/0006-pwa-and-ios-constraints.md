# ADR 0006: Progressive enhancement for browser navigation

## Decision

Ship an installable web app with a cached shell, IndexedDB route/ride data,
Wake Lock and speech APIs when available, and explicit recovery for denied GPS,
network loss, and browser suspension. Do not claim background GPS, universal
screen wake, or unrestricted offline routing where iOS/browser APIs do not
provide them.

## Consequences

Ride mode stays honest on iPhone Safari and installed PWAs, while the same
domain model can support richer native capabilities later.
