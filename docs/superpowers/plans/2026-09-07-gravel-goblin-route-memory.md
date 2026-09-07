# Gravel Goblin Route Memory Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add grounded recorded-ride retrieval, learned rider preferences, and easy model swapping while preserving Switchback's deterministic routing boundary.

**Architecture:** Build a compact deterministic `RideFingerprint` from existing route evidence, aggregate fingerprints into a confidence-aware learned profile, and expose that memory to the existing Gravel Goblin/planner flow. Keep the current `AdvisorProvider` abstraction and add logical model configuration slots rather than another gateway.

**Tech Stack:** TypeScript 6, Vitest 4, React 19/Next 16, existing GraphHopper/Valhalla routing and advisor providers.

**Spec:** `docs/GRAVEL-GOBLIN-ROUTE-MEMORY-SPEC.md`

## Global Constraints

- No model-authored geometry or raw GraphHopper custom-model JSON.
- No vector database, LangGraph, new MCP orchestration stack, or model gateway.
- Unknown route evidence remains unknown.
- Existing bike/access/closure constraints outrank learned preference.
- Every behavior change follows red-green TDD and a stage-specific adversarial gate.
- Each stage remains independently reversible.

---

### Task 1: Ride fingerprints and learned profile

**Files:**
- Create: `src/lib/rides/ride-memory.ts`
- Test: `tests/unit/ride-memory.test.ts`

**Interfaces:**
- Consumes: `PlannedRoute`, `RidePreferenceVector`.
- Produces: `fingerprintPlannedRoute(route, metadata?)`, `deriveLearnedRiderProfile(fingerprints, baseline)`.

- [ ] **Step 1: Write failing tests** for measured twistiness/elevation, explicit unknown surface/road evidence, robust aggregation, baseline preservation, bounded values, and monotonic confidence.
- [ ] **Step 2: Run CI and verify RED** because `@/lib/rides/ride-memory` does not exist.
- [ ] **Step 3: Implement minimal deterministic fingerprinting and aggregation** using only existing `PlannedRoute` evidence. Use median/trimmed evidence aggregation rather than allowing one outlier to dominate.
- [ ] **Step 4: Run focused/unit CI and verify GREEN.**
- [ ] **Step 5: Adversarial review gate:** inspect the implementation for fabricated evidence, sparse-corpus overconfidence, NaN/out-of-range inputs, and order dependence. Add a regression test for every confirmed issue before fixing it.
- [ ] **Step 6: Record value proof** in the PR body: fixture showing a metadata-identical pair of rides that becomes distinguishable by measured character.

### Task 2: Recorded-ride query and ranking

**Files:**
- Create: `src/lib/rides/ride-memory-search.ts`
- Test: `tests/unit/ride-memory-search.test.ts`
- Reference only: `feat/recorded-rides-route-intelligence:src/lib/rides/ride-library-search.ts`

**Interfaces:**
- Consumes: compact ride documents plus optional `RideFingerprint`.
- Produces: `parseRideMemoryQuery(query)`, `searchRideMemory(documents, query)` returning only real documents/ids.

- [ ] **Step 1: Write failing tests** for mileage/duration/source/region terms plus twistiness, gravel and highway constraints.
- [ ] **Step 2: Run CI and verify RED.**
- [ ] **Step 3: Implement deterministic parser and ranking.** Positive evidence filters must reject unknown evidence; contradictory constraints must return no result without silent relaxation.
- [ ] **Step 4: Run focused/unit CI and verify GREEN.**
- [ ] **Step 5: Adversarial review gate:** attack negation, contradictory ranges, unknown evidence, duplicate ids, empty corpus, punctuation/case, and tie ordering; regression-test confirmed defects.
- [ ] **Step 6: Value proof:** compare against the old metadata-only fixture and show that character-aware queries select the correct ride while still issuing zero model/network calls.

### Task 3: Learned preference merge for New Ride

**Files:**
- Modify: `src/lib/ai/ride-preferences.ts`
- Test: `tests/unit/advisor-ride-preferences.test.ts`

**Interfaces:**
- Consumes: current intent vector, `LearnedRiderProfile`, and explicit axes touched by the current rider turn.
- Produces: `mergeLearnedRidePreferences(current, learned, explicitAxes)`.

- [ ] **Step 1: Write failing tests** proving explicit edits win, unlearned axes remain exact, history cannot produce values outside `0..1`, and merge is deterministic.
- [ ] **Step 2: Run CI and verify RED.**
- [ ] **Step 3: Implement minimal merge**; only axes marked learned may replace the baseline, and current-turn explicit axes always win.
- [ ] **Step 4: Run focused/unit CI and verify GREEN.**
- [ ] **Step 5: Adversarial review gate:** attempt to smuggle safety/access policy through the preference vector. Verify the function has no geometry/provider-policy inputs and cannot alter hard constraints.
- [ ] **Step 6: Value proof:** fixture where a vague 'two hour ride' inherits measured rider character but 'less gravel' still overrides history.

### Task 4: Model slots and Goblin eval fixtures

**Files:**
- Create: `src/lib/advice/model-slots.ts`
- Create: `tests/unit/advisor-model-slots.test.ts`
- Create: `tests/fixtures/gravel-goblin-evals.ts`
- Create: `docs/GRAVEL-GOBLIN-EVALS.md`

**Interfaces:**
- Produces: provider-neutral logical model-slot resolver for `intent`, `goblin`, `reasoning`, `maps`; fixed eval-case schema usable by provider bake-offs.

- [ ] **Step 1: Write failing tests** proving model ids are configuration-driven and defaults preserve the existing provider choices.
- [ ] **Step 2: Run CI and verify RED.**
- [ ] **Step 3: Implement the smallest slot resolver**; do not replace `AdvisorProvider` or add another proxy/gateway.
- [ ] **Step 4: Add a fixed eval corpus** covering recorded-ride retrieval, new-ride synthesis, follow-up constraint preservation, route-id hallucination, and ungrounded evidence.
- [ ] **Step 5: Run CI and verify GREEN.**
- [ ] **Step 6: Adversarial review gate:** ensure evals are provider-independent and no API secret/network dependency enters unit CI.
- [ ] **Step 7: Value proof:** document the one-variable model swap command/config and the metrics to compare before promoting a model.

### Task 5: Minimal UI integration of the two modes

**Files:**
- Create/port: `src/components/rides/RideLibraryGoblin.tsx`
- Modify: `src/components/rides/RidesSurface.tsx`
- Modify: `src/components/rides/RidesDestination.tsx`
- Modify: `src/components/rides/rides-view-model.ts`
- Test: `tests/components/ride-library-goblin.test.tsx`
- Test: `tests/components/rides-surface.test.tsx`

**Interfaces:**
- Consumes: `searchRideMemory` and existing planner callback.
- Produces: explicit **My Rides** and **New Ride** modes; generation always returns to the existing planner.

- [ ] **Step 1: Write/port failing interaction tests** for explicit two-mode behavior and real-id filtering.
- [ ] **Step 2: Run CI and verify RED.**
- [ ] **Step 3: Port only the useful UI from `feat/recorded-rides-route-intelligence`**, replacing metadata-only search with `searchRideMemory` where fingerprint evidence is available.
- [ ] **Step 4: Run component tests, full Vitest, typecheck, lint, build and critical E2E.**
- [ ] **Step 5: Adversarial review gate:** verify no generation path was added to the Rides library, no result can exist without a backing ride id, empty/unknown states are explicit, and mobile layout remains usable.
- [ ] **Step 6: Update PR evidence and keep draft until all required branch checks are green.**

## Self-review

- Spec coverage: all two-mode behavior, model swapping, deterministic learning, and adversarial gates map to Tasks 1-5.
- Placeholder scan: no deferred implementation placeholders are used as acceptance criteria.
- Type consistency: `RideFingerprint` -> `LearnedRiderProfile` -> `mergeLearnedRidePreferences`; search consumes fingerprints but never mutates them; UI consumes search and planner callbacks only.
