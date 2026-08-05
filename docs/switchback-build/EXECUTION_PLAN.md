# Switchback first-class routing execution plan

This checklist consolidates the supplied master prompt, first-class routing
specification, implementation roadmap, and the current repository audit.

## Phase 0 — baseline and contract stabilization

- [x] Extract the supplied build package and read all three specifications.
- [x] Audit package scripts, route providers, planner, Ride, storage, offline
      code, API routes, tests, and current documentation.
- [x] Add normalized domain contracts without breaking provider wire contracts.
- [x] Add deterministic score, recommendation, offline-recovery, and profile
      focused tests.
- [x] Add ADRs for routing, traffic, offline packs, scoring, learning, PWA/iOS,
      privacy, and recommendation safety.

## Phase 1 — deterministic route intelligence

- [x] Normalize route candidates into provider-neutral score inputs.
- [x] Represent curvature, surface, road class, urban, traffic/incident,
      legal-access, seasonal, confidence, and familiarity fields in contracts.
- [x] Implement transparent weighted scoring and hard rejection gates.
- [x] Produce rider-facing explanations from measured fields only.
- [x] Preserve meaningful route diversity by overlap and route shape.
- [x] Map Quick, Balanced, Twisty, Scenic, Adventure, Gravel, Avoid Highways,
      and Neural to explicit provider-compatible behavior.

## Phase 2 — Plan product

- [x] Preserve address/place/current-location search, multi-stop editing, loop
      generation, route alternatives, GPX import/export, saved routes, and
      responsive layouts.
- [x] Expose profile labels, score reasons, warnings, and unavailable/degraded
      provider behavior at the planner boundary.
- [x] Capture current Free Ride desktop/mobile-landscape visual evidence.
- [ ] Complete the full visual matrix for every specified Plan state.

## Phase 3 — Ride product

- [x] Keep the guidance state machine, maneuver progression, off-route
      detection, reroute/rejoin behavior, voice, wake-lock path, and degraded
      states wired to the existing Ride surface.
- [x] Add saved-corridor recovery for offline/provider-failure reroutes.
- [x] Add focused navigation, reroute, and Ride HUD tests.
- [ ] Complete real-device permission, suspension, offline, and voice checks.

## Phase 4 — temporal providers

- [x] Define capability-aware temporal, traffic, incident, closure, weather,
      daylight, and optional signal fields in the normalized domain contract.
- [x] Keep missing/stale data explicit rather than labeling it live.
- [ ] Add and verify live traffic/incident adapters when a selected provider
      and service credentials exist.

## Phase 5 — Free Ride / Neural Map v1

- [x] Add a first-class Free Ride entry point and active surface.
- [x] Track GPS confidence, speed, route context, and safe interaction
      workload at the recommendation boundary.
- [x] Generate bounded curvature candidates from the existing repository.
- [x] Rank deterministic candidates with route score and local preferences.
- [x] Show at most one actionable suggestion and support accept, ignore, and
      less-like-this without typing.
- [x] Convert an accepted suggestion into a normal navigable route and record
      local private events.

## Phase 6 — local learning and offline packs

- [x] Add local events, local preference ranking, reset/export/deletion, and
      privacy copy.
- [x] Preserve validated regional pack storage and explicit pack status.
- [x] Add active-route offline corridor recovery with coverage/expiry checks.
- [ ] Run a real airplane-mode iPhone/PWA drill and record the result.
- [x] Document browser limitations and unsupported fallbacks.

## Phase 7 — optional ranker and hardening

- [x] Keep personalization subordinate to deterministic legality, safety,
      confidence, and detour gates.
- [ ] Add pairwise/learned ranking only after deterministic quality is measured.
- [ ] Run the complete accessibility, security, privacy, provider-cost,
      migration, performance, battery, and end-to-end release matrix.
- [x] Keep traceability, status, ADRs, and handoff evidence in the repository.

## Release gates for the next quality pass

- [x] `npm run lint`
- [x] `npm run typecheck`
- [x] `npm test` — 168 files / 1,147 tests
- [x] `npm run build`
- [x] Free Ride Playwright desktop/mobile-landscape matrix
- [ ] Live provider health/routing/geocoding/custom-model/offline smoke checks
- [ ] Physical iPhone airplane-mode drill
- [ ] Requirement-by-requirement evidence review
