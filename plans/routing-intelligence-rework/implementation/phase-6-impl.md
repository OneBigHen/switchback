---
type: planning
entity: implementation-plan
plan: "routing-intelligence-rework"
phase: 6
status: draft
created: "2026-07-22"
updated: "2026-07-22"
---

# Implementation Plan: Phase 6 - Free-Text Preservation and Loading UX

> Implements [Phase 6](../phases/phase-6.md) of [routing-intelligence-rework](../plan.md)

## Approach

Replace the split intent/routing indicators with one planner lifecycle controller. Submit the primary request first, render it immediately, then start optional alternatives/research and merge them without changing the rider's selection. Preserve the previous route during replan and expose Cancel everywhere the free-text request can be submitted.

## Affected Modules

| Module | Change Type | Description |
|--------|-------------|-------------|
| `src/components/planner/usePlannerRideIntent.ts` | modify | Preference-complete local-first prompt flow |
| `src/lib/client/trip-planning-coordinator.ts` | modify | Lifecycle, primary, alternatives, and cancellation |
| `src/stores/planner-store.ts` | modify | Progress and retained-route state |
| `src/components/planner/PlannerDeck.tsx` | modify | Visible progress and Cancel |
| `src/components/planner/PlannerShell.tsx` | modify | Controller integration and progressive merging |
| `src/components/planner/PlannerDeckViewModel.ts` | modify | Typed lifecycle/evidence commands and state |
| `src/components/planner/MapStage.tsx` / map source helpers | modify | Retained/dimmed prior geometry during replan |
| `src/app/styles/planner-controls.css` / scoped planner styles | modify | Existing-language progress, retained-route, and mobile states |
| `tests/components/`, `tests/unit/`, `tests/e2e/` | modify/create | Lifecycle, progressive merge, map retention, accessibility, and browser coverage |

## Required Context

| File | Why |
|------|-----|
| `src/components/planner/usePlannerRideIntent.ts` | Sets intent idle immediately before routing and omits preferences |
| `src/components/planner/PlannerDeck.tsx` | Omnibox spinner tracks only interpretation; routing spinner is editor-only |
| `src/stores/planner-store.ts` | `beginRouting` clears the current plan |
| `src/lib/client/trip-planning-coordinator.ts` | Phase 2 progressive/cancellation behavior |
| `src/components/planner/PlannerDeckViewModel.ts` | Typed boundary for view and commands |
| `tests/components/planner-shell-geocoding.test.tsx` | Existing free-text and place-resolution behavior |

## Implementation Steps

### Step 1: Create one planner lifecycle state

- **What**: Model interpreting, geocoding, primary routing, alternatives, ready, cancelled, and error with an elapsed start time and cancellability.
- **Where**: Planner store/view model or a dedicated lifecycle controller consumed by them.
- **Why**: Two unrelated status flags currently create a dead-looking interval.
- **Considerations**: Persist no transient controllers/status; old saved planner state must migrate cleanly.

### Step 2: Make free-text local-first and preference-complete

- **What**: Use the local parser immediately for confident prompts; invoke remote interpretation only when ambiguity requires it; resolve independent endpoints concurrently; preserve all route-affecting state.
- **Where**: `usePlannerRideIntent`, prompt flow, and request builder call.
- **Why**: Simple prompts should not wait for AI and must not erase rider constraints.
- **Considerations**: Location permission remains sequential when it is required to bias destination search; do not partially commit failed endpoint resolution.

### Step 3: Render primary then alternatives

- **What**: Generate one UUID `planningId`, submit the locked primary wire request, apply it immediately, then submit the same normalized request plus the primary ID and ≤128-point sampled geometry as the locked alternatives request; merge only an echoed-current `planningId` and preserve selected ID.
- **Where**: Client coordinator, PlannerShell, and store actions.
- **Why**: The route becomes usable before optional work completes.
- **Considerations**: Stale alternative responses are ignored and aborted; routes over 85% overlap with any accepted route are discarded; an empty successful alternative set is final, not an error.

### Step 4: Retain the previous route during replanning

- **What**: Keep prior geometry visible with a recalculating/dimmed presentation until new primary success; restore it on failure/cancel.
- **Where**: Store transition and MapStage/PlannerDeck props/styles.
- **Why**: Clearing the map makes latency feel worse and removes useful context.
- **Considerations**: Clearly distinguish stale geometry and prevent starting navigation on it during an active replan.

### Step 5: Add continuous visible and accessible feedback

- **What**: Keep omnibox activity visible, add plain-language phase text, elapsed time, and Cancel in expanded/minimized/mobile/desktop states.
- **Where**: PlannerDeck and scoped existing planner styles.
- **Why**: Users currently see no loading indication during the route request.
- **Considerations**: Announce phase changes via live region without announcing every elapsed-second update.

## Testing Plan

| Test Type | What to Test | Expected Outcome |
|-----------|-------------|-----------------|
| Unit/component | Lifecycle states | Correct transitions, cancellation, recovery, and no persistence |
| Component | Omnibox/minimized planner | Spinner/status/Cancel visible throughout active work |
| Component | Progressive results | Primary first; alternatives merge without selection change |
| Integration | Golden free-text flow | Duration/preferences preserved and exact phases shown |
| Browser | Desktop/mobile/landscape | No blocked controls, lost status, or inaccessible Cancel |

Primary verify command:

```bash
npm test -- --run tests/components/planner-deck.test.tsx tests/components/planner-shell-geocoding.test.tsx tests/unit/planner-store.test.ts tests/unit/trip-planning-coordinator.test.ts && npx playwright test tests/e2e/planner-routing-progress.spec.ts && git diff --check
```

### Test Integrity Constraints

- Existing failed-geocode behavior must remain atomic; do not mutate half the route before every required place resolves.
- Do not hide loading tests behind the expanded route editor; assert the normal omnibox and minimized surfaces.
- Do not delete current clear-route, replan, offline-pack, or start-route action assertions.

## Rollback Strategy

Revert the Phase 6 merge commit; Phase 2 API still returns valid primary results through the previous planner UI.

## Open Decisions

| Decision | Options | Chosen | Rationale |
|----------|---------|--------|-----------|
| Replan display | blank/retain previous | retain and dim previous | Better continuity and perceived performance |
| Alternative selection | automatic/preserve primary | preserve primary | Background work must not surprise the rider |
| AI interpretation | always/local-first | local-first, ambiguity-only remote | Faster and more deterministic common prompts |
| Progress transport | server stream/client phases | client lifecycle phases | Works with separate primary/alternatives requests |

## Reality Check

### Code Anchors Used

| File | Symbol/Area | Why it matters |
|------|-------------|----------------|
| `src/components/planner/usePlannerRideIntent.ts` | `setIntentStatus("idle")` before `runTripPlan` | Spinner ends before slow work starts |
| `src/components/planner/PlannerDeck.tsx` | omnibox and action-dock spinners | Routing feedback is not visible in default flow |
| `src/stores/planner-store.ts` | `beginRouting` | Clears the current route immediately |
| `src/components/planner/PlannerShell.tsx` | `runTripPlan` and command wiring | Central integration point for new lifecycle |

### Mismatches / Notes

- The current planner has routing status, but it is not presented where the free-text user is looking; this is a presentation/state-integration bug, not total absence of state.
- This phase must use existing visual language and avoid reskinning.
