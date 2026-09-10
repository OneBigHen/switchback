# Adaptive Planner Workspace V3 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace Switchback's binary phone/desktop responsive behavior with deliberate compact, medium, and wide planner workspaces, making tablets first-class without changing routing/business truth.

**Architecture:** One canonical workspace-mode authority drives composition and map insets. Compact retains the contextual bottom-sheet model; medium introduces persistent tablet planner/inspector + map compositions; wide becomes a bounded/resizable spatial workspace. Existing planner state, routing, route selection, recording, recovery, and Advisor trust contracts remain authoritative and are consumed by presentation rather than reimplemented.

**Tech Stack:** Next.js, React, TypeScript, CSS, Zustand planner state, MapLibre GL, Vitest, Playwright.

**Spec:** GitHub issue #115. Work remains isolated from release issue #114 and PR #109 until release isolation is explicitly lifted.

## Global Constraints

- Use a dedicated isolated worktree/branch, suggested `ux/adaptive-workspace-v3`, from current qualified `main`; never base it on PR #109.
- Do not merge UX V3 into the active beta candidate while #114 remains HOLD.
- No UA/device sniffing; layout is based on available application width and orientation/geometry where needed.
- Do not create a second planner/routing/store/advisor/recovery authority.
- Compact phone behavior, including short landscape, must remain supported.
- Solve topology and scroll ownership before visual polish.
- Use visible pointer/touch interactions in browser tests; avoid Playwright auto-scroll artifacts.
- Check disk space before screenshot/build/Playwright work and remove only ignored/generated output when needed.

---

## File map

Primary existing surfaces:

- `src/components/planner/PlannerComposition.tsx` — planner presentation composition.
- `src/components/planner/PlannerDeck.tsx` — Search/Choose/Edit/Prepare deck and current sheet state.
- `src/components/planner/PlannerShell.tsx` — large canonical state/orchestration component; avoid growing it with layout logic.
- `src/components/planner/PlannerMapStage.tsx` — map stage; avoid growing it with independent responsive rules.
- `src/components/planner/workspace/ContextSheet.tsx` — compact vertical sheet behavior.
- `src/components/planner/workspace/context-sheet-state.ts` — sheet detent state.
- `src/components/planner/workspace/map-viewport-insets.ts` — map camera/content insets.
- `src/app/styles/breakpoints.css` — current breakpoint contract.
- `src/app/styles/planner-shell.css`, `planner-deck.css`, `plan-v2.css`, `planner-action-dock.css`, `map-placement.css`, `route-comparison.css` — layout/presentation styles.
- `tests/e2e/short-landscape-geometry.spec.ts` — visible-pointer short-landscape regression semantics.
- `tests/e2e/planner.spec.ts`, `prepare-layout.spec.ts`, `advisor.spec.ts`, and visual/critical/mobile suites — regression coverage.

New focused boundaries:

- Create: `src/components/planner/workspace/workspace-mode.ts`
- Create: `src/components/planner/workspace/AdaptivePlannerWorkspace.tsx` unless repository inspection finds an existing equivalent boundary that should be extended.
- Create: `tests/e2e/adaptive-workspace.spec.ts`

---

### Task 1: Capture current-main baseline evidence before layout changes

**Files:**
- Create: one timestamped evidence directory under the existing `docs/quality/sessions/` convention.
- Create: baseline screenshots and a measurement manifest there.
- No product changes.

- [ ] **Step 1: Verify exact base.** Record `git rev-parse HEAD`, `git rev-parse origin/main`, clean status, branch/worktree list, and `df -h`.
- [ ] **Step 2: Capture Search, Choose, Edit, and Prepare on current main at `390x844`, `667x375`, `768x1024`, `820x1180`, `1024x768`, `1180x820`, `1366x1024`, and `1440x900`.**
- [ ] **Step 3: Record geometry.** For each state/viewport record map rect, planner rect, primary-action rect, scroll-owner rect(s), attribution, native map controls, layer control, notices, horizontal overflow, collisions, and meaningful map-visible area.
- [ ] **Step 4: Run `.claude/skills/impeccable` audit/layout guidance against the captured states and write a concise defect inventory sorted by rider impact.**
- [ ] **Step 5: Commit baseline evidence separately.** Suggested message: `test(ux): capture adaptive workspace baseline`.

---

### Task 2: Add one canonical workspace-mode authority

**Files:**
- Create: `src/components/planner/workspace/workspace-mode.ts`
- Test: nearest existing workspace/component unit-test area; create focused coverage if none exists.
- Modify: `src/app/styles/breakpoints.css` only to align the documented CSS contract with the same boundaries.

**Interfaces:**

```ts
type WorkspaceMode = "compact" | "medium" | "wide"

function resolveWorkspaceMode(width: number): WorkspaceMode
```

Initial contract:

- compact: `width <= 760`
- medium: `761 <= width && width <= 1180`
- wide: `width >= 1181`

- [ ] **Step 1: Write RED boundary tests.** Assert 390/667/760 => compact, 761/768/820/1024/1180 => medium, and 1181/1366/1440 => wide.
- [ ] **Step 2: Implement the pure resolver and exported constants.** Do not introduce UA checks.
- [ ] **Step 3: Run GREEN unit tests and typecheck.**
- [ ] **Step 4: Search for component-local `(max-width: 760px)` topology decisions.** Migrate React/TS layout branching that controls planner topology to the canonical authority. CSS media queries may remain for styling when they match the same documented boundaries.
- [ ] **Step 5: Commit.** Suggested message: `refactor(ux): centralize planner workspace modes`.

---

### Task 3: Introduce adaptive composition without moving business logic

**Files:**
- Create: `src/components/planner/workspace/AdaptivePlannerWorkspace.tsx`
- Modify: `src/components/planner/PlannerComposition.tsx`
- Modify: `src/components/planner/PlannerDeck.tsx`
- Modify: `src/components/planner/workspace/ContextSheet.tsx` only as needed to scope it to compact behavior.
- Modify: `src/components/planner/workspace/map-viewport-insets.ts`
- Modify: relevant planner CSS.

**Interfaces:**
- Consumes existing presentation model/commands, planner stage/state, map content, inspector/deck content, and primary-action surfaces.
- Produces layout composition only. It must not call routing providers, mutate canonical planner state directly, persist ride state, implement recovery, or enforce Advisor evidence.

- [ ] **Step 1: Write RED geometry assertions for medium portrait and landscape.** At `820x1180` and `1180x820`, ordinary Search/Choose/Prepare must show both a materially visible map and a persistent planner/action region without using compact half/full sheet behavior.
- [ ] **Step 2: Implement compact topology by delegating to existing `ContextSheet`.** Preserve `peek/half/full` semantics only in compact mode.
- [ ] **Step 3: Implement medium portrait.** Use a persistent map region plus persistent planner/inspector region; routine states must not require a full-screen planner overlay and the primary action must remain reachable.
- [ ] **Step 4: Implement medium landscape.** Use a bounded left planner/inspector and right live map; target roughly 35–40% planning / 60–65% map with min/max constraints rather than a fixed desktop card.
- [ ] **Step 5: Implement wide composition.** Preserve navigation rail where present and use a bounded/resizable planner region, live map, and optional contextual inspector. Avoid resize persistence unless an existing canonical pattern already supports it.
- [ ] **Step 6: Drive `map-viewport-insets.ts` from the same workspace geometry.** Route fitting, waypoint fitting, attribution, and map controls must agree with occupied pane area.
- [ ] **Step 7: Run focused geometry E2E, typecheck, and the existing short-landscape regression.**
- [ ] **Step 8: Commit.** Suggested message: `feat(ux): add adaptive planner workspace`.

---

### Task 4: Rebuild Search/Choose/Edit/Prepare hierarchy inside the new topology

**Files:**
- Modify: `src/components/planner/PlannerDeck.tsx`
- Modify: current route-comparison component(s).
- Modify: `src/app/styles/planner-deck.css`, `plan-v2.css`, `planner-action-dock.css`, `route-comparison.css` as needed.
- Test: `tests/e2e/adaptive-workspace.spec.ts` and existing planner/prepare tests.

- [ ] **Step 1: Search state.** Make destination/loop intent and Plan dominant. Move Road Locks, avoidance, profile tuning, layers/weather/evidence/offline/community diagnostics behind contextual or secondary affordances without removing them.
- [ ] **Step 2: Choose state.** Present compact route alternatives as a master list on medium/wide. Keep key facts glanceable and deeper metrics progressively disclosed.
- [ ] **Step 3: Edit state.** Keep map context visible while editing waypoints/profile/locks. Do not force ordinary tablet editing into full-screen overlays.
- [ ] **Step 4: Prepare state.** Stabilize selected route identity, core facts, and one primary Start Ride action. Details/offline/save/share remain subordinate but discoverable.
- [ ] **Step 5: Assert one dominant primary action per state.** Avoid multiple equal-weight orange CTAs and nested action bars competing for attention.
- [ ] **Step 6: Run planner, prepare-layout, road-lock, and focused adaptive E2E.**
- [ ] **Step 7: Commit.** Suggested message: `feat(ux): clarify planner state hierarchy`.

---

### Task 5: Make route comparison map-synchronized master/detail on medium and wide

**Files:**
- Modify: current route-comparison component(s)
- Modify: `PlannerDeck.tsx` / `PlannerComposition.tsx` only for presentation wiring.
- Test: `tests/e2e/adaptive-workspace.spec.ts`

**Interfaces:**
- Preview uses existing `previewRouteId` semantics and remains ephemeral/non-persistent.
- Commit uses the existing canonical route-selection callback/path.

- [ ] **Step 1: RED test preview versus commit.** Pointer/focus/tap on an alternative changes map preview without changing the committed selected route; activation commits through the canonical selection path.
- [ ] **Step 2: Implement compact alternative rows/cards suited to a persistent pane.** Let the map carry spatial comparison instead of duplicating every detail in each card.
- [ ] **Step 3: Preserve keyboard/touch equivalence.** Focus preview must not trap keyboard navigation; touch must have an explicit commit action rather than hover-only semantics.
- [ ] **Step 4: GREEN test at medium portrait, medium landscape, and wide desktop.**
- [ ] **Step 5: Commit.** Suggested message: `feat(ux): sync route comparison with live map`.

---

### Task 6: Place Gravel Goblin contextually without weakening Advisor trust

**Files:**
- Modify: presentation/composition surfaces only after PR #109 has merged or its canonical callbacks are otherwise explicitly settled.
- Test: `tests/e2e/adaptive-workspace.spec.ts` plus existing `tests/e2e/advisor.spec.ts`.

- [ ] **Step 1: Rebase UX branch after #109 merges before touching Goblin composition.** If #109 remains open, leave this task pending rather than duplicating its contracts.
- [ ] **Step 2: On medium/wide, render Goblin in a contextual inspector/pane or bounded workspace surface that does not obscure the whole map for ordinary conversation.**
- [ ] **Step 3: Preserve conversation while Search/Choose/Edit/Prepare state changes.**
- [ ] **Step 4: Preserve #109 action callbacks/evidence gates exactly.** UX code may invoke existing commands; it may not reinterpret model evidence or mutate planner state through a new path.
- [ ] **Step 5: Run existing Advisor correctness E2E unchanged plus new tablet placement tests.**
- [ ] **Step 6: Commit.** Suggested message: `feat(ux): integrate contextual gravel goblin`.

---

### Task 7: Deterministic responsive/tablet qualification

**Files:**
- Create/extend: `tests/e2e/adaptive-workspace.spec.ts`
- Add intentional visual evidence under existing quality-session conventions.

Required viewports:

- `390x844`
- `667x375`
- `700x900` narrow split-window fallback
- `768x1024`
- `820x1180`
- `1024x768`
- `1180x820`
- `1366x1024`
- `1440x900`

Required tablet missions:

1. Destination route from empty state.
2. Timed loop.
3. Compare at least three alternatives; preview then select.
4. Edit route/profile/waypoint and replan.
5. Prepare: inspect details, save/offline where supported, reach Start Ride.
6. Road Locks / avoid-area flow.
7. Gravel Goblin suggestion and trusted route-change handoff after #109 integration.
8. Reload/recovery state.

- [ ] **Step 1: Assert zero horizontal document overflow at every viewport.**
- [ ] **Step 2: Assert exactly the intended scroll owner per surface and no nested scroll trap blocks the primary action.**
- [ ] **Step 3: Assert map attribution, map controls, layers, notices, safe areas, route dock, and navigation rail do not collide.**
- [ ] **Step 4: Assert the map remains materially visible during normal tablet Search/Choose/Edit/Prepare work.**
- [ ] **Step 5: Assert details open/close is non-destructive and orientation/resize preserves canonical ride state.**
- [ ] **Step 6: Run compact phone, short-landscape, desktop, critical, mobile, PWA, road-lock, real-router, Advisor, and visual gates.**
- [ ] **Step 7: Commit qualification/evidence separately.** Suggested message: `test(ux): qualify adaptive planner workspace`.

---

### Task 8: Visual polish after topology is proven

**Files:** relevant planner CSS/components only; no business-logic refactor for styling convenience.

- [ ] **Step 1: Run `.claude/skills/impeccable` critique/audit/layout/polish guidance against the GREEN topology.**
- [ ] **Step 2: Reduce card-on-card chrome, borders, duplicate headings, and dead space. Improve typography hierarchy, spacing rhythm, density, and route-fact glanceability.**
- [ ] **Step 3: Use Switchback orange primarily for action/selection/state rather than decoration. Keep the map visually dominant.**
- [ ] **Step 4: Add restrained motion only where it communicates pane/state transition and respect reduced-motion behavior.**
- [ ] **Step 5: Capture before/after screenshots for `820x1180`, `1180x820`, `390x844`, and `1440x900`.** Do not blindly rebaseline snapshots or loosen thresholds.
- [ ] **Step 6: Run full relevant gates again and commit.** Suggested message: `style(ux): polish adaptive planner hierarchy`.

---

### Task 9: Open a draft UX PR and hold merge

- [ ] **Step 1: Rebase on stable current main only after release correctness merges are settled enough to avoid churn.**
- [ ] **Step 2: Open a DRAFT PR referencing #115 with architecture summary, exact head SHA, changed files, before/after evidence, exact test commands/results, and known remaining UX findings.**
- [ ] **Step 3: Explicitly state that the PR is excluded from the #114 beta replacement candidate until release isolation is lifted.**
- [ ] **Step 4: Require human visual review of tablet portrait and landscape before merge.**
- [ ] **Step 5: If physical iPad/tablet hardware is unavailable, record that gate as NOT RUN rather than simulating it as passed.**
