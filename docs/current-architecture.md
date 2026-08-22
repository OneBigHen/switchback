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

## GPX intelligence, join, and export boundary

The project GPX importer uses `src/lib/gpx/streaming-parser.ts` and
`corpus-ingest.ts` to preserve original track/route segments, timestamps,
elevation, waypoints, duplicate counts, gaps, and fingerprints. P27 attaches a
bounded `gpxIntelligence` report to imported routes. It stores scalar facts and
point-index spans rather than copying geometry, keeps provider path coverage
distinct from route-distance coverage, and leaves surface, road class, access,
MVUM, community, and fuel facts unknown without provenance-backed data.
`GpxIntelligencePanel` exposes the report in route details. A no-path result is
track-only with no invented turns or highway snap. P28 extends the same route
detail and exchange path: `src/lib/gpx/join.ts` scores a bounded set of nearby
forward/original/waypoint entries, uses the existing planner for the approach,
and appends one GPX tail as a private `continuous-track` derivative. The Ride
HUD keeps provider instructions on the approach, then switches to explicit
track guidance without auto-reroute or fabricated GPX turns. Track,
track-plus-waypoints, route, original, and recorded-ride exports remain one
serialization boundary; anchor-preserving simplification never mutates the
stored source geometry.

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
- Free Ride uses `FreeRideHud` and the recommendation reducer. The API loads an
  optional bounded canonical-segment/RIG graph, finds one directed ahead
  opportunity, verifies baseline versus corridor detour routing, suppresses
  unsafe/overloaded situations, applies a bounded quiet/prompt budget, and
  turns acceptance or a saved-local-Home request into the existing Ride flow.
  Accept/Ignore/Less like this use the stable-bike local preference seam.
  Without `FREE_RIDE_RIG_PATH`, it returns an explicit unavailable response
  rather than falling back to curvature rows or straight-line geometry.
- `rider-preferences.ts` and `rider-route-ranking.ts` keep preference learning
  local, interpretable, resettable, exportable, and subordinate to route
  safety/legal gates.
- Dexie/IndexedDB libraries persist routes, trip plans, rides, rider
  preferences, offline region packs, and saved route packs.

## Offline and privacy posture

`src/lib/offline/v2-router.ts`, `OfflineGeoWorkerClient`, and the region
download client provide validated local graph data. Active region manifests are
selected spatially and loaded through a byte-bounded worker LRU; the existing
`offline-route-recovery.ts` corridor path remains the smaller fallback. Both
paths reject missing, expired, corrupt, or out-of-corridor packs and never
substitute a straight line. Full device airplane-mode proof remains a release
gate.

Precise history stays local by default. Profile controls expose local learning,
reset, export, and deletion. `src/lib/community` owns bounded route-centered
public objects and plain-text moderation boundaries. The optional identity path
uses real WebAuthn registration/authentication through
`src/app/api/identity/*`, stores only credential id/public key/counter, and
issues a signed pseudonymous session only after exact origin/RP-ID verification.
Cookie-authenticated community and sync mutations also require CSRF. The core
planner, local saving, GPX, riding, and offline paths remain account-free.
`privacy-preview.ts` produces exact public geometry before upload.
`src/lib/sync` stores only authenticated ciphertext envelopes server-side; the
server does not decrypt them.

## PWA and evidence

`src/app/manifest.ts` and `public/sw.js` provide the installable shell and
same-origin/tile caching. API requests are not cached as fake successes.
Current Free Ride browser evidence is in
`artifacts/screenshots/e2e-free-ride-*.png`; it covers mobile Safari,
desktop Chromium, and mobile-landscape widths. Browser/device limitations are
documented in ADR 0006.

## Validation posture

The latest the validation host acceptance run is green through unit (202 files / 1,285
passed / 1 skipped), lint, typecheck, and production build. The self-hosted
Compose/Caddy stack is stable with non-degraded `/api/health`, live routes for
all eight profiles, and a valid Caddy configuration; final container gates are
standard browser (32/32 broad), critical browser (30/30), PWA (2/2), memory
soak (10/10 cycles), and real-router (5/5). Automated evidence still does not
imply authenticated-browser/passkey, physical iPhone, outdoor GPX-transfer,
production Valhalla, public-edge, or field behavior.
