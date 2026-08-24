# P23 — Ride HUD v2

**Phase:** P23 — portrait/landscape mounted-phone interface  
**Current SHA:** `5632af2ea7109ae860d608069b8c4364d6f80273` HEAD plus the
uncommitted phase documentation changes  
**Release gate:** G5

## Before behavior

- `RideHud`, `RideHudStatus`, navigation-map presentation, and responsive CSS
  already supplied the mounted-phone cockpit in the working tree.
- GPS acquisition, stale fixes, ambiguous matches, off-route recovery, voice,
  recording, weather, and locked-corridor states had focused tests, but P23 had
  no phase-level visual/acceptance record.

## After behavior

- Confirmed one responsive Ride HUD owns portrait and landscape layouts with
  safe-area-aware top controls, maneuver card, telemetry rail, route progress,
  voice/pause/record/exit controls, and responsive camera controls.
- Confirmed the HUD says Route preview until an accurate live fix exists,
  withholds maneuver claims for uncertain/off-route states, and exposes
  explicit recovery actions rather than silently changing the route.
- Confirmed stale-GPS, HTTPS, wake/viewport cleanup, weather alert, locked
  corridor, fuel-stop, recording, and overnight checkpoint paths.
- No production source, route data, or schema migration was needed. P23 is an
  audit/acceptance closure of the existing coherent implementation.

## Files changed

- `docs/recovery/WORKLOG.md` — P23 before/after evidence and boundary.
- `docs/phase-reports/P23-ride-hud-v2.md` — this phase report.

## Files deleted

None.

## Migrations

None.

## Tests

- the validation host focused audit: 8 files / 77 tests:
  `ride-hud.test.tsx`, `free-ride-hud.test.tsx`, `navigation-engine.test.ts`,
  `navigation-map.test.ts`, `navigation-session-controller.test.ts`,
  `navigation-store.test.ts`, `recording-session-hook.test.tsx`, and
  `recording-session.test.ts`.
- the validation host planner-to-Ride journey: 4/4 passed across desktop Chromium,
  mobile Safari, mobile landscape wide, and mobile landscape narrow.
- Portrait and both landscape Ride screenshots were visually reviewed.
- The unchanged source tree retained the P19 acceptance gates: `npm run
  verify` at 184 test files / 1,225 passed / 1 skipped, lint, typecheck, and
  build; browser 24/24; critical 30/30; PWA 2/2; real-router 5/5; memory soak
  10/10 planner cycles; and clean router shutdown.

## Commands

```text
npm exec -- vitest run tests/components/ride-hud.test.tsx \
  tests/components/free-ride-hud.test.tsx \
  tests/unit/navigation-engine.test.ts tests/unit/navigation-map.test.ts \
  tests/unit/navigation-session-controller.test.ts \
  tests/unit/navigation-store.test.ts \
  tests/unit/recording-session-hook.test.tsx \
  tests/unit/recording-session.test.ts --reporter=verbose

npm exec -- playwright test tests/e2e/planner.spec.ts \
  --project=desktop-chromium --project=mobile-safari \
  --project=mobile-landscape-wide --project=mobile-landscape-narrow \
  --grep "plans, compares, saves, exports, restores, and opens ride mode"
```

## Gate boundary

P23 proves responsive rendering and navigation-state behavior in browser and
fixture tests. It does not prove physical mounted-phone touch/brightness,
authenticated-browser behavior, live provider quality, or field GPS behavior.

## Deferred

- P24 — navigation state machine for GPS filtering, off-route, forward rejoin,
  resume, voice, and wake behavior.
- Physical-device drill and production-concurrency evidence remain release
  gates outside this local/the validation host acceptance loop.

## Rollback

Revert the two documentation files only. No production or data rollback is
required.
