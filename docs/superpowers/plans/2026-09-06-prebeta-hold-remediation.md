# Pre-Beta HOLD Remediation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove the software blockers from the 2026-09-06 pre-beta audit without merging PRs #66 or #68, then rerun the same release gates before inviting riders.

**Architecture:** Keep the existing ride-history/result-identity model and make its `hasUnappliedChange` contract visible at every startable surface. Treat named prompt locality as explicit origin, treat severe timebox misses as non-startable until accepted, keep sketch drafts owned by the map until routing succeeds, and make phone overlays share one usable-map clearance. Advisor context must come from the same canonical planner/result state. Production must expose build identity so black-box behavior can be mapped to source.

**Tech Stack:** Next.js, React, TypeScript, Zustand, Vitest, Playwright, MapLibre/Mapbox adapters.

**Spec:** `docs/quality/sessions/2026-09-06-prebeta-agentic-audit.md`

## Global Constraints

- Do not merge PR #66 or PR #68 wholesale; reimplement only verified changes needed by this plan.
- No snapshot rebaselining to hide regressions.
- A visible route may remain as recovery context, but Start/Offline actions must never imply it answers unapplied intent.
- A requested duration miss greater than the planner tolerance must not be presented as an ordinary ready-to-start ride.
- Named loop locality must never fall through to the Harrisburg fallback.
- Draw mode must always have a visible and keyboard-reachable exit.
- Physical iPhone/PWA/GPS/background/degraded-cellular/sunlight/gloves/vibration/real-road/screen-reader gates remain separate release gates.

---

### Task 1: Named locality and route readiness

**Files:**
- Modify: `src/lib/ai/ride-intent.ts`
- Modify: `src/components/planner/v2/RouteDecisionCard.tsx`
- Modify: `src/components/planner/PlannerDeck.tsx`
- Test: existing ride-intent, route-decision, planner-deck suites

**Interfaces:**
- Produces: loop prompts such as `90-minute scenic loop near Austin` set `startQuery="Austin"`.
- Produces: severe loop timebox misses expose a durable mismatch and require explicit acceptance before Start.

- [ ] Add failing parser coverage for `loop near Austin` and `90-minute scenic loop near Austin`.
- [ ] Implement bounded `near/around` loop-origin extraction while excluding `near me`.
- [ ] Add failing route-card/deck coverage for a severe timebox miss.
- [ ] Show requested-versus-achieved duration and gate Start behind explicit acceptance.
- [ ] Run focused Vitest and planner E2E.

### Task 2: Canonical recovery and Advisor grounding

**Files:**
- Modify: `src/stores/planner-store.ts`
- Modify: `src/components/planner/PlannerDeck.tsx`
- Modify: `src/components/planner/v2/RideAdvisor.tsx` and/or its route-context caller
- Test: planner-store, planner-deck, advisor browser contract, recovery E2E

**Interfaces:**
- Consumes: existing `committedRide`, result identity, and `rideHistory.hasUnappliedChange` signal.
- Produces: old route is labelled recovery context and cannot be started while current intent is unapplied.

- [ ] Add combined change/cancel/offline/undo visible-state regressions.
- [ ] Fence Start and Offline pack whenever `hasUnappliedChange` is true.
- [ ] Make Cancel restore the committed intent and settle its displayed-route identity coherently.
- [ ] Ground Advisor context/proposals in canonical planner intent plus current visible answer only.
- [ ] Run focused unit and advisor/recovery E2E.

### Task 3: Drawing resilience and mobile usable-map layout

**Files:**
- Modify: `src/app/styles/map-placement.css`
- Modify: `src/components/planner/v2/SketchRouteToolbar.tsx`
- Modify: `src/components/planner/v2/SketchRouteToolbar.module.css`
- Modify: `src/components/planner/map-stage-props.ts`
- Modify: `src/components/planner/PlannerMapStage.tsx`
- Modify: `src/components/planner/PlannerShell.tsx`
- Test: sketch toolbar, map placement, mobile Playwright

**Interfaces:**
- Produces: `onRouteSketch(trace)` returns an explicit success/failure result.
- Produces: raw sketch persists on routing failure and is discarded only on success or explicit Cancel.

- [ ] Port the verified usable-map-floor behavior from PR #68 without merging it.
- [ ] Add Escape cancellation for sketch mode and an explicit accessible alternative to pointer drawing.
- [ ] Change sketch submission boundary to await routing outcome; preserve line on failure.
- [ ] Assert portrait and short-landscape toolbar/attribution containment.
- [ ] Run component, mobile Chromium/WebKit, visual, and real-router checks.

### Task 4: Ride HUD layout and planning progress

**Files:**
- Modify: ride HUD/layout styles and `RideHud.tsx` as needed.
- Modify: `src/components/planner/v2/PlanComposer.tsx` only if lifecycle status needs stronger placement/copy.
- Test: denied-GPS mobile geometry and delayed-route lifecycle E2E.

- [ ] Add 320/390/430 denied-GPS overlap assertions.
- [ ] Give recovery/status/telemetry/attribution one ordered mobile layout region.
- [ ] Keep lifecycle phase in a live status region adjacent to controls for the entire request.
- [ ] Add a bounded long-wait recovery hint without fake percentage progress.
- [ ] Run mobile and accessibility checks.

### Task 5: Non-destructive details, deployment identity, and full release gates

**Files:**
- Modify: diagnostics/build-info surface or endpoint.
- Test: route-choice → details → back/start identity E2E; full release matrix.

- [ ] Add route-identity assertion across open/close details.
- [ ] Expose source/build SHA in runtime diagnostics so public failures map to exact code.
- [ ] Run lint, typecheck, full Vitest, build, critical E2E, full E2E, PWA, real-router, visual without baseline changes, deterministic mobile QA, advisor contract, and memory soak.
- [ ] Record exact-head results in a new quality session report and keep release HOLD if any software or required physical gate remains unproven.
