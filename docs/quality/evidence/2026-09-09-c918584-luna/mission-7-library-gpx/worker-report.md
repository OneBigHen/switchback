# Luna Mission 7 — Ride library and GPX

- Candidate: `c91858479c176119ba633580cfc0902c6863ba8c`
- URL: https://ride.henning.rodeo/
- Session: `mission7-c918584` (isolated browser)
- Viewport: desktop 1440x900; no physical-device evidence
- Date: 2026-09-09 (America/New_York)
- Build gate: PASS. Browser-fetched raw HTML was 20,246 bytes and contained exactly `data-dpl-id="c91858479c176119ba633580cfc0902c6863ba8c"`.

## Summary

The public PA/NJ route-planning path generated a usable route and exposed strong preparation evidence (route quality, surface/condition caveats, NWS weather hierarchy, turn count, and GPX controls). A synthetic PA/NJ GPX imported successfully, survived reload, and was safely deleted afterward. Two library problems were reproducible: saving the freshly planned route gave no confirmation and did not create a planned library item; and the library count/filter disagreed with the imported route card (`PLANNED` card while `Planned 0`). GPX export was visibly available on route details but not clicked after the save failure; no download/physical-device evidence is claimed.

## Finding 1 — Planned route Save route does not appear in library

- Classification: suspected product defect (core workflow failure)
- Severity: High / S2
- Reproducibility: reproduced once in the bounded run; the same missing confirmation and `Planned 0` state persisted after returning to Rides.
- Evidence: `screenshots/before-save.png`, `screenshots/after-save.png`, `screenshots/rides-empty.png`

### Reproduction

1. From Plan, enter: `Scenic motorcycle ride from Easton, PA to Lambertville, NJ with twisty roads and a riverside stop`.
2. Click `Find ride options`; after routing completed, the selected route was `Twisty alternative 3`, `231 min · 148.7 mi · Twisty`.
3. Open `Details`, then `Show route details`; click `Save route`.
4. No toast, status, label change, or disabled/saved-state feedback appeared.
5. Navigate to Rides. The library showed `Planned 0`; no new planned ride for the prompt was visible.

### Expected / actual

- Expected: a clear saved confirmation and a planned ride that appears in Rides and can be reopened after reload.
- Actual: the button remained `Save route`, there was no confirmation, and the library still reported `Planned 0`.

## Finding 2 — Imported planned card and type counts disagree

- Classification: product UX/data-consistency defect
- Severity: Medium / S3
- Reproducibility: reproduced with harmless synthetic data; persisted through reload.
- Evidence: `screenshots/import-recognized.png`, `screenshots/reload-library.png`

### Reproduction

1. In Rides > Import ride, upload `synthetic-pa-nj.gpx` containing public coordinates near Easton, PA and Princeton/Lambertville, NJ.
2. Choose `Open as a route`.
3. The library increased from `All 537` / `Imported 537` to `All 538` / `Imported 538`, while `Planned` stayed `0`.
4. The new card was visibly labeled `PLANNED`, `Saved route`, `Luna PA NJ Synthetic Test`, `Ready to ride`, `35.9 mi`, `0 min`.
5. Reloaded `https://ride.henning.rodeo/?tab=rides`; the card remained present with the same `Planned 0` / `Imported 538` mismatch.

### Expected / actual

- Expected: a card labeled PLANNED should be included by the Planned count/filter, or the card should be labeled Imported if it is not a planned route.
- Actual: the card and counters contradict each other, making library filtering and preparation state misleading. The `0 min` duration is also confusing for a loaded public-coordinate test track, though the synthetic geometry was intentionally minimal.

## Passed preparation checks

For the generated Easton-to-Lambertville route, Route details showed:

- `33% MAPPED DATA COVERAGE`; access 100%, surface 0%, condition unavailable.
- Explicit caveat that surface type is unknown for all 148.7 miles and condition data is unavailable.
- `157 mapped turns` and `Route quality 41/100`.
- Weather hierarchy: `Live forecast along your line · NWS`, `81°`, `Mostly Sunny`, `1% rain at peak`.
- Turn-by-turn disclosure showed `39 steps`.
- GPX export controls were present with `Track`, `Track + waypoints`, `Route`, and `Original` choices and an `Export GPX` button. Export was not executed after the save failure, so no download claim is made.

## Recovery / cleanup

- Synthetic route management was exercised only on the test data. `Manage Luna PA NJ Synthetic Test` exposed `Delete route`; confirmation was required and deletion succeeded.
- Final status explicitly said `Luna PA NJ Synthetic Test removed from this device.` Library returned to `All 537`, `Imported 537`; screenshot: `screenshots/delete-confirmed.png`.
- No source, tests, docs, GitHub, code, runtime, or deployment files were inspected or changed.
- Agent-browser session was closed after evidence capture.
