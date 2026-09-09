# Switchback beta convergence program

Date: 2026-09-08
Baseline: `main` @ `b53c177c1620098bfa00883257eae245411a6f5c`

## Executive decision

The shortest path to beta is **not more capability**. It is convergence.

Switchback already has a serious deterministic motorcycle-routing core, progressive alternatives, route evidence, direct-manipulation primitives, GPX tooling, local libraries, Free Ride machinery, navigation/recovery, and a substantial test suite. The beta risk is that these capabilities are exposed through too many overlapping product surfaces and too much orchestration concentrated in a few React owners.

The program therefore optimizes for four outcomes:

1. **One coherent rider mental model.** Plan makes/changes a ride; Rides is mine; Discover finds rides; Ride follows or freely discovers roads.
2. **One authority per concept.** No duplicate basemap authority, route-facts authority, search authority, ride-intent authority, or AI mutation path.
3. **Smaller autonomous change surfaces.** Agents should be able to modify one product area without loading or editing the 80+ KB planner coordinator.
4. **Evidence-based beta promotion.** Exact-head automated gates plus real phone/rider evidence; no feature-count definition of done.

## What is already strong — protect it

Do not rewrite these merely to make folders prettier:

- canonical RideIntent/history/revision work already landed through the planner store;
- `trip-planning-coordinator` stale-result fencing, cancellation, primary-first progressive results;
- route API schema/validation and provider error boundaries;
- routing planner/scoring/eligibility/diversity modules;
- route entity cache and large-geometry separation;
- `PlannerComposition` choice/details separation;
- `PlannerDeckViewModel` grouped read-model/command pattern;
- navigation engine pure logic and existing recovery machinery;
- GPX original-vs-derived truth boundaries;
- #83 graphics primitives for truthful route/evidence visualization.

No Redux/XState/event-bus/service-container rewrite. No new routing engine, model gateway, vector DB, generic plugin framework, microservices, or learned route ranker for beta.

## Current integration ledger

### PR #82 — map presentation

**Disposition: finish and integrate first.**

Why it matters:

- collapses Road/Terrain/Satellite into one canonical preset authority;
- removes duplicate raster basemap controls;
- contains legacy map-experience ids to storage migration boundaries;
- corrects Mapbox Standard config-property assumptions;
- unifies map viewport measurement;
- wires #83 map-style previews into the real picker.

Latest observed head at this checkpoint: `8109809a047b1fb37c0484bc289a173d3db43749`.

Observed CI on that head: Mobile Core succeeded; real-router, visual, and rider-journey jobs succeeded in the observed Quality run, but the Quality run itself failed early in the `verify` job at **Dependency audit (moderate+)**, causing later lint/typecheck/unit/build steps in that job to be skipped. Treat this as a real integration blocker until the advisory is classified. Do not assume it is product-code failure; do not waive it silently either.

Required before merge:

- identify exact `npm audit` advisory/package path;
- decide upgrade/override/accepted-risk with rationale;
- rerun exact-head required checks;
- rebase if main moved;
- verify the graphics foundation remains intact after conflict resolution.

### PR #66 — geometry-first Rides intelligence

**Disposition: salvage, do not merge wholesale.**

Valuable pieces:

- geometry-derived region/route intelligence;
- real road-name extraction;
- truthful geometry previews;
- deterministic local route search ideas;
- evidence tests around sampling-density invariance and outside-region handling.

Do not carry forward without redesign:

- a second `RideLibraryGoblin` search surface;
- a `Generate new` mode inside personal Rides;
- seeded fake route art as fallback for a specific real ride;
- PA-only region concepts as the permanent global product taxonomy;
- parallel route-facts/search types if #81 or the canonical Rides model already owns them.

Port domain/test value into one canonical Rides read model after #82; close #66 once all retained commits/ideas are accounted for.

### PR #80 — conversational route preference vector

**Disposition: salvage the domain seam after beta-critical planner truth bugs are closed.**

Keep:

- provider-neutral ride-character axes;
- relative edit semantics that preserve unspecified axes;
- hard safety/access/bike constraints remaining outside preference rewards.

Do not merge as an independent planner model. The vector must become a field/read-model of the existing canonical ride intent/typed-command system or a deterministic adapter feeding it.

Before integration, test whether six axes materially improve route decisions over existing rider-facing profiles. If an axis has no trustworthy routing/evidence input, keep it unknown/inactive rather than inventing resolution.

### PR #81 — route memory

**Disposition: split and salvage after #80/#66 reconciliation.**

Potentially valuable:

- deterministic ride fingerprints;
- confidence/support-aware learned profile;
- deterministic local ride-memory search;
- adversarial unknown-evidence rules;
- provider-independent model eval corpus.

Do not preserve the proposed two-mode Rides UI. `Rides` is not where new generation belongs. Do not add logical model slots unless current provider configuration actually needs them; configuration indirection without a beta use case is bloat.

## Architectural concentration audit

### 1. `PlannerShell.tsx` — highest conflict risk

Observed size on main: about 87.8 KB.

The defect is not line count. It is independent ownership:

- planning and replanning;
- top-level navigation;
- map presentation/packs/layers;
- saved routes/project GPX/trips;
- import/export/join;
- recordings and replay;
- Free Ride polling/accept/Head Home/preferences;
- Advisor handoffs;
- location/Home;
- offline packs;
- map editing callbacks;
- active ride transitions;
- URL restoration and notices.

**Rule:** never assign `Refactor PlannerShell` as a task. Extract one lifecycle only when the next product change needs it, prove no behavior change, merge, then modify that lifecycle.

Target seams, in order of value:

1. planning orchestration controller;
2. Free Ride controller;
3. route/library ingress controller;
4. map-presentation controller after #82.

Each exposes a small `viewModel + commands` boundary. Routing algorithms and storage repositories stay in their current specialized modules.

### 2. `PlannerMapStage.tsx` — second conflict risk

Observed size on main: about 63 KB.

It combines renderer lifecycle with several mutually exclusive pointer modes: waypoint placement, via placement, sketch, avoid area, road-lock drafting, route sculpting, route preview, navigation camera, layers, reference maps and map controls.

The highest-value refactor is **exclusive map interaction ownership**, not arbitrary component splitting.

Target discriminated state:

```ts
type MapInteractionMode =
  | { kind: "idle" }
  | { kind: "place-point"; point: "start" | "finish" }
  | { kind: "add-stop" }
  | { kind: "sketch-route" }
  | { kind: "avoid-area" }
  | { kind: "road-lock" }
  | { kind: "route-sculpt"; /* bounded draft id */ }
```

One mode owns pointer input. Escape/cancel has one meaning. Migrate one mode at a time; preserve pan/zoom, pointer capture, retry geography and current road-lock/sculpt behavior.

### 3. `PlanComposer` / `PlannerDeck`

`PlannerDeckViewModel` already groups state well; `PlanComposer` still receives a very large flat prop/callback surface.

Refactor only the contract first:

- `model.request`
- `model.waypoint`
- `model.rideConfig`
- `model.lifecycle`
- `model.context`
- corresponding command groups

Then extract only visually coherent pieces such as request bar, progress, quick actions and contextual stop ideas. Do not atomize every field into a wrapper component.

### 4. CSS/style authority

`layout.tsx` currently imports a long sequence of global feature stylesheets, several explicitly described as overrides/recovered authorities. `globals.css` still bundles Sora and DM Sans specifically because V1 surfaces remain; `tokens.css` carries V1 aliases and route-role colors until consumers migrate.

This is real bloat, but deleting CSS before inventory is dangerous.

Run a **style authority retirement audit**:

- map every global stylesheet to live component selectors;
- identify selectors redefined later only to neutralize earlier rules;
- migrate live surfaces to canonical V2 tokens/component modules;
- delete old authority in the same PR that removes its last consumer;
- remove Sora/DM Sans packages only when zero live selector/component references remain;
- never add another `*-fix.css` or `*-polish-final.css` override layer for beta.

Value: smaller bundle, fewer responsive regressions, less agent confusion. Risk: high if done as mass deletion; perform per surface.

## Product truth bugs to test before more UX work

These are code-read findings, not yet claimed runtime defects. Convert each into a failing deterministic test before changing behavior.

### A. Natural-language toll coherence

The prompt path routes using parsed `intent.tollPolicy`. Verify the same policy is committed to canonical RideIntent and reflected by the visible control.

Scenario: `avoid tolls to New Hope`.

Assert request, canonical state, control and Undo agree.

### B. Stale segment-profile coherence

Start with a manually segmented ride, then submit a fresh natural-language request that changes points/vias.

Assert no stale `segmentProfiles` array reaches a route request with incompatible leg count.

### C. `Best Ride` label authority

Audit route-role assignment. `Best Ride` must mean the deterministic Switchback selection/ranking policy actually chose the route as best, not merely that its coarse profile is scenic/adventure/gravel.

### D. Recorded duration provenance

When actual recording timestamps are invalid/missing, do not silently show planned route duration as though it were recorded elapsed time. Use an explicit source/unknown state.

### E. Fake route art

No specific stored/community ride may render seeded invented geometry. Real geometry → `RouteThumbnail`; unavailable geometry → explicit generic fallback.

## Rides / Discover convergence

### Rides contract

`Rides` means rider-owned material:

- saved routes;
- recorded rides;
- user imports;
- trips.

The project/curated GPX corpus is not `Your roads` and should move to Discover browsing.

One search entry can support text plus deterministic structured constraints. There is no separate Goblin search UI and no `Generate new` inside Rides.

List rows remain compact and factual: real shape, source, title, truthful duration/distance, one character fact, optional distance from rider.

### Discover contract

Do not rebuild the existing GPX Atlas capabilities. Consolidate them with community discovery.

Reuse/salvage:

- near-me sorting;
- radius filters;
- distance bands;
- curvature bands;
- regions;
- real route posters;
- surface facts;
- detail/intelligence pages.

Expose source explicitly: `Curated` vs `Community`.

Storage stays separate; browsing becomes one surface.

Retain public share/detail URLs as compatibility routes. Deprecate duplicate list pages only after deep-link/data/SEO behavior is verified.

## Route-choice UX — highest visible payoff

Switchback's candidate/evidence pipeline already contains more useful information than cards currently expose.

Compact cards should answer one question: **what does the extra time buy?**

Show at most:

- factual role;
- actual route thumbnail;
- ETA and distance;
- added minutes vs fastest/current;
- one character sentence;
- one compact evidence visual when useful;
- warning, if any.

Do not turn route choice into a dashboard of six gauges. Details owns deeper surface/elevation/evidence/traffic/uncertainty data.

Unavailable diversity means fewer cards, not fake variants.

## AI / Gravel Goblin boundary for beta

One rider request entry. Do not add a second chat-first planner.

Target flow:

```text
rider text
  -> local parser or optional model interpretation
  -> validated typed RideCommand proposal
  -> base-revision check
  -> canonical RideIntent change
  -> deterministic route planning
```

Follow-ups such as `more curves`, `less gravel`, `keep this road`, `coffee halfway`, `home by 6` should ultimately use the same command pipeline.

AI never supplies route geometry, hard access/safety truth, route IDs that do not exist, raw provider config, or authoritative metric deltas.

No-key structured controls remain complete.

## Debloat kill/defer matrix

### Keep for beta

- GraphHopper baseline;
- current bounded fallback/provider seams;
- Mapbox primary renderer after #82;
- MapLibre only as the explicitly documented rollback path until retirement gate is met;
- deterministic scoring/evidence;
- local-first libraries;
- Free Ride core;
- GPX import/export/intelligence;
- Advisor only where grounded and optional;
- #83 factual graphics.

### Consolidate before beta

- Rides/project GPX boundary;
- Discover vs GPX Atlas vs `/routes` listings;
- map preset/layer authority (#82);
- route facts/search/fingerprint types across #66/#81;
- planner callbacks into smaller controllers;
- map gesture booleans into exclusive ownership;
- global CSS override chains surface-by-surface.

### Defer until after beta unless a gate proves otherwise

- Google cinematic 3D;
- additional commercial routing providers;
- model-slot abstractions without an immediate bakeoff;
- mountain-pass enrichment providers;
- new dashboards;
- more mascot surfaces;
- large settings redesign;
- social feed/follow/likes/DMs;
- native apps/CarPlay/Android Auto;
- broad offline-parity expansion.

### Candidate removal audit

Do not delete on suspicion. Produce evidence first for:

- unused legacy components/re-export shims;
- global CSS files with zero live selectors;
- Sora/DM Sans dependencies after V1 retirement;
- duplicate public browse surfaces after redirect compatibility exists;
- stale feature flags after rollout evidence;
- MapLibre only after ADR retirement criteria and production/device acceptance.

## Beta definition

Beta is for roughly a small trusted rider group, not a feature-complete public product.

### Required automated evidence on exact candidate

At minimum:

```sh
npm run lint
npm run typecheck
npm test
npm run build
npm run test:e2e:critical
npm run test:e2e:pwa
npm run test:e2e:real-router
```

Plus branch-required visual/road-lock checks and the relevant mobile matrix. Dependency audit must be classified, not ignored.

### Required rider journeys

1. Fresh start → destination route → alternatives → choose → save → reload.
2. 90–120 minute loop from location and from explicit start when geolocation is denied.
3. Change route character/highway/toll/time and undo/redo the whole change.
4. Draw a route, cancel cleanly, retry a failed draw without geography changing.
5. Add/remove/reorder/drag a shaping stop.
6. Add an avoid area and recover from a conflicting route request.
7. Open a saved/recorded/imported ride and see truthful geometry/provenance.
8. Discover a curated/community route, understand source, use it as a private editable ride.
9. Start Ride mode, lose/recover GPS, go off-route, exit/reload safely.
10. Free Ride → suggestion → accept/ignore → Head Home while recording continuity is preserved.
11. Advisor/no-key behavior: core planning remains complete with Advisor absent.
12. Offline/PWA: shell reload, saved route display and any routing claims are accurately separated.

### Required physical/human evidence

Before inviting beta riders:

- one real iPhone Safari/PWA pass;
- mounted/handheld readability in daylight;
- portrait + landscape + short landscape;
- location permission deny/recover;
- background/foreground;
- wake/speech lifecycle;
- weak/no network behavior;
- recording continuity;
- a safe real-road ride with at least one reroute/recovery scenario;
- owner review of screenshots at required viewports;
- one Luna black-box human-style QA run against the exact deployed candidate.

Simulation cannot close these gates.

## Value gate

Every proposed beta change must answer:

1. Which rider decision or failure becomes better?
2. Is the problem reproduced/evidenced?
3. Could an existing capability solve it through better composition?
4. Does this create a new state authority or permanent UI surface?
5. What is the smallest reversible implementation?
6. What measurable test proves the value?
7. What can be removed once this lands?

Score candidate work:

- Rider value: 0–5
- Correctness/trust risk reduced: 0–5
- Agent leverage/conflict reduction: 0–5
- Implementation/regression cost: 0–5 (subtract)
- Permanent complexity: 0–5 (subtract)

`priority = value + trust + leverage - cost - complexity`

Do not implement negative/zero-value work during beta convergence without an explicit owner decision.

## Sequencing

### Gate 0 — clean integration lane

- resolve #82 dependency audit and merge only on exact-head green;
- rebase this beta-control branch on the resulting main;
- classify #66/#80/#81 into salvage commits/tasks and close superseded drafts when accounted for;
- no new large feature branch until this lane is clean.

### Gate 1 — correctness before polish

Write/fix tests for toll coherence, stale segment profiles, role truth, duration provenance and any current high-confidence QA blockers.

### Gate 2 — agent-friendly ownership seams

Extract planning orchestration and the minimum next-needed controller from PlannerShell with no behavior change. Refactor PlanComposer prop contract. No redesign in structural PRs.

### Gate 3 — personal Rides + canonical ride facts

One factual read model, real geometry, truthful provenance, deterministic search. Move curated/project corpus out of personal Rides.

### Gate 4 — Discover convergence

Merge Atlas capability into Discover browsing without changing underlying source storage. Preserve deep links.

### Gate 5 — route decision comprehension

Use #83 graphics selectively to make route tradeoffs immediately legible.

### Gate 6 — map interaction ownership

Exclusive gesture mode, then direct-manipulation polish. No giant MapStage rewrite.

### Gate 7 — conversational follow-up commands

Integrate only validated #80/#81 preference/memory value through canonical typed commands.

### Gate 8 — ride/session qualification

Free Ride/navigation continuity, physical device, PWA/offline truth, deployed exact-build smoke and Luna black-box QA.

Only after Gate 8 should cinematic 3D, broader provider federation or major new capability return to the queue.

## Beta HOLD conditions

Any one of these keeps the product at HOLD:

- known S1/blocker in core planning, route truth, recovery or ride execution;
- stale result can replace newer rider intent;
- route shown as safe/known where evidence is unknown;
- save/reload loses or mutates the active ride unexpectedly;
- drawing/placement mode cannot be predictably canceled;
- selected route and map disagree;
- Rides shows fabricated geometry for a real ride;
- Free Ride/Head Home loses recording or hard constraints;
- required no-key path is unusable;
- physical iPhone/PWA ride gate not performed;
- deployed candidate SHA/build cannot be identified during final acceptance;
- required CI red or unexplained/flaky in release scope.

Beta should be smaller and truthful rather than broad and brittle.
