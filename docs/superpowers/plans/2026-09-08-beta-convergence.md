# Switchback Beta Convergence — First Wave Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Land the canonical map authority, close high-confidence planner truth risks, and create the first smaller planner orchestration seam without changing routing algorithms or launching another feature wave.

**Architecture:** Preserve the existing RideIntent/store, planning coordinator, routing planner, provider APIs and UI composition. Integrate map presentation first, use red-green tests to prove/fix state-truth mismatches, then extract planning orchestration from `PlannerShell` behind a focused model/command boundary with no intended visual behavior change.

**Tech Stack:** Next.js 16.3.3, React 19.2.7, TypeScript 6.0.3, Zustand 5, Vitest 4.1, Playwright 1.61, GraphHopper real-router fixture, Node >=24.

**Spec:** `docs/beta/BETA-CONVERGENCE.md`

## Global Constraints

- `AGENTS.md`, ADRs, and current code truth outrank this plan.
- No second RideIntent/planner authority.
- No routing/scoring/provider rewrite.
- No visual redesign in behavior-neutral extraction commits.
- Unknown evidence remains unknown.
- Do not weaken dependency-audit policy or tests to pass a gate.
- Use isolated worktrees for writing agents; do not share writable checkouts.
- One task/PR may be rejected while neighboring tasks survive.

---

### Task 1: Resolve PR #82 integration gate

**Files:**
- Modify only as required by the confirmed dependency advisory: `package.json`, lockfile, dependency-audit workflow/policy file if the policy itself is proven wrong.
- Existing PR #82 files remain owned by that PR.

**Interfaces:**
- Consumes: current npm dependency tree and exact CI audit command.
- Produces: classified advisory and exact-head #82 rerun.

- [ ] **Step 1: Reproduce the dependency failure on the exact #82 head**

```bash
PATH=/root/.n/bin:$PATH
node --version
npm ci
# Run the exact dependency-audit command from .github/workflows/quality.yml.
```

Expected: reproduce the same moderate+ advisory or prove the CI failure was transient/environmental.

- [ ] **Step 2: Record the dependency path and fixed-version options**

```bash
npm ls <affected-package>
npm view <affected-package> versions --json
```

Record whether the package is direct/transitive, runtime/dev-only, reachable in Switchback, and whether a patch/minor-compatible fixed version exists.

- [ ] **Step 3: Apply the smallest supported fix**

Preferred order:
1. compatible direct patch/minor upgrade;
2. compatible transitive resolution/override already allowed by the package manager;
3. documented temporary risk acceptance only when no patched compatible version exists and owner explicitly accepts it.

Do not lower audit severity.

- [ ] **Step 4: Verify dependency and core gates**

```bash
PATH=/root/.n/bin:$PATH
npm ci
npm run verify:install-scripts
# exact dependency audit command
npm run lint
npm run typecheck
npm test
npm run build
```

Expected: PASS or one explicitly documented unresolved advisory requiring owner decision.

- [ ] **Step 5: Rebase #82 onto current main and run its relevant gates**

```bash
git fetch origin
git rebase origin/main
npm run qa:pr
npm run test:e2e:real-router
```

Also run the repository's visual and map-specific test project used by PR #82.

- [ ] **Step 6: Adversarial review before merge**

Verify:
- Road/Terrain/Satellite persistence;
- old Standard/Terrain/Satellite/Topo map-pack migration;
- no duplicate basemap layer controls;
- Mapbox Standard Satellite does not receive unsupported config keys;
- 844x390 viewport/route fit uses map-canvas measurement;
- #83 `MapStylePreview` still renders correctly.

- [ ] **Step 7: Merge only the exact reviewed/green head**

Record merged SHA in `docs/beta` checkpoint/PR body.

---

### Task 2: Add planner intent-coherence regression tests

**Files:**
- Create: `tests/components/planner-intent-coherence.test.tsx` if no current focused test file cleanly owns all cases.
- Reference: `src/components/planner/usePlannerRideIntent.ts`
- Reference: `src/stores/planner-store.ts`
- Reference: `src/lib/planner/ride-plan-request.ts`
- Reference: planner option/control component exposing toll state.

**Interfaces:**
- Consumes: real canonical store command behavior and request builder.
- Produces: red/green contracts for whole-ride prompt edits.

- [ ] **Step 1: Write RED toll-policy coherence test**

Test setup concept:

```ts
it("commits explicit toll avoidance into the same ride revision it routes", async () => {
  // Seed a destination ride that currently allows tolls.
  // Submit: "avoid tolls to New Hope" through the actual intent hook/surface seam.
  // Capture the route request.
  // Assert store RideIntent.tollPolicy === "avoid".
  // Assert captured request.tollPolicy === "avoid".
  // Assert one Undo restores "allow-with-warning".
})
```

Use current repository fixtures/mocks rather than inventing a second request harness.

- [ ] **Step 2: Run focused test and confirm RED for the intended mismatch**

```bash
PATH=/root/.n/bin:$PATH npx vitest run tests/components/planner-intent-coherence.test.tsx
```

If it passes, record toll coherence as already correct and do not modify production code for it.

- [ ] **Step 3: Write RED stale-segment-profile test**

```ts
it("does not carry per-leg styles into a fresh prompt with different point topology", async () => {
  // Seed destination start/via/finish with valid per-leg styles.
  // Submit a fresh natural-language destination or loop request.
  // Capture the next route request.
  // Assert segmentProfiles are absent or exactly points.length - 1.
})
```

- [ ] **Step 4: Run focused test and confirm actual behavior**

```bash
PATH=/root/.n/bin:$PATH npx vitest run tests/components/planner-intent-coherence.test.tsx
```

- [ ] **Step 5: Fix only confirmed defects in one compound RideIntent edit**

If toll is red, add `tollPolicy: intent.tollPolicy` to the same prompt-derived `editRide` transaction.

If segment styles are red, clear/rederive `segmentProfiles` in that same new-prompt transaction rather than patching only the outgoing request.

The canonical state and request must agree.

- [ ] **Step 6: Add Undo/redo and unrelated-field preservation cases**

Assert prompt-derived changes are one revision and preserve unrelated hard constraints unless the prompt explicitly changes them.

- [ ] **Step 7: Verify**

```bash
PATH=/root/.n/bin:$PATH npx vitest run tests/components/planner-intent-coherence.test.tsx
npm run typecheck
npm run lint
npm run test:e2e:critical
```

Expected: PASS.

---

### Task 3: Make route roles factually authoritative

**Files:**
- Modify: `src/components/planner/v2/RouteDecisionCard.tsx`
- Test: use existing route-decision-card test if present; otherwise create `tests/components/route-decision-card.test.tsx`.

**Interfaces:**
- Consumes: `PlannedRoute[]`, selected route id, measurable route fields.
- Produces: factual rider-facing role labels.

- [ ] **Step 1: Write RED test for false `Best Ride`**

```ts
it("does not call an unselected scenic route Best Ride solely because of profile", () => {
  // Candidate A is selected by the deterministic result.
  // Candidate B has profile scenic/adventure but is not selected.
  // Assert B role !== "Best Ride".
})
```

- [ ] **Step 2: Run focused test**

```bash
PATH=/root/.n/bin:$PATH npx vitest run tests/components/route-decision-card.test.tsx
```

Expected: RED if the current profile heuristic controls `Best Ride`.

- [ ] **Step 3: Implement factual role resolution**

Rules:
- `Fastest Now` only from minimum eligible duration within the supplied set;
- `Maximum Twisties` only from the measured maximum with current threshold/tie semantics;
- `Best Ride` only when the route corresponds to the canonical selected/best candidate presented by the planner;
- otherwise use a factual character label already derivable from evidence, not provider ordinals.

If the current props do not expose enough authority to know the canonical best route, extend the presentation helper with the smallest explicit input; do not infer it from profile.

- [ ] **Step 4: Add ties/unknown-surface tests**

No role may depend on unknown evidence being treated as zero/clean.

- [ ] **Step 5: Verify**

```bash
PATH=/root/.n/bin:$PATH npx vitest run tests/components/route-decision-card.test.tsx
npm run typecheck
npm run lint
```

Then run the planner visual route-choice state without updating snapshots. Review the actual screenshot before any baseline change.

---

### Task 4: Make recorded duration provenance explicit

**Files:**
- Modify: `src/components/rides/rides-view-model.ts`
- Modify: `src/components/rides/RidesSurface.tsx` type only if required.
- Modify: `src/components/rides/RideListRow.tsx` only if display needs source/unknown treatment.
- Test: existing Rides view-model tests or create `tests/components/rides-view-model.test.ts`.

**Interfaces:**
- Produces one truthful duration value/source for each browse item.

- [ ] **Step 1: Write RED invalid-timestamp test**

```ts
it("does not present planned route duration as actual recorded elapsed time", () => {
  // Recorded ride has invalid/missing startedAt/endedAt and route.durationMinutes > 0.
  // Normalize into RideLibraryItem.
  // Assert duration source is not "recorded"; use "planned" fallback explicitly or unknown.
})
```

- [ ] **Step 2: Run focused test**

```bash
PATH=/root/.n/bin:$PATH npx vitest run tests/components/rides-view-model.test.ts
```

- [ ] **Step 3: Add minimal duration provenance**

Prefer a bounded shape such as:

```ts
type RideDuration = {
  minutes: number | null
  source: "recorded" | "planned" | "estimated" | "unknown"
}
```

Only adopt this exact shape if it fits current types; do not create a second route-facts model that will conflict with BETA-030. If a simpler existing provenance field exists, use it.

- [ ] **Step 4: Keep row copy compact**

Do not add permanent provenance badges to every row unless user testing shows they help. The primary requirement is that internal/read-model semantics are truthful and details can expose provenance.

- [ ] **Step 5: Verify Rides component/unit tests and typecheck/lint**

```bash
PATH=/root/.n/bin:$PATH npx vitest run tests/components --reporter=dot
npm run typecheck
npm run lint
```

---

### Task 5: Extract planning orchestration from `PlannerShell` with no intended behavior change

**Files:**
- Modify: `src/components/planner/PlannerShell.tsx`
- Create: `src/components/planner/usePlanningController.ts` or the closest existing client/planner naming convention.
- Modify: `src/components/planner/PlannerDeckViewModel.ts` only if the new controller needs an explicit already-existing command grouping.
- Test: create/focus `tests/components/planning-controller.test.tsx` only for lifecycle seams not already pinned by coordinator/store tests.
- Reuse existing planner/recovery E2E tests.

**Interfaces:**
- Consumes: `LatestRequestGate`, existing planning-session/coordinator, canonical planner store, request builder, notice callback.
- Produces:

```ts
interface PlanningController {
  model: {
    phase: PlanningPhase
    isRecalculating: boolean
  }
  commands: {
    plan(): Promise<TripPlan | null>
    replanAfterIntentEdit(): void
    replanAfterHistoryMove(): void
    cancel(): void
  }
}
```

Names may follow current conventions; responsibility may not expand beyond the planning lifecycle.

- [ ] **Step 1: Characterize current behavior before extraction**

Focused tests must cover:
- ordinary plan;
- rapid intent edits coalesce into one later replan;
- history undo/redo can replan without an already displayed route;
- cancel prevents late result mutation;
- recovered intent replans once;
- failed update leaves last usable committed route semantics intact.

Run current tests first and record pass/fail.

- [ ] **Step 2: Move `handlePlan` request orchestration into the controller without changing request contents**

The controller reads the current canonical store at execution time and calls the existing planning session/coordinator. Do not copy routing logic.

- [ ] **Step 3: Move replan timer ownership into the same controller**

There must be one coalescing timer and it must be cleared on unmount/cancel.

- [ ] **Step 4: Move history/intent replan helpers**

Keep their existing semantic distinction:
- history movement restores authored intent and replans whenever routable;
- ordinary edit auto-replans only when there is already a route to improve.

- [ ] **Step 5: Keep PlannerShell as composition**

PlannerShell receives/calls controller commands and retains unrelated library/map/Free Ride/advisor ownership for now. Do not opportunistically extract those in this task.

- [ ] **Step 6: Verify behavior-neutrality**

```bash
PATH=/root/.n/bin:$PATH
npx vitest run tests/components/planning-controller.test.tsx
npm run typecheck
npm run lint
npm run test:e2e:critical
# focused planner + ride-recovery Playwright specs
```

Visual planner baselines must remain unchanged. If visuals change, treat it as a defect in this structural task.

- [ ] **Step 7: Commit extraction independently**

Do not combine with PlanComposer prop cleanup or planner redesign.

---

### Task 6: Rebaseline beta control plane after first-wave merges

**Files:**
- Modify: `docs/beta/README.md`
- Modify: `docs/beta/BETA-CONVERGENCE.md`
- Modify: `docs/beta/AGENT-TASKS.md` only for status/dependency changes.

- [ ] **Step 1: Record exact new main SHA and merged PRs**
- [ ] **Step 2: Close/supersede completed task entries without erasing evidence**
- [ ] **Step 3: Re-score next tasks based on newly exposed failures**
- [ ] **Step 4: Choose one next product lane: canonical Rides facts OR map interaction ownership; do not start both if they edit overlapping planner/map files**

**Exit:** the next Opus session can start from one unambiguous task rather than replaying this audit.

## Self-review

- Spec coverage: integrates #82, closes four high-confidence truth risks, and creates the first autonomous planner seam; broader Rides/Discover/Free Ride work remains in `docs/beta/AGENT-TASKS.md` by design.
- Placeholder scan: no task uses `TODO/TBD` as an implementation instruction.
- Type consistency: this plan reuses current `PlanningPhase`, `TripPlan`, canonical planner store and request coordinator types; the example controller is intentionally bounded and may be named to match local convention without changing responsibility.
