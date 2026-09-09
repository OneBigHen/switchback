# Mission 6 — Advisor / Gravel Goblin

**Candidate:** `https://ride.henning.rodeo`
**Expected build:** `c91858479c176119ba633580cfc0902c6863ba8c`
**Viewport:** 1440×900, isolated `agent-browser` session `mission6-advisor-vs3mR1`
**Date:** 2026-09-09 (America/New_York)
**Session:** closed after the journey.

## Build identity

The full expected SHA was present, unchanged, in the loaded deployment asset
URLs as `?dpl=c91858479c176119ba633580cfc0902c6863ba8c` (CSS, JS, font, and
Gravel Goblin image requests all returned 200). No conflicting `dpl` value was
observed. The rendered DOM did not expose a literal `data-dpl-id` attribute;
the asset query parameter was the available deployment identity evidence.

## Rider journey and observations

1. Opened the planner and opened Gravel Goblin via its visible “Ask” control.
   Initial state showed a map, Morristown was not yet selected, and no route
   was visible. Evidence: `screenshots/00-initial-annotated.png`,
   `screenshots/01-assistant-open.png`.
2. Asked: “I want a 3-hour motorcycle loop from Morristown, NJ to Delaware
   Water Gap, with twisty roads, a little gravel, and lunch.” The assistant
   displayed “Sniffing out the good roads…” for roughly 45 seconds, then
   replaced it with a clear timeout message: “That one took too long. Give me
   another crack at it.” Evidence: `screenshots/02-request-filled.png`,
   `screenshots/04-assistant-timeout.png`.
3. Retried with: “Suggest a scenic half-day loop from Morristown NJ with one
   gravel section.” The retry completed after about 20 seconds and proposed a
   “4-hour loop through the Great Swamp area with mixed surface riding,” with
   a “Plan this ride” action. Evidence: `screenshots/05-retry-progress.png`.
4. Selected “Plan this ride.” The visible route became “Gravel route,”
   `233 min · 103.4 mi · Gravel`, with “Dense curves · 98 curve score.” The
   assistant remained open and repeated the Great Swamp / unpaved-road
   rationale. Evidence: `screenshots/06-planned-from-advisor.png`.
5. Opened route details as a rider. The preparation view exposed useful
   caveats: `67% MAPPED DATA COVERAGE`, condition unavailable, 1,640 ft mapped
   gravel/unpaved, and an explicit warning that uncertain coverage should be
   verified. It also showed weather with source (`NWS`) and route rationale
   (“98/100 curve signal”, 209 mapped turns). Evidence:
   `screenshots/07-route-details.png`, `screenshots/08-prep-expanded.png`.
6. Edited the plan and changed the ride options. The resulting visible route
   changed to `200 min · 84.7 mi · Gravel`, with `100` curve score. The map
   clearly showed the loop from the Morristown area. Evidence:
   `screenshots/09-edit-before-change.png`, `screenshots/10-plan-changed.png`.
7. Re-opened Gravel Goblin against the changed route. During loading it
   displayed the impossible phrase “Weighing 240% unpaved against a 100/100
   curve score…”; the completed response then correctly described the visible
   route as 84.7 miles, about 200 minutes, 2% mapped unpaved, and 370 turns.
   Evidence: `screenshots/11-advisor-after-plan-change.png`.
8. Exercised the route-preview/close path. The route preview displayed the
   same 84.7 miles / 200 minutes, paused safely at “GPS fix required” with
   “User denied Geolocation,” and exposed “Exit ride mode.” Clicking Exit
   returned to the route choices screen with the route still visible. Evidence:
   `screenshots/12-advisor-prep-question.png`,
   `screenshots/13-exit-ride-mode.png`.

## Findings

### M6-01 — Advisor shows an impossible unpaved percentage during route-context refresh

**Classification:** Actual defect
**Severity:** S2 / high rider-trust risk, though transient
**Reproduction:**

1. Open the app at 1440×900.
2. Open Gravel Goblin and ask for a realistic Morristown, NJ mixed-surface
   loop.
3. Use “Plan this ride.”
4. Change the route plan, then reopen Gravel Goblin against the changed route.
5. Observe the assistant’s loading/status copy before the final answer.

**Observed:** The status said: “Weighing **240% unpaved** against a 100/100
curve score…” A percentage over 100 is impossible and is presented as route
context. The final answer corrected itself to “2% of it is mapped unpaved,” so
the defect is in the intermediate state but can mislead a rider during route
selection/preparation. Evidence: `screenshots/11-advisor-after-plan-change.png`.

### M6-02 — Gravel/pavement surface context is internally confusing

**Classification:** Confusing UX (possible data-label defect)
**Severity:** S2 / preparation risk
**Reproduction:**

1. Plan the Gravel Goblin suggestion.
2. Open route details and expand preparation.
3. Compare the same visible state’s surface labels.

**Observed:** The route is labeled “Gravel route” and reports mapped gravel/
unpaved surface, while the “Your ride” summary says `No highways · Pavement`.
The preparation rationale also says `0% non-paved mix from routing tags` while
the measured facts list 1,640 ft mapped gravel/unpaved. Some of this may be
rounding or bike-profile context, but the rider is not told that distinction
clearly. Evidence: `screenshots/06-planned-from-advisor.png`,
`screenshots/08-prep-expanded.png`, `screenshots/11-advisor-after-plan-change.png`.

### M6-03 — Advisor backend is slow but has a recoverable retry path

**Classification:** Environment/backend latency problem (not promoted to an
app defect from this run)
**Severity:** S3 / degraded experience
**Observed:** The first realistic question remained in “Sniffing out the good
roads…” for roughly 45 seconds before the UI reported a timeout. A second,
shorter question succeeded after roughly 20 seconds. The retry affordance was
clear and preserved the user’s typed question. No browser console/page errors
were observed. Evidence: `screenshots/03-assistant-response.png`,
`screenshots/04-assistant-timeout.png`, `screenshots/05-retry-progress.png`.

### Unconfirmed anomaly — quick preparation prompt entered ride preview

After the completed route-context answer, clicking the visible “Any gravel on
this?” quick prompt led to the route preview rather than an assistant answer in
this run. The preview itself was coherent and “Exit ride mode” returned cleanly;
the interaction should be replayed before filing as a defect because the
transition may have raced with route state updates. Evidence:
`screenshots/11-advisor-after-plan-change.png`,
`screenshots/12-advisor-prep-question.png`,
`screenshots/13-exit-ride-mode.png`.

## Evidence inventory

- `videos/mission6-advisor-journey.webm` — full interaction recording.
- `screenshots/00-initial-annotated.png` through
  `screenshots/13-exit-ride-mode.png` — sequential visual evidence.
