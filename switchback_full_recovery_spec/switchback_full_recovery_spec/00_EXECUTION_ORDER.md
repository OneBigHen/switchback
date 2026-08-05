# Execution Order

## Operating model

This is a recovery and productization program, not a normal feature sprint. Execute in controlled phases. Do not begin the next phase while unresolved P0 findings remain in the current phase.

## Step 1 — Baseline audit

Before editing:

1. Confirm branch, clean/dirty state, last ten commits, open PRs, and workflow status.
2. Inventory source files, components, stores, API routes, databases, scripts, tests, stylesheets, docs, flags, and generated artifacts.
3. Run the current quality suite exactly as documented.
4. Record passing, failing, skipped, and untested production paths.
5. Identify UI-backed features without complete domain behavior.
6. Find duplicate domain concepts, stale docs, TODOs, placeholders, hardcoded confidence, permissive fallbacks, and disabled lint rules.
7. Build a traceability matrix mapping this package to current files and future tests.

Deliverable: `docs/recovery/BASELINE_AUDIT.md`.

## Step 2 — Establish product truth

Classify every major feature as:

- Keep and harden
- Rewrite
- Experimental
- Remove
- Defer

Deliverable: `docs/recovery/FEATURE_DISPOSITION.md`.

## Step 3 — P0 correctness

Implement Phase 0 and Phase 1 from `15_PHASED_IMPLEMENTATION_PLAN.md`. Do not start visual redesign except where needed to make behavior truthful.

## Step 4 — Modular architecture

Introduce normalized contracts, controller boundaries, state machines, repositories, migrations, and explicit error models.

## Step 5 — UX restructuring

Implement mobile and desktop layouts only after domain and controller boundaries are stable.

## Step 6 — Intelligence and offline maturity

Complete Free Ride, learning, route evidence, offline routing, recovery, and readiness.

## Step 7 — Release hardening

Run semantic tests, production E2E, real-router tests, PWA tests, storage tests, migration tests, accessibility checks, and physical iPhone drills. Produce release evidence.

## Autonomous decision priority

1. Legal access and rider safety.
2. Honest behavior and labels.
3. Data integrity and recoverability.
4. Core route usefulness.
5. Mobile usability.
6. Desktop editing productivity.
7. Performance.
8. Feature breadth.
9. Visual polish.

When a feature is unclear, choose the smallest coherent and testable implementation. When complexity is disproportionate and the feature is not essential, remove or defer it.

## Commit strategy

Suggested phase commits:

1. `docs: establish recovery baseline and feature disposition`
2. `fix: enforce normalized routing constraints`
3. `fix: replace placeholder road requirement semantics`
4. `fix: harden timebox eligibility and route scoring`
5. `fix: secure portable route sharing`
6. `fix: complete offline download and storage flows`
7. `refactor: modularize planner session controllers`
8. `refactor: unify rider settings and bike identity`
9. `feat: restructure mobile planning workflow`
10. `feat: add desktop route editing workspace`
11. `feat: rebuild graph-backed free ride`
12. `test: add semantic and release qualification gates`
13. `docs: align operations and product behavior`

Each commit must leave lint, typecheck, unit tests, and relevant focused tests green.
