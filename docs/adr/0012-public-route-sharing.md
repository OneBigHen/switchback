# ADR 0012: Opaque-link read-only route sharing

## Decision

A shared route is a read-only snapshot addressed by a high-entropy opaque id
(`/r/<token>`), never direct access to the owner's editable record. The creator
can copy, regenerate, and disable the link. Viewing requires no account.
Request handlers split into cheap (get shared route, map style, cached derived
metrics) and expensive (routing, geocoding, weather, traffic, route
enrichment); expensive handlers are rate-limited hard by the in-process
limiter. Cloudflare Turnstile is added to expensive anonymous actions only if
bots become a real problem — never a CAPTCHA on ordinary route viewers.

## Consequences

A random public viewer cannot spend the operator's provider quota. No Redis is
introduced for this. Sharing stays a snapshot feature; followers, likes, feeds,
DMs, reputation, and moderation are out of scope (see ADR 0009).
