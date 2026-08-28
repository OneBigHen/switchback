# Release evidence

This index maps product capabilities to the implementation and the strongest
available verification layer. `NOT PERFORMED` is intentional when a physical
or configured live environment was not available.

| Capability | Implementation | Unit/integration | Browser | Real router | Live/device | Status |
|---|---|---|---|---|---|---|
| Twisties / scenic suggestions | `PlannerDeck`, ride-intent flow | route intent tests | critical suggestions and prompts | normal route | live smoke PASS | Automated; device pending |
| Profiles and access safety | `src/lib/routing/graphhopper.ts`, bike profiles | GraphHopper request tests | provider-error journey | private and motorcycle-closed fixture cases | live smoke PASS | Automated; device pending |
| Loops | round-trip planner and GraphHopper provider | loop request tests | fixed-start loop | closed 20-minute fixture loop | device drill | Automated; device pending |
| Destination routing | `/api/routes`, planner | destination timebox tests | destination journey | normal point-to-point | live smoke PASS | Automated; device pending |
| Alternatives | planner comparison path | alternatives tests | alternative selection | N/A | N/A | Automated |
| Save and GPX library | IndexedDB libraries and import worker | library/import tests | save/reload and import | N/A | device drill | Automated; device pending |
| Free Ride | suggestion API and guided Ride transition | Free Ride tests | accept-to-Ride journey | N/A | device drill | Automated; device pending |
| PWA shell and offline library | `public/sw.js`, IndexedDB | service-worker tests | production PWA project | N/A | physical drill | Automated; device pending |
| Regional offline reroute | `OfflineGeoWorkerClient`, v2 tiles, `regional-offline-route.ts` | offline worker/router suites | regional E2E pending | generated PA/NJ parity: 187/208 (89.9%), legality clean; 0 oracle errors; gate failed | physical drill | Parity open; device pending |
| Provider degradation | typed route errors and hybrid provider | hybrid/error tests | provider failure journey | impossible route fixture | live smoke PASS | Automated; live depends on config |
| Responsive plan/ride surfaces | existing responsive CSS and Playwright projects | component tests | responsive critical journey and broad matrix | N/A | iPhone drill | Automated; device pending |
| Privacy/local data | local libraries and profile storage | storage/privacy tests | save/reload behavior | N/A | device drill | Automated; device pending |
| Level A mobile hierarchy | `playwright.mobile.config.ts`, `tests/e2e/mobile-qa/` | mobile QA helper/assertion tests | WebKit/iPhone primary; Chromium comparison | N/A | real iOS/PWA separate | Fast/full emulation must be recorded separately from real-device proof |

## Visual evidence

The repository already contains canonical screenshots for the meaningful
surfaces. The most direct release references are:

- [planner desktop routes](../../artifacts/screenshots/e2e-planner-desktop-chromium.png)
- [planner iPhone Safari](../../artifacts/screenshots/e2e-planner-mobile-safari.png)
- [planner landscape](../../artifacts/screenshots/e2e-planner-mobile-landscape-wide.png)
- [route comparison](../../artifacts/screenshots/planner-desktop-comparison.png)
- [Free Ride desktop](../../artifacts/screenshots/e2e-free-ride-desktop-chromium.png)
- [guided Ride desktop](../../artifacts/screenshots/e2e-ride-desktop-chromium.png)
- [saved Library desktop](../../artifacts/screenshots/e2e-library-desktop-chromium.png)
- [profile controls](../../artifacts/screenshots/reskin-profile-desktop-final.png)

Failure screenshots, traces, browser video, and the GraphHopper log are CI
artifacts with seven-day retention. The separate Level A mobile workflow
uploads the complete `artifacts/mobile-qa/` tree for 14 days; see
[LEVEL_A_MOBILE_QA.md](LEVEL_A_MOBILE_QA.md) for inspection commands and
retention boundaries.

## Mobile release confidence

Record these four boundaries on separate lines in every release summary. Do
not infer either real-device line from WebKit or Chromium:

```text
Mobile responsive emulation: PASS/FAIL
WebKit mobile approximation: PASS/FAIL
Real iOS Safari: PASS/FAIL/NOT RUN
Installed iOS PWA behavior: PASS/FAIL/NOT RUN
```

Level A uses WebKit/iPhone emulation as its primary Linux signal and Chromium
as a comparison. Its offline state proves only shell/local saved data and API
failure handling, not offline rerouting. Level B is an infrequent real iOS
Safari or BrowserStack run using the same `core-state`, `layout-containment`,
and `visual-state` IDs. There are currently no real-iOS credentials or SDK in
this repository, so that boundary remains `NOT RUN` until it actually runs.
Installed PWA behavior requires the physical-device drill and is reported
separately. No real-iPhone claim is made without real-iPhone evidence.
