# P22 — Expert Customize/Edit

**Phase:** P22 — surface, bike, locks, sketch, avoid, and vias behind
progressive disclosure  
**Current SHA:** `5632af2ea7109ae860d608069b8c4364d6f80273` HEAD plus the
uncommitted phase documentation changes  
**Release gate:** G4

## Before behavior

- `PlannerDeck` already owned the explicit `Edit route` disclosure and the
  expert controls in the working tree.
- Bike profiles, road locks, shaping stops, sketch mode, avoid-highways, and
  route-edit history were covered by focused tests, but P22 had no phase-level
  acceptance record.

## After behavior

- Confirmed `Edit route` is the single disclosure boundary for route profile,
  bike preset, surface/curvature preferences, loop/A-to-B mode, waypoints,
  vias, sketch, avoid-highways, segment styles, and edit history.
- Confirmed road locks remain a separate explicit action-dock dialog with
  provenance, Must use/Prefer modes, confirmation, and graph-matched state.
- Confirmed mobile sheet minimization, accessible controls, profile mismatch
  hints, and offline/library actions remain within the same planner ownership.
- No production source, route data, or schema migration was needed. P22 is an
  audit/acceptance closure of the existing coherent implementation.

## Files changed

- `docs/recovery/WORKLOG.md` — P22 before/after evidence and boundary.
- `docs/phase-reports/P22-expert-customize-edit.md` — this phase report.

## Files deleted

None.

## Migrations

None.

## Tests

- the validation host focused audit: 9 files / 92 tests passed:
  `planner-deck.test.tsx`, `planner-shell-geocoding.test.tsx`,
  `bike-profile-picker.test.tsx`, `road-lock-library-drawer.test.tsx`,
  `library-drawer-road-locks.test.tsx`, `waypoint-field.test.tsx`,
  `route-edit-state.test.ts`, `road-locks.test.ts`, and `bike-profiles.test.ts`.
- the validation host graph-matched road-lock journey: desktop Chromium 1/1 passed.
- The unchanged source tree retained the P19 acceptance gates: `npm run
  verify` at 184 test files / 1,225 passed / 1 skipped, lint, typecheck, and
  build; browser 24/24; critical 30/30; PWA 2/2; real-router 5/5; memory soak
  10/10 planner cycles; and clean router shutdown.

## Commands

```text
npm exec -- vitest run tests/components/planner-deck.test.tsx \
  tests/components/planner-shell-geocoding.test.tsx \
  tests/components/bike-profile-picker.test.tsx \
  tests/components/road-lock-library-drawer.test.tsx \
  tests/components/library-drawer-road-locks.test.tsx \
  tests/components/waypoint-field.test.tsx \
  tests/unit/route-edit-state.test.ts tests/unit/road-locks.test.ts \
  tests/unit/bike-profiles.test.ts --reporter=verbose

npm exec -- playwright test tests/e2e/road-lock.spec.ts \
  --project=desktop-chromium
```

## Gate boundary

P22 proves progressive disclosure and editor/road-lock behavior under focused
component tests and the browser road-lock flow. It does not prove physical
device ergonomics, authenticated-browser behavior, or field/provider quality.

## Deferred

- P23 — Ride HUD v2 for portrait and landscape mounted-phone use.
- Physical-device drill and production-concurrency evidence remain release
  gates outside this local/the validation host acceptance loop.

## Rollback

Revert the two documentation files only. No production or data rollback is
required.
