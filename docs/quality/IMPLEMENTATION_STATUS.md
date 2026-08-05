# Implementation status

**State: AGENT WORKING**

This work starts at baseline `90977e1ff0b582149b7b621d280a55a5f09ff441`
(`feat: ship first-class routing and free ride`) on the agent-managed branch.

## Completed in this pass

- Isolated Playwright from stale port-3100 processes and added critical,
  real-router, and service-worker-enabled PWA projects.
- Added 15 focused critical journeys covering built-in suggestions, prompts,
  planning, loops, denial, stale requests, provider failure, alternatives,
  persistence, GPX import, Free Ride acceptance, and responsive layout.
- Added a tiny OSM/GraphHopper 11 fixture and prepared/imported local graph.
- Added real-router browser checks for live routing, closed-loop geometry, and
  private/`motorcycle=no`/disconnected rejection.
- Added PWA shell/offline persistence tests and API no-fake-success coverage.
- Added the owner workflow, quality summary scripts, live smoke script,
  release evidence, physical drill, failure policy, PR template, and one
  GitHub Actions workflow.
- Fixed GraphHopper 11 request-model compatibility for OSM `earth`/`mud`
  surfaces and added a regression test.

## Defects found during the final gate and fixed with regressions

1. **Phone action dock occluded the "Edit route" control.** The home-state
   dock (Free Ride + Road locks stacked, ≈134px) is taller than the 82px the
   scroll area reserved, so the bottom of the ride-prompt card sat beneath the
   fixed bar and could not be tapped on phones. Fixed the reservation in
   `responsive.css`; the critical helper now uses a real (actionability-checked)
   click so a recurrence fails the suite instead of being force-clicked past.
2. **Ride-prompt submit raced the controlled-input state.** Enter pressed right
   after typing could submit an empty prompt to the intent API. The form now
   reads the live field value (`FormData`) instead of possibly-unflushed state,
   and the browser tests wait for the submit to enable (explicit readiness)
   before pressing Enter.
3. **Passive GPS seed invalidated an in-flight ride intent.** A location fix
   arriving up to 8s after load called `gate.invalidate()`, silently dropping a
   just-submitted suggestion/prompt and leaving the planner stuck on
   "interpreting" with no route request ever sent (reproduced ~1-in-8 locally).
   The seed now skips when a planning session is in flight; unit regression
   added in `planner-location-seed.test.tsx`.

## Fresh evidence (final gate, re-run after the last source edits)

| Check | Result |
|---|---|
| Lint | PASS |
| Typecheck | PASS |
| Vitest | PASS: 1,148 passed, 1 live-gate skip only while app was down (re-runs green) |
| Build | PASS |
| Critical Chromium | PASS: 15/15 |
| Critical WebKit | PASS: 15/15 |
| Real GraphHopper fixture | PASS: 5/5 (live evidence + 3 rejection cases) |
| PWA/offline | PASS: 2/2 |
| Live providers | PASS: 8/8 (app health, geocode, route, GraphHopper, Valhalla status + elevation, Photon) |
| Physical iPhone | NOT PERFORMED — documented drill in `PHYSICAL_DEVICE_DRILL.md` |

## Remaining before handoff

- Independent review of the branch diff, repair any findings, then re-run the
  final gates.
- Commit, push, and open the pull request.
- Physical iPhone airplane-mode drill remains owner-side; keep the device
  section honest (`NOT PERFORMED`) until a real run is recorded.
