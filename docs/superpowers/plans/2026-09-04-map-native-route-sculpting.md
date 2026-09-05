# Map-native route sculpting implementation plan

**Goal:** make the selected route directly shapeable from the map while reusing Switchback’s existing road-lock, avoid-area, graph-match, and planner request boundaries.

## Tasks

1. Add pure sculpt-interaction state tests covering tap vs drag threshold, cancellation, route replacement, and no mutation during movement.
2. Extend the existing road-lock draft hook with seeded one-anchor and two-anchor entry points; test Must/Prefer seed semantics, graph-match failure, and exactly one commit callback.
3. Add a selected-route invisible hit layer separate from alternate-route selection.
4. Add a compact accessible map palette for Must / Prefer / Avoid nearby.
5. Wire selected-route tap, touch/context-menu, drag, Escape, pointer-cancel, and route-change cancellation in `PlannerMapStage`.
6. Route successful road-lock save to the existing planner `handlePlan()` once; no replan on pointer move or cancelled proposal.
7. Add E2E coverage for tap→Must, tap→Prefer, Avoid handoff, drag→review→save, cancellation, and one request after confirm.
8. Add desktop/390px visual evidence and run typecheck/lint/unit/build/critical/WebKit/road-lock/PWA/real-router/visual gates.
9. Adversarial review: no invented avoid mode, no duplicate route authority, no hidden auto-commit, no edge-id fabrication, no request flood.
