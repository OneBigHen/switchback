# Gravel Goblin Verification + Map-Native Route Comparison Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Finish PR #58 as a visually verified, green, draft planner/Gravel Goblin UX change, then create a separate stacked PR that makes route comparison map-native and deterministic.

**Architecture:** PR #58 remains focused on stage-driven planner hierarchy and Gravel Goblin presentation. The next PR branches from #58's final exact head and adds transient map emphasis, geometry-driven selection, route-delta summaries, and Gravel Goblin-to-route linking through existing route IDs; it does not change routing/scoring/provider authority.

**Tech Stack:** Next.js, React, TypeScript, CSS Modules, Vitest + Testing Library, Playwright, existing Switchback map/runtime abstractions, GitHub Actions.

**Spec:** `docs/design/2026-09-04-ai-advisor.md` plus PR #58's stage-driven planner UX contract.

## Global Constraints

- Keep PR #58 draft until exact-head lint, typecheck, unit, production build, PWA smoke, rider journeys, real-router, and visual regression checks are green or explicitly investigated and corrected.
- Never rebaseline screenshots blindly; inspect rendered evidence and change baselines only when the new composition is intentionally better.
- Gravel Goblin remains advisory only: no auto-routing, auto-selection, invented route IDs, or mutation without rider action.
- Route-map interactions may only reference deterministic candidates already present in the current route result set.
- Hover/focus/touch emphasis is transient; explicit selection remains a separate action and state.
- Preserve accessibility: keyboard focus must produce the same route emphasis as pointer hover where applicable, and touch must not depend on hover.
- Preserve map-first hierarchy and mobile usability.
- Do not merge either PR as part of this work.

---

### Task 1: Finish exact-head #58 verification

**Files:**
- Modify only files implicated by current exact-head failures.
- Test existing `tests/components/*`, `tests/e2e/*`, and PWA/visual suites.

**Interfaces:**
- Consumes: PR #58 head and GitHub Actions logs/artifacts.
- Produces: an exact head where every genuine regression is fixed and stale assertions match the approved stage-driven UX.

- [ ] **Step 1: Read the latest exact-head workflow jobs and logs**

Confirm the commit SHA equals the PR head before acting on failures. Separate genuine implementation failures from cancelled/stale runs.

- [ ] **Step 2: Fix current component/unit regressions with the smallest behavior-preserving changes**

For each failure, first determine whether the product is wrong or the test asserts removed UX. Update product code only for a genuine regression; update tests only when the new stage-driven behavior is the approved contract.

- [ ] **Step 3: Run/observe exact-head verification again**

Required green steps: lint, typecheck, Vitest, production build, PWA smoke, rider journeys, real-router.

- [ ] **Step 4: Commit each coherent fix**

Use focused commits such as `fix: harden Gravel Goblin test environment` or `test: follow route-card details hierarchy`.

### Task 2: Inspect visual regression evidence and perform final Gravel Goblin QA

**Files:**
- Potentially modify `src/components/planner/v2/RideAdvisor.tsx`, `RideAdvisor.module.css`, planner composition styles, and approved visual baselines only after evidence review.

**Interfaces:**
- Consumes: CI visual artifacts/screenshots for desktop and phone widths.
- Produces: visually balanced pre-route, choose-route, expanded Goblin, and compact routed states.

- [ ] **Step 1: Download visual-regression artifacts from the exact-head run**

Inspect failure/current/diff images rather than using pass/fail alone.

- [ ] **Step 2: Review desktop composition**

Verify the mascot stays subordinate to the map, conversation has clear rider/Goblin hierarchy, route cards remain primary during Choose, and no dead space or duplicated controls are introduced.

- [ ] **Step 3: Review phone composition**

Verify the companion does not monopolize vertical space, controls remain touch-safe, the input/CTA stays reachable, and route choice remains legible above secondary advisor content.

- [ ] **Step 4: Fix visual defects and rerun visual checks**

Do not approve a baseline that merely captures clipping, overflow, excessive mascot scale, poor contrast, or route-card displacement.

- [ ] **Step 5: Remove dead advisor styling**

Delete selectors/classes no longer referenced by the current `RideAdvisor` markup and re-run lint/typecheck/unit tests.

### Task 3: Finalize #58 documentation without making it ready-to-merge

**Files:**
- Modify: PR #58 description.
- Modify if needed: `docs/design/2026-09-04-ai-advisor.md`.

**Interfaces:**
- Produces: accurate verification record and explicit draft status.

- [ ] **Step 1: Update verification section with exact-head evidence**

Record the final SHA and the concrete passing suites. Mention any intentionally changed visual baselines and why.

- [ ] **Step 2: Keep #58 draft**

Do not call `mark_pull_request_ready_for_review` and do not merge.

### Task 4: Create failing tests for map-native route emphasis and selection

**Files:**
- Create/modify component tests around route-card/map interaction.
- Create/modify E2E test for map-native route comparison.

**Interfaces:**
- Produces contract:
  - `hover/focus route card -> transiently emphasize matching route geometry`
  - `leave/blur -> restore selected/default map styling`
  - `tap/click alternate geometry -> explicitly select that existing candidate`
  - `touch route card -> select or open according to existing card action model, never rely on hover`

- [ ] **Step 1: Write a failing component test for transient route emphasis**

Assert emphasis changes by candidate ID without changing selected route ID.

- [ ] **Step 2: Write a failing browser test for geometry-driven selection**

Mock deterministic candidates, click an alternate rendered geometry, and assert the matching route card becomes selected and stage transitions remain valid.

- [ ] **Step 3: Commit tests before implementation**

Use `test: define map-native route comparison contract`.

### Task 5: Implement transient route emphasis through existing route IDs

**Files:**
- Modify the route-choice card/rail component to emit preview/emphasis callbacks.
- Modify planner composition/view model types to carry `previewRouteId: string | null` and callbacks.
- Modify map workspace/rendering adapter to style the preview route separately from the selected route.

**Interfaces:**
- Produces:
  - `onPreviewRoute(routeId: string | null): void`
  - preview state must not mutate deterministic route selection.

- [ ] **Step 1: Add preview state at the planner composition boundary**

Keep preview ephemeral and reset it when candidates change.

- [ ] **Step 2: Wire pointer hover and keyboard focus from route cards**

Use the same route ID callback for `mouseenter/focus` and clear on `mouseleave/blur`.

- [ ] **Step 3: Render preview geometry with stronger map emphasis**

Selected route remains authoritative; preview should visually rise above alternatives without hiding them.

- [ ] **Step 4: Run component tests and commit**

Use `feat: highlight route candidates from planner cards`.

### Task 6: Implement geometry-driven explicit selection

**Files:**
- Modify map route layer interaction handling.
- Modify planner command/view model wiring as needed.

**Interfaces:**
- Consumes existing candidate IDs encoded on route geometry/layers.
- Produces explicit `onSelectRoute(candidateId)` only for IDs currently in the route comparison set.

- [ ] **Step 1: Make alternate route geometries pointer/touch interactive**

Attach candidate IDs to hit-testable route layers using existing map library primitives; do not create a second route model.

- [ ] **Step 2: Validate the ID against current candidates before selection**

Unknown/stale IDs are ignored.

- [ ] **Step 3: On click/tap, call the same explicit route selection command used by route cards**

No hidden reroute or provider call.

- [ ] **Step 4: Run E2E test and commit**

Use `feat: select route alternatives directly on the map`.

### Task 7: Add rider-centered route deltas

**Files:**
- Create a focused comparison helper if no existing helper cleanly computes deltas.
- Modify route card summary UI and tests.

**Interfaces:**
- Consumes deterministic route metrics already available on candidate summaries.
- Produces concise deltas relative to the currently selected/recommended baseline, e.g. `+18 min`, `+24% gravel`, `+12 curve score` when those metrics exist.

- [ ] **Step 1: Write unit tests for signed delta formatting**

Cover positive, negative, unavailable, and negligible differences.

- [ ] **Step 2: Implement pure delta helper**

Never fabricate unavailable surface/curve data; omit missing dimensions.

- [ ] **Step 3: Render at most the most useful 2–3 deltas per alternate card**

Prioritize ride time, road/surface character, and curve/fun signal over generic implementation metrics.

- [ ] **Step 4: Run tests and commit**

Use `feat: show rider-centered route deltas`.

### Task 8: Link Gravel Goblin recommendations to deterministic map objects

**Files:**
- Modify `RideAdvisor.tsx`/props and planner composition wiring.
- Modify component/E2E tests.

**Interfaces:**
- Consumes `RouteSecondOpinion.wouldPick` candidate ID already validated by the resolver.
- Produces `Preview on map` and/or `Show route` behavior through the same preview/select callbacks as route cards.

- [ ] **Step 1: Write failing test that Goblin preview does not select automatically**

Hover/focus/tap-preview may emphasize the recommended route; selected route must remain unchanged until rider presses `Show route`.

- [ ] **Step 2: Wire Goblin recommendation to preview callback**

Only validated current candidate IDs are allowed.

- [ ] **Step 3: Keep `Show route` as the explicit selection action**

Reuse the existing selection callback.

- [ ] **Step 4: Commit**

Use `feat: connect Gravel Goblin picks to map comparison`.

### Task 9: Visual and accessibility QA for map-native comparison

**Files:**
- Modify styles/tests only as evidence requires.

**Interfaces:**
- Produces keyboard, pointer, and touch-legible route comparison on desktop and phone.

- [ ] **Step 1: Run desktop interaction screenshots**

Capture selected route, hovered/focused alternate, and Goblin-recommended alternate.

- [ ] **Step 2: Run phone interaction screenshots**

Confirm route tap targets and map hit regions are usable without hover.

- [ ] **Step 3: Verify contrast and non-color cues**

Selection/preview must not depend solely on hue; use stroke width/opacity/card state/accessibility attributes as applicable.

- [ ] **Step 4: Run full exact-head CI**

Require lint, typecheck, unit, build, PWA, rider journeys, real-router, and visual checks.

### Task 10: Open the stacked map-native comparison PR

**Files:**
- PR metadata only.

**Interfaces:**
- Base: final `ux/planner-workspace-hierarchy` head/branch (#58).
- Head: a new feature branch created only after Task 3 is complete.

- [ ] **Step 1: Branch from #58's final exact head**

Use a distinct branch such as `ux/map-native-route-comparison`.

- [ ] **Step 2: Open a draft stacked PR**

Describe route-card ↔ map bidirectional interaction, deterministic candidate-ID boundary, delta semantics, Gravel Goblin integration, and exact-head verification.

- [ ] **Step 3: Keep both PRs unmerged**

#58 remains draft per user request; the comparison PR is also draft until its own exact-head visual/functional QA is complete.
