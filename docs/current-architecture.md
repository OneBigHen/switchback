# Switchback current architecture

This is the repository architecture after the 2026-08-04 first-class routing
implementation slice. It distinguishes code that is present from provider,
device, and visual evidence that still needs a dedicated quality pass.

## Runtime and boundaries

- The product is a single Next.js 16 / React 19 / TypeScript application.
- `src/app/page.tsx` mounts `PlannerShell`, which owns Plan, Ride, Record,
  Profile, Library, and Free Ride surface transitions.
- Next.js route handlers under `src/app/api/` are the server boundary. Provider
  credentials and routing URLs remain server-side.
- The default routing region is Pennsylvania plus New Jersey. Requests outside
  installed graph coverage return an explicit provider error; the application
  does not draw a straight-line route as a substitute.

## Routing path

```text
PlannerShell / PlannerDeck
  -> ride-plan-request + trip-planning-coordinator
  -> POST /api/routes
  -> routes/handler + routing/planner
  -> normalized provider boundary
       -> GraphHopper primary/custom models
       -> optional Valhalla alternative/fallback
       -> optional elevation and PA unpaved enrichment
  -> PlannedRoute + routeScore / TripPlan
  -> MapStage, RouteComparison, RideHud, RouteLibrary
```

`src/lib/routing/types.ts` remains the compatibility-facing application
contract. `src/lib/domain/contracts.ts` defines provider-neutral route,
road-feature, temporal, score, rider-event, suggestion, and offline-pack
values. `src/lib/recommendation/route-score.ts` turns normalized features into
an explainable score with hard safety/legal/confidence gates. The existing
planner still owns timeboxing, locks, overlap rejection, provider warnings,
and final selection.

## Profiles and providers

The product exposes eight profiles: `quick`, `balanced`, `twisty`, `scenic`,
`adventure`, `gravel`, `avoid-highways`, and `neural`. Each has explicit
GraphHopper/Valhalla compatibility behavior. Balanced and Neural may reuse a
provider primitive, but their Switchback scoring/request rules remain distinct;
Avoid Highways adds a hard motorway/trunk exclusion.

GraphHopper is primary. Valhalla is optional and retains provider provenance
and degraded warnings. Provider responses are normalized before reaching the
UI, and route explanations use measured route fields rather than invented
claims.

## Client modes and persistence

- Plan uses `PlannerDeck`, route comparison, route-score explanations, and the
  existing multi-stop/loop/GPX/library flows.
- Ride uses `RideHud`, `navigation-engine`, and the navigation session
  controller for GPS matching, maneuvers, off-route state, voice, wake lock,
  and reroute/rejoin behavior.
- Record uses `useRecordingSession` and `RideRecordingHud`; finished rides are
  local `RideJournalLibrary` entries.
- Free Ride uses `FreeRideHud` and the recommendation reducer. The API reads
  bounded curvature candidates, suppresses unsafe/overloaded situations, shows
  one suggestion, and turns acceptance into the existing Ride flow.
- `rider-preferences.ts` and `rider-route-ranking.ts` keep preference learning
  local, interpretable, resettable, exportable, and subordinate to route
  safety/legal gates.
- Dexie/IndexedDB libraries persist routes, trip plans, rides, rider
  preferences, offline region packs, and saved route packs.

## Offline and privacy posture

`src/lib/offline/v2-router.ts` and the region download client provide validated
local graph data. `offline-route-recovery.ts` can recover a route from a valid
saved corridor pack after provider failure or network loss; it rejects missing,
expired, corrupt, or out-of-corridor packs and never substitutes a straight
line. Full device airplane-mode proof remains a release gate.

Precise history stays local by default. Profile controls expose local learning,
reset, export, and deletion. Portable sharing retains its redaction behavior;
home/work redaction and future sync remain explicit product boundaries.

## PWA and evidence

`src/app/manifest.ts` and `public/sw.js` provide the installable shell and
same-origin/tile caching. API requests are not cached as fake successes.
Current Free Ride browser evidence is in
`artifacts/screenshots/e2e-free-ride-*.png`; it covers mobile Safari,
desktop Chromium, and mobile-landscape widths. Browser/device limitations are
documented in ADR 0006.

## Validation posture

Focused routing/profile/navigation checks are green. The full lint, typecheck,
Vitest, build, browser, live-provider, accessibility, security, and physical
iPhone matrix is intentionally the next quality pass. A passing local test does
not imply that GraphHopper, Valhalla, or iOS services were live during the run.
