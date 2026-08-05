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
| Provider degradation | typed route errors and hybrid provider | hybrid/error tests | provider failure journey | impossible route fixture | live smoke PASS | Automated; live depends on config |
| Responsive plan/ride surfaces | existing responsive CSS and Playwright projects | component tests | responsive critical journey and broad matrix | N/A | iPhone drill | Automated; device pending |
| Privacy/local data | local libraries and profile storage | storage/privacy tests | save/reload behavior | N/A | device drill | Automated; device pending |

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
artifacts with seven-day retention.
