# Switchback Remaining Roadmap — GLM Execution Guide

## Purpose

This document is the authoritative remaining-work backlog for completing Switchback beyond the currently working core. It is written for a lead engineer who owns architecture, integration, deployment, and release decisions, with `neuralwatt/glm-5.2` used for bounded implementation packages.

The application already has meaningful planning, routing, navigation recovery, GPX exchange, map layers, local route storage, and initial trip persistence. Do not treat those existing slices as proof that the systems below are complete.

## Non-negotiable delivery rules

- GLM works only from a complete work package containing: Scope, Allowed files, Forbidden files, Acceptance criteria, Validation commands, and Non-goals.
- Use an isolated worktree for every GLM package. Never run a worker in the dirty integration tree.
- GLM does not edit shared routing contracts, global stores, deployment/configuration, dependencies, service infrastructure, or the integration branch unless the lead explicitly approves the exact paths.
- The lead reviews every worker diff, reruns validation, resolves integration conflicts, and performs production/public-browser verification.
- No requirement is complete merely because source code exists or a mocked unit test passes.
- Preserve existing saved routes, recovery sessions, trip plans, map packs, and ride records through versioned IndexedDB migrations.

## Current architectural gaps

| Area | Current state | Remaining outcome |
| --- | --- | --- |
| Ride HUD | Single large component owns controller effects and presentation. | Navigation-session controller separated from HUD presentation; GPS updates do not create unnecessary UI work. |
| Offline | Packs contain verified route/cues and map configuration only. | Bounded offline graph, worker routing, pack lifecycle, and recovery drills. |
| Trips | Local staged route snapshots exist. | Durable editable multi-day plans, library organization, replay, and portable/shareable trip workflows. |
| Sharing | Portable route links exist. | Revocable optional authenticated shares, copies, expiry, privacy zones, and collaboration boundaries. |
| Community | Not implemented. | Scoped, expiring, moderated reports that warn/rank but never silently decide legal access. |
| Regional expansion | PA/NJ-centric services and data. | Region manifests with data provenance, freshness, coverage, and gated expansion suites. |

---

# Phase 1 — Finish the Ride HUD/controller boundary

## Lead-owned design work

Define a `NavigationSessionController` boundary that owns:

- GPS lifecycle, stale-fix detection, foreground/background behavior, and retry state.
- Navigation frame calculation, recovery checkpointing, completed waypoint tracking, and deviation history.
- Explicit rejoin policies: nearest-safe, next shaping point, skip point, preserve original line, and fuel detour.
- Automatic reroute timing and cancellation.
- Voice cue and wake-lock degradation behavior.
- Recording lifecycle and ride-journal handoff.

The controller must expose a compact, typed view model and commands to presentation. It must not require the planner tree to render for GPS samples.

## GLM packages

### RH-01 — Extract pure HUD status/presentation

Allowed files:

- `src/components/planner/RideHud.tsx`
- `src/components/planner/RideHudStatus.tsx`
- `tests/components/ride-hud.test.tsx`

Acceptance criteria:

- `RideHudStatus` accepts display-only props.
- Existing heading, instruction, progress, GPS, alert, and recovery UI remains behaviorally identical.
- No effects, browser APIs, routing requests, or storage calls move into the presentation component.

Validation:

```bash
npx vitest run tests/components/ride-hud.test.tsx
npm run typecheck
npm run lint
```

### RH-02 — Extract static recovery action panel

Allowed files:

- `src/components/planner/RideHud.tsx`
- `src/components/planner/RideRecoveryActions.tsx`
- `tests/components/ride-hud.test.tsx`

Acceptance criteria:

- Recovery action controls are presentation-only and receive callbacks from `RideHud`.
- All policy labels, disabled states, and explicit preserve-original behavior remain unchanged.
- Controls meet the existing 48px ride-mode target styling without CSS redesign.

Validation: focused RideHud test, typecheck, lint.

### RH-03 — Extract weather-alert presentation

Allowed files:

- `src/components/planner/RideHud.tsx`
- `src/components/planner/RideWeatherAlert.tsx`
- `tests/components/ride-hud.test.tsx`

Acceptance criteria:

- Alert rendering/dismissal UI moves to a pure component.
- Fetching, session storage, and alert selection remain in controller code.

Validation: focused RideHud test, typecheck, lint.

## Lead integration and release gates

- Introduce the controller hook/store only after the above presentation packages are accepted.
- Verify denied geolocation, stale GPS, tunnel/dropout, pause/resume, overnight recovery, reroute cancellation, and recording restart.
- Verify portrait/landscape controls on real iPhone dimensions and a public deployed build.
- Prove no root planner rerender occurs for each GPS sample.

---

# Phase 2 — True offline corridor routing

## Required product definition

An offline pack is not complete if it contains only route geometry and cues. A complete pack includes a bounded road graph suitable for recoverable local routing, selected map assets, route/cues, shaping constraints, access metadata, size/freshness information, and lifecycle controls.

## Lead-owned architecture

Define versioned contracts:

- `OfflinePackManifest`
- `OfflineGraphSegment`
- `OfflineRoutingRequest`
- `OfflineRoutingResult`
- `OfflinePackEstimate`
- `OfflinePackStatus`

Define a corridor strategy around the planned route with configurable width, graph-size limits, segment/access provenance, and a Web Worker protocol. The worker performs bounded A* routing; it must not claim global/off-corridor routing.

## GLM packages

### OFF-01 — Offline-pack metadata and migration

Allowed files:

- `src/lib/storage/offline-route-pack.ts`
- `tests/unit/offline-route-pack.test.ts`

Acceptance criteria:

- Versioned pack records include estimated bytes, freshness/expiry, and status metadata.
- Existing records migrate without loss.
- Existing follow-saved-route behavior remains accurately labeled until OFF-04 lands.

### OFF-02 — Pure corridor manifest builder

Allowed files:

- `src/lib/offline/corridor-manifest.ts`
- `tests/unit/corridor-manifest.test.ts`

Acceptance criteria:

- Given route geometry and settings, produce a deterministic bounded corridor manifest.
- Validate width, geometry, and maximum graph budget inputs.
- No fetches, IndexedDB, map UI, or routing-service calls.

### OFF-03 — Offline graph utility algorithms

Allowed files:

- `src/lib/offline/graph.ts`
- `src/lib/offline/a-star.ts`
- `tests/unit/offline-graph.test.ts`

Acceptance criteria:

- Typed graph adjacency, restrictions, shaping points, and bounded A* algorithm.
- Tests cover path found, no path, restricted edge avoidance, and shaping-point ordering.
- No browser-worker wiring or UI.

### OFF-04 — Worker protocol implementation

Allowed files:

- `src/workers/offline-routing.worker.ts`
- `src/lib/offline/worker-protocol.ts`
- `tests/unit/offline-worker-protocol.test.ts`

Acceptance criteria:

- Versioned request/result messages.
- Worker rejects unsupported/malformed requests with normalized errors.
- Cancellation and stale request IDs are represented.

## Lead integration and release gates

- Acquire/package the actual bounded graph and legal-access data with explicit provenance.
- Connect worker to the offline pack library and PWA cache controls.
- Build pack estimate, quota, update, deletion, expiry, and freshness UI.
- Test offline mode by disabling network after pack installation; verify initial route, reroute within corridor, unavailable route outside corridor, and restart recovery.
- Never label a route/cues-only pack as offline routing.

---

# Phase 3 — Complete trip, library, replay, and share workflows

## Required product definition

Trip plans must be local-first and durable. A rider can build stages, edit/reorder/split/skip, preserve fuel/daylight constraints, save/restore, record actual rides, compare plan to actual, and export or share deliberate copies without silently exposing private locations.

## GLM packages

### TRIP-01 — Trip-plan model validation helpers

Allowed files:

- `src/lib/trip/trip-plan.ts`
- `src/lib/trip/stage-planner.ts`
- `tests/unit/trip-plan.test.ts`
- `tests/unit/stage-planner.test.ts`

Acceptance criteria:

- Pure helpers validate stage ordering, terminal destination behavior, and fuel/daylight constraints.
- Invalid state produces typed, actionable errors.
- No UI or IndexedDB changes.

### TRIP-02 — Trip-library organization actions

Allowed files:

- `src/lib/storage/trip-plan-library.ts`
- `tests/unit/trip-plan.test.ts`

Acceptance criteria:

- Local trip list supports stable update, delete, and deterministic recency ordering.
- Version migrations preserve prior snapshots.

### TRIP-03 — Library trip presentation

Allowed files:

- `src/components/planner/LibraryDrawer.tsx`
- `tests/components/library-drawer.test.tsx`

Acceptance criteria:

- Saved trips are searchable, loadable, and delete-confirmed.
- Accessibility/focus behavior remains intact.
- No direct IndexedDB access from the component.

### SHARE-01 — Portable share validation hardening

Allowed files:

- `src/lib/share/route-share.ts`
- `tests/unit/route-share.test.ts`

Acceptance criteria:

- Strictly validate decoded payload fields and numeric coordinates.
- Preserve explicit privacy-zone redaction behavior.
- Reject malformed or oversized portable shares without throwing to callers.

## Lead integration and release gates

- Add versioned `TripPlan`, `TripStage`, timeline, checklist, fuel envelope, and alternate-plan data contracts.
- Add actual ride comparison: planned versus recorded geometry, deviations, stops, notes, and media metadata.
- Implement optional account-backed shares only as a separate service with authentication, expiry, revocation, and privacy zones.
- Keep local-first planning, GPX portability, and recovery fully usable without accounts.
- Verify save/restore/edit/delete and GPX round-trip in a fresh browser profile.

---

# Phase 4 — Collaboration, community, and regional expansion

## Lead-owned systems

These require product/security decisions and must not be delegated as broad GLM tasks:

- Optional authentication and synchronization service: Postgres/PostGIS plus S3-compatible object storage.
- Revocable share links, collaborative copies, live safety sharing, privacy zones, and expiry.
- Community reports: geographic scope, category, timestamps, expiry, corroboration, moderation state, trust signals, and dismissals.
- Region manifests: graph versions, map/layer availability, provenance, freshness, coverage, and storage budget.

## GLM-safe packages after contracts are frozen

- Pure report validation/expiry helpers and unit tests.
- Region-manifest schema validation and fixtures.
- Presentation-only report cards, filters, empty states, and accessibility tests.
- Documentation and fixture expansion with disjoint file allowlists.

## Release gates

- Community data may warn or rank but must never silently decide legal access.
- Every report and layer exposes provenance/freshness/confidence.
- Every new region passes routing profile, restriction, fallback, geocoding, offline-pack, and recovery suites before availability.

---

# Full release gate

Before declaring the roadmap core complete, run and preserve evidence for:

```bash
npm run lint
npm run typecheck
npm test
npm run build
```

Then verify deployed behavior at `https://ride.henning.rodeo`:

- Planner: destination-only, address, ambiguous destination, origin/destination, multiple stops, loop, highway avoidance, provider fallback.
- Routing: GraphHopper profiles, route diversity, Valhalla supplementation/fallback, elevation degradation, restricted-road avoidance.
- Exchange: GPX/KML/KMZ import/export round trips and no silent road matching.
- Ride: denied/stale GPS, dropout, pause/resume, overnight restart recovery, rejoin policies, fuel detour, background/foreground behavior.
- Offline: pack lifecycle and actual in-corridor reroute with network disabled.
- Usability: desktop Chromium, mobile Safari dimensions, real iPhone portrait/landscape, keyboard/screen-reader, touch targets, and map/sheet gestures.

## Recommended execution order

1. RH-01 through RH-03, then lead controller extraction.
2. OFF-01 through OFF-04, then lead graph acquisition/worker/PWA integration.
3. TRIP-01 through TRIP-03 and SHARE-01, then lead replay and optional-share service work.
4. Community and region contracts, then bounded GLM presentation/validation packages.
5. Full release gate and live public evidence.
