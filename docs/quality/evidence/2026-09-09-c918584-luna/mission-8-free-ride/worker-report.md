# Mission 7 — Free Ride continuity

| Field | Value |
|---|---|
| Target | https://ride.henning.rodeo |
| Deployed SHA | `c91858479c176119ba633580cfc0902c6863ba8c` |
| Build | `build-TfctsWXpff2fKS` |
| Session | `luna-c918-free-ride` |
| Viewport | Chromium, 390x844 CSS px |
| Requested location | Harrisburg, PA area: 40.2732, -76.8867 |

## Outcome

The planner accepted an emulated Harrisburg start. I set a Twisty road character and checked Avoid highways and Avoid tolls. Free Ride opened and exited cleanly, and the freshly selected avoid constraints were still checked after exiting Free Ride (`screenshots/14-free-ride-precondition.png`, `screenshots/15-free-ride-entered.png`, `screenshots/18-constraints-after-free-ride.png`).

The complete suggestion -> accept -> Head Home path could not be proven: the production browser reported geolocation permission `denied` and the visible map control stayed `Location not available`. A thin in-page coordinate stub was used only to seed the requested Harrisburg start; this is not real GPS, background, device, or physical evidence. Free Ride remained on its HUD with Pause disabled and no suggestion/Head Home after a 5-second wait (`screenshots/16-free-ride-waited.png`). Treat this as an environment limitation, not a product defect.

## Top findings

### M7-01 — Starting/resuming a recording drops all controls on mobile

| Field | Value |
|---|---|
| Classification | Actual defect / functional UX |
| Severity | High (reload workaround) |
| Confidence | Medium; observed on both Start recording and Resume in this session |
| Reproduced | Yes within the same session |
| Evidence | `screenshots/07-record-dialog.png`, `screenshots/08-recording-active.png`, `screenshots/09-after-escape.png`, `screenshots/10-reload-recovery.png`, `screenshots/11-recording-resumed.png` |

**Repro:** At 390x844 with a start set, tap Record, then Start recording. The modal closes into a map-only screen: planner, nav, recording HUD, and stop/pause controls are absent. Escape does nothing. Reloading restores a Ride recording HUD (`Finish recording`, `Resume`, `Finish & save`, `Discard`), but tapping Resume returns to the same map-only screen. A rider cannot operate or finish the active recording without reloading.

**Expected:** Active recording should show a visible HUD with pause/finish controls and remain in the same ride/recording mental model.

### M7-02 — Recording recovery resets selected rider avoid constraints

| Field | Value |
|---|---|
| Classification | Actual defect / functional continuity |
| Severity | Medium |
| Confidence | Medium; one complete repro in this session |
| Reproduced | Yes across the recording start -> reload -> finish flow |
| Evidence | `screenshots/02-constraints-twisty-avoid.png`, `screenshots/08-recording-active.png`, `screenshots/10-reload-recovery.png`, `screenshots/13-constraints-after-record.png` |

**Repro:** Set Twisty plus Avoid highways and Avoid tolls. Start recording; after the map-only state, reload and use the recording HUD to return to the planner. Open Ride options. Both Avoid highways and Avoid tolls are now unchecked (and the profile is back to Street), despite the same ride being restored. Re-selecting the constraints before entering Free Ride kept them checked after Free Ride exit, so the loss is specific to the recording recovery path observed here.

**Expected:** Recording/recovery should preserve the rider's active route character, avoid constraints, and bike profile.

### M7-03 — Free Ride suggestion and Head Home unavailable under this browser environment

| Field | Value |
|---|---|
| Classification | Environment limitation, not defect |
| Severity | N/A |
| Confidence | High for this session |
| Reproduced | N/A |
| Evidence | `screenshots/04-find-location.png`, `screenshots/15-free-ride-entered.png`, `screenshots/16-free-ride-waited.png` |

The browser's geolocation permission remained denied despite the agent-browser geolocation setting; the app visibly rendered `Location not available` and emitted only Mapbox warnings that geolocation support was unavailable. Free Ride therefore could not produce a rider-positioned suggestion, accept/ignore one, or expose Head Home. No physical-device or real-GPS claim is made.

## Successful checks

- Ride options exposed road character, highway/toll avoidance, and motorcycle profile controls.
- Emulated current-location start was accepted and became `Change start` (`screenshots/05-current-location-emulated.png`).
- Free Ride entry and exit worked (`screenshots/15-free-ride-entered.png`, `screenshots/17-free-ride-exit.png`).
- After reselecting the constraints for the Free Ride attempt, Avoid highways and Avoid tolls remained checked after exit (`screenshots/19-constraints-after-free-ride-visible.png`).

## Console/environment notes

No uncaught page exception was observed. Repeated warnings stated: `Geolocation support is not available so the GeolocateControl will be disabled.` The recording finish action also reported `Record at least two GPS points before finishing`; with a fixed emulated coordinate this is expected environment behavior, not evidence of a defect.
