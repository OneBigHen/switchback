# OpenGravel PostHog development observability design

Status: approved for implementation
Baseline: `main@030b256a02409f6b0efcf53583ba421e2ea27841`
Branch: `docs/posthog-dev-observability-spec`
Supersedes the product direction in ADR 0011 through ADR 0026.

## Goal

Make the hosted OpenGravel beta exceptionally observable so a small PA/NJ test group can generate enough behavioral evidence to improve the product quickly. The hosted instance should use PostHog deeply: product analytics, web analytics, session replay, heatmaps, error tracking, performance telemetry, feature flags, experiments, surveys where useful, and agent-readable analysis.

The system is not privacy-maximal. It is a development environment with explicit prior disclosure and acknowledgement. It may capture IP-derived information, stable browser/session identity, detailed interaction telemetry, and session recordings. Self-hosted OpenGravel remains telemetry-off by default.

The purpose is product learning and debugging, not ad targeting, resale, or building a rider-location database.

## Product constraints

OpenGravel remains a motorcycle trip decision engine. Telemetry must answer concrete questions such as:

- Where do riders get stuck?
- Which route modes and alternatives are actually chosen?
- How long does planning take from intent to usable route?
- Which provider fails, times out, or produces a rejected candidate?
- Which UI surfaces are ignored, misunderstood, rage-clicked, or abandoned?
- Which GPX-library flows produce a ride rather than a dead end?
- Which Free Ride suggestions are accepted or dismissed?
- Did a specific build, PR, feature flag, or experiment improve or hurt behavior?
- What breaks on mobile/PWA compared with desktop?
- Which errors or slow paths correspond to abandonment in replay?

Do not add telemetry merely because PostHog can capture it. Every custom event must support a product, reliability, UX, routing, or release question.

## Deployment modes

### Hosted beta

The hosted OpenGravel instance is the high-observability environment.

Required capabilities:

- product analytics;
- web analytics;
- pageview/pageleave tracking;
- selected autocapture;
- session replay;
- heatmaps;
- browser error tracking;
- web vitals/performance telemetry;
- stable anonymous sessions;
- optional signed-in user correlation using an opaque identifier;
- IP/GeoIP collection as supported by the configured PostHog project;
- release/build correlation;
- feature flags and experiments;
- agent-readable PostHog context;
- Replay Vision/Self-driving or equivalent PostHog analysis when available to the project.

### Self-hosted

Self-hosted OpenGravel must remain silent by default.

`TELEMETRY_ENABLED=false` is the default. No OpenGravel-owned PostHog project key or endpoint may be baked into a self-hosted build. A self-hoster may explicitly enable telemetry and configure their own PostHog host/project.

The implementation must make this distinction obvious in code and documentation rather than relying on deployment convention.

## Disclosure and acknowledgement

The hosted beta must show an explicit first-run telemetry acknowledgement before PostHog session replay and non-essential telemetry starts.

This is a beta participation gate, not a vague cookie banner. The copy must state in plain language that the hosted development instance records detailed usage information to improve OpenGravel, including session recordings, device/browser information, IP/approximate network location, feature usage, errors, and performance data.

It must also state that:

- authentication secrets are excluded;
- precise raw ride history/GPX payloads are not intentionally sent as analytics properties;
- the self-hosted version has telemetry disabled by default;
- the user can inspect the public telemetry specification.

For the hosted beta, declining the acknowledgement may direct the rider to self-hosting information rather than silently starting full telemetry anyway.

Store acknowledgement version and timestamp locally so copy/schema changes can require re-acknowledgement when materially necessary.

Do not initialize replay before the gate is satisfied.

## PostHog integration architecture

PostHog must be behind a narrow OpenGravel telemetry boundary. Product code should not scatter raw `posthog.capture()` calls everywhere.

Expected structure:

```text
src/lib/telemetry/
  config.ts
  client.ts
  events.ts
  properties.ts
  privacy.ts
  spans.ts
  identity.ts
  release.ts
  replay.ts
  index.ts
```

Names may adapt to repository conventions, but responsibilities must remain separated.

### `config.ts`

Owns runtime enablement and environment parsing.

Expected environment contract:

```text
TELEMETRY_ENABLED=false
NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN=
NEXT_PUBLIC_POSTHOG_HOST=https://us.i.posthog.com
NEXT_PUBLIC_POSTHOG_UI_HOST=https://us.posthog.com
NEXT_PUBLIC_OPENGRAVEL_BUILD_SHA=
NEXT_PUBLIC_OPENGRAVEL_DEPLOYMENT_ID=
NEXT_PUBLIC_OPENGRAVEL_RELEASE=
NEXT_PUBLIC_OPENGRAVEL_TELEMETRY_SCHEMA=1
```

Do not expose a PostHog personal API key to the browser. Server/agent access requiring a personal key must use server-side secrets only.

### `client.ts`

Initializes `posthog-js` only when:

1. telemetry is enabled for the deployment;
2. the browser is available;
3. hosted beta acknowledgement has been accepted.

The repo is on Next.js 16.3.3, so implementation should prefer the current PostHog-supported Next.js 15.3+ client instrumentation path (`instrumentation-client.ts`) where it fits the app. The implementing agent must verify the exact API against the installed PostHog SDK version and current Next.js docs rather than copying stale snippets.

### `events.ts`

Exports typed custom events and their legal property schemas. Business logic calls OpenGravel telemetry helpers, not PostHog directly.

### `privacy.ts`

Provides hard payload sanitization and replay exclusion rules. It is not intended to make the hosted beta anonymous; it exists to prevent accidental credential and raw-location leakage.

### `spans.ts`

Tracks long-running product workflows with start/end/cancel/failure state and durations.

### `identity.ts`

Owns anonymous and authenticated identity behavior. If the rider is signed in, correlate sessions only with an opaque OpenGravel account identifier. Do not send email, display name, credential IDs, passkey material, recovery secrets, or other auth data as person properties.

On logout, call the appropriate PostHog reset behavior so the next rider on a shared browser is not merged into the previous person.

## SDK configuration intent

The implementation should deliberately configure, not merely accept defaults for:

- project token and ingest host;
- pageview/pageleave behavior;
- autocapture scope;
- person profile mode;
- session replay;
- error tracking;
- performance/web-vitals collection;
- feature flags;
- persistence/identity;
- `before_send`/event sanitization;
- replay masking/blocking;
- development/debug behavior;
- opt-in/acknowledgement state.

Use a current pinned `posthog-js` version in `package-lock.json`. Do not load the SDK from an unpinned third-party script tag.

## Identity model

### Anonymous riders

Allow PostHog to maintain a stable anonymous browser identity for the hosted beta after acknowledgement. This is useful for multi-session retention, funnel, replay, and experiment analysis.

### Signed-in riders

When the app has a canonical authenticated principal, call `identify()` with an opaque internal subject only. The preferred value is a stable non-human-readable identifier already safe to expose to the client; if the current auth model lacks one, add a dedicated telemetry subject rather than sending email/name.

Allowed person properties are intentionally small:

- beta cohort, if explicitly assigned;
- first seen app release;
- installed PWA boolean;
- broad device class;
- optional tester role such as `owner`, `invited_tester`, or `anonymous` if this already exists in product state.

Do not mirror the user table into PostHog.

## IP and GeoIP

The hosted beta intentionally permits PostHog to receive the client IP needed for IP/GeoIP functionality. PostHog can enrich events with properties such as city, region/subdivision, country, timezone, and approximate coordinates from the request IP.

Requirements:

- do not manually attach IP to every client event when PostHog already receives it at ingestion;
- server-side events representing a browser request must use the real client IP from trusted request context rather than the server/datacenter IP;
- never trust a random client-supplied `X-Forwarded-For` unless it has passed through the deployment's trusted proxy path;
- keep IP usage scoped to product analytics, debugging, abuse/security context, and approximate geography;
- do not treat GeoIP latitude/longitude as actual rider GPS;
- document the PostHog project setting governing client-IP retention and GeoIP enrichment so the owner knows the effective configuration.

The agent should verify the current PostHog project setting and current SDK behavior during implementation because PostHog's IP/GeoIP controls can evolve independently of this repository.

## What may be captured

The hosted beta may capture:

- route/screen names;
- page URLs after sanitization;
- referrer and campaign source;
- browser, OS, viewport, device class;
- PWA installed/standalone state;
- stable anonymous distinct/session IDs;
- opaque authenticated telemetry subject;
- IP/GeoIP supplied by PostHog;
- clicks, taps, form interactions, panel opens/closes, tab changes;
- scroll and dwell behavior;
- rage/dead clicks and heatmap data;
- UI state represented by safe categorical properties;
- feature-flag variants;
- experiment assignment;
- errors/exceptions and safe stack metadata;
- provider name;
- HTTP status/error class;
- operation durations and timeouts;
- route distance/time/elevation/surface values when bucketed or already non-sensitive aggregate output;
- counts such as number of waypoints, candidates, saves, shares, imports;
- broad outcome states;
- app release/build/deployment/schema versions;
- session replay of permitted DOM/UI surfaces.

## Never intentionally send as event/person properties

The following remain prohibited even in high-observability mode:

- passwords;
- passkey credential material;
- WebAuthn challenge/response payloads;
- auth/session tokens;
- API keys;
- cookies or authorization headers;
- recovery secrets;
- raw GPX/XML/file contents;
- complete route polylines/GeoJSON geometry;
- raw GPS tracks or ride-history coordinate arrays;
- exact home/work addresses;
- exact origin/destination coordinates as custom analytics fields;
- arbitrary search text when it may contain an address or private place name;
- user-written private notes;
- uploaded-file byte contents.

This list is enforced in code through sanitizers and tests, not only documentation.

## Session replay

Session replay is a first-class beta tool and should be enabled after acknowledgement.

### Replay should capture

- shell/navigation transitions;
- planner panel interaction;
- route-card comparison behavior;
- tabs/drawers/sheets;
- button and control usage;
- loading/skeleton/error states;
- GPX library browsing and filtering UI;
- Free Ride flows;
- Labs surfaces where safe;
- scroll, pointer, touch and viewport behavior;
- console/error context where supported;
- safe network timing/metadata where supported;
- performance timing around visible stalls.

### Replay must mask or block

Apply PostHog/rrweb masking or blocking classes/selectors to:

- password/passkey/authentication surfaces;
- any token/API-key input;
- raw GPX/file preview text;
- free-form private notes;
- exact address/search text if present in an input;
- any DOM element that renders raw coordinates;
- any debugging panel that could expose headers, cookies, credentials, or raw provider requests.

All password-like inputs must remain masked regardless of local overrides.

### Map/canvas policy

Do not blindly enable global canvas recording. Maps can encode exact origin, destination, current position, ride history, or route geometry visually.

V1 should record the surrounding controls and interaction telemetry while keeping primary navigation/ride-history map canvases excluded from replay capture unless a later, explicitly reviewed change proves a safe and valuable per-surface policy.

Map interactions must still be measurable through events such as pan/zoom frequency, layer changes, route-selection changes, recenter use, and interaction dwell.

### Network replay policy

If network capture is enabled, sanitize request data before it is recorded. Routing/search/geocoding endpoints often carry coordinates or search terms in query strings or bodies.

At minimum:

- never record Authorization/Cookie headers;
- do not record request/response bodies for auth, GPX, routing, search, geocoding, sharing-token, or passkey endpoints;
- strip sensitive query parameter values;
- retain method, normalized endpoint family, status, duration, size bucket and error class where useful.

The implementing agent must use the current PostHog session-replay network-sanitization API for the pinned SDK version and add tests proving sensitive values do not survive serialization.

## Autocapture

Enable autocapture selectively for the hosted beta because the small tester population makes interaction-level evidence useful.

However, autocapture must not become the primary semantic analytics layer.

Rules:

- semantic product outcomes use named custom events;
- autocapture supplies exploratory click/form/heatmap context;
- use `data-ph-capture-attribute-*` only for stable, non-sensitive metadata;
- use `ph-no-capture`/current equivalent on sensitive surfaces;
- avoid capturing arbitrary input values;
- normalize dynamic route IDs/share tokens out of URL properties.

## URL sanitization

The telemetry boundary must sanitize URLs before custom capture and before any explicit pageview logic.

Strip or replace:

- share tokens;
- opaque route IDs when they reveal private objects without adding analytical value;
- query text;
- coordinates;
- auth callback data;
- one-time tokens;
- file names if user supplied;
- secrets in query strings/fragments.

Prefer route templates, for example:

```text
/routes/[id]
/gpx-library/[project]
/shared/[token]
```

rather than high-cardinality raw URLs.

## Release context on every meaningful event

Every custom event must include or inherit:

```text
app_release
build_sha
deployment_id
telemetry_schema_version
environment
hosted_or_self_hosted
pwa_mode
device_class
```

When feature flags or experiments affect the event, include the relevant variant through PostHog's native feature-flag context rather than duplicating ad hoc strings where possible.

This release context is required so agents can correlate behavioral changes with exact deployments and PRs.

## Core semantic event taxonomy

The implementation may add events when justified, but V1 must cover the following families.

### App/session

- `app_opened`
- `beta_telemetry_acknowledged`
- `pwa_install_prompt_shown`
- `pwa_installed`
- `app_backgrounded`
- `app_resumed`

### Planner intent and route generation

- `planner_opened`
- `planner_input_completed`
- `route_plan_requested`
- `route_plan_succeeded`
- `route_plan_failed`
- `route_candidates_presented`
- `route_candidate_selected`
- `route_mode_changed`
- `route_replanned`
- `route_reroute_triggered`
- `route_reroute_completed`
- `route_reroute_failed`

Important safe properties:

- `route_mode`;
- `provider_set`/provider role;
- `distance_band`;
- `duration_band`;
- `detour_band`;
- `waypoint_count_band`;
- `candidate_count`;
- `surface_mix_band`;
- `traffic_evidence_present`;
- `success`;
- `failure_class`;
- `latency_ms` or latency band;
- `selected_candidate_role`.

Do not include raw origin/destination or geometry.

### Route comparison/decision

- `route_detail_opened`
- `route_comparison_started`
- `route_comparison_ended`
- `route_explanation_opened`
- `traffic_incident_opened`
- `route_saved`
- `route_shared`
- `navigation_started`
- `route_abandoned`

### Free Ride

- `free_ride_opened`
- `free_ride_discovery_started`
- `free_ride_suggestions_presented`
- `free_ride_suggestion_opened`
- `free_ride_suggestion_accepted`
- `free_ride_suggestion_dismissed`
- `free_ride_live_started`
- `free_ride_live_suggestion_shown`
- `free_ride_live_suggestion_accepted`

### GPX/library

- `gpx_library_opened`
- `gpx_project_opened`
- `gpx_import_started`
- `gpx_import_succeeded`
- `gpx_import_failed`
- `gpx_route_loaded`
- `gpx_exported`
- `gpx_filter_changed`

Properties may include file-size band, point-count band, route-count band, source class, parse duration and failure class. Never send raw GPX content or user-supplied filenames unless explicitly sanitized to a non-sensitive categorical label.

### Map/UI

- `map_style_changed`
- `map_layer_toggled`
- `map_recenter_used`
- `map_3d_toggled`
- `panel_opened`
- `panel_closed`
- `primary_action_invoked`
- `help_opened`

Avoid creating one custom event per button. Use a constrained `surface`/`control` enum for generic UI events where semantic events are unnecessary.

### Offline

- `offline_mode_entered`
- `offline_pack_download_started`
- `offline_pack_download_completed`
- `offline_pack_download_failed`
- `offline_route_planned`

### Providers/reliability

- `provider_request_started` only if needed for latency diagnostics and sampled appropriately;
- `provider_request_completed`;
- `provider_request_failed`;
- `provider_timeout`;
- `provider_fallback_used`.

Provider events must use normalized operation names and never include raw provider request URLs containing coordinates.

### Errors

Use PostHog error tracking for unhandled browser exceptions and capture explicit handled failures where product state matters.

Required safe dimensions:

- error class/code;
- feature/surface;
- build SHA;
- provider if relevant;
- recoverable boolean;
- recovery path;
- user-visible impact class.

Do not intentionally attach complete state dumps.

## Workflow spans and duration measurement

Time-on-page alone is insufficient. Implement first-class workflow spans.

A span has:

```text
span_id
workflow
started_at
ended_at
duration_ms
outcome
step_count
build_sha
session_id
safe categorical context
```

Required V1 workflows:

- `planner_to_first_routes`;
- `route_comparison`;
- `planner_to_navigation`;
- `free_ride_discovery`;
- `gpx_import`;
- `gpx_library_to_route`;
- `share_flow`;
- `offline_pack_download`;
- `reroute_recovery`.

Spans must close on success, explicit cancel, route/page abandonment, and known failure. Use page visibility/background events to avoid counting long inactive periods as engaged workflow time.

For interaction dwell, distinguish:

- wall-clock duration;
- foreground duration;
- active-interaction duration when practical.

Do not emit per-second heartbeat events. Derive durations locally and send summarized span events.

## Key funnels

Create PostHog insights/dashboards for at least:

1. `app_opened -> planner_opened -> route_plan_succeeded -> route_candidate_selected -> navigation_started`
2. `free_ride_discovery_started -> free_ride_suggestions_presented -> free_ride_suggestion_accepted -> navigation_started`
3. `gpx_library_opened -> gpx_project_opened -> gpx_route_loaded -> navigation_started`
4. `route_shared -> shared route viewed -> navigation_started` where technically available;
5. `route_plan_failed -> retry/recovery -> route_plan_succeeded`;
6. first-session activation and return-session retention.

Each funnel should be filterable by build SHA, device class, PWA state, provider, route mode and experiment variant.

## Required dashboards

### Beta cockpit

- active testers/sessions;
- sessions per tester/browser;
- median session duration;
- planner opens;
- plan success rate;
- navigation-start rate;
- Free Ride usage;
- GPX-library usage;
- top errors;
- session recordings from failed/abandoned funnels.

### Planner health

- route-plan success/failure;
- P50/P95 route-generation latency;
- provider success/timeout/fallback rate;
- candidate count distribution;
- selected candidate role;
- route mode distribution;
- comparison dwell;
- plan-to-navigation conversion.

### UX friction

- rage/dead clicks;
- repeated panel toggling;
- abandon points;
- longest workflow spans;
- mobile vs desktop differences;
- replay playlists for failed or high-friction sessions.

### Release regression

All primary metrics split by `build_sha`/deployment with comparison to previous deployment.

The owner must be able to answer: "What got worse after this deploy?" without manually reconstructing dates.

### Reliability

- JavaScript exception rate;
- error class by build;
- provider failure rate;
- API error rate;
- slow endpoint families;
- retries/recoveries;
- offline failures.

## Replay playlists / cohorts

Create saved replay views or playlists for:

- planner abandonment;
- plan failure followed by retry;
- rage-click sessions;
- route generated but no candidate selected;
- candidate selected but navigation not started;
- Free Ride suggestion dismissed repeatedly;
- GPX import failure;
- mobile/PWA sessions;
- sessions with uncaught exception;
- longest 10% route-generation waits;
- newest build only.

## Feature flags and experiments

Use PostHog feature flags for controlled beta changes that are genuinely uncertain and measurable. Do not migrate existing deterministic server capabilities into PostHog just because flags exist.

Good experiment targets:

- planner layout/CTA presentation;
- alternative-card ordering/presentation, without changing routing truth;
- onboarding/help affordances;
- GPX-library presentation;
- Free Ride explanation/entry treatment.

Do not use client-only PostHog flags to grant premium/security capabilities; ADR 0021 remains authoritative for server-declared capabilities.

Every experiment must define:

- hypothesis;
- primary metric;
- guardrail metric;
- exposure event;
- target population;
- planned duration or minimum useful observations;
- rollback condition.

With approximately a dozen testers, treat experiments as directional evidence, not statistically powerful consumer-scale studies.

## Surveys

PostHog surveys may be used sparingly for contextual beta feedback, especially immediately after:

- successful first route;
- abandoned route planning;
- Free Ride use;
- GPX import/use;
- major redesign exposure.

Never interrupt active navigation. Prefer one-question targeted prompts and link responses to the session/release context.

## PostHog AI, Replay Vision and Self-driving

Where enabled in the PostHog plan/project, use AI analysis as an evidence summarizer, not an autonomous product authority.

Desired recurring questions:

- What are the most common sources of friction in the newest build?
- Which sessions abandoned route planning, and what patterns cluster them?
- Which errors correspond to visible user failure?
- Which newly shipped UI is ignored or misunderstood?
- Which sessions show repeated retries or rage clicks?
- Did the latest deployment improve planner-to-navigation conversion?

AI-generated findings must link back to underlying metrics/replays. A replay shows symptoms, not necessarily root cause.

## Hermes / coding-agent observer loop

Build toward an aggregate observer workflow using PostHog's API/MCP/agent surfaces.

The safe loop is:

```text
PostHog evidence
  -> anomaly/friction summary
  -> correlate build SHA / deployment / GitHub PR
  -> inspect representative replays + errors
  -> create or update an investigation artifact
  -> reproduce deterministically
  -> propose code/test change
  -> PR
  -> CI + review
  -> deploy
  -> compare telemetry
```

Do not give an agent permission to modify production solely because a metric moved.

The observer may automatically:

- summarize daily/weekly beta health;
- identify regressions by build;
- attach relevant replay links;
- correlate deployment SHA to GitHub history;
- open a GitHub issue or investigation when thresholds are crossed;
- suggest likely reproduction paths;
- prepare a PR after deterministic reproduction.

It must not:

- expose PostHog personal API keys to the client;
- paste raw sensitive replay/network contents into public issues;
- automatically merge/deploy behavioral fixes with no verification;
- treat one session as proof of a general problem.

## Suggested alert thresholds for the small beta

Avoid percentage-only alerts on tiny sample sizes. Require both an absolute count and a rate/delta where possible.

Initial examples:

- 3+ route-plan failures in 24h and failure rate > 10%;
- P95 route planning > 10 seconds across at least 5 plans;
- 3+ uncaught exceptions on the newest build;
- navigation-start conversion drops by >20 percentage points vs prior build with at least 5 eligible sessions per side;
- the same provider timeout appears 3+ times in 24h;
- 3+ sessions exhibit the same replay-friction cluster.

These are starting values, not immutable product contracts.

## Event schema governance

Create a telemetry schema/version and enforce it in tests.

Requirements:

- event names are centralized;
- properties are typed;
- enum-like properties use constrained values;
- no arbitrary `Record<string, unknown>` escape hatch in ordinary product code;
- every new custom event includes a short reason/comment or schema description;
- high-cardinality properties require explicit review;
- sensitive-key denylist is checked before send;
- URL sanitization is deterministic and tested;
- telemetry failures must never break route planning/navigation.

Use `before_send` or the current PostHog equivalent as a final fail-closed scrubber in addition to typed call sites.

## Sensitive-key denylist

At minimum reject or remove properties whose normalized keys imply:

```text
password
passwd
secret
token
authorization
cookie
credential
webauthn
challenge
assertion
private_key
api_key
raw_gpx
polyline
geometry
coordinates
latitude
longitude
origin_lat
origin_lng
destination_lat
destination_lng
```

GeoIP properties created by PostHog itself are an explicit exception to the generic `latitude`/`longitude` naming concern; the denylist applies to OpenGravel-supplied payloads and should not corrupt vendor-enriched event fields after ingestion.

## Performance and cost

The beta is tiny, so optimize for signal rather than aggressive sampling, but do not generate pathological event volume.

Rules:

- do not capture pointer-move events as custom analytics;
- do not emit navigation/GPS heartbeat events into PostHog;
- do not send every map frame/camera tick;
- aggregate repeated map interactions;
- provider timing events may be sampled if volume later becomes material;
- session replay can begin at 100% of acknowledged hosted beta sessions while the tester population is roughly a dozen;
- revisit sampling before a broader public launch.

PostHog currently advertises free tiers large enough for this beta, but implementation must not assume pricing/free-tier quantities are permanent.

## Expected implementation surfaces

The implementing agent should inspect exact ownership before editing, but likely changes include:

- `package.json` / `package-lock.json` for pinned PostHog SDK(s);
- Next.js client instrumentation entry point;
- `src/lib/telemetry/**`;
- top-level app/provider integration;
- auth/session hooks for identify/reset;
- planner action boundaries;
- Free Ride flow boundaries;
- GPX library/import boundaries;
- provider/routing adapters for normalized success/failure timing;
- shared error boundary/client error handling;
- settings/about/privacy disclosure surface;
- first-run hosted-beta acknowledgement UI;
- `.env.example`;
- CSP/connect-src changes if required by the configured PostHog ingest/UI hosts;
- docs for PostHog project configuration and dashboard bootstrap;
- deterministic tests and Playwright coverage.

Do not scatter vendor code through route-scoring/domain modules. Instrument boundaries, not algorithms.

## Implementation sequence

### Phase 0 — project/config contract

1. Create/confirm the US PostHog project.
2. Record project token/host through environment variables.
3. Document effective IP/GeoIP and replay retention settings.
4. Create ADR 0026 and update active agent guardrails.
5. Add telemetry-disabled self-host defaults.

### Phase 1 — foundation

1. Install and pin PostHog SDK.
2. Add client initialization behind enablement + acknowledgement.
3. Add release/build context.
4. Add identity/reset behavior.
5. Add URL/property sanitization and denylist.
6. Add telemetry test helpers/mocks.

### Phase 2 — product events and spans

1. Planner events/spans.
2. Route comparison/navigation events.
3. Free Ride events.
4. GPX-library/import events.
5. Offline events.
6. Provider/reliability events.
7. Error tracking.

### Phase 3 — replay/autocapture

1. Enable replay for acknowledged hosted beta sessions.
2. Apply auth/private-input masking.
3. Apply map/canvas exclusions.
4. Sanitize network replay metadata.
5. Enable selected autocapture/heatmaps.
6. Verify no sensitive values appear in captured payloads.

### Phase 4 — dashboards/flags/feedback

1. Create required dashboards and funnels.
2. Create saved replay playlists.
3. Add targeted surveys if useful.
4. Establish first feature-flag/experiment workflow.

### Phase 5 — observer automation

1. Give Hermes/approved agent server-side read access via PostHog API/MCP.
2. Produce a daily or weekly beta report.
3. Correlate anomalies with deployment/build SHA and GitHub PR history.
4. Create investigation issues only above defined thresholds.
5. Never auto-merge based on telemetry alone.

## Testing requirements

### Unit tests

- telemetry disabled means no SDK initialization/capture;
- acknowledgement gate blocks replay/non-essential capture until accepted;
- URL sanitizer removes tokens, coordinates, auth callbacks and private query text;
- property scrubber rejects prohibited keys;
- typed event property contracts compile and reject invalid values;
- span duration handling closes success/failure/cancel paths;
- background time is not incorrectly counted as active interaction;
- logout resets PostHog identity;
- self-host mode cannot silently use the hosted project token.

### Integration tests

Use a mocked/intercepted PostHog transport to assert actual serialized payloads.

Tests must prove:

- planner success contains release/build context and safe route bands;
- raw coordinates are absent;
- GPX file contents are absent;
- share/auth tokens are absent from page URLs;
- masked inputs do not appear in replay/event payload fixtures;
- provider URLs are normalized before capture;
- errors are captured without state dumps.

### Playwright

At minimum cover:

1. first hosted visit -> acknowledgement -> telemetry initializes;
2. decline/no acknowledgement -> no replay startup;
3. plan route -> expected semantic sequence;
4. route failure -> normalized failure event;
5. GPX import -> no raw GPX content in telemetry requests;
6. auth/passkey surface -> sensitive DOM marked non-capture;
7. logout/login boundary -> distinct identity reset/transition;
8. self-host-style env -> zero PostHog network traffic.

### Manual PostHog validation

Before release, inspect a real beta session and confirm:

- replay is useful;
- auth data is masked;
- route/search secrets are not visible in network/replay context;
- build SHA is attached;
- GeoIP behaves as intended;
- funnels populate;
- errors link to useful replay context;
- no duplicate pageviews or duplicate semantic events occur.

## Release gates

The telemetry implementation is not complete until:

- exact-head `npm run lint` passes;
- exact-head `npm run typecheck` passes;
- exact-head `npm test` passes;
- critical E2E remains green;
- production build passes;
- the hosted beta can be run with telemetry on;
- a self-host configuration can be run with telemetry completely off;
- no secret/auth/raw-GPX/raw-coordinate fixtures are emitted by telemetry tests;
- at least one real replay is manually reviewed for masking and usability;
- at least one planner funnel and release dashboard show real events;
- build SHA/deployment context is verified in PostHog;
- a documented kill switch can disable telemetry/replay without code changes.

## Kill switch and failure behavior

The owner must be able to disable PostHog quickly by configuration.

If PostHog is unavailable, blocked, slow, or misconfigured:

- OpenGravel still loads;
- route planning still works;
- navigation still works;
- GPX import/export still works;
- errors are logged locally as appropriate;
- telemetry failures never surface as rider-facing fatal errors.

## Non-goals

- no ad-tech pixels;
- no selling/sharing analytics for advertising;
- no data broker integration;
- no raw GPS breadcrumb ingestion into PostHog;
- no replay of passkey/auth secrets;
- no autonomous production code changes purely from PostHog AI output;
- no replacing deterministic QA with replay analysis;
- no making PostHog a dependency of routing correctness;
- no enabling hosted OpenGravel telemetry on self-hosters by default.

## Completion criteria

This work is complete when the hosted beta can answer, with evidence:

- who/which stable tester browser used which release;
- how long major workflows took;
- where a session stalled or abandoned;
- what the rider clicked/tapped around that failure;
- which provider/build/feature flag was involved;
- whether the behavior is repeated across multiple sessions;
- which representative replays demonstrate it;
- whether the next deployment measurably improved it;

while OpenGravel still has hard technical protections against credential leakage and accidental raw ride-history/GPX ingestion, and self-hosted builds remain telemetry-off by default.
