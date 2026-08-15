# P28 — GPX join and export

**Phase:** P28 — join an imported GPX from the rider's current location and
export the resulting or original track without changing ownership
**Release gate:** G6

## Before behavior

- Imported GPX routes could be inspected and replayed, but a rider away from
  the original start had no bounded way to route to a safe forward entry.
- Track-only guidance could not be composed with a routed approach while
  preserving the distinction between provider instructions and the original
  GPX line.
- Route export was a single generic GPX shape and recorded rides had no
  first-class export path.

## After behavior

- `src/lib/gpx/join.ts` builds a bounded join preview from the current GPS
  fix, nearby forward entries, original start, and GPX waypoints. It rejects
  remote, backwards, direction-mismatched, and too-short candidates instead
  of inventing a connector or silently rerouting the GPX.
- Planner route details expose Find entries, Best join, Original start, and
  explicit entry choices. The existing route planner produces the approach;
  `joinGpxRoute` appends the GPX tail once, preserves approach instructions,
  and marks the result `continuous-track` with private rider provenance.
- Continuous-track and track-only Ride sessions show track guidance, do not
  announce a false arrival or GPX-leg turn, and do not auto-reroute when road
  data is unavailable.
- The existing export path now offers Track, Track + waypoints, Route,
  Original, and Recorded ride. Error-bounded simplification protects start,
  finish, waypoint, and maneuver anchors. Preview routes and derivative
  routes cannot be exported as an "original" artifact.
- The original route remains the single geometry owner. Joined routes carry
  only the selected tail plus the routed approach; no duplicate global GPX
  store or destructive source mutation was added.

## Files changed

- `src/lib/gpx/join.ts` — bounded candidate preview, selection, composition,
  metric blending, and derivative provenance.
- `src/lib/routing/types.ts` — optional navigation and GPX-parent metadata.
- `src/lib/routing/gpx.ts` — export variants, recorded-ride export, and
  anchor-preserving simplification.
- `src/lib/routing/gpx-import.ts`, `scripts/import-project-gpx.ts` — explicit
  track-only mode on imported GPX/KML artifacts.
- `src/lib/client/navigation-engine.ts`,
  `src/components/planner/useNavigationSessionController.ts`, and
  `RideHud.tsx` — continuous-track instruction and reroute boundaries.
- `src/lib/client/route-exchange-actions.ts`, `PlannerShell.tsx`, and
  `RouteComparison.tsx` — download, recorded-ride, and join UI wiring.
- `src/app/styles/route-comparison.css` and `ride-hud.css` — compact join and
  track-guidance presentation.
- `tests/unit/gpx.test.ts`, `tests/unit/gpx-join.test.ts`, and the existing
  route/navigation/component suites — export, simplification, bounded join,
  no-false-arrival, and compatibility coverage.

## Migrations

No destructive migration is required. Navigation mode, GPX parent, and
derivative provenance are optional route fields, so existing saved routes and
older project artifacts remain readable. No owner-corpus re-import was run.

## Tests

- Megaplex focused P28 audit: 7 files / 68 tests passed.
- Megaplex `npm run verify`: 188 test files / 1,244 passed / 1 skipped;
  lint, typecheck, and production build passed.
- Megaplex broad browser matrix: 28/28 passed.
- Megaplex critical Chromium/WebKit matrix: 30/30 passed.
- Megaplex PWA/offline matrix: 2/2 passed.
- Megaplex memory soak: 1/1 test, 10/10 planner cycles.
- Megaplex real GraphHopper fixture: 5/5 passed with
  `GRAPHHOPPER_URL=http://127.0.0.1:8998`; router PID and port 8998 cleanup
  were clear afterward.

## Routing and data-quality boundary

P28 proves bounded local join selection and the app's continuous-track
behavior. It does not prove that a production map provider can reach every
candidate, that a device GPS fix or heading is accurate outdoors, that a
transferred GPX device renders every variant, or that physical iPhone voice,
screen, storage, and rejoin behavior are correct. The automated browser suite
also retains the known non-failing narrow MapLibre canvas-fit warning.

## Deferred

- P29–P36 — remaining qualification and release work.
- Physical/mobile-device transfer and outdoor GPX rejoin acceptance remain
  release gates; automated tests are not a substitute for those checks.

## Rollback

Remove the join/export UI wiring and optional route metadata. Existing GPX
geometry, track-only imports, and saved routes remain usable; no data rollback
is needed.
