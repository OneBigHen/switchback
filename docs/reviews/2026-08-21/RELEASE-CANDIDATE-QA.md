# Switchback Release Candidate QA

Date: 2026-08-22
Build: `integration/paperclip-baseline` (final consolidated head)

## Result

PASS for the exercised local release-candidate flows. No release-blocking UX
defect was found. The app kept unavailable GPS and optional provider data
explicit instead of presenting fabricated success.

## Workflows exercised

| Surface | Result | Evidence |
| --- | --- | --- |
| Planner initial state | PASS | Desktop screenshot: `agent-browser/screenshots/screenshot-1787371771899.png` |
| Built-in loop/scenic suggestion and routed outcome | PASS | Real GraphHopper fixture produced a visible route card, geometry, turn-by-turn steps, and honest fixture-distance notice; screenshot: `agent-browser/screenshots/screenshot-1787372138260.png` |
| Route details and alternatives controls | PASS/PRESENT | Route card and turn-by-turn region were visible; the details control was present. Full alternative coverage remains in critical and real-router Playwright suites. |
| Typed destination | NOT TESTABLE | No stable browser geocoder fixture was available in this manual session; real-router tests cover fixture destination planning. |
| Road-lock library | PASS | Empty road-lock panel opened and remained usable; success/failure and poisoned-state behavior are covered by focused tests and `road-lock` E2E. |
| Library | PASS/PRESENT | Browse surface and GPX/KML/KMZ import plus road-lock upload controls were visible. Actual manual file upload was not repeated because the checkout has no browser fixture file; focused KMZ and critical GPX coverage passed. |
| Guided Ride | PASS | Entered Ride preview; HUD, route map, pause/record/exit controls, and explicit `GPS fix required` state were visible. Screenshot: `agent-browser/screenshots/screenshot-1787372371640.png` |
| Reroute/recovery | NOT TESTABLE | The local browser had no real GPS stream; related abort/recovery coverage passed in unit and critical suites. |
| Free Ride transition | PASS | Entered Free Ride with explicit disabled pause state until GPS is available; controls were visible. |
| Offline/PWA | PASS | Production PWA suite passed 2/2, including offline reload, IndexedDB saved-route persistence, and non-cached API failure. |
| Responsive layout | PASS | Inspected desktop, iPhone portrait 390x844 (`agent-browser/screenshots/screenshot-1787372316718.png`), and landscape 844x390 (`agent-browser/screenshots/screenshot-1787372331466.png`); controls remained visible and tappable. |
| Profile/diagnostics | PASS/PRESENT | Profile opened above the map with usable fields and theme control. Light and dark screenshots: `agent-browser/screenshots/screenshot-1787372268503.png`, `agent-browser/screenshots/screenshot-1787372276936.png`; Diagnostics control was present. |

## Findings

- No product defect required a code change during this pass.
- Local Chromium reported the expected geolocation-unavailable warning; the
  Ride HUD showed an explicit GPS-required state.
- Curvature and some optional road-overlay requests were unavailable locally;
  the UI displayed an honest unavailable/loading message.
- The hosted visual job still reports light/dark snapshot drift caused by the
  app's time-based automatic theme selection. Expected/actual screenshots show
  a coherent theme swap, not a broken layout or assertion failure. Snapshots
  were not updated.
