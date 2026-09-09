# Beta Remediation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove the confirmed c918584 beta blockers and trust defects without opening another architecture or UX wave.

**Architecture:** Keep each unrelated root cause in its own focused PR. Preserve canonical RideIntent, existing recording state authority, and Advisor route facts; fixes should strengthen identity/state invariants at their current seams rather than adding parallel state.

**Tech Stack:** Next.js 16, React 19, TypeScript, Zustand, Vitest, Playwright.

**Spec:** `docs/quality/evidence/2026-09-09-c918584-luna/COORDINATOR-REPORT.md`

## Global Constraints

- Work RED-first and confirm every new regression test fails for the reported reason before production code changes.
- Do not hardcode Lancaster, New Hope, or Pennsylvania-specific product behavior.
- Do not weaken existing visual budgets or branch-protection checks.
- Do not treat browser-emulation evidence as physical iPhone evidence.
- Do not change the save flow or hidden accessibility-target findings that the coordinator did not reproduce.
- Keep unrelated root causes in independently reviewable commits/PRs.

---

### Task 1: Preserve named-place identity

**Files:**
- Modify: `tests/unit/ride-prompt-flow.test.ts`
- Modify: `src/lib/planner/ride-prompt-flow.ts`

**Interfaces:**
- Consumes: `PlaceResult`, `GeocoderBias`, `resolveRidePromptWaypoints`.
- Produces: deterministic place selection where semantic name/entity identity outranks proximity, and proximity only breaks equivalent candidates.

- [x] **Step 1: Write failing tests** for a locality competing with a closer street/POI, equivalent locality tie-breaking, and a specific address.
- [ ] **Step 2: Run CI and confirm RED** on the locality identity cases.
- [ ] **Step 3: Implement minimal semantic candidate ranking** at `selectRidePromptPlace`.
- [ ] **Step 4: Run focused and full exact-head gates.**
- [ ] **Step 5: Merge only after exact-head CI is green.**

### Task 2: Make recording permission denial recoverable

**Files:**
- Modify: `tests/unit/recording-session.test.ts` and/or existing recording component tests
- Modify: `src/lib/client/recording-session.ts`
- Modify: `src/components/shell/useRecordingSession.ts`
- Modify: `src/components/shell/RideRecordingHud.tsx`
- Modify: `src/components/planner/PlannerShell.tsx` only if the mount predicate requires it

**Interfaces:**
- Consumes: `RecordingSessionState`, `RecordingSessionController`.
- Produces: a denied/error recording session that stays controllable, can retry GPS without creating a second session, and can finish/discard safely.

- [ ] **Step 1: Write failing denied/error continuity tests.**
- [ ] **Step 2: Confirm RED for the map-only/ignored-finish behavior.**
- [ ] **Step 3: Add the smallest session-continuity/retry transition and keep the HUD mounted.**
- [ ] **Step 4: Verify retry, finish, discard, recovery, and successful-GPS paths.**
- [ ] **Step 5: Run exact-head gates and merge independently.**

### Task 3: Prevent impossible Advisor percentages

**Files:**
- Test/modify the exact Advisor progress/fact module identified during root-cause tracing.

**Interfaces:**
- Consumes: canonical route surface facts.
- Produces: rider-facing progress facts whose percentage denominator is valid and bounded to the actual fact domain.

- [ ] **Step 1: Trace the `240% unpaved` value to its source.**
- [ ] **Step 2: Write a failing route-context regression.**
- [ ] **Step 3: Fix the source calculation or suppress incomplete facts; do not cosmetically clamp invalid data.**
- [ ] **Step 4: Run exact-head gates and merge independently.**

### Task 4: Repair confirmed medium consistency defects

**Files:**
- Bike Undo: planner store/handler and focused history tests.
- Import labeling: `src/components/rides/rides-view-model.ts`, row/filter tests.
- Offline copy: exact recovery view-model/component identified from Mission 5 evidence.
- Short landscape: exact planner scroll/layout CSS plus a 667x375 focused browser/visual test.

- [ ] **Step 1: Reproduce each defect independently before editing production code.**
- [ ] **Step 2: Fix bike-profile Undo at the canonical ride-history seam.**
- [ ] **Step 3: Make imported card label/count/filter semantics agree.**
- [ ] **Step 4: Give recovered-offline state one truthful copy hierarchy.**
- [ ] **Step 5: Fix the 667x375 scroll owner without changing normal portrait/landscape layout.**
- [ ] **Step 6: Run exact-head gates for each focused PR.**

### Task 5: Investigate repeated alternatives latency

**Files:**
- No production file is named until controlled timing reproduces the problem.

- [ ] **Step 1: Add controlled timing evidence around progressive alternatives.**
- [ ] **Step 2: Determine whether delay is provider latency, missing timeout/fallback, or presentation state.**
- [ ] **Step 3: Only if a deterministic root cause exists, write RED coverage and implement a bounded fix.**
- [ ] **Step 4: Otherwise retain it as qualification evidence rather than guessing.**

## Final qualification

- [ ] Merge all independently green remediation PRs.
- [ ] Deploy one new exact `main` SHA.
- [ ] Verify public SHA marker and `/api/health`.
- [ ] Re-run focused black-box cases for place identity, GPS denial/retry, and Advisor facts.
- [ ] Run the full fresh Luna suite only after focused cases pass.
- [ ] Keep physical iPhone status NOT RUN until the replacement deployed candidate clears black-box qualification.
