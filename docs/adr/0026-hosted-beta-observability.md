# ADR 0026: Hosted beta development observability

## Status

Accepted 2026-09-14. Supersedes [ADR 0011](0011-product-analytics.md).

## Decision

The hosted OpenGravel beta is a high-observability development environment using PostHog for product analytics, web analytics, selected autocapture, session replay, heatmaps, browser error tracking, performance telemetry, feature flags, experiments, targeted surveys, and agent-readable product evidence.

The hosted beta requires explicit prior acknowledgement before replay and non-essential telemetry starts. It may use stable anonymous/session identity, opaque signed-in identity, client IP/GeoIP as supported by the configured PostHog project, detailed interaction events, workflow durations, and replay of permitted UI surfaces.

Every meaningful semantic event carries release/build/deployment context so behavior can be correlated to exact code changes.

PostHog remains behind a typed OpenGravel telemetry boundary with URL/property sanitization, replay masks/blocks, and tests. Authentication secrets, authorization data, API keys, raw GPX/file contents, complete route geometry, raw GPS tracks, exact home/work data, and raw coordinate arrays are never intentionally sent as OpenGravel analytics properties. Primary navigation/private ride-history map canvases are not globally recorded by replay in V1.

Self-hosted OpenGravel remains telemetry-off by default (`TELEMETRY_ENABLED=false`) and never phones home to the OpenGravel-owned PostHog project unless an operator explicitly configures their own telemetry.

PostHog AI/Replay Vision/Self-driving and external agents may summarize aggregate evidence, find friction, correlate regressions to builds, and open investigations. They do not gain authority to change or deploy production code solely because a metric or replay changed.

The full implementation contract is `docs/superpowers/specs/2026-09-14-posthog-dev-observability-design.md`.

## Consequences

- ADR 0011's ~15-event/no-replay/no-identify constraint no longer governs the hosted beta.
- The hosted beta intentionally trades privacy minimization for product-learning speed, with explicit disclosure and acknowledgement.
- Session replay and autocapture require active masking/blocking review as product surfaces evolve.
- Raw location/ride payloads remain outside the analytics event model; useful route characteristics are captured as safe aggregates/bands.
- Build SHA, deployment ID, schema version, device/PWA context, provider outcome, errors, and workflow timing become first-class analysis dimensions.
- Telemetry is non-critical infrastructure: PostHog failure must never break routing, navigation, GPX, or offline behavior.
- A broader public launch requires a new review of replay sampling, retention, consent/disclosure, identity, and collection scope rather than assuming this small hosted-beta posture scales unchanged.
