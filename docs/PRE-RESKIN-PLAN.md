# Switchback Pre-Reskin Completion Plan

Status as of this writing: the **data layer** for E2 (Road Locks) and E4 (Regions) is
implemented and tested (80 unit tests, 744 tests green, lint + typecheck clean). The
**UI layer is not wired**. A full reskin should not begin until every item below is
done; otherwise the new skin will be applied to surfaces that do not yet render the
E2/E4 features, requiring a second skinning pass.

The only item explicitly deferred is fully automatic route extraction from arbitrary
map images.

---

## 0. Mental model

Three layers must converge before reskin:

1. **Data / types / libraries** — DONE. E2 and E4 data contracts are merged.
2. **Planner wiring** — NOT DONE. `RouteRequest.roadLocks`, `BikeProfile`, region
   policy overlays, route data-quality, staleness, storage quota, download modes,
   and region suites are all exported but unused by the planner.
3. **Components / surfaces** — NOT DONE. There are no road-lock affordances, no
   bike-profile selector, no data-quality bars, no staleness badges, no suite
   picker, no storage-quota UI, no download-mode picker in the existing components.

Reskin = visual + typography + layout + interaction polish. It must be the **last**
step. Doing it before wiring produces legacy-looking surfaces that immediately need
to be reskinned again.

---

## 1. Road locks — UI surface

Currently `RouteRequest.roadLocks` exists in `src/lib/routing/types.ts` and the
`RoadLock` type, library, rematch, and satisfaction helpers all exist in
`src/lib/roads/road-locks.ts`. None of it is reachable from the UI.

### 1.1 Map interactions

Files: `src/components/planner/MapStage.tsx`, `src/components/planner/map-drawing.ts`.

- [ ] **Road tap selector.** Tapping a road on the map enters lock-select mode and
      snaps the tap to the nearest routable graph edge. Existing click handler in
      `MapStage.tsx:277-289` only knows `armedPoint` / `addingVia`; extend to a new
      `armedRoadLock` mode.
- [ ] **Start/end of corridor.** After the first tap, the rider chooses the
      beginning and end of the locked stretch (two ordered anchor points). Render
      anchor notches on the map at the chosen coordinates.
- [ ] **Mode picker.** Inline UI to choose `Must use` or `Prefer` (the only two
      tiers; refuse a third).
- [ ] **Name your lock.** Optional free-text field, e.g. "Best section of PA-125".
- [ ] **Manual corridor drawing.** Reuse the sketch surface in `map-drawing.ts`
      (`beginSketch`/`continueSketch`/`finishSketch` at `MapStage.tsx:127-169`)
      but emit a `RoadLock` instead of a route sketch when in lock-draw mode.
- [ ] **GPX lock import.** `src/lib/routing/gpx-import.ts` parses GPX today; extend
      the import path in `src/lib/client/route-exchange-actions.ts:34` to optionally
      emit a `gpx`-provenance `RoadLock` (via `createGpxRoadLock`) when the rider
      chooses "Import as lock" rather than "Import as route".
- [ ] **Match-state rendering**. Green / amber / red polylines for
      `exact` / `matched` / `approximate`; unresolved locks render dashed.
- [ ] **Anchor drift arrows** when rematching moves the snaps.

### 1.2 Image overlay trace (Phase one)

Files: new `src/components/planner/RoadLockImageOverlay.tsx`, new
`src/components/planner/useRoadLockImageOverlay.ts`.

The state shape (`RoadLockImageOverlayState`) is already defined in
`src/lib/roads/road-locks.ts`. The accuracy statement constant
`IMAGE_TRACE_ACCURACY_STATEMENT` is exported and waiting.

- [ ] **Image upload.** Local-only, never persisted, never redistributed.
- [ ] **Two-point georeference.** Rider pins two known points from the image onto
      the live map.
- [ ] **Transform controls.** Position, scale, rotation, opacity sliders.
- [ ] **Optional verify point.** Third control point used to confirm alignment.
- [ ] **Manual trace.** Rider traces the desired line in image pixel space.
- [ ] **Snap to routable OSM roads.** Trace is converted to edge ids and ordered
      anchors; unmatched sections render in red on the map.
- [ ] **Save as `image-trace` lock** via `createImageTraceRoadLock`.
- [ ] **Accuracy banner.** Display `IMAGE_TRACE_ACCURACY_STATEMENT` verbatim above
      the matched route.
- [ ] **Cleanup.** Uploaded image bytes are dropped from memory after save or
      cancel.

### 1.3 Lock list panel

Files: new `src/components/planner/RoadLockLibraryDrawer.tsx`, reuse
`RoadLockLibrary` from `src/lib/roads/road-locks.ts`.

- [ ] List active locks with provenance icon, mode badge, source region.
- [ ] Tap a lock to highlight it on the map and show its anchors.
- [ ] Edit a lock: rename, widen fallback corridor, convert `must` → `prefer`.
- [ ] Delete a lock with a confirm-step (a lock must never disappear silently).
- [ ] Filter by region, source, mode.

### 1.4 Must-use lock failure UX

Files: new `src/components/planner/MustLockUnresolvedPanel.tsx`.

The four recovery options are already exported as
`MUST_LOCK_UNRESOLVED_OPTIONS` in `src/lib/roads/road-locks.ts`. The panel must:

- [ ] Surface the previous route (the planner must not overwrite it on a failed
      `must` plan).
- [ ] Show: "<displayName> could not be included."
- [ ] Offer all four options:
  - Try a wider match
  - Convert to Prefer
  - Remove lock
  - Restore previous route
- [ ] Never silently fall through to a "valid" route that omits the lock.

### 1.5 Prefer lock skip explanation

Files: `src/components/planner/RouteComparison.tsx`, new
`src/components/planner/RoadLockSatisfactionBadge.tsx`.

- [ ] When `RoadLockSatisfaction.skippedReason` is present, render the explanation
      string on the route card (e.g. "Preferred road skipped because it requires a
      47-mile backtrack." — `describePreferSkipReason` already produces this).

---

## 2. Planner wiring — locks into the routing pipeline

Files: `src/lib/planner/ride-plan-request.ts`, `src/lib/client/trip-planning-coordinator.ts`,
`src/lib/routing/planner.ts`, `src/lib/routing/hybrid.ts`, `src/lib/routing/graphhopper.ts`,
`src/components/planner/PlannerShell.tsx`, `src/stores/planner-store.ts`.

### 2.1 Store + view model

- [ ] Add `roadLocks: RoadLock[]` to `PlannerState` in `src/stores/planner-store.ts`.
- [ ] Add `addRoadLock`, `updateRoadLock`, `removeRoadLock`, `convertRoadLock`,
      `clearRoadLocks` actions.
- [ ] Add to `PlannerRideConfigViewModel` in
  `src/components/planner/PlannerDeckViewModel.ts`.
- [ ] Plumb through `buildPlannerDeckViewModel`.

### 2.2 Request construction

- [ ] `buildRideTripRequest` in `src/lib/planner/ride-plan-request.ts` must
      include `roadLocks: state.roadLocks` on the outgoing `TripPlanRequest`.
- [ ] `runLatestTripPlan` already passes the request through unchanged; verify
      nothing strips the field.
- [ ] Server side: `src/app/api/routes/handler.ts` must accept and forward
      `roadLocks` to GraphHopper's custom model. (Currently does not.)

### 2.3 Engine integration

Files: `src/lib/routing/graphhopper.ts`, `src/lib/routing/hybrid.ts`, `src/lib/routing/planner.ts`.

- [ ] **Must-use locks.** Translate `mode: "must"` locks into GraphHopper
      `custom_model.priority` rules that zero-out any path not containing the
      locked edge ids; if no path exists, the `planMotorcycleTrip` call returns
      with a `MustLockUnresolved` warning instead of silently dropping the lock.
- [ ] **Prefer locks.** Translate `mode: "prefer"` locks into a
      `multiply_by` reward (e.g. 1.5–2.0) on the corridor edges via
      `custom_model.priority`.
- [ ] **Lock precedence**. Before submitting, call `partitionLocksByPrecedence`
      from `src/lib/roads/lock-precedence.ts`. Skip locks that fail precedence and
      attach their reason to `TripPlan.warnings` — never silently drop.
- [ ] **Lock satisfaction.** After candidates come back, call
      `evaluateRoadLockSatisfaction` for each lock on each candidate and surface
      the results on the route card.
- [ ] **Hybrid provider**. `createHybridRouteProvider` in
      `src/lib/routing/hybrid.ts` must carry locks through to both engines and
      union the satisfaction results.

### 2.4 GPX import path

Files: `src/lib/client/route-exchange-actions.ts`, `src/lib/routing/gpx-import.ts`.

- [ ] `parseGpxRoute` returns a `PlannedRoute` today; extend the flow so a rider
      can opt to import a GPX as a `gpx`-source `RoadLock` via
      `createGpxRoadLock`.
- [ ] Library drawer (`LibraryDrawer.tsx:228-287`) needs an "Import as lock"
      affordance next to the existing "Import as route".

### 2.5 Region policy overlays at request time

Files: `src/lib/routing/graphhopper.ts`, `src/lib/routing/region-policy.ts`,
`src/lib/planner/ride-plan-request.ts`.

- [ ] When the route's waypoints fall in PA/WV/NJ/NY, merge the matching
      `RegionPolicyOverlay.customModel` into the outgoing GraphHopper
      `custom_model` (speed multipliers, priority multipliers, surface exclusions).
- [ ] `resolveRegionsByCode` from `src/lib/offline/region-suites.ts` plus
      `findRegionsContaining` already compute coverage; use them to pick the
      active overlay.

---

## 3. Bike profiles

Files: new `src/components/planner/BikeProfilePicker.tsx`, `src/stores/planner-store.ts`,
`src/lib/planner/ride-plan-request.ts`, `src/lib/routing/graphhopper.ts`.

`MOTORCYCLE_PROFILES`, `getBikeProfile`, `listBikeProfiles`, `disallowedSurfaces`,
`disallowedSmoothness`, `disallowedTracktypes` are already exported from
`src/lib/routing/bike-profiles.ts` and unused.

- [ ] Store `bikeProfile: BikeProfile` in `planner-store.ts`.
- [ ] Add `setBikeProfile` action.
- [ ] Add to `PlannerRideConfigViewModel` and `PlannerRideConfigCommands`.
- [ ] Render `BikeProfilePicker` (segmented control: Street / Touring / Adventure
      / Dual-Sport) inside `PlannerDeck.tsx`.
- [ ] Surface rider-editable fields (fuel range, reserve, allowMaintainedGravel).
- [ ] Translate `BikeProfile` into GraphHopper `custom_model` rules:
  - `Street` / `Touring`: exclude `highway=path`, exclude most `highway=track`,
    strongly penalize unknown unpaved surfaces (`disallowedSurfaces`).
  - `Adventure`: permit maintained tracks, prefer known gravel, penalize
    `disallowedSmoothness` (impassable).
  - `Dual-Sport`: permit broader track classes, still enforce legal access.
- [ ] Apply `bikeMatchesSurface` from `lock-precedence.ts` before a route is
      accepted so bike/lock conflicts are surfaced as warnings, not silently
      routed through.

---

## 4. Route data quality — UI surface

Files: `src/components/planner/RouteComparison.tsx`, new
`src/components/planner/RouteDataQualityPanel.tsx`.

`computeRouteDataQuality` in `src/lib/roads/route-data-quality.ts` returns
access / surface / condition coverage, unknown-surface miles, seasonal flag, and
caveats — all unused.

- [ ] Render three coverage bars (access / surface / condition) under the route
      card. Headline = lowest of the three.
- [ ] Show `unknownSurfaceMiles` next to the existing "X% unpaved" line at
      `RouteComparison.tsx:137`.
- [ ] Show each caveat from `result.caveats` as a small warning row.
- [ ] When `seasonalUncertainty` is true, add a distinct amber badge.
- [ ] Show `sourceMapUpdated` (region build date) in the route metadata footer.
- [ ] For corridor / offline packs, pass per-segment tag knowledge through
      `segments` argument (the fallback path today only uses `surfaceMix`).

---

## 5. Offline regions — UI surface

Files: `src/components/planner/RegionDownloadsPanel.tsx` (currently 311 lines),
new `src/components/planner/RegionSuitePicker.tsx`, new
`src/components/planner/StorageQuotaMeter.tsx`, new
`src/components/planner/DownloadModePicker.tsx`.

### 5.1 Suite picker

The three `REGION_SUITES` (Home Territory, Appalachia, Northeast) plus the
individual-region list all exist in `src/lib/offline/region-suites.ts` /
`src/lib/offline/region-catalog.ts` and are unused.

- [ ] Suite selector at the top of `RegionDownloadsPanel`.
- [ ] Selecting a suite checks every region it references (no duplicates).
- [ ] Each region remains independently: downloadable, updateable, removable,
      versioned (verify the `RegionDownloadClient` does not bundle them).
- [ ] Show "Home Territory" as the default recommendation with a distinct visual.

### 5.2 Storage quota meter

`readStorageQuotaSnapshot`, `requestPersistentStorage`,
`projectStorageQuota`, `packagesRemaining`, and the
70/85/block thresholds are all in `src/lib/offline/storage-quota.ts` and unused
(except a tiny stub `StorageQuota` component at `RegionDownloadsPanel.tsx:287-311`
that only shows total bytes).

- [ ] Show: current usage, estimated available quota, projected usage after
      install, installed size, persistence status, packages remaining that fit.
- [ ] Tier badges: normal / warn (≥70%) / strong-warn (≥85%) / block.
- [ ] "Request durable storage" button calling `requestPersistentStorage()`.
- [ ] Block the download only when the projection says `permitted: false` — never
      wipe existing data.
- [ ] Surface that browser-stored data is not guaranteed permanent; saved-route
      packs remain recoverable from the server.

### 5.3 Download-mode picker

`OFFLINE_DOWNLOAD_LEVELS`, `SAVED_RIDE_CORRIDOR_DEFAULT_MILES`,
`corridorMilesToHalfWidthMeters` are all unused.

- [ ] Three-choice picker: routing-only / full offline region / saved-ride corridor.
- [ ] For saved-ride corridor: surface the 10 / 20 / 30-mile defaults segmented by
      street / adventure / multi-day.
- [ ] Default the easiest option ("saved-ride corridor") before pressing Start Ride.
- [ ] Pass the chosen level + corridor width to `buildOfflinePackCorridor` at
      `src/lib/client/offline-pack-coordinator.ts:29` (currently hard-codes a
      500-meter half-width and 5 MB cap).

### 5.4 Staleness badges

`evaluateRegionStaleness`, `shouldPromptCorridorRebuild`,
`STALENESS_THRESHOLDS` are all unused.

- [ ] Replace the ad-hoc 7-day stale check at
      `RegionDownloadsPanel.tsx:124-129` with `evaluateRegionStaleness`.
- [ ] Render tier labels: Current / Aging / Stale / Very stale / Unsupported.
- [ ] Routing is **never blocked** based on age alone — verify nothing in
      `region-download-client.ts:52-62` rejects an "expired" bundle for routing.
- [ ] When a `saved-ride-corridor` pack's source region has been updated, show
      the prompt: "A newer <Region> map is available. Rebuild this ride's
      offline corridor?" — never silently rebuild immediately before departure.

### 5.5 Update cadence UX

`scripts/build-region-tiles.sh` runs the server pipeline; the client should:

- [ ] Check manifests once per day on app open (not in background).
- [ ] Prompt before large downloads.
- [ ] Offer "Update all on Wi-Fi".
- [ ] Allow manual refresh before a trip.

(Delta updates are explicitly deferred per lead decision — full package
replacement only.)

---

## 6. Map and attribution

Files: `src/components/planner/MapStage.tsx`, `src/components/planner/map-stage-sources.ts`,
`src/lib/client/map-layers.ts`.

The user has confirmed attribution is **already watermarked**. Do not add
duplicate attribution controls.

- [ ] Verify `MapStage.tsx:251` (compact `AttributionControl`) still renders the
      OSM credit on every map surface, in every theme.
- [ ] Verify the Offline Regions panel continues to surface the expanded ODbL
      statement at `RegionDownloadsPanel.tsx:193-201`.
- [ ] Do not add an About-page attribution section as a separate work item;
      attribution is closed.

---

## 7. Planner action dock

Files: `src/components/planner/PlannerDeck.tsx`, `src/components/planner/PlannerShell.tsx`.

- [ ] Add a "Road locks" entry point in the action dock at `PlannerDeck.tsx:612-648`
      that opens `RoadLockLibraryDrawer`.
- [ ] When the rider has at least one active `must` lock, badge the dock so the
      state is visible without opening the drawer.
- [ ] When `bikeProfile` differs from the route's selected `profile`, surface a
      small "Profile mismatch" hint.
- [ ] Add an "Offline pack" flow that respects the new download-mode picker
      before saving.

---

## 8. Ride HUD

Files: `src/components/planner/RideHud.tsx`, `src/components/planner/RideHudStatus.tsx`.

- [ ] When riding through a `must` lock corridor, render a persistent badge
      ("On locked corridor: <displayName>").
- [ ] When the ride exits a `must` corridor unexpectedly, surface an off-route
      alert (the existing reroute flow at `src/lib/client/ride-reroute.ts`
      should be the recovery path).
- [ ] Show the active bike profile in the HUD status strip so the rider can
      confirm at a glance.
- [ ] Show the route's `headlinePercent` data-quality score so a rider knows to
      verify surfaces.

---

## 9. Tests to add

The data layer has 80 unit tests. The UI/plumbing layer needs:

- [ ] `tests/unit/ride-plan-request.test.ts` — `buildRideTripRequest` carries
      `roadLocks` and `bikeProfile` through.
- [ ] `tests/unit/graphhopper-lock-request.test.ts` — locks translate into the
      expected `custom_model` entries (must → zero-out, prefer → reward).
- [ ] `tests/unit/hybrid-lock-satisfaction.test.ts` — hybrid provider returns
      per-lock satisfaction on every candidate.
- [ ] `tests/unit/planner-store-locks.test.ts` — add / update / convert / remove
      actions, persistence.
- [ ] `tests/unit/region-policy-overlay.test.ts` — overlay merges with locks and
      avoid areas without losing precedence.
- [ ] `tests/unit/route-data-quality-ui.test.tsx` — bars render the right
      percentages, caveats render the unknown-surface mileage.
- [ ] `tests/unit/storage-quota-ui.test.tsx` — tier badges and block projection.
- [ ] `tests/unit/download-mode-picker.test.tsx` — three choices, corridor
      defaults.
- [ ] `tests/unit/region-suite-picker.test.tsx` — selecting a suite selects
      independent regions, no duplicates.
- [ ] Playwright E2E: tap a road → lock must-use → plan → assert lock is in the
      proposed route.

---

## 10. Server / pipeline

Files: `src/app/api/routes/handler.ts`, `scripts/build-region-tiles.sh`,
`scripts/build-graph-bundle.mjs`, `infra/systemd/*`.

- [ ] `routes` API handler accepts `roadLocks` and `bikeProfile` and forwards
      them to GraphHopper as `custom_model` entries.
- [ ] `routes` API handler surfaces lock-satisfaction results on the response.
- [ ] GraphHopper `config.yml` in `build-graph-bundle.mjs:58-73` includes the
  full motorcycle-relevant encoded values list: `motorcycle_access, road_class,
  road_environment, max_speed, surface, smoothness, track_type, toll,
  max_weight, seasonal`. (Currently missing `track_type`, `max_weight`,
  `seasonal`.)
- [ ] `motorcycle-osm.mjs` ingests `access:conditional`, `motorcycle:conditional`,
      `motorcycle:conditional`, `surface`, `smoothness`, `tracktype`, `maxweight`,
      and `seasonal` tags — currently only normalizes motorcycle-specific access
      (`scripts/lib/motorcycle-osm.mjs:41-63`).
- [ ] systemd unit (`infra/systemd/switchback-router.service` or a new
      `switchback-region-builder.timer`) runs
      `scripts/build-region-tiles.sh --all` weekly (Sunday 03:15 recommended),
      retains the newest 3 versions, validates counts and schema, computes
      SHA-256, and publishes the manifest atomically.

---

## 11. Visual / reskin readiness checklist

Only after items 1–10 are done:

- [ ] All new surfaces have stable, semantic class names (no inline styles).
- [ ] All new surfaces use the existing token set in `src/app/globals.css`
      (`--oled`, `--machined`, `--raised`, `--instrument`, `--metal`, `--line`,
      `--signal`, `--danger`, `--success`).
- [ ] All new components have accompanying CSS modules in
      `src/app/styles/` following the naming pattern of the existing files.
- [ ] Match-state colors (green / amber / red) load from tokens so the reskin
      can re-theme them in one place.
- [ ] Focus rings, ARIA labels, and keyboard scope rules are wired through the
      existing `src/components/planner/a11y/` helpers (`AriaLiveRegion`,
      `FocusReturn`, `KeyboardScope`).
- [ ] Mobile variants in `src/app/styles/responsive.css` (currently 4,131 lines)
      are extended for every new surface.
- [ ] `MOCKUP-BRIEF.md` is updated to include the new components so the reskin
      can be generated against accurate mockups.

---

## 12. Definition of done (before reskin begins)

A reskin can start when **all** of the following are true:

1. A rider can select a road corridor on the map, choose Must use or Prefer, and
   have the lock survive replans and graph changes (with an unresolved-failure
   panel for Must, and a skip-reason panel for Prefer).
2. A rider can import a GPX file as a road lock with `gpx` provenance.
3. A rider can upload a screenshot, align it with two/three control points, trace
   a corridor, and save an `image-trace` lock (Phase one, not auto-extraction).
4. `planMotorcycleTrip` consumes `roadLocks` via the store, applies the 7-tier
   precedence, and attaches satisfaction results to each candidate.
5. A rider can pick a bike profile (Street / Touring / Adventure / Dual-Sport)
   and the planner translates it into GraphHopper `custom_model` rules.
6. The region policy overlays for PA / WV / NJ / NY are applied at request time.
7. `RouteComparison` shows three coverage bars (access / surface / condition),
   the unknown-surface mileage, seasonal flag, and source map date.
8. `RegionDownloadsPanel` shows suite presets (Home Territory / Appalachia /
   Northeast), a storage-quota meter, a download-mode picker, and staleness
   badges. Routing is never blocked based on age alone.
9. Saving a corridor pack prompts the rider to rebuild when a newer region graph
   is installed; never silently modifies immediately before departure.
10. The build pipeline runs weekly, keeps the latest three versions, and the
    client checks the manifest once per day on app open.
11. The data layer is still green: `npm run lint && npm run typecheck && npm test`
    passes; all new UI tests pass; Playwright E2E for the road-lock happy path
    passes.

The only acceptable deferred item is fully automatic route extraction from
arbitrary map images (Phase four of image work).

---

## 13. Estimated scope

Rough sizing to set expectations — not a commitment:

| Area | New / changed files | Effort |
| --- | --- | --- |
| §1 Road lock UI | 5 new components, MapStage + LibraryDrawer edits | Large |
| §1.2 Image overlay | 2 new components | Medium |
| §2 Planner wiring | 6 files, store + view model + request | Medium |
| §3 Bike profiles | 1 new picker + store + GraphHopper translation | Small-Medium |
| §4 Data quality UI | 1 new panel + RouteComparison edits | Small |
| §5 Offline UI | 3 new panels + RegionDownloadsPanel edits | Medium-Large |
| §8 Ride HUD | small edits | Small |
| §9 Tests | 10 test files | Medium |
| §10 Server / pipeline | API handler + motorcycle-osm.mjs + systemd | Medium |

Net: this is multiple days of focused work, not a single sitting. It is the
prerequisite body of work before any visual reskin can land cleanly.
