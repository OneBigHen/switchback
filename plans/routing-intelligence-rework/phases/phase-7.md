---
type: planning
entity: phase
plan: "routing-intelligence-rework"
phase: 7
status: pending
created: "2026-07-22"
updated: "2026-07-22"
---

# Phase 7: Integrated Evaluation, Deployment, and Review

> Part of [routing-intelligence-rework](../plan.md)

## Objective

Independently review every worker diff, prove route quality and latency on the real micro-PC, deploy with rollback, and verify the exact public workflow before release is considered complete.

## Scope

### Includes

- Cross-phase contract and diff review.
- Full automated and golden-route test suite.
- Live p50/p95 benchmark collection.
- Graph cache validation and controlled atomic swap.
- Application build/restart, public health, and real browser verification.
- Rollback drill and final user-facing evidence.

### Excludes (deferred to later phases)

- New feature development discovered during verification.
- Visual reskin, offline expansion, or unrelated technical debt.

## Prerequisites

- [ ] Phases 1–6 are integrated into the release candidate branch.
- [ ] Every worker commit, diff, and focused test result is available.
- [ ] Old application build and graph cache are preserved.

## Deliverables

- [ ] Reviewed combined diff with resolved overlaps and no out-of-scope edits.
- [ ] Full verification report and benchmark artifact.
- [ ] Validated graph/application rollback procedures.
- [ ] Public screenshots/evidence for progress, route shape, alternatives, and toll disclosure.
- [ ] Final merge/release recommendation.

## Acceptance Criteria

- [ ] Lint, typecheck, unit tests, build, Playwright, and diff checks all pass.
- [ ] Golden and control routes pass repeatedly against the candidate graph.
- [ ] Direct, timeboxed, and free-text p95 budgets pass on the live host.
- [ ] Local health, router health, and public health pass after controlled restart.
- [ ] Exact golden prompt works in the public desktop and mobile planner.
- [ ] Primary appears before alternatives with continuous progress and working Cancel.
- [ ] Toll and route-quality explanations match the returned geometry.
- [ ] Application and graph rollback paths are proven before old artifacts are retired.
- [ ] User reviews the combined result before final merge/release.

## Dependencies on Other Phases

| Phase | Relationship | Notes |
|-------|-------------|-------|
| 1–6 | blocked-by | All implementation packages must be integrated |

## Notes

Only the lead release owner may swap the production graph, restart live services, merge the release branch, or claim completion.
