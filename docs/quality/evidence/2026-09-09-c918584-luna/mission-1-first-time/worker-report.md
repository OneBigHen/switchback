# Luna Mission 1 — First-time rider

- Target: `https://ride.henning.rodeo`
- Immutable deployed SHA requested: `c91858479c176119ba633580cfc0902c6863ba8c`
- Build marker check: the full SHA was present in the public document asset query (`dpl=...`); no `data-dpl-id` element was present in the live DOM.
- Browser: fresh isolated `luna-c918-first-time`, Chromium, 1440x900 desktop.
- Date: 2026-09-09.

## Mission outcome

**Partial / not rider-ready.** I successfully planned a plausible public PA ride from the visible UI: `90 minute scenic ride from Easton, PA`. The app produced a `Scenic route` of **97 min / 42.5 mi**, showed a dense-curves route on the map, and exposed route-detail preparation UI. The preparation hierarchy visibly reported NWS weather (`78°`, `Mostly Sunny`, `1% rain at peak`) plus mapped-data coverage (`67%`, access 100%, surface 100%, condition unavailable).

I could not complete the required Best Ride/Fastest/twisty comparison, save, reload, and reopen flow. Editing the ready route entered a long-running `Adding alternatives…` state and never produced additional route cards during the mission. An hourly-weather interaction also left route details unexpectedly. Because of those failures, I did not reach a defensible “ready to ride” state.

## Successful scenario evidence

1. Opened the public app in a fresh isolated browser session. Evidence: `screenshots/00-initial.png`.
2. Entered `90 minute scenic ride from Easton, PA` and selected **Find ride options**.
3. Route completed as `Scenic route`, 97 min / 42.5 mi, with a visible loop on the map. Evidence: `screenshots/02-route-ready.png`.
4. Opened route details and **Prepare ride**. The visible panel showed mapped-data coverage, route facts, route character, and weather hierarchy. Evidence: `screenshots/03-prepare-weather.png`.
5. The weather hierarchy was legible in the accessibility-visible UI as `Live forecast along your line · NWS`, `78°`, `Mostly Sunny`, `1% rain at peak`, and an `Hourly detail along the route` control.

## Findings

### ISSUE-001 — Hourly weather control leaves route preparation instead of exposing hourly detail

- Classification: actual defect / confusing UX
- Severity: medium
- Confidence: medium
- Reproduced: yes in two direct attempts; one later attempt reset the planner before the result screenshot
- Viewport: 1440x900 desktop Chromium
- Scenario: first-time rider inspecting weather before committing to a 97-minute ride
- Repro:
  1. Plan `90 minute scenic ride from Easton, PA` and wait for `Scenic route` to become ready. (`screenshots/02-route-ready.png`)
  2. Open **Details**, then expand **Prepare ride**. (`screenshots/03-prepare-weather.png`)
  3. Click the visible **Hourly detail along the route** control.
  4. Instead of an hourly forecast, the app entered **Ride Preview** with `GPS unavailable`, `GUIDANCE PAUSED`, `GPS fix required`, `User denied Geolocation`, and `WAITING FOR GPS`. No hourly weather detail was shown.
- Expected rider behavior: the control should expand hourly weather along the route in the preparation panel, or clearly say that it starts ride mode.
- Evidence: `screenshots/03-prepare-weather.png`; `videos/issue-001-hourly-weather-repro.webm`; `screenshots/issue-001-step-1-weather-before.png`; `screenshots/issue-001-step-2-result.png`.
- Note: the paced video's final attempt ended with the planner reset before the result capture; the two earlier direct attempts produced the Ride Preview state described above.

### ISSUE-002 — Route alternatives remain stuck in “Adding alternatives…” and no comparison is delivered

- Classification: actual defect / core workflow blocker
- Severity: high
- Confidence: high
- Reproduced: yes; persisted beyond 80 seconds in the same session
- Viewport: 1440x900 desktop Chromium
- Scenario: first-time rider needs to compare Best Ride/Fastest/twisty choices before leaving
- Repro:
  1. Plan `90 minute ride from Easton, PA` and wait for the single `Scenic route` card to become ready. (`screenshots/02-route-ready.png`)
  2. Click **Edit route** to inspect ride character and alternatives.
  3. Observe `Adding alternatives… · 41s` and `Still working — road search can take longer on weak connections.`
  4. Continue waiting. The status reached `Adding alternatives… · 80s` with no additional route cards; subsequent browser snapshots/queries hung while this state remained.
- Expected rider behavior: route options should load in a bounded, understandable time and show comparable Best Ride/Fastest/twisty alternatives, or provide a clear retry/fallback while keeping the current route usable.
- Observed result: the initial route choices view exposed only `1 route`, labeled `FASTEST NOW` / `Scenic route`; no Best Ride or twisty alternatives were available before the alternatives request stalled.
- Evidence: `screenshots/02-route-ready.png` (visible `1 route` / `FASTEST NOW` state). The exact `Adding alternatives…` status was captured from the visible accessibility UI during the session; no source or implementation inspection was used.

## Test-environment notes (not product findings)

- The headless browser had no geolocation permission/device. Ride Preview therefore showed `GPS unavailable` / `User denied Geolocation`; this is expected test-environment behavior and was not counted as a product defect.
- No authentication or private location was used. The browser session was closed at the end of the mission.

## Final mission status

The rider can create and inspect a route and see top-level weather, but this mission did **not** reach a saved, reloadable, compared route that feels ready to ride. Save/reload/reopen was not attempted after the alternatives workflow became unresponsive.
