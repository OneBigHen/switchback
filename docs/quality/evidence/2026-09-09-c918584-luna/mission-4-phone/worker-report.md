# Mission 4 — Phone-first rider

| Field | Value |
|---|---|
| Target | https://ride.henning.rodeo |
| Immutable deployed SHA | `c91858479c176119ba633580cfc0902c6863ba8c` |
| Build ID | `build-TfctsWXpff2fKS` |
| Session | `luna-c918-phone` |
| Environment | Fresh mobile Chromium emulation; iPhone 14 device profile with exact CSS viewports 390x844 portrait, 844x390 landscape, and 667x375 short landscape. Not physical iPhone evidence. |
| Scope | Plan → choose → prepare on PA/NJ points; keyboard/text entry; details/road locks; edit/replan/recovery; orientation, touch, map/sheet containment, attribution, and action stability. |

## Outcome

The core route flow is usable, but three mobile findings are rider-impacting. A normal request of `New Hope, PA to Lambertville, NJ` produced a 129.7 mi / 185 min route whose resolved START was a New Hope church in Lower Paxton Township near Harrisburg, not the New Hope town. Editing the endpoints to explicit `New Hope, Pennsylvania` and `Lambertville, New Jersey` recovered the flow and produced three choices, including a 6 min / 3.2 mi Quick route. The route-card Details action is exposed in the accessibility tree but is not visibly rendered and opens the unrelated Road locks sheet. At 667x375 landscape, the planner sheet clips the lower ride card and the attempted page scroll did not reveal it.

The route endpoint can take roughly 45–75 seconds before the final route state appears. No console errors or page errors were observed in the exercised flow. Starting ride mode correctly exposed the emulation limitation `GPS unavailable`; this is environment evidence, not a physical-device claim.

## Severity summary

| Severity | Count |
|---|---:|
| Critical | 0 |
| High | 1 |
| Medium | 2 |
| Low | 0 |
| **Total** | **3** |

## Findings

### ISSUE-001 — Route-card Details opens Road locks and has no visible Details affordance

| Field | Value |
|---|---|
| Severity | Medium |
| Category | Functional / UX / responsive UI |
| Viewport | 390x844 portrait |
| Reproduced | Yes; repeated on the route-ready state with the Scenic alternative card. |
| Confidence | High |
| Rider impact | A rider seeking route explanation (and expected weather/details context) is sent to an unrelated empty Road locks sheet; the route remains visible, but the intended information is unreachable. |
| Evidence | `screenshots/issue-001-step-1-route-ready-2.png`, `screenshots/issue-001-result-road-locks-2.png`, `screenshots/03-route-ready-390x844.png` |

**Repro**

1. At 390x844, enter `New Hope, PA to Lambertville, NJ`, submit, and wait for `ROUTE READY`. The route card is visible in `screenshots/issue-001-step-1-route-ready-2.png`.
2. Activate `Details for Scenic alternative 2` (the control is present in the accessibility tree).
3. **Actual:** a `Road locks` sheet opens instead of route details; the result is captured in `screenshots/issue-001-result-road-locks-2.png`.

**Expected:** A visible, tappable Details control opens the selected route's details, with a clear dismiss action. Weather/details could not be reached through this intended path because of the misrouted action.

### ISSUE-002 — Ambiguous PA/NJ request resolves the start to the wrong Pennsylvania location

| Field | Value |
|---|---|
| Severity | High |
| Category | Functional / route correctness |
| Viewport | 390x844 portrait |
| Reproduced | Yes on the immutable build during the ordinary plan flow. |
| Confidence | High |
| Rider impact | A rider can commit to a route starting about 120 miles away from the requested New Hope town without an obvious confirmation warning. This directly undermines route selection and trip preparation. |
| Evidence | `screenshots/03-route-ready-390x844.png`, `screenshots/08-edit-route-390x844.png`, `screenshots/09-choose-quick-390x844.png` |

**Repro**

1. At 390x844, enter exactly `New Hope, PA to Lambertville, NJ` and submit.
2. Wait for route ready. The app displays `185 min · 129.7 mi · Scenic`; map context is Philadelphia/Wilmington rather than the requested nearby PA/NJ towns (`screenshots/03-route-ready-390x844.png`).
3. Open `Edit route`. The resolved START field reads `New Hope Brethren in Christ, American Legion Memorial Highway, Lower Paxton Township, Pennsylvania 17112, United States`; FINISH reads `New Hope-Lambertville Toll Bridge, Delaware Township, New Jersey 08530, United States` (`screenshots/08-edit-route-390x844.png`).
4. **Actual:** the ordinary town request silently routes from Lower Paxton Township near Harrisburg. There is no confirmation that the selected place is not New Hope town.

**Recovery observed:** replacing the fields with explicit `New Hope, Pennsylvania` and `Lambertville, New Jersey`, confirming the suggestions, and choosing `Replan` produced three options. `Quick route` was 6 min / 3.2 mi and could be selected with a visible tap in the partially shown card (`screenshots/09-choose-quick-390x844.png`, `screenshots/11-quick-selected-390x844.png`).

### ISSUE-003 — Short landscape planner sheet clips ride controls and does not reveal content on scroll

| Field | Value |
|---|---|
| Severity | Medium |
| Category | Responsive UI / UX |
| Viewport | 667x375 landscape |
| Reproduced | Yes; visible on load and unchanged after a 300 px downward scroll. |
| Confidence | High |
| Rider impact | In short-landscape use, the bottom of the planner is cut off: the `Your ride` card and its actions are only partially visible, reducing confidence that the route is saved/undoable and making controls hard to reach. |
| Evidence | `screenshots/13-landscape-667x375.png`, `screenshots/14-landscape-667x375-scrolled.png`, `screenshots/12-landscape-844x390.png` |

**Repro**

1. Load the planner at 667x375 landscape with the normal plan sheet open (`screenshots/13-landscape-667x375.png`).
2. **Observe:** the planner extends below the viewport; the `Your ride` card is cut after its first row and lower actions are not visible.
3. Scroll down 300 px.
4. **Actual:** the visible slice remains unchanged; the captured result is `screenshots/14-landscape-667x375-scrolled.png`.

At 844x390 landscape the main planner remains contained and the map is useful behind it (`screenshots/12-landscape-844x390.png`), so this is specific to the shorter landscape height.

## Successful flow and observations

- 390x844 portrait loaded with map, attribution, map controls, planner, and bottom navigation contained. Attribution links remained readable (`screenshots/00-initial-390x844.png`).
- Text entry worked in the ride request field and enabled `Find ride options`. In headless mobile Chromium, no OS software keyboard is rendered; this is emulation limitation, not physical keyboard evidence.
- After the normal route request completed, route choices and map geometry rendered (`screenshots/03-route-ready-390x844.png`).
- Explicitly correcting the endpoints, replanning, selecting Quick, and entering ride preview worked. Starting ride mode showed `GPS unavailable`, which is expected without a physical/emulated location and is recorded as environment evidence only (`screenshots/07-prepare-390x844.png`). Exiting ride mode returned to the route state.
- `Undo ride change` and `Redo ride change` were present during route editing. No console/page errors were observed in the exercised route flow.
- The map remained useful behind the portrait sheet and in 844x390 landscape. At 667x375 landscape, map attribution and controls were contained but the planner content was not.

## Evidence inventory

- Portrait: `screenshots/00-initial-390x844.png`, `screenshots/03-route-ready-390x844.png`, `screenshots/07-prepare-390x844.png`, `screenshots/08-edit-route-390x844.png`, `screenshots/11-quick-selected-390x844.png`.
- Landscape: `screenshots/12-landscape-844x390.png`, `screenshots/13-landscape-667x375.png`, `screenshots/14-landscape-667x375-scrolled.png`.
- Details repro captures: `screenshots/issue-001-step-1-route-ready-2.png`, `screenshots/issue-001-result-road-locks-2.png`.
- Session recordings retained under `videos/`; the most relevant exploratory capture is `videos/issue-001-details-repro.webm`.
