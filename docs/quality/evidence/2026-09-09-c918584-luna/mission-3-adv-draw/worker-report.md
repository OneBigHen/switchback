# Luna Mission 3 — ADV / Drawing and Map Interactions

**Run status:** Completed after deployment-gate clarification
**Target:** https://ride.henning.rodeo/
**Candidate:** c91858479c176119ba633580cfc0902c6863ba8c
**Browser session:** luna-m3-c918584-r2 (isolated)
**Viewport:** 1440x900 (verified in-page)
**Date:** 2026-09-09

## Deployment identity

The first attempt stopped because hydration removed data-dpl-id from the live DOM. That false stop is preserved in build-marker-check.txt and the earlier initial.png.

For the resumed run, the deployment gate was accepted from the parent coordinator's independent raw public-response check: the response contained the exact candidate marker, and public Next asset URLs carried ?dpl=c91858479c176119ba633580cfc0902c6863ba8c. The hydrated live DOM still had no matching element; this is expected for this deployment and was not treated as a run blocker.

## Rider journey executed

1. Opened the public planner at the target URL in the isolated session and set a 1440x900 desktop viewport.
2. Entered the realistic request: Easton PA to Clinton NJ ADV ride with gravel and twisties.
3. Clicked Find ride options. After route generation, the planner showed one selected Adventure route: 132 min, 51.4 mi, dense curves.
4. Opened Edit route. The planner briefly showed Adding alternatives… for more than a minute with controls disabled. Clicking Cancel ride change returned the editable controls.
5. Entered Draw route. The UI showed Draw a rough route, Undo drawing point, Clear drawing, Finish drawing and plan route, Cancel drawing, and Use route fields instead.
6. Dragged a freehand line across the visible map from approximately (350,700) through (480,580), (620,650), (760,520), (900,620), to (1060,480). The orange sketch line appeared.
7. Clicked Undo drawing point. The last segment was removed while the remaining sketch stayed visible.
8. Clicked Finish drawing and plan route. The planner produced three route choices:
   - Traced — 75 min, 27.8 mi, 98% of the drawn line.
   - Better roads nearby — 54 min, 20.9 mi, 56% of the line.
   - Leaner — 22 min, 8.9 mi, 21% of the line.
9. Selected Better roads nearby. The current setup changed to that route and showed it as selected.
10. Re-entered Edit route and removed Sketch stop 3 after scrolling the planner panel to expose the control. The shaping-stop list dropped from five stops to four and the route replanned.
11. Entered Add stop on map, clicked the map at approximately (1050,350), and observed a new Shaping stop 5 plus a new Traced result (91 min, 32.2 mi).
12. Re-entered Add stop on map and clicked Cancel map pick / Cancel map placement without clicking the map. The map-pick mode exited and the Add stop on map control returned; no extra stop was added.
13. Changed the motorcycle bike preset from Street to Adventure. The ride summary changed to Mixed surfaces and the status read Changed bike preferences.
14. Clicked Undo ride change twice in separate attempts. The ride summary stayed Mixed surfaces, the status stayed Changed bike preferences, and Redo ride change stayed disabled.

No GPX export/import control surfaced naturally during this route-planning/editing journey, so no GPX interaction was performed.

## Findings

### ISSUE-001 — Undo ride change does not undo a bike-profile change

**Classification:** Actual defect
**Severity:** Medium (S2)
**Reproducibility:** Reproduced twice

**Steps**

1. Start from the prepared public PA/NJ route above.
2. Open Edit route and scroll the Ride options panel until Bike & map is visible.
3. Select the Adventure bike preset.
4. Return to the route summary and observe 120 min · Mixed surfaces, Unpaved difficulty depends on available evidence., and status Changed bike preferences.
5. Click Undo ride change.
6. Observe that the summary remains Mixed surfaces, the status remains Changed bike preferences, and Redo ride change is disabled.
7. Repeat step 5; the state remains unchanged.

**Impact:** A rider cannot visibly reverse a bike-preference change through the exposed Undo control. They must reopen Edit route and manually select the prior preset. This is especially confusing because the control remains enabled while Redo is disabled.

**Evidence:** [profile change](screenshots/r2-profile-adventure.png), [first undo](screenshots/r2-profile-undo.png), [repeat undo](screenshots/r2-profile-undo-repeat.png), [text observation](screenshots/r2-profile-undo-repeat.txt).

## Successful interaction notes

- Freehand drawing, draw-point undo, route planning, three route-choice generation, and route selection all worked.
- Removing a sketch stop worked once the offscreen control was brought into view; it triggered a replan.
- Add-stop map mode worked and returned to route results after a map click.
- Cancel map placement worked without adding a point.
- The route options clearly reported requested 120 minutes versus shorter generated alternatives.
- No browser console/page errors were observed during the checked states.

The initial Adding alternatives… state lasted over a minute until Cancel ride change was used. This was recorded as an environment/test observation rather than a confirmed application defect because no error surfaced and controls recovered after cancellation.

## Evidence index

- [Resumed initial screenshot](screenshots/r2-initial.png)
- [Request ready](screenshots/r2-request-ready.png)
- [Route result](screenshots/r2-route-results-wait.png)
- [Draw mode](screenshots/r2-draw-enter.png)
- [Freehand line](screenshots/r2-draw-line.png)
- [Draw undo](screenshots/r2-draw-undo.png)
- [Draw route options](screenshots/r2-draw-options.png)
- [Selected Better roads nearby](screenshots/r2-select-nearby.png)
- [Shaping-stop removal result](screenshots/r2-after-stop-removal.png)
- [Add-stop map result](screenshots/r2-stop-added-map.png)
- [Cancel map placement before/after](screenshots/r2-cancel-map-before.png), [after](screenshots/r2-cancel-map-after.png)
- [Undo defect evidence](screenshots/r2-profile-undo.png), [repeat](screenshots/r2-profile-undo-repeat.png)
- [Full edit snapshot](screenshots/r2-edit-snapshot.txt)
- [Full-run recording](videos/mission-3-r2-full.webm)

The browser session was closed after evidence capture. No source, runtime, GitHub state, deployment, or physical device was changed.
