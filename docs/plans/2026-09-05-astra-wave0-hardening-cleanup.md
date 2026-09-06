# Astra Wave 0 Hardening & Cleanup Implementation Plan

> **Scope:** Close proven Wave 0 correctness and maintainability debt on `implement/astra-wave-0` without broad refactors, unrelated product-wave work, deployment, or merge.

## Goal

Leave PR #63 with one clear advisor request contract, verified Home/selection semantics, synchronized Astra evidence, and exact-head CI evidence. Preserve the already-green rider behavior unless a focused reproducer proves a defect.

## Baseline

- Branch: `implement/astra-wave-0`
- PR: #63 against `ux/map-native-route-sculpting`
- Known-good head before this cleanup: `77c49c98e2dfe2cfa741c60ea4b8e78809903d81`
- GitHub Actions run #505 is green across verify, build, Vitest, visual, real-router, PWA, critical rider journeys, Advisor Chromium, WebKit, and road-lock.
- No production deployment or merge is part of this plan.

## Design boundaries

1. **Single request-contract authority.** Advisor body bytes and transcript-turn limits belong in `src/lib/advice/request-limits.ts`; client and server consume the same exported constants.
2. **Evidence before status changes.** Home destination and automatic route-selection items are only marked resolved if existing code and tests demonstrate end-to-end behavior; otherwise add a focused failing test first and make the smallest fix.
3. **No speculative component refactors.** `RideAdvisor.tsx` and planner state are changed only for a demonstrated bug or duplicated authority with a regression contract.
4. **Docs describe exact evidence.** `ASTRA-STATE.md`, Wave 0 review evidence, and PR #63 must distinguish closed correctness findings from remaining product/release gates.
5. **Exact-head verification.** Any code change invalidates run #505 as final evidence. The new head must pass the same CI lanes before completion is claimed.

## Task 1 — Verify Home destination and route-selection ownership

**Files to inspect**
- `src/lib/ai/ride-intent.ts`
- `src/lib/ai/planner-location.ts`
- `src/hooks/usePlannerHome.ts`
- planner shell/store selection code and associated tests
- Home/intent/selection unit and E2E tests

**Steps**
1. Trace explicit `Home` intent from parser output to saved-home resolution and planner application.
2. Verify Home is not inferred from the current route destination.
3. Trace automatic candidate selection and verify a valid default/Best candidate stays visibly selected when multiple candidates exist.
4. If either behavior is missing, add the narrowest failing regression test and confirm it fails for the intended reason.
5. Apply only the minimal production fix and rerun the focused contract.
6. If behavior is already correct and covered, make no production change; record the evidence in the Wave 0 docs.

## Task 2 — Remove duplicated advisor transcript-limit authority

**Files**
- `src/lib/advice/request-limits.ts`
- `src/app/api/advisor/route.ts`
- `src/lib/client/advisor-client.ts`
- `tests/unit/advisor-request-budget.test.ts`
- relevant route validation tests if needed

**Contract**
- Export `MAX_ADVISOR_CONVERSATION_TURNS = 12` beside `MAX_ADVISOR_BODY_BYTES`.
- Server schema uses the shared turn limit.
- Client trimming uses the same shared turn limit.
- Remove client-only `MAX_POSTED_CONVERSATION` authority.
- Existing byte-bound and newest-message preservation behavior must remain unchanged.

**TDD sequence**
1. Change/add the focused test to import the shared turn-limit constant and assert trimming against it.
2. Confirm RED because the shared export does not yet exist.
3. Add the shared constant and wire server/client to it.
4. Confirm focused GREEN.
5. Run lint and typecheck before broader verification.

## Task 3 — Reconcile stale Astra evidence and state

**Files**
- `docs/astra/ASTRA-STATE.md`
- `docs/astra/evidence/wave0/review.md`

**Steps**
1. Replace stale “uncommitted” and in-flight retry/history language with the committed state.
2. Record exact green evidence from run #505 as the pre-cleanup baseline, then replace it with the new exact-head run if code changes.
3. Use accurate test counts from the final run.
4. Remove stale agent-ownership notes that no longer describe active work.
5. Close only findings actually demonstrated by code/tests.
6. Keep unresolved product/release gates explicit: responsive/physical-device evidence, reload/session continuity, Free Ride continuity, intent-wide undo, editable shapes/sketches, typed AI proposal breadth, route-specific offline recovery, and any other still-unverified gates.
7. Preserve `DO NOT SHIP`/wave-incomplete language unless all documented release gates are actually satisfied.

## Task 4 — Refresh PR #63 evidence

**Steps**
1. Update PR description from provisional/expected language to exact fixes and verification.
2. Include RED evidence only where it represents intentional regression contracts.
3. Include final exact-head SHA and CI run.
4. Keep PR draft unless the implementation itself reaches its documented ready-for-review boundary; do not merge.

## Task 5 — Adversarial final review

**Review targets**
- PR #63 complete diff against its stacked base
- request-limit contract and tests
- Home/selection evidence
- failure rollback semantics
- PA DEP/PASDA provenance and access-boundary wording
- CI workflow change enforcing Advisor E2E
- docs vs actual code/CI state

**Checks**
1. Look for accidental churn, competing constants, stale comments, misleading truth claims, dead exports, and weakened tests.
2. Do not convert harmless style preferences into cleanup work.
3. Any newly found correctness issue gets a focused reproducer before a fix.

## Task 6 — Final exact-head verification

Expected gates after the final code commit:

```bash
npm run lint
npm run typecheck
npm test -- --reporter=dot
npm run build
```

GitHub Actions must also complete the existing PR matrix:
- visual regression matrix
- real-router browser checks
- PWA build/smoke
- critical rider journeys in Chromium
- Advisor browser contract in Chromium
- WebKit compatibility smoke
- road-lock regression

## Completion criteria

- One shared advisor transcript-turn constant; no competing client/server authority.
- Explicit Home and default selection are either verified and documented or fixed with focused regressions.
- Retry, body-budget, surface-truth, provenance, and access-boundary contracts remain green.
- Astra state/review and PR description match the final code and exact-head CI.
- Final PR diff has been adversarially reviewed.
- Final exact-head CI is green.
- PR remains unmerged and production remains untouched unless separately requested.
