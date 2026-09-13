# Adaptive Workspace Release Qualification Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close every deterministic #115 qualification gap that can be proven in automation so the final handoff is limited to human UX/device judgment and merge authorization.

**Architecture:** Keep product behavior unchanged unless a qualification test exposes a real defect. Reuse the existing planner fixtures and critical Playwright project, and add only acceptance-oriented tests around adaptive-workspace topology and cross-state interactions. Preserve #114 release isolation until the final human gate explicitly authorizes merge.

**Tech Stack:** Next.js, React, TypeScript, Vitest, Playwright, GitHub Actions.

**Spec:** GitHub issue #115 (`UX V3: adaptive planner workspace for tablet, phone, and desktop`).

## Global Constraints

- Compact `<=760px`, Medium `761..1180px`, Wide `>=1181px` remain the canonical workspace boundaries.
- Do not change routing/provider/advisor trust semantics for this qualification pass.
- Do not loosen visual thresholds, assertions, timeouts, or CI gates to manufacture green.
- Do not blindly rebaseline screenshots.
- No merge until exact-head CI is green and the final human UX/device gate is explicitly approved.

---

### Task 1: Reconcile #115 acceptance coverage

**Files:**
- Read: `tests/e2e/critical/*.spec.ts`
- Read: `tests/e2e/prepare-layout.spec.ts`
- Read: `tests/e2e/ride-recovery.spec.ts`
- Read: `tests/e2e/road-lock.spec.ts`
- Read: `tests/components/route-map-comparison.test.tsx`

**Interfaces:**
- Consumes: the #115 required mission and viewport matrix.
- Produces: a precise list of deterministic gaps that are not already covered elsewhere.

- [ ] **Step 1:** Map destination routing, timed loop, route comparison/preview, edit/prepare, road-lock/avoid, advisor handoff, reload recovery, and viewport coverage to existing tests.
- [ ] **Step 2:** Treat existing focused suites as evidence instead of duplicating them in the adaptive spec.
- [ ] **Step 3:** Identify only cross-topology gaps where the feature is tested but not under Medium adaptive layout.

### Task 2: Expand critical adaptive-workspace regression coverage

**Files:**
- Modify: `tests/e2e/critical/adaptive-workspace.spec.ts`

**Interfaces:**
- Consumes: `uxState`, planner fixtures, `data-workspace-mode`, planner/map geometry.
- Produces: critical CI coverage for representative Compact, Medium and Wide boundaries plus Medium interaction semantics.

- [ ] **Step 1:** Add representative compact/split/wide viewport regression cases: `390x844`, `667x375`, `700x900`, `1366x1024`, `1440x900`.
- [ ] **Step 2:** Assert each reports the correct workspace mode, has no horizontal overflow, keeps map and primary planner surface rendered, and preserves an appropriate map share for its topology.
- [ ] **Step 3:** Add a Medium route-choice journey with three candidates that proves pointer/focus preview does not commit selection, explicit selection does commit, details open/close is non-destructive, and Start Ride remains reachable.
- [ ] **Step 4:** Add a Medium timed-loop journey proving the loop command reaches a route while the map/planner topology remains usable.
- [ ] **Step 5:** Run the critical suite through exact-head CI; fix only genuine defects exposed by these tests.

### Task 3: Final exact-head verification

**Files:**
- No product file changes unless Task 2 exposes a real defect.

**Interfaces:**
- Consumes: branch head after qualification changes.
- Produces: exact-head CI evidence and a clean control-plane handoff.

- [ ] **Step 1:** Require Quality and Mobile Core to pass at the same exact SHA.
- [ ] **Step 2:** Confirm `main` has not moved unexpectedly and the PR is still mergeable with no unresolved review threads.
- [ ] **Step 3:** Record exact run IDs and remaining non-automatable gates on PR #119 and issue #115.
- [ ] **Step 4:** Leave PR draft/unmerged for the human UX/device pass.

### Task 4: Human UX/device handoff

**Files:**
- No repository changes required unless the reviewer finds a defect.

**Interfaces:**
- Consumes: exact green head from Task 3.
- Produces: APPROVE+MERGE or a concrete defect list with screenshots/reproduction steps.

- [ ] **Step 1:** Test the exact PR head on a **physical** tablet-class device and the required phone-class device. Browser or device emulation (Playwright, Chrome device mode, Xcode Simulator) is interim review evidence only and never completes this gate.
  - 2026-09-12: the owner chose to merge the foundation before this gate and to run the full device session after the integration train lands; the gate is recorded as waived, not passed (#128).
- [ ] **Step 2:** Judge clarity, hierarchy, touch ergonomics, map visibility, route comparison, edit/prepare flow, and orientation behavior rather than only checking element presence.
- [ ] **Step 3:** If any material UX defect appears, do not merge; file/fix it and rerun exact-head CI.
- [ ] **Step 4:** If the UX/device pass is clean and current release-control policy permits it, mark PR ready and merge with expected-head protection.
