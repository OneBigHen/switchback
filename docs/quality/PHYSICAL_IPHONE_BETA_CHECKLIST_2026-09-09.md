# Physical iPhone beta checklist — candidate `c918584`

Status: **NOT RUN**

This checklist is the remaining physical-device gate for the candidate deployed
at `https://ride.henning.rodeo`. It does not inherit a pass from Chromium,
Playwright WebKit, screenshots, or the Luna black-box session.

## Candidate lock and test record

- Expected source/deployment ID:
  `c91858479c176119ba633580cfc0902c6863ba8c`
- Expected Next build ID: `build-TfctsWXpff2fKS`
- URL: `https://ride.henning.rodeo`
- Device model:
- iOS version:
- Safari version/build:
- Installed-PWA state before test: fresh / retained (describe)
- Test date, local time, and timezone:
- Tester / observer:
- Network(s) used:
- Public test area/route (do not commit private home coordinates):
- Evidence directory or private evidence location:

Before beginning, have the operator re-check the public deployment marker and
confirm it is still the expected full SHA. If it differs, stop: the checklist
does not apply to the new build.

Use a parked motorcycle, passenger, or observer for any road portion. Do not
ask a moving rider to operate planning or editing controls.

## A. Installation, orientation, safe areas, and touch

Record PASS / FAIL / NOT RUN and one evidence reference for every item.

1. **Safari first launch.** Open the URL in Safari with no retained tab. Confirm
   the planner and map settle, the primary next action is clear, and no stale
   update/error UI appears.
2. **Install and relaunch.** Add Switchback to the Home Screen, close Safari,
   launch the installed PWA, and confirm it opens as the same candidate with
   the expected planner state.
3. **Portrait.** At the normal portrait viewport, plan a public destination
   ride. Confirm the map remains useful, the selected route is unambiguous,
   and the primary action is reachable.
4. **Landscape.** Rotate during the planned ride. Confirm map, sheet/dock,
   route summary, attribution, and primary actions reflow without stale
   measurements, clipping, or overlap.
5. **Short landscape.** Exercise the shortest realistic landscape state
   available on the device (record the CSS viewport and Safari/PWA chrome
   state). Open the keyboard and a route-detail disclosure. Confirm there is a
   reachable close/back action and no primary control is trapped off-screen.
6. **Safe areas.** In portrait and landscape, inspect the notch/Dynamic Island,
   rounded corners, home indicator, keyboard, and browser/PWA chrome. Confirm
   no app-owned control or required map attribution is obscured or untappable.
7. **Touch targets.** One-handed while stationary, tap the primary planner,
   route-choice, disclosure, Undo/Redo, close/cancel, Free Ride, and riding
   actions without pinch-zooming. Record any repeated missed or adjacent taps.

## B. Permission, GPS, interruption, and resume

8. **Deny location.** From a fresh permission state, deny location. Confirm an
   explicit-start route remains possible and the message explains how to
   continue without claiming GPS is active.
9. **Recover location.** Grant precise location in iOS Settings, foreground the
   same installed PWA, and confirm location recovers without reinstalling or
   losing the authored ride and constraints.
10. **Foreground/background GPS continuity.** Start a ride/recording, collect a
    visible position update, background the PWA long enough for iOS behavior to
    matter, then foreground it. Record elapsed time and whether samples paused.
    PASS means continuity or an honest, recoverable paused/lost-GPS state; it
    does not require capabilities iOS does not provide.
11. **Screen lock/background behavior.** With the ride/recording active, lock
    the screen, wait at least two minutes, unlock, and resume. Record wake-lock,
    speech, GPS, recording, and guidance behavior separately. No silent reset,
    duplicate activity, or fabricated track segment is acceptable.
12. **Interruption.** During an active ride, take a phone call or use a safe
    equivalent system interruption, then return. Confirm the same ride,
    selected route, remaining stops, recording identity, and useful next action
    remain clear.
13. **Terminate and resume.** Close the PWA after meaningful planning, reopen
    it, and confirm the saved/checkpointed intent is recovered honestly. If
    geometry must be recalculated, the UI must say so rather than show stale
    geometry as current.

## C. Network loss, route recovery, and reroute

14. **Weak network.** Using a safe throttled hotspot or Network Link
    Conditioner, request or edit a route. Confirm visible progress, bounded
    failure, cancellation/retry, and preservation of the last usable ride.
15. **No network while foregrounded.** Disable Wi-Fi/cellular or enable Airplane
    Mode with a saved ride visible. Confirm the installed shell and saved local
    ride remain available, and new online routing fails honestly without
    synthetic geometry.
16. **Offline cold resume.** Close and relaunch the installed PWA while still
    offline. Confirm the shell loads, local material is distinguishable from
    provider/routing availability, and no generic badge implies unsupported
    offline coverage.
17. **Network recovery.** Restore connectivity and retry. Confirm provider
    health and route planning recover without clearing the ride or requiring a
    reinstall.
18. **Route deviation and reroute.** On a safe observed road test, deviate from
    the selected route where legal. Confirm off-route feedback is timely,
    reroute/rejoin is understandable, the selected route/map agree afterward,
    and recording continuity is preserved.

## D. Free Ride and constraint continuity

19. Set recognizable rider constraints before the activity: toll policy,
    highway policy, road character/surface preference, bike, and any hard
    keep/avoid constraint used for the test. Capture the visible state.
20. Start one recording/activity, enter **Free Ride**, wait for one suggestion,
    and confirm its purpose and consequences are understandable at a glance.
21. Select the suggestion. Confirm guided Ride state appears without starting a
    second recording or silently changing the captured constraints.
22. Invoke **Head Home** while the same recording remains active. Confirm the
    destination is the explicitly configured Home, not a guess, and the route
    retains all applicable hard constraints.
23. End/exit deliberately. Confirm there is one coherent activity/recording,
    its elapsed time comes from the recording, and reopening it does not mutate
    the saved route.

## E. Daylight, glanceability, and accessibility basics

24. **Daylight/glanceability.** Parked or with an observer, inspect the planner,
    route-choice, warning, active guidance, GPS-degraded, and reroute states in
    direct daylight. Record whether the primary instruction, route state, and
    warning remain legible without prolonged attention.
25. **Text size.** Test the intended iOS text-size setting and one substantially
    larger accessibility size. Confirm the core plan/choose/prepare/ride task
    remains completable without clipped actions or hidden recovery controls.
26. **VoiceOver basics.** With VoiceOver enabled, traverse primary navigation,
    planner input, route alternatives/selection, route details, warning/status,
    Undo/Redo, Free Ride, and Head Home. Confirm useful names, selected state,
    status announcements, focus return, and a non-drag alternative for any
    essential map edit.
27. **Non-color meaning and motion.** Confirm route selection/warnings are
    understandable without color alone and that Reduce Motion removes
    nonessential movement without losing feedback.

## Exit decision

- PASS requires no reproducible blocker in the advertised beta journey and an
  evidence reference for every performed item.
- A platform limitation may pass only when the UI reports it honestly and the
  rider can recover without losing the ride or recording.
- Any code fix creates a new candidate SHA. Stop, deploy the new SHA, re-attest
  it, rerun automated/Luna checks proportionate to the fix, then restart this
  physical checklist from the candidate-lock step.
- Until the fields above are completed, report all of these boundaries as
  **NOT RUN**, including real iOS Safari, installed PWA behavior, real GPS/
  background continuity, weak/no-network device behavior, daylight/touch, and
  real-road reroute usefulness.
