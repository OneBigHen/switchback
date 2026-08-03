---
type: planning
entity: phase
plan: "routing-intelligence-rework"
phase: 6
status: completed
created: "2026-07-22"
updated: "2026-08-03"
---

# Phase 6: Free-Text Preservation and Loading UX

> Part of [routing-intelligence-rework](../plan.md)

## Objective

Make free-text planning preserve the rider's full intent and show continuous, cancellable progress while the primary and alternatives arrive.

## Scope

### Includes

- Local-first intent parsing with ambiguity-only remote interpretation.
- Concurrent safe endpoint resolution.
- Full manual-preference preservation in free-text requests.
- Planner progress state machine and Cancel behavior.
- Previous-route retention during replanning.
- Primary-first rendering and non-disruptive alternative merging.
- Accessible status across expanded, minimized, desktop, portrait, and landscape surfaces.

### Excludes (deferred to later phases)

- Routing/scoring algorithm changes.
- Visual reskin or broad layout redesign.
- Graph import and deployment.

## Prerequisites

- [ ] Phase 2 progressive API behavior is merged.
- [ ] Phase 4 evidence and duration result contracts are stable before final rebase.

## Deliverables

- [ ] Unified progress/cancellation controller.
- [ ] Updated omnibox and planner status presentation.
- [ ] Preference-preserving free-text request flow.
- [ ] Progressive route/alternative merge behavior.
- [ ] Component and browser tests for all states.

## Acceptance Criteria

- [ ] Visible feedback begins within 100 ms and remains until the primary is usable.
- [ ] Exact golden prompt shows understanding, endpoint resolution, primary routing, alternatives, and ready states.
- [ ] Cancel is available in the normal omnibox view and aborts work.
- [ ] A previous route stays visible but clearly marked as recalculating.
- [ ] Alternatives never replace the selected primary automatically.
- [ ] Bike, locks, avoid areas, via points, toll policy, and duration survive free-text planning.
- [ ] Keyboard/screen-reader status and mobile layouts pass focused tests.

## Dependencies on Other Phases

| Phase | Relationship | Notes |
|-------|-------------|-------|
| 2 | blocked-by | Needs primary/alternatives API split |
| 4 | blocked-by-final | Needs evidence and duration response shape |
| 5 | consumes | Shows optional research state without blocking |
| 7 | blocks | Browser behavior is release-tested |

## Notes

Keep the existing planner design language. This phase repairs feedback and behavior; it is not a reskin.
