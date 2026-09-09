# Luna worker report — Mission 2: Change My Mind

| Field | Value |
|---|---|
| Target | `https://ride.henning.rodeo` |
| Immutable deployed SHA | `c91858479c176119ba633580cfc0902c6863ba8c` |
| Build ID | `build-TfctsWXpff2fKS` |
| Session | `luna-c918-change-mind` |
| Viewport | 1366x768 desktop Chromium |
| Date | 2026-09-09 |

## Mission outcome

PARTIAL / HOLD. The normal public PA/NJ destination flow and the requested
change controls were exercised through the visible UI. Evidence was captured
for destination selection, route-character changes, route selection, duration
and preference changes, undo/redo exposure, and rapid changes while a
recalculation was settling. A final refresh could not be completed: under the
host memory-pressure warning, the browser tab became `about:blank` and the
session was closed. No product code or deployment state was changed.

## Scenario log

1. Fresh planner at the target URL, then `Lancaster, PA` was typed and the
   city suggestion was selected. The route eventually became ready as a
   12-minute / 5.0-mile Balanced route, while the UI said it planned
   `Ride to Lancaster, Pennsylvania, United States`.
   Evidence: `screenshots/initial.png`, `screenshots/issue-destination-picked.png`,
   `screenshots/issue-destination-result.png`.
2. Entered Edit route, changed road character to Twisty, and selected the
   Quick alternative. The UI exposed three route choices and updated the
   selected route and map. Evidence: `screenshots/twisty-selected.png`,
   `route-selection-quick.png`.
3. Exercised Undo and Redo controls. Undo was exposed and enabled, but the
   selected Quick route did not visibly change on the first attempt; a later
   attempt lost the route state while the browser interaction was being
   recorded. This was not promoted to a standalone defect because the exact
   trigger was not isolated.
4. Revised the destination to `Princeton, NJ`, selected the city suggestion,
   and planned again. The eventual route was a coherent 297-minute / 153.5-mile
   Scenic route with Princeton as the finish. Evidence:
   `screenshots/princeton-route-result.png`.
5. In Edit route, selected a 2-hour target and then selected Adventure while
   recalculation was still settling. The UI accepted the rapid change, showed
   the Adventure style, and surfaced a Street-profile mismatch warning.
   Avoid Highways and Avoid tolls were both checked during the same edit pass.
   The Touring bike profile was then clicked as the additional planner
   preference, but the tab became `about:blank` before a final readback could
   be captured. Evidence: `screenshots/rapid-change-pending.png`.
6. A recalc/cancel state was observed with a visible Cancel control and a
   `45s Still working` message. The route editor remained usable while a
   second `Replanning…` state was shown. Evidence:
   `screenshots/issue-destination-edit-route.png`,
   `screenshots/rapid-change-pending.png`,
   `videos/issue-cancel-recalc-repro.webm`.
7. The browser console showed only the expected geolocation-unavailable
   warning. Captured API requests for geocoding and routing returned HTTP 200;
   no JavaScript exception was observed.

## Top three findings

### FINDING-001 — City destination resolves to a nearby street and a 5-mile local route

| Field | Value |
|---|---|
| Severity | High |
| Category | Functional / route integrity |
| Confidence | High |
| Reproducibility | 2/2 attempts with `Lancaster, PA` |
| Regression | Unknown; no prior build baseline available |

**Expected:** Selecting the visible city result `Lancaster, Pennsylvania,
United States` should route to Lancaster city and show a map/length consistent
with that destination.

**Actual:** The planner title retained the requested Lancaster city, but Edit
route showed the finish as `Lancaster Street, Swatara Township, Pennsylvania
17111, United States`; the map stayed in the Harrisburg area and the selected
route was only 5.0 miles / 12 minutes. There was no warning that the resolved
finish differed from the selected city.

**Repro:**

1. Open the target URL at 1366x768. [Initial](screenshots/initial.png)
2. Type `Lancaster, PA` and select the city suggestion. [Selected](screenshots/issue-destination-picked.png)
3. Click Find ride options and wait for ROUTE READY. [Result](screenshots/issue-destination-result.png)
4. Click Edit route and inspect FINISH. [Resolved finish](screenshots/issue-destination-edit-route.png)

Full interaction capture: `videos/issue-destination-mismatch-repro.webm`.

**Rider impact:** A rider can commit to a short Harrisburg-area ride while
believing they planned a Lancaster destination trip. This directly violates
the route-selection and rider-intent contract.

### FINDING-002 — Recalculation presents long, weakly bounded loading states while accepting more changes

| Field | Value |
|---|---|
| Severity | Medium |
| Category | UX / feedback |
| Confidence | High |
| Reproducibility | Reproduced during both destination plans |
| Regression | Unknown |

**Expected:** After a meaningful edit, the UI should give a clear progress
state and make it obvious whether further changes will replace, queue, or
cancel the current calculation. Cancel should leave the prior valid route
intact unless the user explicitly discards it.

**Actual:** Edit route showed `Adding alternatives… · 45s Still working` and
the next edit showed `Routing your ride… · 18s Still working` followed by a
second `Replanning…` state. Road-character and duration controls remained
available, so a rapid Adventure change was accepted while the prior duration
recalculation was still settling. The route was eventually usable, but the
loading copy did not explain the queued-change semantics or give a reliable
completion estimate.

Evidence: `screenshots/issue-destination-edit-route.png`,
`screenshots/rapid-change-pending.png`,
`videos/issue-cancel-recalc-repro.webm`.

**Rider impact:** A rider changing their mind cannot confidently tell which
preference the map currently reflects or whether pressing Cancel preserves the
last valid route. This is especially risky when duration, route character, and
avoid preferences are changed in quick succession.

### FINDING-003 — Route-choice deltas use inconsistent comparison bases

| Field | Value |
|---|---|
| Severity | Medium |
| Category | UX / content clarity |
| Confidence | Medium-high |
| Reproducibility | Reproduced after Twisty produced three routes |
| Regression | Unknown |

After selecting `Quick alternative 2`, the selected card said `+2 min vs
fastest`, while the Twisty card showed `-2 min · -0.5 mi` and the other card
mixed a signed delta with `vs fastest`. The cards did not use one consistent
comparison label, so the rider must infer whether each number is relative to
the fastest route or the currently selected route.

Evidence: `route-selection-quick.png` and `screenshots/twisty-selected.png`.

**Expected:** Every route card should state one explicit, consistent basis,
for example `2 min slower than Fastest Now` or `1 min faster than selected`.

**Rider impact:** A rider comparing routes can misread negative minutes or
distance as a ranking signal and select the wrong trade-off.

## Successful behaviors

- Place suggestions were discoverable and selecting a valid Princeton city
  result eventually produced a coherent PA/NJ-length route.
- Twisty, Quick alternative selection, Adventure style, 2-hour target, Avoid
  Highways, and Avoid tolls were all visible controls and produced visible
  state changes or recalculation states.
- The Street versus Adventure mismatch warning was useful safety feedback.
- No JavaScript exception was observed; console output was limited to the
  environment's unavailable geolocation warning.
