# Switchback Closure and Reskin Handoff for GLM 5.2

**Baseline:** `main` at `c75e0df` (`Complete planner refactor and offline foundations`)

## Mission and ordering

Close the outstanding functional and architectural debt in the current rider workbench. GLM 5.2 must **stop after tech-debt closure and its verification evidence are delivered**. It must not begin, propose, scaffold, design, style, or implement a visual reskin. The user will return to Codex separately for the final UI/UX rewrite.

This is an execution brief for a lead engineer using GLM 5.2 for narrowly bounded implementation packages. It is not permission for an autonomous worker to redesign the application, add accounts/cloud infrastructure, alter service configuration, or broaden the product.

## Current truth

The following bounded foundations are implemented and tested. They require lead integration, not a second rewrite:

| Area | Accepted foundation | Still missing |
| --- | --- | --- |
| Ride HUD | Presentation extraction for recovery actions and weather alerts. | A dedicated navigation-session boundary; real-device recovery/performance proof. |
| Offline | Deterministic corridor manifest, typed graph, bounded A*, worker protocol. | Actual legal/provenanced graph data, browser pack lifecycle, worker-to-pack wiring, offline recovery proof. |
| Trips | Validation helpers for plans and stages. | Versioned editable plan/stage timeline, local library UX, actual-versus-planned replay. |
| Sharing | Strict portable-route validation and privacy redaction. | Optional authenticated/revocable sharing only if product contracts approve it. |
| Planner | Hybrid routing, GPX exchange/import worker, map layers, route library, sketching and recovery controls. | Must-use road locks, reference-image line extraction, data-quality/provenance completion, final mobile/device evidence. |

Do not reopen accepted pure helpers solely to make them match a future UI. Integrate through their typed public contracts and add adapters if a boundary changes.

## Non-negotiable worker rules

- One GLM package has one outcome, a disjoint allowlist, explicit non-goals, and focused tests.
- Work in an isolated worktree. The lead alone merges packages into `main`.
- GLM may not alter `package.json`, lockfiles, deployment/systemd/Cloudflare config, GraphHopper/Valhalla infrastructure, global stores, or shared routing contracts unless the package explicitly names the file and the lead has approved it.
- No external API key, OAuth secret, private route, home address, raw ride record, or production cookie may enter source, fixtures, screenshots, prompts, or commits.
- Do not claim an offline route is possible just because a saved geometry/cue track is present. Do not claim access is legal from an unproven community report or map layer.
- Preserve existing IndexedDB data with versioned migrations and test both old and new records.
- Every package ends with a clean commit, focused tests, `npm run lint`, and `npm run typecheck`. The lead runs the full gate and live verification after integration.
- **Stop condition:** after all closure streams and the integrated release gate are complete, report the evidence and stop. Do not open a reskin task, create design assets/tokens, change layout/CSS for a new visual direction, or perform product redesign work.

## Closure stream A — prove the existing release surface

This stream prevents the team from disguising unverified behavior as technical debt closure.

### A1 — Refresh public-browser evidence

**Lead owned. Do not delegate as a broad GLM task.**

Verify the deployed `https://ride.henning.rodeo` application, not only localhost:

1. Planner: destination-only, explicit origin/destination, ambiguous search, multi-stop edit, loop route, avoid area, and free-form ride request.
2. Routing: Quick/Twisty/Scenic/Adventure diversity; GraphHopper primary; Valhalla supplemental/fallback; elevation degradation; restricted-road avoidance.
3. Exchange: GPX/KML/KMZ import; source-track preservation; route/cue export; import/export round trip in a new browser profile.
4. Ride: denied GPS, weak/stale GPS, dropped signal, pause/resume, reroute cancellation, preserve-original rejoin, fuel detour, and restart recovery.
5. Mobile: iPhone-sized portrait and landscape Safari, planner sheet gestures, tap targets, map controls, library, and Ride HUD.

Save only deliberate final screenshots to `artifacts/screenshots/`; ignore raw server logs and dogfood output.

### A2 — Add a stable E2E matrix

**GLM package A2.**

Allowed files:

- `tests/e2e/planner.spec.ts`
- `playwright.config.ts`
- `artifacts/screenshots/` only for intentional baseline images

Acceptance criteria:

- Tests target current user-facing labels and flows, not retired planner markup.
- Desktop Chromium and mobile Safari cover one complete plan-to-ride journey.
- A smoke test covers free-form intent and a route-sketch/edit flow.
- Tests never depend on real personal credentials, a mutable personal route library, or uncontrolled public provider responses.
- Failures produce useful screenshots/traces without committing temporary test output.

Non-goals: changing planner behavior, CSS, routing code, or production deployment.

## Closure stream B — complete architecture boundaries

### B1 — Navigation session controller

**Lead design, then small GLM packages. This is the largest reskin blocker.**

Create a `NavigationSessionController` hook/store which owns:

- geolocation lifecycle, permissions, stale fixes, foreground/background transitions, retry state, and cleanup;
- navigation-frame calculation, completed points, deviation history, recovery checkpoints, recording, and journal handoff;
- reroute scheduling/cancellation and explicit rejoin policies: nearest-safe, next shaping point, skip point, preserve original, and fuel detour;
- voice/wake-lock capability degradation without assuming browser APIs exist;
- a compact typed view model plus commands consumed by `RideHud`.

`RideHud` becomes presentation-first. GPS samples must not require the root planner tree to re-render.

Suggested packages:

| Package | Bounded outcome | Candidate allowlist |
| --- | --- | --- |
| B1a | Define controller view model, commands, reducer/state transitions, and pure tests. | `src/lib/client/navigation-*`, `src/stores/navigation-store.ts`, navigation tests. |
| B1b | Move geolocation/session effects out of `RideHud` without changing visible behavior. | `RideHud.tsx`, controller files, RideHud/navigation tests. |
| B1c | Move recovery/recording/voice handoff behind controller commands and prove teardown. | Same narrow controller boundary and tests. |

Lead acceptance:

- Denied location, stale location, tunnel/dropout, pause/resume, overnight restart, and reroute cancellation are exercised.
- A profiler or deterministic render counter proves root planner rendering is not coupled to every GPS fix.
- iPhone HTTPS validation proves wake-lock/voice/geolocation failure paths remain understandable and recoverable.

### B2 — Planner composition boundary

The planner is more modular than the old audit states, but the orchestration boundary must be finished before a reskin.

Required end state:

- `PlannerShell` coordinates typed feature hooks; it does not own unrelated routing, research, library, location, and ride effects inline.
- `PlannerDeck` receives grouped, stable view models/command objects rather than an expanding flat prop surface.
- `MapStage` owns map rendering/interaction boundaries; drawing, sources, navigation camera, and layer controls remain independently testable.
- CSS stays component-scoped under `src/app/styles/`; do not return to one global stylesheet.

GLM work must be extraction-only: no label, layout, route, gesture, or style changes. The lead must approve every moved boundary after a behavior comparison.

### B3 — Accessibility and interaction primitives

Before reskin, establish testable primitives instead of embedding accessibility fixes into a visual rewrite:

- Announce material route, GPS, and navigation-instruction changes through appropriate `aria-live` regions without announcing every distance tick.
- Preserve keyboard escape/focus return for drawer, dialogs, sheet states, map controls, and share/import errors.
- Define touch target, focus-visible, reduced-motion, contrast, and landscape-safe rules as reusable tokens.
- Add focused component tests for these contracts.

## Closure stream C — make offline behavior truthful and usable

### C1 — Offline pack contract and storage migration

The implemented graph helpers are not an offline product until a pack carries real bounded data.

Lead defines and freezes versioned contracts before GLM work:

- `OfflinePackManifest`, `OfflineGraphSegment`, `OfflineRoutingRequest`, `OfflineRoutingResult`, `OfflinePackEstimate`, and `OfflinePackStatus`;
- corridor width, maximum graph budget, source/version/date, legal-access provenance, expiry, and storage accounting;
- clear states for `available`, `downloading`, `ready`, `stale`, `expired`, `failed`, and `deleted`.

GLM package C1 may update only `src/lib/storage/offline-route-pack.ts` and its tests to migrate old route/cue-only packs without data loss. It must continue to label those packs as follow-saved-route, not offline routing.

### C2 — Data acquisition and worker integration

**Lead owned because this involves licensing, data provenance, budgets, and browser cache policy.**

The lead must choose a legally distributable bounded graph source and packaging format. Then wire:

`pack manifest -> graph asset retrieval -> IndexedDB/Cache Storage -> worker request -> bounded A* result -> navigation recovery`

Requirements:

- Routing is strictly in-corridor; outside-corridor requests fail with an explicit, actionable result.
- Restrictions and shaping constraints are honored.
- Request IDs support cancellation/stale-result rejection.
- Pack install estimates bytes before download; deletion genuinely reclaims data; update and expiry are visible.
- Service worker/PWA configuration does not cache arbitrary graph data or stale private records.

### C3 — Offline UX and recovery drills

GLM may implement presentation only after C1/C2 contracts are frozen:

- Pack estimate, quota, download/update/delete, freshness, and error views.
- A visible distinction among saved-route guidance, offline map availability, and offline rerouting.
- Status text that says what the rider can do while disconnected.

Lead proof: install a pack, disable network, create/recover a route inside the corridor, attempt an outside-corridor reroute, restart the browser, and delete the pack. Record evidence on a physical phone.

## Closure stream D — finish trip, library, and sharing behavior

### D1 — Local-first trip command model

Freeze versioned `TripPlan` and `TripStage` contracts that cover:

- ordered stages, terminal destination behavior, route snapshots, alternates, notes, checklist state, and deliberate skip/reorder/split actions;
- fuel envelope, daylight/weather windows, lodging/camping/service stops, and typed validation errors;
- migration of existing saved trip snapshots.

Use the accepted pure validators in `src/lib/trip/` as the single source of truth. UI must not recreate validation rules.

### D2 — Library and timeline integration

Build a coherent local-first interface to create, edit, save, restore, duplicate, delete-confirm, search, and load trips. `LibraryDrawer` stays presentation-only; storage access remains in a library/service hook. Verify a fresh browser profile and a migrated existing profile.

### D3 — Planned versus actual replay

Define a privacy-preserving ride-journal contract before building UI. A rider must be able to compare planned geometry to recorded geometry, deviations, stops, notes, and optional media metadata locally. No cloud sync is implied.

### D4 — Sharing boundary

Portable, local route shares remain available without accounts. Account-backed sharing is a separate product decision and cannot be smuggled into the reskin. If approved, it requires authentication, expiry, revocation, copies rather than shared mutation by default, privacy-zone redaction, auditability, and a dedicated service/security review.

## Closure stream E — data quality, rider intelligence, and region contracts

### E1 — Map/data provenance

Every operational layer must expose source, coverage, refresh date, confidence, and limitations. Finish the semantic distinction between public/private access, closures, traffic, weather, services, cell coverage, MVUM/access, and reference overlays. Approximate/heuristic layers must say so.

### E2 — Reference and road-editing gaps

Complete two signature planner gaps before reskin:

- must-use road/corridor locks that survive route edits and provider changes; and
- reference-image line extraction or a clearly bounded assisted workflow that never presents a guessed trace as an authoritative legal road.

Each needs real route/edit/reload tests and iPhone Safari gesture proof.

### E3 — Rider learning and community reports

Durable per-rider/per-motorcycle preference learning and community reports remain incomplete. Do not make them broad GLM assignments. First decide retention, consent, categories, geographic scope, freshness/expiry, corroboration, moderation, dismissal, trust signals, and legal-safety policy. Community data may inform/rank/warn; it must never silently determine legal access.

### E4 — Region manifests and expansion

Define a region manifest containing graph versions, map/layer availability, provenance, freshness, coverage, restrictions, and storage budgets. A region is not enabled until its routing profile, restriction, fallback, geocoding, offline-pack, and recovery suites pass.

## Reskin handoff gate

These are the conditions Codex will require before it accepts a separate future full UI/UX rewrite. They are **not work for GLM 5.2**:

- Navigation-session controller is integrated, behaviorally verified, and decoupled from planner-wide GPS renders.
- Offline packs either support real, bounded, proven offline rerouting or the product explicitly scopes offline to saved-route guidance and removes misleading affordances.
- Trip/library contracts and essential local-first workflows are stable and migration-tested.
- Sharing policy is frozen; unapproved account/community work is visually and architecturally out of scope.
- Planner, map, and accessibility interaction boundaries are stable enough that presentation can consume view models rather than moving business logic.
- Current public browser matrix, real-iPhone checks, and offline/recovery drills have evidence.
- `npm run lint`, `npm run typecheck`, `npm test`, `npm run build`, and the Playwright suite pass on the integrated tree.
- No open critical privacy, data-provenance, routing-safety, or stale-test issue remains.

If any item is open, make only narrow, behavior-preserving usability/accessibility fixes required to close the relevant tech-debt package. Do not start a visual rewrite.

## Reserved future phase — full UI/UX reskin

**Reserved for Codex and the user after GLM has stopped.** This section is context only; GLM must not execute it, create tasks for it, or modify files in anticipation of it. It is a product/UI project, not another architecture extraction.

### Reskin deliverables

1. A written design contract: rider personas, information hierarchy, navigation states, desktop/mobile/landscape layouts, interaction inventory, typography, color/tokens, motion/reduced-motion behavior, empty/loading/error/offline states, and accessibility requirements.
2. A visual baseline for planner, route comparison, library, map layers, trip timeline, pack lifecycle, active ride, recovery, and share/import flows.
3. A reusable component/token system that consumes stable view models and does not import routing/storage/browser side effects.
4. Incremental screen migration behind behavior-preserving contracts, with desktop and iPhone Safari visual regression evidence.
5. Final live rider workflow validation and a post-reskin cleanup pass removing obsolete styles and duplicate components.

### Reskin non-goals

- No new routing provider, map-data source, account system, offline graph format, or community backend.
- No hidden change to privacy, legal-access, safety, or data-retention policy.
- No redesign that trades map usability, touch targets, keyboard access, or visible failure state for visual polish.

## Integrated release gate

Run from a clean integrated tree, then verify the public deployment:

```bash
npm run lint
npm run typecheck
npm test
npm run build
npm run test:e2e
```

The lead then checks deployed planner/routing/exchange/ride/offline/mobile behavior as defined in A1. Capture only final intentional evidence, document any intentionally deferred product decision, and do not call the roadmap closed from unit tests alone.
