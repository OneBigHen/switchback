# Beta Release Correctness Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the remaining Gravel Goblin trust blockers, qualify the exact PR #109 head, reconcile recovery/latency follow-ups, and freeze one defensible beta replacement candidate.

**Architecture:** Deterministic routing, place lookup, planner state, and MapLibre sources remain authoritative. Gravel Goblin may classify intent and explain verified results, but cannot manufacture route/POI facts or commit state without planner evidence. Release work stays isolated from UX V3 issue #115.

**Tech Stack:** Next.js, React, TypeScript, Zustand planner state, MapLibre GL, Vitest, Playwright, GitHub Actions.

**Spec:** GitHub issues #114 and #104; active PR #109. Historical handoff head `2ffab9c54446b33facfa590f3c73b13da988a142` passed Quality `34498039614` and Mobile Core `34498039575`; current GitHub truth overrides these values if the branch moves.

## Global Constraints

- Do not merge because CI is green; semantic trust blockers must be proven closed first.
- Use RED -> reproduce -> minimal GREEN -> regression -> independent adversarial review.
- Do not introduce UX V3/adaptive-workspace changes into PR #109.
- Preserve newer rider intent over stale Advisor completion.
- Preserve the current route on failed/unverified route+stop actions.
- No model prose may claim an action, route, POI, road, surface, or map update unless deterministic evidence supports it.
- Do not merge #110, #80, or #81 into this candidate.
- Check disk space before Next/Playwright runs; delete only ignored/generated `.next`, `test-results`, and `playwright-report` output when needed.

---

## File map

Primary implementation surfaces:

- `src/components/planner/PlannerShell.tsx` — canonical compound route+stop transaction and planner handoff.
- `src/components/planner/PlannerComposition.tsx` — presentation command wiring only.
- `src/components/planner/PlannerPresentationBoundary.ts` — typed presentation/command boundary.
- `src/components/planner/map-stage-sources.ts` — authoritative `switchback-routes` GeoJSON source update.
- `src/components/planner/v2/RideAdvisor.tsx` — Advisor client action rendering/execution.
- `src/app/api/advisor/route.ts` — request schema and server-side route evidence ingestion.
- `src/lib/advice/action-policy.ts` — action classification/enforcement and trusted response shaping.
- `src/lib/advice/route-context.ts` — bounded route candidate evidence supplied to the Advisor.
- `tests/unit/advisor-action-policy.test.ts` — action/trust RED/GREEN coverage.
- `tests/components/gravel-goblin-action-routing.test.tsx` — command handoff coverage.
- `tests/e2e/advisor.spec.ts` — end-to-end Advisor/planner/map behavior.

Prefer existing geometry utilities. If no reusable route-near-waypoint helper exists after repository search, create one in the existing routing/geometry utility area rather than embedding distance math in `PlannerShell.tsx`.

---

### Task 1: Prove a compound route actually traverses its grounded stop

**Files:**
- Modify: `src/components/planner/PlannerShell.tsx`
- Modify/create only if needed: existing routing geometry utility module
- Test: `tests/e2e/advisor.spec.ts`
- Test: appropriate routing geometry unit test beside the helper

**Interfaces:**
- Consumes: selected `PlannedRoute.geometry` and the grounded `ProposedStop.anchor` used to build the planner waypoint.
- Produces: deterministic route-through-stop verification used before compound success is committed/reported.

- [ ] **Step 1: Write a deterministic RED browser case.** Stub a successful grounded POI and a materially different planned route whose returned geometry does not pass the requested stop. Assert rejection, preservation of the pre-command route, rollback of tentative Advisor via state, and absence of success copy.
- [ ] **Step 2: Run only that test and prove RED.** Use the existing Advisor Playwright project/configuration; do not add sleeps. Record the failing assertion in the #109 checkpoint.
- [ ] **Step 3: Search existing geometry/snap utilities.** Reuse the canonical distance/snap tolerance already used for waypoint/route matching. If none exists, add a small pure helper such as `routePassesNearWaypoint` with unit tests for on-route, snapped-near-route, and clearly-off-route points. Keep tolerance documented in the utility, not as a magic number in the component.
- [ ] **Step 4: Gate compound success in `handleRouteWithAdvisorStop`.** Existing `routeChanged` evidence remains necessary but insufficient. Require `planned && selected && routeChanged && routePassesNearWaypoint(selected.geometry, stopWaypoint)`. On failure, use the existing rollback/cancel transaction so committed ride, selection, result identity, and newer rider intent are preserved.
- [ ] **Step 5: Run GREEN focused tests.** Run the new browser case, helper unit tests, `tests/unit/advisor-action-policy.test.ts`, `tests/components/gravel-goblin-action-routing.test.tsx`, and the full Advisor E2E file.
- [ ] **Step 6: Commit.** Suggested message: `fix(advisor): require routed stop inclusion evidence`.

---

### Task 2: Prove successful Advisor reroutes reach the actual MapLibre route source

**Files:**
- Inspect/modify only if required for a generic test seam: `src/components/planner/map-stage-sources.ts`, `src/components/planner/PlannerMapStage.tsx`
- Test: `tests/e2e/advisor.spec.ts`
- Test: existing/new unit or integration coverage for `updatePlannerSources`

**Interfaces:**
- Source authority: MapLibre GeoJSON source id `switchback-routes`.
- Production path: `updatePlannerSources()` -> `geoJsonSource(map, "switchback-routes")?.setData(buildRouteFeatures(...))`.

- [ ] **Step 1: Inspect existing E2E/map instrumentation.** Reuse an existing safe map-instance/source inspection facility if present. Route-card text, selected IDs, canvas existence, screenshot color, or React state alone do not satisfy this proof.
- [ ] **Step 2: Write RED source proof.** Capture route-source geometry/digest before an explicit successful Goblin reroute, execute the command, then assert `switchback-routes` receives geometry corresponding to the newly selected canonical route and no longer corresponds to the old route.
- [ ] **Step 3: If no map inspection seam exists, add the smallest generic E2E-only diagnostic.** Expose MapLibre source data/updates generically, disable it outside E2E/test, and keep it free of Goblin-specific business logic. Prefer exposing the source over duplicating route geometry into a second state authority.
- [ ] **Step 4: Add a non-Advisor regression using the same seam if cheap.** Prove ordinary route selection updates the same source.
- [ ] **Step 5: Run focused Chromium and relevant map-source unit/integration tests.** Do not loosen thresholds or blindly rebaseline visuals.
- [ ] **Step 6: Commit.** Suggested message: `test(map): prove advisor reroute reaches route source`.

---

### Task 3: Ground or suppress structured model prose on mutating turns

**Files:**
- Modify: `src/lib/advice/action-policy.ts`
- Modify if needed: `src/components/planner/v2/RideAdvisor.tsx`
- Modify if needed: `src/app/api/advisor/route.ts`
- Test: `tests/unit/advisor-action-policy.test.ts`
- Test: `tests/e2e/advisor.spec.ts`

**Interfaces:**
- Consumes: validated route evidence, grounded place evidence, deterministic metrics/facts, and raw provider/model response.
- Produces: rider-facing action copy containing only evidence-entailable facts; unsupported nested rationale/reasons/cautions are dropped or rebuilt.

- [ ] **Step 1: Add adversarial RED fixtures.** Return structurally valid actions containing invented businesses, roads, towns, surface percentages, closures, or route claims inside `message`, `reason`, `rationale`, `cautions`, summaries, or similar nested fields.
- [ ] **Step 2: Assert unsupported clauses do not survive a mutating action.** Outer action validity must not confer trust on arbitrary nested prose.
- [ ] **Step 3: Centralize trusted action copy shaping.** Build mutating-turn text from deterministic validated evidence already available to action enforcement. Drop unsupported fields rather than regex-scrubbing every possible hallucination. Preserve ordinary non-mutating conversation subject to existing action/capability guardrails.
- [ ] **Step 4: Preserve concise response behavior.** Keep the existing <=80-word target and avoid repeating metrics already carried by UI cards unless needed to explain the choice.
- [ ] **Step 5: Run the full action-policy unit corpus plus Advisor E2E.** Include degraded place lookup, routing failure, identical route candidate, stale completion, exploratory questions, and explicit stop-only actions.
- [ ] **Step 6: Commit.** Suggested message: `fix(advisor): derive action copy from trusted evidence`.

---

### Task 4: Exact-head qualification and independent review of PR #109

**Files:** no intended product changes; only fix newly reproduced root causes.

- [ ] **Step 1: Record exact PR head SHA and clean worktree.** Run `git status --short`, `git rev-parse HEAD`, `git rev-parse origin/fix/goblin-action-routing-104`, and `gh pr view 109`.
- [ ] **Step 2: Run focused local gates.** Advisor action-policy unit tests, Goblin component tests, complete Advisor E2E, map-source proof, typecheck, and targeted lint.
- [ ] **Step 3: Run/observe full repository gates.** Protected contexts include `typecheck`, `lint`, `vitest`, `build`, `critical-e2e`, `pwa`, `road-lock`, `real-router`, and `visual`.
- [ ] **Step 4: Require fresh exact-head GitHub Quality and Mobile Core success.** Previous green runs become stale after any push.
- [ ] **Step 5: Run an independent adversarial review against exact head.** Reviewer explicitly examines stop inclusion, map-source evidence, stale rider-intent fencing, non-mutating classification, server candidate geometry verification, and structured-prose grounding.
- [ ] **Step 6: Only if zero material blockers remain, mark #109 ready and merge with expected-head protection.** Close #104 with exact test/run/merge evidence and update #114.

---

### Task 5: Reconcile PR #111 recovery truth after #109 lands

**Files:** PR #111 currently changes two files; inspect its exact diff after rebase before editing.

- [ ] **Step 1: Rebase `fix/beta-recovery-copy` onto newly qualified main.** Do not assume old head `fa7974a` is current enough.
- [ ] **Step 2: Reproduce the prior `navigator.serviceWorker.ready` timeout from a clean environment.** Classify infrastructure/config/environment versus product defect before modifying product code.
- [ ] **Step 3: If infrastructure-only, fix the harness/config and prove the original recovery behavior independently.** Do not solve by merely increasing a timeout.
- [ ] **Step 4: If product behavior is wrong, write RED for truthful restore copy/state, make the smallest product fix, then GREEN it.**
- [ ] **Step 5: Obtain fresh exact-head Quality/Mobile Core evidence before any merge decision and update #114.**

---

### Task 6: Resolve PR #113 as diagnostic evidence, not speculative behavior

**Files:** PR #113 is test-only and historically changed one file.

- [ ] **Step 1: Rebase or replay its deterministic latency/cancellation tests on current main.**
- [ ] **Step 2: Decide whether the tests add durable regression value without creating false timing contracts.** Historical public spot checks did not reproduce the 45–80 second delay and did not justify a production timeout.
- [ ] **Step 3: If useful, keep only deterministic cancellation/progressive-settlement coverage and qualify it normally. If not useful, record the evidence in #114 and close/supersede the draft without a product change.**

---

### Task 7: Freeze and qualify the beta replacement candidate

- [ ] **Step 1: Reconcile local `main`, `origin/main`, and GitHub main; require a clean tree and one exact SHA.**
- [ ] **Step 2: Freeze that SHA as the replacement candidate in #114.** Do not keep landing unrelated changes after freeze.
- [ ] **Step 3: Run complete exact-candidate automation and required protected checks.**
- [ ] **Step 4: Deploy that exact SHA and verify the deployed build/SHA marker and `/api/health`.**
- [ ] **Step 5: Run focused deployed black-box missions, fresh eight-mission Luna human-style QA, physical iPhone gate, and real motorcycle ride gate.** Record NOT RUN explicitly where hardware/ride cannot actually be performed.
- [ ] **Step 6: Update #114 with READY/HOLD based only on evidence.** Do not declare READY if any release gate is missing.
