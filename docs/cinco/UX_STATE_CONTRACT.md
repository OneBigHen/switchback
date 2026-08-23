# Switchback UX State Contract (CINCO Phase 0)

This document is the authoritative contract for how every planner/ride screen
state is constructed deterministically in tests. Later CINCO phases change
these states' *presentation*; the construction seams and markers defined here
are what visual and E2E evidence are pinned against.

- Program: CINCO (`docs/cinco/`)
- Established: Phase 0, branch `cinco/phase-0-baseline-ux-contract`
- Baseline main SHA at phase start: `b2d78ca5267e7995a0bc9a9520e90a0e46aa4a5f`

## Sources of nondeterminism made deterministic

| Input | Behavior without pinning | Deterministic control |
|---|---|---|
| Wall-clock time | Shell theme flips to dark when local hour `< 6` or `>= 19` (`PlannerShell.tsx`), auto night map style via sun calc (`day-phase.ts`), Free Ride suggestion expiry (`SB-030`) | `page.clock.setFixedTime(UX_STATE_FIXTURES.PINNED_CLOCK)` (midday) before navigation |
| Device location | Config pins geolocation to fixture start (`playwright.config.ts`) | Keep default; off-route state moves it explicitly with `page.setGeolocation` |
| Map camera motion | `easeTo`/`flyTo` run 650 ms animations that can straddle a screenshot | Fixed `MAP_SETTLE_MS = 900` settle window (> longest 650 ms transition) after each state marker |
| Live external services | Tiles, routing, weather, geocoding, suggestions would vary or fail | All network calls fulfilled by `tests/e2e/helpers/planner-fixtures.ts` mocks; service workers blocked by Playwright config |
| Dev-mode toast | Next.js dev indicator overlays screenshots | Masked via existing `screenshotOptions()` |

No app code was changed to achieve this stabilization; all controls live in
the test harness.

## Required viewports

Every primary screen must be evidenced at all of:

| Name | Size | Role |
|---|---|---|
| `desktop` | 1440x900 | Desktop workspace |
| `mobile` | 390x844 | Phone portrait |
| `phone-landscape` | 844x390 | Phone landscape |
| `tablet-portrait` | 768x1024 | Tablet portrait |
| `tablet-landscape` | 1024x768 | Tablet landscape |

Covered by `tests/e2e/visual/screens.spec.ts` (primary screens) and
`tests/e2e/visual/ux-states.spec.ts` (state contract evidence, phone portrait
+ desktop).

## Screen-state contract

Each state lists: how tests construct it, the UI marker asserted before any
screenshot, and the fixture file that owns it. Construction must never depend
on a live external service.

### 1. Home
- Construct: open `/` with planner service mocks installed.
- Marker: heading `Where do you want to ride`.
- Owner: `uxState.home`.

### 2. Route loading
- Construct: home → editor → fixture start/finish → intercept `/api/routes`
  and hold the response open → click `Plan route`.
- Marker: plan button label switches to `Reading the roads…`.
- Owner: `uxState.routeLoading` (returns a release function that resolves the
  held response so the page can finish cleanly).

### 3. Route selected
- Construct: route loading flow released with one fixture route → click its
  `Select` button.
- Marker: deck header shows `Route ready` plus the route name.
- Owner: `uxState.routeSelected`.

### 4. Alternatives
- Construct: same planning flow with a trip plan containing two or more
  routes (twisty primary, scenic alternative).
- Marker: heading `Choose a route` with multiple `Select` buttons.
- Owner: `uxState.routeAlternatives`.

### 5. Route detail
- Construct: alternatives/result state → click `Show route details`.
- Marker: toggle reads `Hide route details`.
- Owner: `uxState.routeDetail`.

### 6. Route edit
- Construct: from result/selected state click `Edit route`.
- Marker: editor heading `Pick two points` / point comboboxes visible.
- Owner: `uxState.routeEdit` (reuses `openPlannerEditor`).

### 7. Ride
- Construct: selected route → `Start … route`.
- Marker: `.ride-hud` panel plus region `Ride mode|Ride preview for …`.
- Owner: `uxState.ride`.

### 8. Off-route / recovery
- Construct: reach Ride state, then move the virtual GPS fix far off the
  fixture geometry with `page.setGeolocation`.
- Marker: `.ride-hud.is-off-route` present.
- Note: automatic reroute requires sustained deviation by design; this state
  captures the immediate off-route recovery surface only.
- Owner: `uxState.offRouteRecovery`.

### 9. Free Ride idle
- Construct: click `Free Ride`; mock `/api/free-ride/suggestions` returning
  `{ suggestion: null, suppressed: true, suppressionReason: "no-safe-candidate" }`.
- Marker: `.free-ride-empty` suppression label text
  `No experimental road suggestion is ready in the next few miles.`.
- Owner: `uxState.freeRideIdle`.

### 10. Free Ride suggestion
- Construct: same entry; mock returns a fresh fixture suggestion whose
  `expiresAt` is a far-future constant (never expires under the pinned clock).
- Marker: region `Suggested fun road`.
- Owner: `uxState.freeRideSuggestion`.

### 11. Map provider failure
- Construct: register an abort handler for the base style endpoint after the
  standard service mocks, then load home.
- Marker: `.map-error` status text `The base map could not load. Routing
  controls remain available.` — proving renderer failure stays distinct from
  routing failure.
- Owner: `uxState.mapProviderFailure`.

## Snapshot discipline

- New baselines are created only by running the specs locally; they are never
  generated in CI to make a gate pass.
- Existing baselines are updated only when the reviewed diff corresponds to an
  intentional, described visual change (QA-002).
- Evidence copies of every Phase 0 capture are exported to
  `artifacts/cinco/phase-0/` for PR review without opening snapshot internals.

## Baseline gate status at Phase 0 start

Recorded on branch point `b2d78ca`:

| Gate | Command | Result |
|---|---|---|
| Lint | `npm run lint` | pass (0 warnings allowed) |
| Types | `npm run typecheck` | pass |
| Unit | `npm test` | 223 files, 1367 passed, 1 skipped |
| Critical E2E | `npm run test:e2e:critical` | 32 passed (chromium + webkit) |

Environment note: after `npm ci`, Playwright browser binaries must be
reinstalled once (`npx playwright install chromium webkit`) before E2E runs;
missing binaries fail launches instantly and are unrelated to app behavior.

## Rules going forward

1. Any phase that changes a state's presentation updates the corresponding
   baseline deliberately, with the visual reason recorded in its PR.
2. Any phase that adds a state extends this contract and
   `ux-state-fixtures.ts` in the same change.
3. Moving-state surfaces (Ride, Free Ride) must remain constructible with the
   same fixtures used here; density changes may not break their markers.
