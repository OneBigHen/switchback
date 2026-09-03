# Planner Command Surface UX Upgrade Implementation Plan

> **Goal:** Reclaim map/planner space, make the route planner read as one coherent command surface, move route-editing semantics into deliberate contextual UI, and preserve existing routing/state contracts.

**Architecture:** Keep `PlannerShell`, planner store, routing providers, route sketch conversion, road-lock domain model, and map renderer authoritative. Refactor presentation and commands at `PlannerDeck` / `PlanComposer` / `PlanOptions`, then narrow the map-stage editing chrome so always-visible controls remain truly map-global. Prefer existing callbacks and state over a second editor state machine.

**Tech:** Next.js 16, React 19, TypeScript, Zustand, Phosphor icons, Vitest + Testing Library, Playwright.

## Task 1 — Collapse idle planner chrome into one command surface

**Files:**
- Modify: `tests/components/plan-composer.test.tsx`
- Modify: `tests/components/planner-deck.test.tsx`
- Modify: `src/components/planner/PlannerDeck.tsx`
- Modify: `src/components/planner/v2/PlanComposer.tsx`
- Modify: `src/app/styles/plan-v2.css`
- Modify: `src/app/styles/planner-deck.css`

**Behavior:**
- Idle desktop/half-sheet planner does not spend a dedicated row on the `Search` stage chip.
- Search/voice/location remains the first interaction.
- Destination / Loop / Draw, Free Ride, and `Ride options` read as one command cluster.
- Planning lifecycle progress stays visible when work is actually in flight.
- Peek/minimized state can retain concise route/planner context.

**TDD:** Update component tests first so old `Options` and idle `Search` chrome expectations fail; then implement the minimum presentation changes.

## Task 2 — Separate ride setup from route editing language

**Files:**
- Modify: `tests/components/plan-options.test.tsx`
- Modify: `src/components/planner/v2/PlanOptions.tsx`
- Modify: `src/components/planner/v2/PlanComposer.tsx`
- Modify: `src/app/styles/plan-v2.css`

**Behavior:**
- Disclosure is named `Ride options` rather than generic `Options`.
- Route points/geometry is presented as `Edit route`, not an implementation-centric `Geometry` section.
- Road-lock UI uses rider semantics: `Prefer a road` when strict road requirements are disabled; `Preferred / required roads` only when requirements are actually available.
- Avoidance status is phrased as exclusions and provides explicit management/clear affordance.
- Route personality, bike, timing, editing, and advanced leg controls remain progressive and are not duplicated in the compact surface.

**TDD:** Update semantic queries in `plan-options` tests first, verify the branch CI catches the old labels, then change production copy/grouping.

## Task 3 — Make map editing chrome contextual

**Files:**
- Modify: `tests/components/map-stage.test.tsx`
- Modify: `tests/components/sketch-route-toolbar.test.tsx` if toolbar contract changes
- Modify: `src/components/planner/PlannerMapStage.tsx`
- Modify: `src/components/planner/v2/SketchRouteToolbar.tsx` if needed
- Modify: `src/app/styles/map-stage-road-locks.css`
- Modify: `src/app/styles/map-placement.css` as needed

**Behavior:**
- Layers/recenter remain map-global.
- Route sketch, road preference, and avoid-area actions do not present as equal always-on map utilities.
- Active draw/avoid/road-preference mode gets a compact, explicit instruction surface with a clear cancel path.
- Existing freehand trace → route intent behavior is preserved; drawing does not require a separately entered destination.
- Existing rectangular exclusion geometry remains the domain contract in this PR unless a safe existing editing primitive supports more; UX must not imply polygon editing that the model cannot persist.

**TDD:** Assert the visible/control-state contract first, then move/gate chrome without changing routing math.

## Task 4 — Tighten desktop/mobile layout and accessibility

**Files:**
- Modify: `src/app/styles/plan-v2.css`
- Modify: `src/app/styles/planner-deck.css`
- Modify: `src/app/styles/planner-shell.css` only where needed
- Modify: relevant component tests and/or `tests/e2e/*` focused planner specs

**Behavior:**
- Desktop uses one compact action row where width permits and wraps predictably at narrow widths.
- Mobile preserves 44px+ touch targets and bottom-sheet detents.
- No white-on-white/dark-theme regressions.
- Focus-visible, `aria-expanded`, Escape cancellation, disabled states, and map viewport obstruction remain correct.

## Task 5 — Verification and PR

1. Run focused component tests for planner composer/options/deck/map stage.
2. Run `npm run lint` and `npm run typecheck`.
3. Run full `npm test`.
4. Run critical Playwright coverage and build (`npm run qa:pr` when CI lane allows).
5. Compare branch vs `main` to ensure no routing/provider/domain changes slipped in.
6. Open a draft PR with scope, verification evidence, screenshots/artifacts if CI supplies them, and explicit non-goals.
7. Review the PR diff before marking ready; do not merge automatically.
