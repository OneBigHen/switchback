# Gravel Atlas Release Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make PR #123 fail closed across code, generated artifacts, runtime activation, cache identity, and release evidence so a stale or differently-verified Gravel Atlas build cannot ship as current.

**Architecture:** Treat the Atlas as a versioned evidence artifact, not just a SQLite file keyed by graph/source fingerprints. Stamp the end-to-end traversability policy into verification output and runtime metadata, require that identity at read time, and require the complete three-variable runtime configuration before route attraction is enabled. Preserve pre-existing request-contract regression coverage and reconcile documentation with the exact current code and regenerated evidence.

**Tech Stack:** Next.js/TypeScript, Node `node:sqlite`, Vitest, GraphHopper, GitHub Actions.

**Spec:** `docs/operations/GRAVEL_ATLAS_ACTIVATION.md` and PR #123 release evidence.

## Global Constraints

- Pennsylvania remains disabled until its production-use authorization is independently proven.
- Atlas failures must never break ordinary routing, but stale or unproven Atlas evidence must not influence a route or render as confirmed-empty data.
- Runtime activation requires `GRAVEL_ATLAS_DB_PATH`, `GRAVEL_ATLAS_GRAPH_FINGERPRINT`, and `GRAVEL_ATLAS_SOURCE_FINGERPRINT` together.
- Every production behavior change gets a regression test first; no broad refactors.
- Do not merge PR #123 without explicit user authorization.

---

### Task 1: Version the traversability evidence contract

**Files:**
- Modify: `src/lib/roads/gravel-atlas/traversability.ts`
- Modify: `scripts/verify-gravel-atlas-routability.ts`
- Modify: `scripts/build-gravel-atlas-runtime.ts`
- Modify: `src/lib/roads/gravel-atlas/runtime-builder.ts`
- Test: `tests/unit/gravel-atlas-traversability.test.ts`
- Test: `tests/unit/gravel-atlas-runtime-builder.test.ts`
- Test: `tests/unit/gravel-atlas-build-scripts.test.ts`

**Interfaces:**
- Produces: `GRAVEL_ATLAS_TRAVERSABILITY_POLICY_VERSION: number` and a `traversabilityPolicyVersion` field carried from live verification output into runtime metadata.
- Consumes: current graph/source fingerprints and `DEFAULT_TRAVERSABILITY_THRESHOLDS`.

- [ ] **Step 1: Write failing tests** proving an old/missing traversability-policy version cannot be converted into a current runtime DB and that current verification output carries the policy identity.
- [ ] **Step 2: Run the focused tests and verify RED** because the current JSON/runtime contracts contain only graph/source fingerprints.
- [ ] **Step 3: Add the policy version at the verification boundary** and make the runtime builder reject missing/mismatched policy versions. Bump the runtime schema so an old DB cannot masquerade as current after the policy changed.
- [ ] **Step 4: Run the focused tests and verify GREEN.**
- [ ] **Step 5: Commit only this invariant and its tests.**

### Task 2: Make route-time reads validate runtime metadata

**Files:**
- Modify: `src/lib/roads/gravel-atlas/repository.ts`
- Modify: `src/app/api/routes/route.ts`
- Test: `tests/unit/gravel-atlas-repository.test.ts`
- Test: `tests/unit/gravel-atlas-request.test.ts` or the narrowest existing route-config test surface.

**Interfaces:**
- Consumes: current runtime schema/policy identity from Task 1.
- Produces: a route-time query that refuses a database whose metadata does not match the configured graph/source/policy build.

- [ ] **Step 1: Write a failing repository test** where corridor rows have matching graph/source fingerprints but metadata is old or mismatched; `queryBounds` must reject it.
- [ ] **Step 2: Write a failing activation test** showing fingerprints alone do not enable Atlas routing when `GRAVEL_ATLAS_DB_PATH` is absent.
- [ ] **Step 3: Run focused tests and verify RED.**
- [ ] **Step 4: Validate build metadata inside the route-time read path** (prefer one opened SQLite handle per query) and remove the implicit `data/gravel-atlas.sqlite` production fallback from route activation.
- [ ] **Step 5: Run focused tests and verify GREEN, including mismatch/fallback cases.**
- [ ] **Step 6: Commit the activation/read-path fix.**

### Task 3: Restore regression coverage removed by the feature branch

**Files:**
- Modify: `tests/unit/canonical-ride-request.test.ts`

**Interfaces:**
- Consumes: the current `defaultRideIntent` including Gravel Atlas defaults.
- Produces: preserved regression coverage for loop request shape, per-leg styles, planning/request IDs, missing points, and drawn-corridor propagation.

- [ ] **Step 1: Diff this test against `main` and enumerate every pre-existing behavior removed by PR #123.**
- [ ] **Step 2: Restore those tests with only the minimum fixture updates required by the new `gravelAtlas` field.**
- [ ] **Step 3: Run the file and verify all old and new contract tests pass.**
- [ ] **Step 4: Commit the test-coverage restoration independently.**

### Task 4: Reconcile release evidence with the hardened gate

**Files:**
- Modify: `docs/operations/GRAVEL_ATLAS_ACTIVATION.md`
- Modify: `docs/reports/GRAVEL_ATLAS_TRAVERSABILITY_VERIFICATION.md`
- Modify: PR #123 description

**Interfaces:**
- Consumes: exact current thresholds/policy version and regenerated NJ verification output.
- Produces: release documentation whose counts, thresholds, fingerprints, and route examples were actually generated by the current code.

- [ ] **Step 1: Regenerate traversability output against the stamped production-equivalent GraphHopper build using the current 20 m proximity, 60 m endpoint, 80% total, 60% continuous, 85% directional, and 1.5x detour policy.**
- [ ] **Step 2: Rebuild the runtime DB from that newly versioned output; do not reuse the pre-hardening DB.**
- [ ] **Step 3: Repeat the documented A→B and Free Ride probes and record any changed counts/results rather than preserving stale numbers.**
- [ ] **Step 4: Update docs and the PR body so every threshold/count/SHA statement matches the exact current head and generated artifacts.**
- [ ] **Step 5: Commit documentation only after evidence exists.**

### Task 5: Final ship gate

**Files:** no production changes unless a gate exposes another defect.

**Interfaces:**
- Consumes: exact final PR head.
- Produces: an auditable merge-readiness verdict.

- [ ] **Step 1: Run `npm run verify` and the focused Gravel Atlas tests on the exact final head.**
- [ ] **Step 2: Confirm all required GitHub checks are green on that same SHA and there are zero unresolved review threads.**
- [ ] **Step 3: Mark the PR ready for review so draft-skipped reviewers (including CodeRabbit) can run, then resolve any concrete findings with RED→GREEN fixes.**
- [ ] **Step 4: Production-smoke the exact configured DB/fingerprints, including wrong-fingerprint and missing-DB fail-closed probes.**
- [ ] **Step 5: Re-state merge readiness with exact SHAs and remaining external gates. Do not merge without explicit authorization.**
