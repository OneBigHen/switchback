# P24 — Navigation state machine

**Phase:** P24 — GPS filtering, off-route, forward rejoin, resume, voice, and
wake  
**Current SHA:** `5632af2ea7109ae860d608069b8c4364d6f80273` HEAD plus the
uncommitted phase documentation changes  
**Release gate:** G5

## Before behavior

- `navigation-engine`, `navigation-session`, `ride-session`, and
  `useNavigationSessionController` already supplied the navigation lifecycle
  in the working tree.
- Filtering, continuity, ambiguity, sustained deviation, recovery points,
  pause/resume, voice, wake, and cleanup were covered by focused tests, but
  P24 had no phase-level acceptance record.

## After behavior

- Confirmed GPS accuracy filtering, derived heading, route continuity, spatial
  matching, ambiguous overlap handling, arrival, and sustained off-route state.
- Confirmed recovery uses the actual rider position and only remaining authored
  stops, with forward on-route rejoin coordinates and offline-pack fallback.
- Confirmed pause/resume, retry, automatic/manual reroute, voice cue
  de-duplication, wake-lock acquire/release, timeout ceilings, and unmount
  cleanup share the controller lifecycle.
- No production source, route data, or schema migration was needed. P24 is an
  audit/acceptance closure of the existing coherent implementation.

## Files changed

- `docs/recovery/WORKLOG.md` — P24 before/after evidence and boundary.
- `docs/phase-reports/P24-navigation-state-machine.md` — this phase report.

## Files deleted

None.

## Migrations

None.

## Tests

- Megaplex focused audit: 7 files / 48 tests:
  `navigation-engine.test.ts`, `navigation-session-controller.test.ts`,
  `ride-session.test.ts`, `ride-reroute.test.ts`, `ride-recovery.test.ts`,
  `ride-recovery-checkpoint.test.ts`, and `offline-route-recovery.test.ts`.
- P23’s planner-to-Ride browser matrix remained green: desktop, iPhone
  portrait, landscape wide, and landscape narrow 4/4.
- The unchanged source tree retained the P19 acceptance gates: `npm run
  verify` at 184 test files / 1,225 passed / 1 skipped, lint, typecheck, and
  build; browser 24/24; critical 30/30; PWA 2/2; real-router 5/5; memory soak
  10/10 planner cycles; and clean router shutdown.

## Commands

```text
npm exec -- vitest run tests/unit/navigation-engine.test.ts \
  tests/unit/navigation-session-controller.test.ts tests/unit/ride-session.test.ts \
  tests/unit/ride-reroute.test.ts tests/unit/ride-recovery.test.ts \
  tests/unit/ride-recovery-checkpoint.test.ts \
  tests/unit/offline-route-recovery.test.ts --reporter=verbose
```

## Gate boundary

P24 proves navigation transitions and resource cleanup in unit/component
fixtures and the P23 browser journey. It does not prove physical GPS/wake
behavior, outdoor audio, authenticated-browser behavior, or field routing
quality.

## Deferred

- P25 — Free Ride graph engine with ahead/reachable RIG candidates and real
  detour/rejoin.
- Physical-device drill and production-concurrency evidence remain release
  gates outside this local/Megaplex acceptance loop.

## Rollback

Revert the two documentation files only. No production or data rollback is
required.
