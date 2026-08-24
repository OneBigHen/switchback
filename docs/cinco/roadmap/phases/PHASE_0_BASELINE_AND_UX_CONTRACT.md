# Phase 0 — Baseline and UX Contract

## Goal
Create the evidence and state model necessary to change UX without losing proven behavior.

## Deliverables
1. Record starting main SHA.
2. Record current required tests and baseline status.
3. Capture current representative screenshots.
4. Define screen-state fixtures for:
   - home,
   - route loading,
   - route selected,
   - alternatives,
   - route detail,
   - route edit,
   - ride,
   - off-route/recovery,
   - Free Ride idle,
   - Free Ride suggestion,
   - map provider failure.
5. Add or stabilize deterministic viewport fixtures.
6. Create a short `docs/cinco/UX_STATE_CONTRACT.md`.
7. Do not intentionally redesign the application in this phase.

## Required target viewports
At minimum:
- 390x844 phone portrait
- 844x390 phone landscape
- 768x1024 tablet portrait
- 1024x768 tablet landscape
- 1440x900 desktop

Use existing Playwright project structure where possible.

## UX state fixture requirement
Each state must be constructible deterministically in tests without relying on live external services.

Prefer existing fixtures/mocks. Do not create a second unrelated test harness.

## Visual test rule
Stabilize time/theme/location inputs rather than accepting random screenshot drift.

## Acceptance criteria
- `npm run lint` passes.
- `npm run typecheck` passes.
- targeted tests pass.
- critical E2E still passes.
- screenshots can be reproduced.
- no material planner/routing behavior changed.
- PR explains exactly which visual drift was made deterministic.

## Do not
- add Mapbox;
- split large files yet unless needed for test seams;
- rename product concepts broadly;
- update visual snapshots merely to make the job green.
