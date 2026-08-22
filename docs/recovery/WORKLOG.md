# Switchback Recovery Work Log

## 2026-08-12 — P29–P36 implementation slice (after)

**Result**
- P29 added a byte-bounded offline Geo Worker client, binary-framed tile
  envelope, lazy active tile loading, and cancellation-aware local routing.
- P30 retained the existing atomic pending/active region install model and
  independent suite selector; corrupt updates preserve the previous active
  version and verified pending tiles remain resumable.
- P31–P34 added bounded community SQLite objects, signed pseudonymous session
  boundaries, exact publish privacy preview, opaque WebCrypto sync envelopes,
  strict grounded intent/description/search helpers, and their APIs/tests.
- P35–P36 added pinned self-host deployment/backup/restore artifacts, a safe
  region-build queue worker, native field decision record, and release
  freeze/rollback runbook.

**Verification**
- Final validation host full unit: 202 test files / 1,287 passed / 1 skipped.
- Final validation host lint, typecheck, and production build passed.
- The production Compose/Caddy stack passed `/api/health` with
  `degraded=false`, returned live GraphHopper routes for all eight profiles,
  and kept web, worker, GraphHopper, and Caddy up with zero restarts; Caddy
  configuration validation passed.
- Final production-container gates: standard browser 32/32, critical browser
  30/30, PWA 2/2, memory soak 10/10 cycles, and real-router 5/5.
- The isolated test router shut down cleanly: no PID file and port 8998 closed.
- The corrected real-data offline parity harness now fails closed on a missing
  GraphHopper oracle and sends the matching Street/Dual-Sport bike model. Its
  fresh the validation host PA/NJ run (204 random plus four golden pairs) produced
  187/208 (89.9%), with clean legality across 45,769 returned edges, 12
  comparisons above 25%, and zero oracle errors; regional parity remains open.
  The active GraphHopper graph was rebuilt with `smoothness` encoded and
  promoted with the previous cache retained for rollback.

**Verification boundary**
- Passkey ceremony, authenticated browser, sync recovery, external riders,
  production providers, field battery/GPS/thermal, and physical iPhone remain
  unproven by local automation.

**Next dependency**
Manual authenticated/field/production gates before any public release tag.

## 2026-08-12 — P29–P36 implementation slice (before)

**Goal**
Complete the remaining offline, region-pack, community, identity, sync, AI,
operations, and release seams without account-gating the local rider core or
inventing provider/device evidence.

**Scope boundary**
Reuse the current Next/API/SQLite, Dexie, routing, PWA, and AI seams. Keep
community route-centered, keep sync ciphertext opaque to the server, and leave
field/native decisions measurement-gated.

## 2026-08-12 — P28 GPX join/export (after)

**Result**
- Added a bounded current-location GPX join preview with Best, Original start,
  and explicit forward waypoint entry choices. Remote, backwards,
  direction-mismatched, and too-short entries remain rejected.
- Reused the existing route planner for the approach, then appended the GPX
  tail once as a private `continuous-track` derivative with parent/provenance
  metadata. Approach turns remain available; the GPX leg does not fabricate
  an arrival or turn instruction and does not auto-reroute.
- Added Track, Track + waypoints, Route, Original, and Recorded ride export
  variants with bounded simplification that preserves route anchors. Preview
  routes and joined derivatives cannot be mislabeled as an original artifact.

**Verification**
- the validation host focused P28 audit: 7 files / 68 tests passed; final full verify:
  188 test files / 1,244 passed / 1 skipped; lint, typecheck, and build passed.
- the validation host broad browser: 28/28; critical: 30/30; PWA: 2/2; memory soak:
  10/10 cycles; real-router: 5/5 with explicit `:8998` endpoint and clean
  router shutdown.

**Gate boundary**
P28 proves local join selection, route composition, export serialization, and
track-guidance boundaries. It does not prove production provider reachability
for arbitrary GPX files, device transfer/rendering, outdoor GPS/heading
quality, authenticated-browser behavior, or physical iPhone behavior. The
known narrow MapLibre canvas-fit warning remained non-blocking.

**Next dependency**
P29 — remaining qualification work.

## 2026-08-12 — P28 GPX join/export (before)

**Goal**
Let a rider join an imported GPX from the current location and export either
the original/derived route or a recorded ride without silently changing the
track's provenance or navigation semantics.

**Before**
- GPX detail and track-only replay existed, but no safe approach-to-entry
  planner or continuous-track session existed.
- Export did not distinguish track, route, original, and recorded-ride
  artifacts.

**Scope boundary**
Extend the existing GPX detail, route planner, navigation engine, and export
action. Keep the original GPX geometry immutable and singular; do not add a
second routing path, infer road facts from a track, or claim physical-device
acceptance from browser tests.

## 2026-08-11 — P27 GPX intelligence (after)

**Result**
- Added one bounded intelligence report to imported GPX artifacts and the
  existing `PlannedRoute` contract. It reports measured distance/duration,
  elevation, curvature, ingest quality, gap spans, matcher evidence,
  confidence basis, creator notes, and deterministic grounded text.
- No-path matching produces an explicit track-only unmatched span. Provider
  waypoint coverage is labeled as such; path-only responses leave percentages
  unquantified instead of claiming route-distance coverage.
- Surface, road class, access, MVUM/community overlap, and fuel facts remain
  unknown without provenance-backed datasets. Project GPX detail responses now
  validate the report shape, and route details show the honest evidence state.

**Verification**
- Final validation host focused GPX audit: 5 files / 16 tests; final full verify:
  187 test files / 1,238 passed / 1 skipped; lint, typecheck, and build passed.
- the validation host broad browser: 28/28; critical: 30/30; PWA: 2/2; memory soak:
  10/10 cycles; real-router: 5/5.

**Gate boundary**
P27 proves bounded local analysis and honest provider/report boundaries. It
does not prove production map-match coverage, current surface/access/legal
datasets, owner-corpus re-import quality, authenticated-browser behavior, or
physical field/device behavior. The known MapLibre narrow-viewport warning
remained non-blocking.

**Next dependency**
P28 — GPX join/export.

## 2026-08-11 — P27 GPX intelligence (before)

**Goal**
Add analysis, confidence, unmatched spans, and grounded descriptions while
preserving immutable original GPX geometry and the existing streaming ingest and
matcher seams.

**Before**
- GPX normalization already measured geometry/elevation/time and preserved
  segment boundaries, but the route detail had no intelligence report.
- Matcher results were provider-level only; unavailable surface/road facts were
  represented only by empty legacy mix maps.

**Scope boundary**
Extend the current importer, matcher result, route contract, catalog trust
boundary, and route detail. Do not add a second geometry store, silently snap
unmatched tracks, infer access/surface from names, or re-import the owner
corpus during implementation.

## 2026-08-11 — P26 Free Ride interruption/learning (after)

**Result**
- Added a bounded rolling prompt budget of three per hour, five-minute normal
  quiet time, and twenty-minute quiet time after repeated ignores or
  `Less like this`.
- The poll loop and API both honor quiet state before graph/provider work;
  existing stable-bike preference signals remain the only learning path.
- Added a real Head Home action backed by the latest GPS fix and browser-local
  saved Home, using the normal route planner and Ride transition.

**Verification**
- the validation host focused P26 audit: 3 files / 22 tests; lint and typecheck passed.
- the validation host full verify: 185 test files / 1,232 passed / 1 skipped; lint,
  typecheck, and build passed.
- Free Ride browser 8/8; broad browser 28/28; critical Chromium/WebKit
  30/30; PWA 2/2; real-router 5/5; memory soak 10/10 cycles.
- Real-router cleanup was clear: no router PID file and port 8998 closed.

**Gate boundary**
P26 proves sparse interruption state, local preference signal wiring, and the
saved-Home route transition in fixture/unit/browser paths. It does not prove
cross-device prompt history, field GPS, outdoor device ergonomics, production
RIG/provider quality, or authenticated-browser behavior. The known MapLibre
narrow-viewport warning remained non-blocking.

**Next dependency**
P27 — GPX intelligence.

## 2026-08-11 — P26 Free Ride interruption/learning (before)

**Goal**
Make Free Ride quiet, sparse, locally learning, and able to route a rider Home
without inventing a destination or interrupting during a quiet period.

**Before**
- The reducer had only a short fixed cooldown and no rolling prompt budget or
  escalating ignore quiet period.
- The Free Ride surface had no Head Home action, although the planner already
  supported a browser-local Home location and normal route planning.

**Scope boundary**
Extend the current reducer, poll loop, preference library seam, and HUD. Do
not add a second learning store, account requirement, raw trail persistence,
or alternate route planner.

## 2026-08-11 — P25 Free Ride graph engine (after)

**Result**
- Replaced the deliberate Free Ride unavailable path with a bounded,
  provenance-carrying graph/RIG engine and real baseline-versus-detour routing.
- Kept the existing RIG corridor builder geometry-free; the runtime document
  joins its corridor references to canonical segment geometry at a strict trust
  boundary.
- Preserved the recording/local-first path and honest failure behavior: missing
  or invalid graph data, provider failure, low workload confidence, and
  cancellation do not become fake suggestions.

**Verification**
- the validation host focused P25 audit: 4 files / 23 tests; lint and typecheck passed.
- the validation host full verify: 185 test files / 1,230 passed / 1 skipped; lint,
  typecheck, and build passed.
- Free Ride browser matrix 4/4; broad browser 24/24; critical Chromium/WebKit
  30/30; PWA 2/2; real-router 5/5; memory soak 10/10 cycles.
- Real-router cleanup was clear: no router PID file and port 8998 closed.

**Gate boundary**
P25 proves the engine with an injected trusted graph and provider-backed route
adapter, plus the existing browser and real-router gates. It does not prove a
production RIG artifact is installed or current, live field GPS/provider/model
quality, authenticated-browser behavior, or physical-device behavior. The
known MapLibre narrow-viewport canvas-fit warning remained non-blocking.

**Next dependency**
P26 — Free Ride interruption/learning and Head Home.

## 2026-08-11 — P25 Free Ride graph engine (before)

**Goal**
Build ahead/reachable RIG candidate generation with a real routable detour and
rejoin while retaining the explicit experimental and no-fake-claims boundary.

**Before**
- The API intentionally returned `503 FREE_RIDE_UNAVAILABLE`; the visible
  browser path used fixtures rather than live graph-backed candidates.
- Historical curvature-only rows were not permitted to supply route geometry,
  access, surface, road class, or confidence claims.

**Scope boundary**
Add the smallest graph/document and provider seam needed for directed matching,
legal/routable detour verification, measured traversal, and provenance. Do not
change the RIG builder into a geometry store, add a cloud account, or ship a
runtime graph artifact containing private/raw data.

## 2026-08-11 — P24 navigation state machine audit (before)

**Goal**
Confirm one bounded navigation state machine for GPS filtering, off-route
detection, forward rejoin, resume, voice, and wake-lock behavior.

**Before**
- `navigation-engine`, `navigation-session`, `ride-session`, and
  `useNavigationSessionController` already supplied the state and resource
  ownership in the working tree.
- Filtering, continuity, ambiguity, sustained deviation, recovery points,
  pause/resume, voice, wake, and cleanup were covered by focused tests, but P24
  had no phase-level acceptance record.

**Scope boundary**
Audit the existing engine/controller seam. Preserve live-position matching,
forward-only authored-stop recovery, bounded deviation evidence, abortable
reroute, and teardown of GPS/audio/wake resources. Do not add a parallel
navigation state store.

## 2026-08-11 — P24 navigation state machine audit (after)

**Result**
- Confirmed GPS accuracy filtering, derived heading, route continuity, spatial
  matching, ambiguous overlap handling, arrival, and sustained off-route state.
- Confirmed recovery uses the actual rider position and only remaining authored
  stops, with forward on-route rejoin coordinates and offline-pack fallback.
- Confirmed pause/resume, retry, automatic/manual reroute, voice cue
  de-duplication, wake-lock acquire/release, timeout ceilings, and unmount
  cleanup all share the controller lifecycle.
- No production source, route data, or schema migration was needed; this phase
  closes the existing coherent implementation.

**Verification**
- the validation host focused navigation audit: 7 files / 48 tests passed.
- P23’s planner-to-Ride browser matrix remains the relevant responsive
  acceptance: desktop, iPhone portrait, and both landscape projects 4/4.
- The unchanged source tree retained the P19 acceptance gates: verify 184 test
  files / 1,225 passed / 1 skipped; lint, typecheck, build; browser 24/24;
  critical 30/30; PWA 2/2; real-router 5/5; memory soak 10/10; router cleanup
  clear.

**Gate boundary**
P24 proves navigation transitions and resource cleanup in unit/component
  fixtures and the P23 browser journey. It does not prove physical GPS/wake
  behavior, outdoor audio, authenticated-browser behavior, or field routing
  quality.

**Next dependency**
P25 — Free Ride graph engine with ahead/reachable RIG candidates and real
detour/rejoin.

## 2026-08-11 — P23 Ride HUD v2 audit (before)

**Goal**
Confirm a mounted-phone Ride HUD that stays readable and actionable in
portrait and landscape while keeping GPS uncertainty and recovery states
truthful.

**Before**
- `RideHud`, `RideHudStatus`, navigation-map presentation, and responsive CSS
  already supplied the portrait/landscape cockpit in the working tree.
- GPS acquisition, stale fixes, ambiguous matches, off-route recovery, voice,
  recording, weather, and locked-corridor states were already covered by
  focused tests, but P23 had no phase-level visual/acceptance record.

**Scope boundary**
Audit the existing RideHud and navigation-session ownership. Preserve the
single live frame source, explicit GPS states, safe recovery choices, viewport
lock cleanup, and safe-area layout. Do not add a second ride interface.

## 2026-08-11 — P23 Ride HUD v2 audit (after)

**Result**
- Confirmed the HUD owns one portrait/landscape mounted-phone layout with
  safe-area-aware top controls, maneuver card, telemetry rail, route progress,
  voice/pause/record/exit controls, and responsive camera controls.
- Confirmed it says Route preview until an accurate live fix exists, withholds
  maneuver claims for uncertain/off-route states, and exposes explicit recovery
  actions rather than silently changing the route.
- Confirmed stale-GPS, HTTPS, wake/viewport cleanup, weather alert, locked
  corridor, fuel-stop, recording, and overnight checkpoint paths.
- No production source, route data, or schema migration was needed; this phase
  closes the existing coherent implementation.

**Verification**
- the validation host focused navigation/HUD audit: 8 files / 77 tests passed.
- the validation host planner-to-Ride journey: desktop, iPhone portrait, landscape-wide,
  and landscape-narrow 4/4 passed.
- Portrait and both landscape Ride captures were visually reviewed; controls,
  instruction card, telemetry, safe-area spacing, and progress remained inside
  the viewport. The known fixture MapLibre bounds warning appeared on mobile
  but did not fail the journey.
- The unchanged source tree retained the P19 acceptance gates: verify 184 test
  files / 1,225 passed / 1 skipped; lint, typecheck, build; browser 24/24;
  critical 30/30; PWA 2/2; real-router 5/5; memory soak 10/10; router cleanup
  clear.

**Gate boundary**
P23 proves responsive rendering and navigation-state behavior in browser and
  fixture tests. It does not prove physical mounted-phone touch/brightness,
  authenticated-browser behavior, live provider quality, or field GPS behavior.

**Next dependency**
P24 — navigation state machine for GPS filtering, off-route, forward rejoin,
resume, voice, and wake behavior.

## 2026-08-11 — P22 expert customize/edit audit (before)

**Goal**
Confirm that expert controls stay behind one deliberate edit boundary while
surface/bike preferences, road locks, sketch/vias, and avoid controls remain
fully usable and truthful.

**Before**
- `PlannerDeck` already owned the explicit `Edit route` disclosure and the
  route editor controls in the working tree.
- Bike profiles, road locks, shaping stops, sketch mode, avoid-highways, and
  route-edit history were covered by focused tests, but P22 had no phase-level
  acceptance record.

**Scope boundary**
Audit the existing PlannerDeck, PlannerShell, map-drawing, road-lock, and bike
profile ownership. Do not split controls into a second editor, add guessed
topology, or weaken graph-match/access validation.

## 2026-08-11 — P22 expert customize/edit audit (after)

**Result**
- Confirmed `Edit route` is the single progressive-disclosure boundary for
  route profile, bike preset, surface/curvature preferences, loop/A-to-B mode,
  waypoints, vias, sketch, avoid-highways, segment styles, and edit history.
- Confirmed road locks remain a separate explicit action-dock dialog with
  provenance, Must use/Prefer modes, confirmation, and graph-matched state.
- Confirmed mobile sheet minimization, accessible controls, profile mismatch
  hints, and offline/library actions remain inside the same planner ownership.
- No production source, route data, or schema migration was needed; this phase
  closes the existing coherent implementation.

**Verification**
- the validation host focused unit/component audit: 9 files / 92 tests passed.
- the validation host graph-matched road-lock journey: desktop Chromium 1/1 passed.
- The unchanged source tree retained the P19 acceptance gates: verify 184 test
  files / 1,225 passed / 1 skipped; lint, typecheck, build; browser 24/24;
  critical 30/30; PWA 2/2; real-router 5/5; memory soak 10/10; router cleanup
  clear.

**Gate boundary**
P22 proves progressive disclosure and editor/road-lock behavior under focused
component tests and the browser road-lock flow. It does not prove physical
device ergonomics, authenticated-browser behavior, or field/provider quality.

**Next dependency**
P23 — Ride HUD v2 for portrait and landscape mounted-phone use.

## 2026-08-11 — P21 plan result UX audit (before)

**Goal**
Confirm that planning returns a small set of materially different route
alternatives with explanations a rider can verify from route data.

**Before**
- Progressive primary-then-alternatives planning, duplicate filtering, route
  comparison cards, and measured route facts already existed in the working
  tree from the routing and diversity phases.
- The P21 acceptance boundary and browser evidence were not yet recorded as a
  phase report.

**Scope boundary**
Audit the existing planner, coordinator, store, and RouteComparison ownership.
Keep eligibility ahead of utility, keep optional alternatives non-blocking, and
do not add a second result surface or invented route claims.

## 2026-08-11 — P21 plan result UX audit (after)

**Result**
- Confirmed a primary route is applied first and alternatives arrive through
  one abortable, stale-request-safe lifecycle.
- Confirmed the server-side comparison path caps alternatives at two, applies
  eligibility before diversity/utility, rejects duplicate or over-overlapping
  geometry, and preserves the primary when optional work fails.
- Confirmed RouteComparison presents route choices and score/distance/time/twist
  metrics first; details, measured route facts, provenance, and score reasons
  remain behind explicit disclosure.
- No production source, route data, or schema migration was needed; this phase
  closes the existing coherent implementation.

**Verification**
- the validation host focused unit/component audit: 5 files / 46 tests passed.
- the validation host relevant critical browser test: Chromium and WebKit 2/2 passed for
  progressive alternatives and user selection.
- The unchanged source tree retained the P19 acceptance gates: verify 184 test
  files / 1,225 passed / 1 skipped; lint, typecheck, build; browser 24/24;
  critical 30/30; PWA 2/2; real-router 5/5; memory soak 10/10; router cleanup
  clear.

**Gate boundary**
P21 proves bounded alternative selection and factual result rendering under
component and critical-browser fixtures. It does not prove current provider
quality, authenticated-browser behavior, physical-device behavior, or field
calibration of route preferences.

**Next dependency**
P22 — expert customize/edit with surface, bike, locks, sketch, avoid, and via
controls behind progressive disclosure.

## 2026-08-11 — P19 design system and map sheet (before)

**Goal**
Give the persistent map workspace one responsive token layer, a semantic
bottom-sheet contract, bundled typography, and touch-safe controls without
replacing the existing PlannerDeck/MapStage ownership.

**Before**
- Typography imports and feature CSS used the retired Inter/Space Grotesk
  layer, with additional unbundled Sora/DM Sans references.
- Sheet geometry and touch sizes were distributed across legacy responsive
  overrides; the sheet had no explicit state data contract or `aria-controls`.
- The map shell had no named design-system ownership for focus, safe-area,
  dark-theme, or reduced-motion rules.

**Scope boundary**
Keep `MapStage` mounted and keep `PlannerDeck` as the sole sheet controller.
Add only shared tokens, the map-shell/sheet primitives, semantic sheet state,
and the bundled-font migration. Preserve feature-specific loading, empty,
error, offline, and ride-mode states.

## 2026-08-11 — P19 design system and map sheet (after)

**Result**
- Added `design-system.css` with exact semantic colors, 4px/8px spacing,
  44px touch targets, focus rings, safe-area sheet geometry, landscape rules,
  dark-theme readability overrides, and reduced-motion behavior.
- Added bundled DM Sans and Sora, removed the retired font packages, and
  routed feature CSS through the shared font tokens.
- Marked the app as a persistent map shell and the PlannerDeck as a bounded
  `sb-bottom-sheet` with explicit expanded/collapsed state and ARIA controls.
- Updated the design contract to version 1.1.0 so its typography matches the
  shipped implementation.
- Added a small design-system contract test and retained AppShell coverage.

**Verification**
- Local focused UI contract: 2 files / 3 tests passed; lint, typecheck, and
  `git diff --check` passed.
- the validation host LXC `<private-test-host>`, Node 24.15.0: `npm run verify` passed with
  184 test files / 1,225 tests passed and 1 skipped; lint, typecheck, and
  production build passed.
- Browser matrix: 24/24; critical Chromium/WebKit: 30/30; PWA: 2/2;
  real-router regression: 5/5; memory soak: 10/10 planner cycles.
- Test-router PID and port 8998 cleanup were clear.
- Desktop, iPhone, landscape, Library, and Ride screenshots were captured;
  the final dark editor screenshot was visually checked after fixing the
  inherited low-contrast text.

**Gate boundary**
P19 proves the rendered app shell and sheet contracts across the tested
viewport matrix. It does not prove authenticated-browser behavior, physical
device touch/brightness behavior, production concurrency, or live-provider
quality calibration.

**Next dependency**
P20 — Explore/search and simple home/free-text/destination/loop/GPX.

## 2026-08-11 — P20 Explore/search audit (before)

**Goal**
Confirm one simple entry path for home, free-text destinations, loops, and
project or imported GPX without adding a second planner surface.

**Before**
- The intent-first home, explicit route editor, place-resolution state machine,
  and Library GPX flows already existed in the working tree.
- The P20 acceptance boundary and the validation host evidence were not yet recorded as a
  phase report.

**Scope boundary**
Audit the existing PlannerDeck/PlannerShell/Library ownership. Preserve the
typed intent boundary, truthful location fallbacks, bounded GPX parsing, and
the existing route request path. Add no duplicate Explore mode or speculative
search abstraction.

## 2026-08-11 — P20 Explore/search audit (after)

**Result**
- Confirmed the home field and quick intents feed the same typed ride request;
  they do not open a second planner mode.
- Confirmed explicit destination and loop editing, browser-location actions,
  saved/Home/region fallbacks, stale-request cancellation, and failed-place
  resolution behavior.
- Confirmed Library search/load for project GPX plus bounded local GPX/KML/KMZ
  import, road-lock matching, and delete confirmation.
- No production source, route data, or schema migration was needed; this phase
  closes with documentation of an existing coherent implementation.

**Verification**
- the validation host focused audit: 4 files / 51 tests passed across PlannerDeck,
  PlannerShell geocoding, LibraryDrawer, and AppShell.
- The unchanged source tree retained the P19 acceptance gates: verify 184 test
  files / 1,225 passed / 1 skipped; lint, typecheck, build; browser 24/24;
  critical 30/30; PWA 2/2; real-router 5/5; memory soak 10/10; router cleanup
  clear.

**Gate boundary**
P20 proves the local intent-to-request, destination/loop, and GPX entry paths
under unit/component and browser fixtures. It does not prove authenticated
browser behavior, physical-device behavior, current third-party place quality,
or model quality in the field.

**Next dependency**
P21 — plan result UX with 2–3 meaningful alternatives and factual explanations.

## 2026-08-11 — P18 PA/NJ golden tuning (before)

**Goal**
Freeze the route-policy values used by scoring and alternative selection, and
replace the single golden prompt with an owner-defined PA/NJ relational corpus
that can catch ranking and eligibility regressions without embedding invented
route geometry.

**Before**
- Profile weights, preferred detour, diversity values, and planner alternative
  caps were scattered as implementation literals.
- `tests/fixtures/routing/golden.ts` held one intent prompt and evaluator
  metadata, but no versioned multi-case regression manifest.

**Scope boundary**
Keep the existing provider-neutral scorer and bounded planner. Add one frozen
policy owner, policy-version telemetry, malformed-policy rejection at the
scoring boundary, and relational golden intent metadata with synthetic feature
behavior tests. Do not invent provider geometry or claim field calibration.

## 2026-08-11 — P18 PA/NJ golden tuning (after)

**Result**
- Added `pa-nj-route-policy-v1` as the single owner for profile weights,
  preferred detour, MMR lambda, duplicate threshold, and alternative cap.
- Scoring validates policy shape before use and stamps accepted/rejected
  route scores with the policy version.
- Planner and diversity selection consume the frozen policy values.
- Added an 11-case PA/NJ golden manifest covering target bands, corridors,
  loops, gravel/twisty ranking, access rejection, seasonal warnings,
  ambiguous surfaces, and one-crossing PA/NJ behavior.
- Added focused tests for policy validation, ranking relationships,
  eligibility-before-utility ordering, and corpus stability.

**Verification**
- Local focused P18 suites: 6 files / 52 tests passed.
- the validation host LXC `<private-test-host>`, Node 24.15.0: `npm run verify` passed with
  183 test files / 1,223 tests passed and 1 skipped; lint, typecheck, and
  production build passed.
- Broad browser 24/24; critical Chromium/WebKit 30/30; PWA 2/2; isolated
  real GraphHopper fixture 5/5; ten-cycle memory soak 10/10.
- Router PID and port cleanup were clear after the real-router gate.
- `git diff --check` and scoped local/remote SHA parity passed.

**Gate boundary**
P18 proves a versioned policy seam and review-ready relational regression
intent. It does not prove current provider responses are map-matched against
the corpus, field-calibrate the weights, or establish authenticated-browser,
physical-device, production-concurrency, or model-quality behavior.

**Next dependency**
P19 — design-system and map-first responsive primitives.

## 2026-08-11 — P17 diversity and factual explanations (before)

**Goal**
Choose materially different route alternatives with canonical directed-segment
evidence when available, retain an honest geometry fallback, and show riders
measured route facts without inventing legal, safety, or model claims.

**Before**
- Planner alternative selection sorted direct geometry overlap and profile
  utility inline.
- No reusable canonical directed-segment similarity or MMR seam existed.
- Route comparison exposed score telemetry but not a compact measured-facts
  summary.

**Scope boundary**
Reuse existing route geometry overlap and route utility. Add only the bounded
similarity/ranking seam, optional canonical refs, and field-derived UI facts;
canonical refs remain optional until graph matching supplies them.

## 2026-08-11 — P17 diversity and factual explanations (after)

**Result**
- Added directed canonical-ref overlap and weighted Jaccard with an explicit
  geometry-proxy fallback.
- Replaced planner alternative selection with bounded MMR using utility,
  similarity, strict overlap filtering, and deterministic tie-breaking.
- Added measured route facts for duration delta, mapped surface/road mix,
  candidate source, sustained quality, and explicit uncertainty.
- Added focused tests for canonical similarity, MMR behavior, fallback honesty,
  measured facts, and no-invention claims.

**Verification**
- Local focused P17 suites: 4 files / 33 tests passed.
- the validation host LXC `<private-test-host>`, Node 24.15.0: `npm run verify` passed with
  182 test files / 1,217 tests passed and 1 skipped; lint, typecheck, and
  build passed.
- Broad browser 24/24; critical Chromium/WebKit 30/30; PWA 2/2; isolated
  real GraphHopper fixture 5/5; ten-cycle memory soak 10/10; router PID and
  port cleanup were clear.
- Scoped local/remote SHA parity matched for all seven P17 source/test files.
- Report: `docs/phase-reports/P17-diversity-explanations.md`.

**Gate boundary**
P17 proves bounded alternative diversity and factual explanation rendering.
It does not prove current provider responses carry canonical segment refs,
calibrated PA/NJ policy quality, authenticated-browser behavior, physical
device behavior, or production concurrency.

**Next dependency**
P18 — owner-reviewed PA/NJ golden corpus and policy tuning.

## 2026-08-11 — P16 candidate generator (before)

**Goal**
Give direct/native/RIG/loop/community candidate paths one bounded generator
owner without allowing AI or loose anchors to define topology.

**Before**
- `planner.ts` built corridor requests inline and owned a local loop fallback
  seed list.
- Provider routes had no candidate-source metadata.
- There was no graph-backed RIG anchor input at the candidate boundary.

**Scope boundary**
Reuse native provider alternatives, existing corridor evidence, and the
normalized request. Add only bounded deterministic request generation; optional
RIG input must carry verified graph-backed anchors, and missing evidence must
remain empty rather than become guessed waypoints.

## 2026-08-11 — P16 candidate generator (after)

**Result**
- Added bounded corridor and loop candidate generation with caps, source
  mapping, point-sequence deduplication, deterministic seeds, and heading
  sectors.
- Routed planner corridor and loop paths through the generator.
- Added direct/native/loop/corridor source metadata to normalized provider
  routes and optional graph-backed RIG anchors to corridor input.
- Added runtime validation and focused tests for malformed anchors, wrong
  shapes, caps, source mapping, and deterministic loop requests.

**Verification**
- Local focused P16 suites: 5 files / 60 tests passed.
- the validation host LXC `<private-test-host>`, Node 24.15.0: `npm run verify` passed with
  180 test files / 1,211 tests passed and 1 skipped; lint, typecheck, and build
  passed.
- Broad browser 24/24; critical Chromium/WebKit 30/30; PWA 2/2; isolated real
  GraphHopper fixture 5/5; ten-cycle memory soak 10/10; router PID and port
  cleanup were clear.
- Scoped local/remote SHA parity matched for all 7 P16 source/test files.
- Report: `docs/phase-reports/P16-candidate-generator.md`.

**Gate boundary**
P16 proves bounded request generation and provider-confirmed route flows. It
does not prove live canonical RIG geometry availability, calibrated candidate
search quality, per-segment legality, owner-corpus map matching, physical
device behavior, authenticated-browser behavior, or production concurrency.

**Next dependency**
P17 — diversity and explanations.

## 2026-08-11 — P15 route utility v2 (before)

**Goal**
Make route ranking reward sustained coherent road quality, price detours in a
preferred-band-aware way, penalize overlap/fragmentation/uncertainty, and keep
personalization below eligibility.

**Before**
- `route-score.ts` had one aggregate score but no explicit contiguous-run,
  corridor-coherence, fragmentation, overlap, or uncertainty diagnostics.
- Detour cost was linear across the permitted range.
- `planner.ts` used a profile-specific selection switch when a provider result
  had no attached score.

**Scope boundary**
Extend the existing provider-neutral scorer and existing geometry helpers. Use
endpoint proximity as a bounded temporary topology proxy, preserve unknown
facts as uncertainty, and avoid building a second ranking subsystem or
persisting new route geometry.

## 2026-08-11 — P15 route utility v2 (after)

**Result**
- Added one `RouteUtilityBreakdown` to the existing scorer with weighted
  segment utility, connected sustained-run bonuses, coherence, fragmentation,
  piecewise detour, uncertainty, backtracking, self-overlap, and preference
  diagnostics.
- Kept the first 8% detour cheap and ramped cost quadratically after it, while
  preserving the existing hard maximum-detour gate.
- Kept explicit unknown access/surface/seasonal/coverage facts eligible with
  an honest uncertainty penalty and explanation.
- Planner selection now uses provider utility totals; only unscored injected or
  legacy routes use a small compatibility fallback.

**Verification**
- Local focused P15 suites: 3 files / 28 tests passed.
- the validation host LXC `<private-test-host>`, Node 24.15.0: `npm run verify` passed with
  179 test files / 1,207 tests passed and 1 skipped; lint, typecheck, and build
  passed.
- Broad browser 24/24; critical Chromium/WebKit 30/30; PWA 2/2; isolated real
  GraphHopper fixture 5/5; ten-cycle memory soak 10/10; router PID and port
  cleanup were clear.
- Scoped local/remote SHA parity matched for all 5 P15 source/test files.
- Report: `docs/phase-reports/P15-route-utility-v2.md`.

**Gate boundary**
P15 proves the utility behavior, eligibility ordering, and provider-fixture
path. It does not prove calibrated field/model quality, per-canonical-segment
OSM/MVUM authority, live owner-corpus map matching, offline packaging,
physical-device behavior, authenticated-browser behavior, or production
concurrency.

**Next dependency**
P16 — candidate generation, provider diversity, and route explanation.

## 2026-08-11 — P14 eligibility engine (before)

**Goal**
Make legality, active closure, bike/surface compatibility, and coverage
decisions hard gates that run before route utility.

**Before**
- `src/lib/domain/routing/eligibility.ts` handled only geometry, preview, and
  unresolved Must locks.
- Segment access, closure, safety, profile compatibility, confidence, and
  detour checks were partly embedded in `route-score.ts`, with no shared
  runtime feature-data guard or explicit unknown-fact warning channel.
- Unknown access/surface data had no single policy boundary separating warnings
  from hard authority.

**Scope boundary**
Keep GraphHopper authoritative for legal topology, preserve unknown facts as
unknown, and reuse the existing route-score seam. Add one eligibility owner
for normalized segment features; do not invent provider tags, build an OSM
authority database, or change persisted route data.

## 2026-08-11 — P14 eligibility engine (after)

**Result**
- Unified route and normalized-segment hard gates in `eligibility.ts` for
  legal access, active closures, bike/profile compatibility, explicit surface
  incompatibility, blocking safety flags, malformed data, and low coverage.
- Kept unknown access, surface, closure, and coverage as explicit warnings;
  current rider reports remain separate from hard authority.
- Added runtime feature validation and passed the computed accepted/rejected
  result through provider scores so planner, timebox, and comparison selection
  cannot choose a rejected candidate.
- Threaded the selected bike profile through GraphHopper, Valhalla, and hybrid
  scoring paths.

**Verification**
- Local focused P14 suites: 4 files / 38 tests passed.
- the validation host LXC `<private-test-host>`, Node 24.15.0: `npm run verify` passed with
  178 test files / 1,203 tests passed and 1 skipped; lint, typecheck, and build
  passed.
- Broad browser 24/24; critical Chromium/WebKit 30/30; PWA 2/2; isolated real
  GraphHopper fixture 5/5; ten-cycle memory soak 10/10; router PID and port
  cleanup were clear.
- Scoped local/remote SHA parity matched for all P14 source/test files.
- Report: `docs/phase-reports/P14-eligibility-engine.md`.

**Gate boundary**
P14 proves the hard-gate owner and candidate-selection boundary without
inventing unknown legal/surface facts or persisting new geometry. It does not
prove per-canonical-segment OSM/MVUM authority, live owner-corpus map matching,
offline eligibility packaging, physical-device behavior,
authenticated-browser behavior, production concurrency, or field/model
quality.

**Next dependency**
P15 — route utility v2.

## 2026-08-11 — P13 RIG corridor clustering (before)

**Goal**
Build contiguous high-value RIG corridors and a bounded spatial tile index
without promoting disconnected snippets or duplicating canonical geometry.

**Before**
- P12 produced per-segment evidence aggregates, but no cluster builder grouped
  adjacent high-value segments into usable corridors.
- No RIG spatial index mapped canonical segment UIDs to bounded geographic tiles.
- Existing offline corridor manifests are route-download geometry envelopes;
  they are not RIG evidence corridors and cannot substitute for this index.

**Scope boundary**
Consume verified canonical segments and P12 aggregates only. Use explicit
endpoint/topology or measured proximity links, preserve segment dimensions and
provenance, and emit UID references instead of another full geometry store.
Defer legality/closure gating to P14 and offline tile packaging to the later
offline integration phase.

## 2026-08-11 — P13 RIG corridor clustering (after)

**Result**
- Added bounded deterministic clustering of high-value canonical segment UIDs
  using exact topology or measured endpoint proximity plus ride-character
  coherence.
- Added minimum utility/evidence/contiguous-length gates so disconnected short
  snippets do not compete with coherent corridors.
- Added UID-only corridor output and a bounded Web Mercator spatial tile index;
  no duplicate route geometry is stored.
- Added the P12 aggregate runtime validator used at the corridor trust boundary.

**Verification**
- Local focused P13 suite: 2 files / 9 tests passed.
- the validation host LXC `<private-test-host>`, Node 24.15.0: `npm run verify` passed with
  177 test files / 1,199 tests passed and 1 skipped; lint, typecheck, and build
  passed.
- Broad browser 24/24; critical Chromium/WebKit 30/30; PWA 2/2; isolated real
  GraphHopper fixture 5/5; ten-cycle memory soak 10/10; router PID and port
  cleanup were clear.
- Scoped local/remote SHA parity matched for both P13 modules and both focused
  tests.
- Report: `docs/phase-reports/P13-rig-corridors.md`.

**Gate boundary**
P13 proves bounded corridor clustering and UID-only spatial indexing from the
verified P09/P12 seams. It does not prove legality/closure eligibility, offline
RIG packaging, live owner-corpus map matching, physical-device behavior,
authenticated-browser behavior, production concurrency, or field/model
quality.

**Next dependency**
P14 — route eligibility and legality precedence.

## 2026-08-11 — P12 RIG evidence aggregation (before)

**Goal**
Create the bounded RIG evidence aggregation seam for route roles, contributor
independence, freshness, separate desirability dimensions, and confidence.

**Before**
- `route-data-quality` reports route-level tag coverage for the UI, but no
  segment evidence event or aggregate model exists.
- There is no bounded contributor cap, duplicate-family independence factor,
  freshness weighting, route-role weighting, or preference posterior.
- Evidence confidence, access/closure reports, and desirability are not
  represented as separate outputs.

**Scope boundary**
Add one geometry-free, canonical-segment-keyed RIG evidence owner with runtime
validation and bounded aggregation. Do not build topology, infer legal access,
cluster corridors, or feed generated routes back into RIG; those belong to
later phases.

## 2026-08-11 — P12 RIG evidence aggregation (after)

**Result**
- Added one geometry-free RIG evidence owner keyed by canonical SHA-256 segment
  UID with runtime validation at the event boundary.
- Added RIG route-role inference with explicit unknown middle/low-confidence
  outcomes, source priors, freshness, duplicate-family independence, bounded
  contributor/channel caps, and zero weight for Switchback-generated routes.
- Kept desirability dimensions, evidence confidence/strength, hard authority,
  soft current reports, surface confidence, and preference posterior separate;
  absence remains neutral rather than negative evidence.

**Verification**
- Local focused P12 suite: 1 file / 5 tests passed.
- the validation host LXC `<private-test-host>`, Node 24.15.0: `npm run verify` passed with
  176 test files / 1,195 tests passed and 1 skipped; lint, typecheck, and build
  passed.
- Broad browser 24/24; critical Chromium/WebKit 30/30; PWA 2/2; isolated real
  GraphHopper fixture 5/5; ten-cycle memory soak 10/10; router PID and port
  cleanup were clear.
- Scoped local/remote SHA parity matched for the P12 module and focused test.
- Report: `docs/phase-reports/P12-rig-evidence-aggregation.md`.

**Gate boundary**
P12 proves bounded evidence aggregation and confidence/desirability separation
without persisting route geometry or generated-route reinforcement. It does not
prove corridor clustering, eligibility, offline RIG tiles, live owner-corpus
map matching, physical-device behavior, authenticated-browser behavior,
production concurrency, or field/model quality.

**Next dependency**
P13 — RIG corridor clustering.

## 2026-08-11 — P11 intrinsic road features (before)

**Goal**
Make route scoring and normalized road features evidence-backed for surface,
access, curvature, elevation, flow, and MVUM without inventing legality,
traffic-control facts, or confidence.

**Before**
- Missing normalized access was emitted as `permitted` and seasonal access as
  `open`.
- Urban density was reused as signal and stop density; missing numeric inputs
  became zero/good values, and route confidence used arbitrary constants.
- Normalized feature values had no explicit source, dataset, version, coverage,
  or limitation record.

**Scope boundary**
Keep the existing provider-neutral scoring seam and route UI contract. Add one
small intrinsic-feature provenance owner, preserve direct feature fixtures, and
validate the optional provenance at the existing worker boundary. Defer
canonical OSM segment assignment, live MVUM facts, and map-match enrichment.

## 2026-08-11 — P11 intrinsic road features (after)

**Result**
- Added explicit intrinsic feature keys, provenance, coverage, limitations,
  runtime validation, and a measured coverage proxy.
- Removed unsupported permitted/open/signal/stop/incident/confidence defaults;
  unknown access remains unknown and unknown score inputs are neutral.
- Propagated provider/version/fallback provenance through GraphHopper, Valhalla,
  hybrid routing, and the route-import worker boundary.

**Verification**
- Local focused P11 suite: 6 files / 41 tests passed.
- the validation host LXC `<private-test-host>`, Node 24.15.0: `npm run verify` passed with
  175 test files / 1,190 tests passed and 1 skipped; lint, typecheck, and build
  passed.
- Broad browser 24/24; critical Chromium/WebKit 30/30; PWA 2/2; isolated real
  GraphHopper fixture 5/5; ten-cycle memory soak 10/10; router PID and port
  cleanup were clear.
- Report: `docs/phase-reports/P11-intrinsic-road-features.md`.

**Gate boundary**
P11 proves explicit evidence ownership and honest unknown handling at the
normalized route/scoring boundary. It does not prove per-canonical-segment
OSM/MVUM data, live owner-corpus map matching, physical-device behavior,
authenticated-browser behavior, production concurrency, or field/model quality.

**Next dependency**
P12 — RIG/evidence ownership and segment-level intrinsic feature integration.

## 2026-08-11 — P10 streaming GPX ingest (before)

**Goal**
Replace the owner-corpus GPX importer with a bounded streaming normalization
and duplicate-family boundary while preserving source provenance and keeping
map-match claims evidence-backed.

**Before**
- The importer read whole files, retained only the longest path, and removed
  its output directory before rebuilding it.
- Exact raw hashes existed, but multi-segment boundaries, timestamps,
  elevation, gap evidence, measured near-duplicate families, and map-match
  status did not.

**Scope boundary**
Keep the existing browser upload worker contract. Change the owner-corpus
importer and its catalog boundary only; do not invent OSM identities, access
facts, or map-match confidence when no provider response exists.

## 2026-08-11 — P10 streaming GPX ingest (after)

**Result**
- Added bounded chunked GPX XML parsing with cancellation, multiple tracks and
  segments, timestamps, elevation, waypoints, and invalid-point accounting.
- Added normalization with exact consecutive dedupe, measured gaps and route
  metrics, one geometry plus segment offsets, and bounded sampled fingerprints.
- Replaced the destructive importer with streamed raw hashing, exact duplicate
  grouping, preserved originals/rejections, staged output, timestamped previous
  output preservation, and measured deterministic duplicate families.
- Added an explicit GraphHopper streaming map-match adapter whose `matched`
  state requires a valid provider path; the real corpus remains track-only
  because no match endpoint is configured.

**Verification**
- Local source corpus: 778 scanned, 420 unique, 358 exact duplicates,
  412 imported, 8 preserved rejected, 125 duplicate families, 113 near-
  duplicate families, and 387 routes in near families.
- the validation host LXC `<private-test-host>`, Node 24.15.0: `npm run verify` passed with
  174 test files / 1,187 tests and 1 skipped; lint, typecheck, and build passed.
- Broad browser 24/24; critical Chromium/WebKit 30/30; PWA 2/2; isolated real
  GraphHopper 5/5; ten-cycle memory soak 10/10; router PID and port cleanup
  were clear.
- Report: `docs/phase-reports/P10-gpx-ingest-worker.md`.

**Gate boundary**
P10 proves bounded parsing, source-preserving normalization, duplicate family
measurement, and provider-status honesty. It does not prove live map matching,
OSM canonical segment assignment, segment-aware downstream navigation, or
physical/authenticated-browser/production-load behavior.

**Next dependency**
P11 — intrinsic route/road features and evidence ownership.

## 2026-08-11 — P09 canonical segment graph (before)

**Goal**
Create the stable OSM-directed segment identity and conservative graph-build
migration lineage required by the RIG foundation.

**Before**
- No canonical `segment_uid` or graph admission verifier existed.
- Current road locks and GraphHopper matching used provider edge IDs for runtime
  compatibility; the current provider payload did not carry trusted OSM way and
  endpoint node IDs.
- No exact/same-way/spatial migration ordering, split/merge lineage, or
  ambiguity quarantine existed.

**Scope boundary**
Add one canonical segment/migration module and focused tests. Preserve existing
road-lock, provider, route, GPX, and offline v2 contracts; do not fabricate OSM
identity from ephemeral provider edge IDs. Defer OSM-backed production mapping
to its owning ingest/matching phase.

## 2026-08-11 — P09 canonical segment graph (after)

**Result**
- Added exact SHA-256 OSM-directed identity, segment metadata, geometry hashing,
  structural validation, duplicate detection, and asynchronous hash admission.
- Added verified exact, same-way/directional, and spatial/directional migration
  planning with measured overlap, one-to-many/many-to-one lineage, and
  conservative ambiguity quarantine.
- Added optional canonical UID transport on normalized road features while
  leaving provider edge IDs and existing lock behavior untouched.

**Verification**
- the validation host LXC `<private-test-host>`, Node 24.15.0: final `npm run verify` passed
  with 172 test files / 1,180 tests passed and 1 skipped; lint, typecheck, and
  production build passed.
- Final broad browser 24/24; critical Chromium/WebKit 30/30; PWA 2/2; isolated
  real GraphHopper fixture 5/5; ten-cycle memory soak 10/10 with 33.1 MB used
  heap, 50.4 MB total heap, and one map instance per cycle.
- Focused canonical segment tests passed 7/7 locally and were included in the
  final full remote suite. The router PID file and port 8998 were clear after
  the real-router run.
- Report: `docs/phase-reports/P09-canonical-segment-graph.md`.

**Gate boundary**
P09 proves canonical identity, verified graph admission, and conservative
lineage behavior under automated tests. It does not yet prove that a live
provider or GPX matcher supplies OSM way/node identity; current edge IDs remain
runtime-only, and automated checks do not prove physical-device,
authenticated-browser, production-load, or field-data quality behavior.

**Next dependency**
P10 — GPX ingest worker and canonical route import boundary.

## 2026-08-11 — P08 worker RPC and lifecycle (before)

**Goal**
Make route-import worker messages typed and cancelable, and close the
listener/timer/source/worker lifecycle gaps at the MapStage and GPX-import
boundaries without changing route semantics.

**Before**
- The import worker protocol carried a request ID but no generation or typed
  cancel message, and the client accepted a route payload without runtime
  validation.
- The client terminated the worker on ordinary completion/error, but did not
  expose caller cancellation, clear all handlers idempotently, or bound active
  import workers.
- MapStage feature-overlay requests used `AbortController` but did not guard
  every post-fetch mutation by disposed state, map identity, and request
  generation.

**Scope boundary**
Add the smallest typed RPC/cancellation and cleanup boundary around the
existing GPX parser, harden the three existing MapStage overlay effects, and
retain all route/provider behavior. No route algorithm, persisted-data, or
offline-worker migration belongs in P08.

## 2026-08-11 — P08 worker RPC and lifecycle (after)

**Result**
- Route-import requests and responses now carry a positive generation, with a
  typed cancel request and runtime validation of both request buffers and
  returned `PlannedRoute` values.
- The client rejects malformed active responses, ignores stale generations,
  accepts an optional `AbortSignal`, bounds the client to one active import,
  removes handlers/listeners exactly once, releases diagnostics, and always
  terminates the worker.
- The worker validates incoming messages, bounds itself to one active parse,
  suppresses canceled delivery, and returns typed generation-aware failures.
- Curvature, PA unpaved-road, and rider-feature refreshes now use disposed,
  map-identity, and request-generation gates before source or state mutation;
  their move listeners and abort controllers are cleaned up with the map.

**Verification**
- the validation host LXC `<private-test-host>`, Node 24.15.0: final `npm run verify` passed
  with 171 test files / 1,173 tests passed and 1 skipped; lint, typecheck, and
  production build passed.
- Broad browser 24/24; critical Chromium/WebKit 30/30; PWA 2/2; isolated
  real GraphHopper fixture 5/5; ten-cycle memory soak 10/10 with 33.1 MB used
  heap, 50.4 MB total heap, and one map instance per cycle.
- Fresh local lint/typecheck and focused lifecycle/import tests passed:
  4 files / 15 tests. The router PID file and port 8998 were clear after the
  real-router run; `git diff --check` passed.
- Report: `docs/phase-reports/P08-worker-rpc-lifecycle.md`.

**Gate boundary**
P08 proves bounded automated worker and map-overlay cleanup, stale-response
protection, and GPX/import response validation. The worker parser remains
synchronous, so protocol cancellation suppresses delivery while client-side
termination is the authoritative way to stop CPU work. Automated checks do
not prove physical-device, authenticated-browser, production-load, or
long-duration field behavior.

**Next dependency**
P09 — segment graph and route editing ownership.

## 2026-08-11 — P06 planning controller (before)

**Goal**
Move the planning lifecycle boundary out of `PlannerShell` without creating a
second routing coordinator or changing route/provider semantics.

**Before**
- `PlannerShell` creates the latest-request gate, wraps
  `runLatestTripPlan`, owns abort/invalidation behavior, and directly cancels
  the active routing request.
- `trip-planning-coordinator.ts` already owns primary/alternative routing and
  stale-response checks, but its lifecycle boundary is assembled in React.

**Scope boundary**
Extract one `PlanningSessionController` around the existing coordinator. Keep
the planner store, route geometry, request construction, previous-route
recovery, and existing hook contracts unchanged. No route cache, worker, or UI
redesign belongs in P06.

## 2026-08-11 — P06 planning controller (after)

**Result**
- Added `PlanningSessionController` as the single request-generation,
  cancellation, and planner-lifecycle boundary around the existing
  `trip-planning-coordinator`.
- `PlannerShell` now creates one stable controller and keeps only UI-level
  request construction, previous-route recovery, notices, and hook wiring.
- Cancellation invalidates stale work before aborting the provider request, so
  a cancelled request cannot publish a later routing failure.
- No route geometry, provider selection, planner store, persisted data, worker,
  route cache, or production service changed.

**Verification**
- the validation host LXC `<private-test-host>`, Node 24.15.0: `npm run verify` passed with
  170 test files / 1,165 tests passed and 1 skipped; lint, typecheck, and
  production build passed.
- Broad browser 24/24; critical Chromium/WebKit 30/30; PWA 2/2; isolated
  real GraphHopper fixture 5/5; ten-cycle memory soak 10/10 with 35.1 MB used
  heap, 50.4 MB total heap, and one map instance per cycle.
- Focused controller/coordinator/request regressions passed locally: 3 files /
  16 tests. Fixture PID file and port 8998 were clear after the real-router
  run; `git diff --check` passed.
- Report: `docs/phase-reports/P06-planning-controller.md`.

**Gate boundary**
P06 proves the planning lifecycle has one cancellable owner around the existing
  coordinator under the automated matrices. `PlannerShell` remains a broad
  composition point, and automated checks do not prove physical-device,
  authenticated-browser, or production-concurrency behavior.

**Next dependency**
P07 — canonical geometry ownership.

## 2026-08-11 — P07 canonical route cache (before)

**Goal**
Give active online route geometry one bounded owner while leaving planner UI
state with route summaries and selected IDs.

**Before**
- `PlannerState.plan.routes` stores every full `PlannedRoute`, including the
  complete geometry array, in Zustand for the live shell.
- `PlannerShell` derives map, comparison, preference-ranking, and ride routes
  from that full store payload; previous-route and ride-original references are
  also held as full React route objects.
- The existing server `RouteCache` is request-result caching and does not own
  browser route entities.

**Scope boundary**
Add one bounded client route-entity cache, migrate the active planner result
and retained recovery/ride references to it, and keep saved routes, GPX, share,
offline-pack, and navigation consumers on the same resolved `PlannedRoute`
objects. No server cache redesign, worker migration, or route algorithm change
belongs in P07.

## 2026-08-11 — P07 canonical route cache (after)

**Result**
- Added one bounded client `RouteEntityCache` with 32 active entities, 50,000
  geometry points per entity, and four retained recovery/ride references, plus
  finite-coordinate and route-ID validation at the cache boundary.
- `PlannerState.plan` and the planner deck view model now carry route summaries;
  `PlannerShell` stores previous/ride-original IDs and resolves full entities
  only for map, comparison, ranking, and ride consumers.
- Explicit route clearing now clears retained entities too. Saved, GPX, share,
  offline-pack, and navigation consumers remain on their existing resolved
  route contracts.

**Verification**
- the validation host LXC `<private-test-host>`, Node 24.15.0: final `npm run verify` passed
  with 171 test files / 1,171 tests passed and 1 skipped; lint, typecheck, and
  production build passed.
- Final broad browser 24/24; critical Chromium/WebKit 30/30; PWA 2/2; isolated
  real GraphHopper fixture 5/5; ten-cycle memory soak 10/10 with 33.1 MB used
  heap, 50.4 MB total heap, and one map instance per cycle.
- Focused cache/store/shell regressions passed locally: 4 files / 49 tests.
  Fixture PID file and port 8998 were clear after the real-router run;
  `git diff --check` passed before the final sync.
- Report: `docs/phase-reports/P07-route-cache.md`.

**Gate boundary**
P07 proves bounded active online route-geometry ownership and summary/ID UI
state under the automated matrices. It does not prove physical-device,
authenticated-browser, production-load, or later worker-ownership behavior.

**Next dependency**
P08 — worker/resource lifecycle.

## 2026-08-11 — P03 dead complexity removal (before)

**Goal**
Cut the optional Spotify product path and remaining dead/unsupported surface
claims before the G1 error/provenance phase, without changing the verified
local rider flow or deleting user data.

**Before**
- `src/app/page.tsx` lazy-loads `SpotifyPlayerDock`; Spotify OAuth callback,
  auth-complete page, five API routes, server session/token helpers, browser
  SDK/remote-player helpers, CSP allowances, and `.env.example` settings are
  still production-visible.
- Eleven Spotify-focused tests and Spotify-only screenshots/docs keep the old
  path active as a second product surface.
- Free Ride is correctly labeled Experimental in most UI, but its root ARIA
  label still says “neural map”; the phase must not reintroduce unsupported
  safety, route, or confidence claims while removing stale branding.

**Scope boundary**
Delete the Spotify production path and its tests/config/docs, remove stale
branding, and preserve the existing routing, local settings, offline, and
recording paths. No account, data, or routing redesign belongs in P03.

## 2026-08-11 — P03 dead complexity removal (after)

**Result**
- Deleted the Spotify home-page mount, OAuth callback/auth-complete page, five
  API route families, player, client/server helpers, eleven tests, CSP/env
  settings, current docs, and tracked Spotify visual artifacts.
- Removed the unsupported Free Ride curvature-to-route fabrication path. The
  API still validates its GPS boundary, then returns typed `503
  FREE_RIDE_UNAVAILABLE` until P25 supplies graph-backed ahead/reachable
  candidates and detour/rejoin evidence.
- Kept the recording surface and pure ranking tests over supplied candidates;
  changed the stale Free Ride “neural map” region label to “Free Ride.” No
  user data or routing planner path was migrated or deleted.

**Verification**
- the validation host LXC `<private-test-host>`, Node 24.15.0: `npm run verify` passed with
  167 test files / 1,159 tests passed and 1 skipped; lint, typecheck, and
  production build passed.
- Broad browser 24/24; critical Chromium/WebKit 30/30; PWA 2/2; isolated
  real GraphHopper fixture 5/5; ten-cycle memory soak 10/10 with 35.1 MB used
  heap, 50.4 MB total heap, and one map instance per cycle.
- Report: `docs/phase-reports/P03-dead-complexity.md`.

**Gate boundary**
P03 proves the superseded Spotify path and unsupported Free Ride API path are
removed from the active product tree while the verified rider paths remain
green. Historical audit prose is retained as historical evidence. This does
not restore graph-backed Free Ride suggestions or claim a physical-device,
two-hour, WebKit-heap, or production-concurrency result.

**Next dependency**
P04 — Error/health/provenance. P25 owns the graph-backed Free Ride engine.

## 2026-08-11 — P04 error/health/provenance (before)

**Goal**
Make route and health responses traceable and honest under provider failure:
carry a bounded request ID, expose actionable error metadata, and distinguish
the normal GraphHopper path from an explicit Valhalla fallback.

**Before**
- The route handler normalizes a provider request ID internally, but the HTTP
  response and error body do not return it or an action for the rider.
- Health reports optional Valhalla degradation, but does not identify the
  degraded provider as a structured list.
- Planned routes expose provider/version compatibility fields and a warning,
  but no structured fallback provenance.

**Scope boundary**
Extend the existing route and health contracts, preserve existing error codes
and client behavior, and add focused regressions. Do not refactor unrelated
API handlers, invent route facts, or change provider selection semantics.

## 2026-08-11 — P04 error/health/provenance (after)

**Result**
- Added bounded request correlation IDs to route and rate-limited health
  responses, with the same ID in route success/error bodies and headers.
- Added shared actionable error metadata while preserving existing route error
  codes; the browser client now retains action and request ID fields.
- Added `degradedProviders` to health and structured route provider/version/
  fallback provenance. Only the real GraphHopper-to-Valhalla fallback branch
  marks a route as a fallback.
- No provider-selection, route-geometry, saved-data, runtime-database, or
  production-service change was made.

**Verification**
- the validation host LXC `<private-test-host>`, Node 24.15.0: `npm run verify` passed with
  168 test files / 1,161 tests passed and 1 skipped; lint, typecheck, and
  production build passed.
- Broad browser 24/24; critical Chromium/WebKit 30/30; PWA 2/2; isolated
  real GraphHopper fixture 5/5; ten-cycle memory soak 10/10 with 33.1 MB used
  heap, 50.4 MB total heap, and one map instance per cycle.
- Focused P04 regression set passed locally: 4 files / 32 tests.
- Report: `docs/phase-reports/P04-error-health-provenance.md`.

**Gate boundary**
P04 proves the route/health wire contract and provider provenance under the
automated matrices. Other API handlers retain legacy error envelopes, and no
physical-device, authenticated-browser, or production-concurrency claim is
made. The known non-failing mobile MapLibre warning remains.

**Next dependency**
P05 — shell and ownership cleanup.

## 2026-08-11 — P05 AppShell modes (before)

**Goal**
Establish one high-level shell boundary for Explore, Plan, Ride, and Library
while preserving the current persistent MapLibre surface and existing local
route, recording, settings, and library behavior.

**Before**
- `src/app/page.tsx` mounts `PlannerShell` directly; its large component owns
  the map, navigation state, planning UI, library, recording, and ride HUD.
- The map is already rendered once, but there is no explicit `AppShell` mode
  contract for Explore versus a planned result, Ride, or Library.
- `AppNavigation` still exposes the compatibility Record and Profile panels;
  later controller/design phases own their migration into the target shell.

**Scope boundary**
Add the smallest typed shell boundary and mode derivation. Do not move
planning orchestration, duplicate map state, redesign the planner, or hide or
delete the existing local data surfaces before P06/P19.

## 2026-08-11 — P05 AppShell modes (after)

**Result**
- Added the stable `AppShell` wrapper and typed `AppMode` derivation for
  Explore, Plan, Ride, and Library.
- Kept one `MapStage` slot in the existing shell and preserved all route, GPX,
  recording, settings, offline, and library behavior.
- Kept compatibility Record/Profile panels instead of creating duplicate
  shell state; final visible mode navigation waits for later controller/design
  phases.

**Verification**
- the validation host LXC `<private-test-host>`, Node 24.15.0: `npm run verify` passed with
  169 test files / 1,163 tests passed and 1 skipped; lint, typecheck, and
  production build passed.
- Broad browser 24/24; critical Chromium/WebKit 30/30; PWA 2/2; isolated
  real GraphHopper fixture 5/5; ten-cycle memory soak 10/10 with 39.6 MB used
  heap, 50.4 MB total heap, and one map instance per cycle.
- Focused P05 regression set passed locally: 3 files / 20 tests.
- Report: `docs/phase-reports/P05-appshell-modes.md`.

**Gate boundary**
P05 establishes the high-level shell contract without redesigning the legacy
planner or moving its orchestration. The visible compatibility tabs remain
until P06/P19–P23; no physical-device, authenticated-browser, or production
load claim is made.

**Next dependency**
P06 — planning controller.

## 2026-08-11 — P02 memory and performance observability

**Result**
- Added bounded client/server runtime diagnostics for browser heap/storage,
  Cache Storage/service workers, timers, GPS watches, workers, map instances,
  route geometry, server memory, route queue, and route cache.
- Instrumented the persistent map, route-import worker, GPS/recording paths,
  and navigation timer cleanup; added the ten-cycle `memory-soak` project.
- Isolated the validation host test checkout on `<lxc-vmid>`
  (`<private-test-host>`) used Node 24.15.0 and the fixture router only. No
  production Switchback service was changed.

**Verification**
- `npm run verify`: 178 test files, 1,212 passed, 1 skipped; lint, typecheck,
  and production build passed.
- Broad E2E: 24/24; critical: 30/30; PWA: 2/2; real GraphHopper fixture:
  5/5.
- Memory soak: 10/10 cycles; 33.1 MB used JS heap, 50.4 MB total heap, one
  map instance on every cycle.

**Gate boundary**
P02 proves bounded automated resource ownership and observability only. It
does not prove a two-hour ride plateau, WebKit heap behavior, physical GPS, or
production-scale routing load. P03 dead-complexity removal is next.

## 2026-08-10 — P01 baseline and provenance (before)

**Goal**
Freeze the current implementation, provider/runtime contract, route fixtures,
screenshots, and known ownership gaps before executing the authoritative
P01–P36 production roadmap.

**Before**
- Repository: `main` at `5632af2ea7109ae860d608069b8c4364d6f80273`;
  worktree clean except the user-supplied, untracked production-spec ZIP.
- Runtime: `switchback-cloudflare` serving the current checkout on port 3100;
  GraphHopper 11.0 on loopback:8989; Valhalla 3.8.2 on loopback:8002.
- Existing path: `PlannerShell` still owns broad planning, map, Free Ride,
  GPX, offline, and ride state; planner/navigation stores and two workers are
  present; no canonical RIG/segment graph subsystem is present.
- Target gaps to preserve as explicit work: P02 observability, P03 Spotify and
  dead-complexity cut, P04 request/error/provenance contract, P05–P08 shell and
  ownership cleanup, and P09+ canonical graph/RIG work.

**Scope boundary**
No graph rebuild, data deletion, provider reconfiguration, or physical-device
claim is authorized by this baseline phase.

## 2026-08-11 — P01 baseline and provenance (after)

**Result**
- P01 report: `docs/phase-reports/P01-baseline.md`.
- `npm run verify`: lint, typecheck, 177 test files / 1,211 tests, and
  production build all passed.
- Current browser matrix: 24/24; critical matrix: 30/30; isolated
  real-router: 5/5; PWA: 2/2; live provider smoke: 8/8.
- Live validator passed the progressive primary/alternatives contract, four
  distinct GraphHopper base-model shapes, all eight rider-visible profile
  requests, and the motorcycle access-detour checks.

**P01 fixes**
- Unwrapped the live road-match success envelope in the shared browser client
  and added a regression test.
- Updated the live validator for progressive alternatives and deliberate
  profile aliases.
- Repaired stale semantic browser assertions and portrait sketch coordinates.

**Gate boundary**
P02 memory/SLO instrumentation is next. No RIG claim, physical-device claim,
offline-airplane-mode claim, or memory-budget claim is made here.

## 2026-08-06 — Phase 2 part 2: ordered Must traversal + bounded Prefer (SB-014/015)

**Goal**
Must-use locks force ordered traversal of the corridor instead of zeroing every
edge outside a thin polygon (the Phase 0 defect); Prefer locks reward the
corridor without globally penalizing unrelated route sections; manual locks
graph-match against the live router before saving (SB-013 wiring); the
`roadRequirements` flag flips on.

**Repository evidence**
- `graphhopper.ts`: `expandMustLockWaypoints` expands a request's wire points
  with each must lock's entry/exit anchors (in lock order) so GraphHopper
  routes through them in sequence; the request carries `lockViaWireToOriginal`
  so the parsed route keeps only the rider's original waypoints. Must rules are
  now `in_<area> → 1.8` and Prefer `in_<area> → 1.6` — bounded inside rewards,
  never a global `!in_<area> → 0`.
- `road-matching.ts`: `roadMatchToAccessSnapshot` converts matched access
  evidence into a persisted snapshot.
- `src/lib/client/road-match-client.ts` (new): `requestRoadMatch` calls
  `/api/road-matching` and throws typed refusals.
- `MapStage.tsx`: `commitLockDraft` graph-matches the two anchors when the flag
  is on and builds the lock from real edge ids + geometry; a matching refusal
  falls back to an approximate lock that never claims exact.
- `road-locks.ts`: `evaluateRoadLockSatisfaction` now requires anchors in
  order for a satisfied must lock (rejects parallel-road substitution).
- `feature-flags.ts`: `roadRequirements: true`.

**Decision**
Ordered traversal belongs at the adapter boundary (wire waypoints), not in the
planner: every mode (destination, segmented, timebox) inherits it. Round trips
cannot inject anchors (single point), so they keep the bounded reward and the
existing satisfaction/unresolved flow.

**Changes**
- New: `road-match-client.ts`; tests updated in graphhopper-lock-request,
  region-policy-overlay, road-locks (+3 regressions: ordered traversal accept,
  out-of-order reject, wire expansion).

**Verification**
- 175 files / 1207 unit tests pass (+3 new); lint + typecheck clean.
- road-lock e2e rewritten to the enabled flow (Must radio, graph-matched edge
  ids, exact confidence).

**Remaining risk**
- SB-016 rematch UI wiring still partial (rematch logic exists).
- Round-trip must locks cannot force anchor traversal; the bounded reward +
  unresolved flow covers them honestly.

**Commit**
- Pending at phase close.

## 2026-08-05 — Phase 0 baseline and containment

**Goal**
Establish an honest baseline: verify every spec defect claim against the live
tree, classify features, and apply containment so placeholder behavior cannot
mislead (feature flags for road requirements / Free Ride / neural ranking,
disable placeholder Must, remove misleading copy, add failing regressions).

**Repository evidence**
- All 11 defect areas in `02_CURRENT_STATE_ASSESSMENT.md` confirmed with
  file:line citations (see `BASELINE_AUDIT.md`).
- Baseline suite green: 1,149 unit, 30/30 critical, 5/5 real-router, 2/2 PWA,
  8/8 live smoke; lint/typecheck/build pass.

**Decision**
Per `00_EXECUTION_ORDER.md` and `19_FEATURE_CUT_AND_DEFER_RULES.md`:
- Road requirements: keep the sound domain model (`RoadLock`, satisfaction,
  rematch), but gate the UI behind a flag, strip the "exact" claim from manual
  locks, and disable Must priority-zero rules until graph matching ships.
- Free Ride: label Experimental, remove synthetic-claim copy, gate suggestions.
- Neural: keep as personalization over eligible candidates, remove "Neural Map"
  branding and the separate profile claim.

**Changes**
- Added `docs/recovery/BASELINE_AUDIT.md`, `FEATURE_DISPOSITION.md`,
  `TRACEABILITY.md`, this worklog.
- (Containment code edits follow in the same phase.)

**Verification**
- `npm run lint`, `npm run typecheck`, `npm test`, focused regressions.

**Remaining risk**
- Physical-device and live-provider checks remain device/environment dependent.

**Commit**
- Pending at phase close.

## 2026-08-05 — Phase 0 containment (code)

**Goal**
Contain the confirmed P0 defects: placeholder road requirements must not
influence routing or claim exact matches; Free Ride must be labeled
experimental without safety claims; misleading copy removed; failing
regressions added; docs reconciled.

**Repository evidence**
- `src/lib/domain/feature-flags.ts` (new): `roadRequirements=false`,
  `freeRideSuggestions=true` (labeled), `neuralRanking=true`.
- Road requirements: `graphhopper.ts` now only forwards locks to the provider
  model when the flag is on AND they carry edge IDs; `createManualRoadLock` /
  `createGpxRoadLock` claim `approximate` (never exact/matched) without edge
  IDs (SB-007); MapStage hides the Must radio, defaults to Prefer, clamps
  drafts to prefer, and labels the feature experimental; PlannerDeck disables
  the per-stop must-use toggle (SB-006).
- Free Ride: FreeRideHud replaces "Neural Map"/"safe, data-backed"/"never
  invents" with honest experimental copy; AppNavigation drops "Premium".
- Timebox fallback (SB-004): planner returns the eligible direct baseline with
  feasibility wording when no shaped candidate passes gates — never a
  gate-failing candidate labeled safe.
- Share copy (SB-008 partial): the success notice no longer claims full
  redaction while instructions still leak (Phase 2 fixes the leak itself).

**Decision**
Follow the spec's cut-and-flag rules: keep the sound road-lock domain model
but disable its untrustworthy plumbing until graph matching (Phase 2) ships.

**Changes**
- Tests updated to the corrected semantics: `graphhopper-lock-request.test.ts`
  (containment + enabled-path coverage), `region-policy-overlay.test.ts`,
  `planner-deck.test.tsx`, `timeboxed-destination-routing.test.ts` wording,
  `free-ride.spec.ts`/`free-ride-hud.test.tsx` copy, `road-lock.spec.ts`
  rewritten to the Prefer/experimental flow.
- Regressions added: manual/gpx locks without edge IDs never claim
  exact/matched; lock corridors never reach the provider model while the flag
  is off.

**Verification**
- `npm test`: 168 files / 1149 passed.
- Live golden timebox route: 108–132 min, 3/3 runs.
- e2e `road-lock.spec.ts` + `free-ride.spec.ts`: pass on desktop-chromium and
  mobile-safari.
- `npm run typecheck`, `npm run lint`: clean.
- Critical suite: running.

**Remaining risk**
- Docs beyond README profile list (full README reconciliation deferred to
  later phases).
- Profile simplification (Gravel/Avoid Highways/Neural as policies) deferred —
  tracked in FEATURE_DISPOSITION.md.

**Commit**
- Pending at phase close.

## 2026-08-05 — Phase 1 routing correctness

**Goal**
Every shown candidate is eligible and every mode applies the same normalized
constraints (SB-001..005).

**Repository evidence**
- `src/lib/domain/routing/normalized-request.ts` (new): `NormalizedRouteRequest`
  (requestId, shape, source, explicit avoidHighways/avoidAreas/tollPolicy/
  roadLocks) + `normalizeRouteRequest()` (idempotent).
- `RouteProvider` now consumes `NormalizedRouteRequest`; adapters
  (`createGraphHopperRequest`, `requestGraphHopperRoutes`,
  `createValhallaRequest`, `requestValhallaRoutes`) normalize at their
  boundary so direct callers also get the full contract.
- SB-003: `planSegmentedTrip` legs inherit the full request (was profile +
  points + two options).
- SB-005: store `selectionSource` ("user" | "automatic"); `selectRoute` marks
  user; `applyAutomaticRouteSelection` refuses to override a user pick;
  applyPlan resets to automatic; PlannerShell re-rank uses it.
- SB-002: `src/lib/domain/routing/eligibility.ts` — hard failures
  (invalid-geometry, preview-only, must-road-unresolved) never become ranking
  penalties; alternatives path filters ineligible candidates with warnings.
- SB-004 (from Phase 0): timebox fallback returns the eligible baseline.

**Decision**
Keep `TripPlanRequest` as the API input; the planner normalizes once at
`planMotorcycleTrip` and threads the normalized contract everywhere. Adapter
boundaries normalize defensively (idempotent) so no call site can bypass the
contract.

**Changes**
- New: normalized-request.ts, eligibility.ts, tests/unit/routing-semantics.test.ts.
- planner.ts, graphhopper.ts, valhalla.ts, hybrid.ts, types.ts,
  planner-store.ts, PlannerShell.tsx; test files updated to the contract.

**Verification**
- 102 routing-focused unit tests pass; new semantic tests (10) pass.
- typecheck + lint clean. Full suite + real-router running.

**Remaining risk**
- Eligibility module is route-derived; provider/coverage hard rules (e.g.
  graph-version staleness) are future extension points.
- Profile simplification (Gravel/Avoid-Highways/Neural as policies) still
  deferred.

**Commit**
- Pending at phase close.

## 2026-08-05 — Phase 2 (part 1): share redaction + graph road matching

**Goal**
Protected shares leak no protected metadata (SB-008); road requirements gain a
graph-backed matching path (SB-013) so placeholders cannot claim exactness.

**Repository evidence**
- `src/lib/share/route-share.ts`: redaction now removes protected geometry AND
  inserts zone-boundary intersection endpoints (no straight jump across a
  zone), drops waypoints inside zones, removes instructions inside/spanning
  zones, rebases surviving instruction intervals onto the visible geometry,
  and recalculates distance/duration proportionally (elevation evidence
  nulled). Oversized links get one deterministic Douglas-Peucker
  simplification (≤30m deviation, instructions dropped) before failing.
- `src/lib/roads/road-matching.ts` + `/api/road-matching` (handler/route):
  entry/exit anchors are routed against the live GraphHopper graph with
  edge_id/street/surface/toll details; returns real geometry, edge ids when
  the graph exposes them, street names, access evidence, graph version; a
  refusal is a typed error, never a straight-line placeholder. Live probe:
  82-point real geometry + street names; honestly "unresolved" when the
  deployed graph does not serve edge_id details.
- The road-requirements feature flag stays OFF: ordered Must traversal
  (SB-014) and bounded Prefer candidates (SB-015) are not yet implemented, so
  the honest state is disabled, not half-honored.

**Decision**
Share redaction is the P0 privacy item and is complete. Matching ships as the
graph-backed foundation; the flag flips only when SB-014/015 land.

**Changes**
- New: road-matching.ts, /api/road-matching, tests (22 share tests + 4
  matching tests).
- PlannerShell share notice now claims the true behavior.

**Verification**
- 170 files / 1170 unit tests pass; typecheck + lint clean.
- Live `/api/road-matching` returns real geometry and street names against the
  running router.

**Remaining risk**
- SB-014/015 (ordered Must traversal, bounded Prefer candidates) not yet
  implemented; Must stays disabled behind the flag.
- edge_id detail requires a graph that encodes it; until then matches report
  "unresolved" honestly.

**Commit**
- Pending at phase close.

## 2026-08-05 — Phase 3 offline and storage (part 1)

**Goal**
Large-download confirmation must start exactly one job (SB-009); Wi-Fi update
must prove or confirm connection; region readiness must be honest (SB-020);
service-worker caches must be bounded and separated (SB-019).

**Repository evidence**
- RegionDownloadsPanel: `downloadRegion` now takes an explicit `confirmed`
  flag — the confirm handler passes it, so a large download can never
  re-prompt forever; resuming a paused download carries the earlier
  confirmation forward. "Update all on Wi-Fi" now uses a conservative
  connection check and confirms when the link is not provably Wi-Fi
  (cellular/unknown).
- `src/lib/offline/readiness.ts` (new): OfflineReadiness model
  (shell/route/routing/mapTiles + per-region status + warnings) and an honest
  level label (Level 1/2/3). Unit tests cover all levels and warning paths.
- `public/sw.js`: rewritten with four bounded, separated caches — shell
  (network-first), build assets (cache-first, 200 cap), tiles (bounded
  cache-first, 500 cap), images (stale-while-revalidate, 100 cap); same-origin
  /api/* still never cached; activate prunes stale switchback-* caches and
  trims all caches to their caps. PWA e2e updated to the build cache name.

**Decision**
Pause/resume and atomic activation already exist in the v2 download client and
manifest flow (verified earlier); this pass fixes the confirmation loop, the
unverified Wi-Fi claim, the missing readiness model, and the unbounded cache.

**Verification**
- Readiness tests + region-download + offline-recovery unit tests pass;
  typecheck + lint clean; full suite running.

**Remaining risk**
- SB-017/018 already largely present; regional offline rerouting E2E and
  low-quota/eviction qualification remain for the release phase.
- The suite/rebuild no-op controls are still presentational; wiring or
  removing them is tracked in the backlog (Phase 3 part 2).

**Commit**
- Pending at phase close.

## 2026-08-05 — Phase 4 part 1: unified settings, stable bike identity, signed learning

**Goal**
P0 SB-010 (negative learning) and SB-011 (stable bike identity), plus the
versioned settings foundation of SB-023.

**Repository evidence**
- `src/lib/settings/rider-settings.ts` (new): versioned RiderSettings with
  stable RiderBike records (id/name/category/fuel/gravel/rough/unknown
  surface), migrateLegacySettings from the old "switchback:rider-profile"
  fields, load/save with an automatic one-time migration, getActiveBike.
- `src/lib/intelligence/rider-preferences.ts`: signed model — positive and
  negative feature centroids; signal weights 5★+2/4★+1/3★0/2★−1/1★−2,
  accepted +1, ignored −0.5, less-like-this −2, manual-edit +1,
  completed-ride +0.5. preferred* values derive from the positive centroid
  only, so a dislike can never raise affinity; fit scoring subtracts a
  negative-centroid resemblance penalty.
- `rider-preference-library.ts`: keys preferences by the stable bike id
  (schema field renamed motorcycleId→bikeId); PlannerShell and RouteRating
  read the active bike from settings — RouteRating's free-text "Motorcycle
  name" identity input is gone (display name is never the learning key).

**Decision**
Settings is the single source for bike identity and learning enablement;
legacy name-keyed preferences are not silently re-keyed (unprovable mapping)
but new signals use the stable id, which is what future sessions read.

**Verification**
- New/updated tests: rider-settings migration (4), signed preference
  regressions (5), route-comparison rating identity (6); all pass.
- typecheck + lint clean; full suite running.

**Remaining risk**
- ProfilePanel still stores legacy fields; the UI rewrite to the settings
  model is Phase 5. PlannerShell component split and explicit state-machine
  controllers remain Phase 4 part 2.

**Commit**
- Pending at phase close.

## 2026-08-05 — Free Ride directionality and expiry (SB-030)

**Goal**
A suggestion must never sit behind the rider or outlive its decision point
(SB-030): heading is enforced, expired suggestions disappear, and polling
continues while a suggestion is visible.

**Repository evidence**
- `src/lib/recommendation/free-ride.ts`: initial-bearing math + heading-delta
  check; `rankFreeRideCandidates` rejects candidates whose approach diverges
  >100° from the current heading (unknown heading = no guess, candidate
  still eligible); reducer gains an `expire` action and the `show` action
  refuses already-expired suggestions.
- `PlannerShell` Free Ride poll loop no longer stops while a suggestion is
  visible — it expires stale suggestions on the next poll.

**Verification**
- 5 new SB-030 tests (behind rejected, ahead accepted, unknown heading,
  expired never shown, visible suggestion expires) — 11 Free Ride tests
  total pass; typecheck + lint clean; free-ride e2e passes with a
  dynamic expiresAt fixture.

**Remaining risk**
- Graph-backed candidate generation (SB-029) and accepted-fragment traversal
  validation (SB-031) remain; suggestions are still curvature-database
  candidates labeled Experimental.

**Commit**
- Pending at phase close.

## 2026-08-05 — Phase 4 part 2: state machine guard + unified export

**Goal**
SB-022 (explicit planner lifecycle state machine) and SB-024 (unified
versioned export/restore).

**Repository evidence**
- `src/lib/domain/planner-state-machine.ts`: allowed-transition map per the
  spec (idle → interpreting → geocoding → routing-primary → alternatives →
  ready; manual idle → routing-primary; replan ready → routing-primary;
  terminal cancelled/error → idle). The store's setPlanningPhase ignores
  illegal transitions — no combination of unrelated booleans can fake a
  lifecycle state. 8 new tests (edges, invalid jumps, store guard, intent
  shortcut).
- `src/lib/settings/unified-export.ts`: versioned backup payload (settings,
  bikes, preferences, routes, trips, ride metadata summary — never raw GPS
  trails) with strict validation. 3 tests (round-trip, rejection, no trails).
- PlannerShell component-level split remains the open Phase 4 item; the
  existing hook decomposition (usePlannerRideIntent, usePlannerLibraries,
  useNavigationSessionController, usePlannerHome, navigation/offline
  reducers) already provides the controller boundaries.

**Verification**
- 1196 unit tests pass; real-router 5/5 through the guarded lifecycle;
  typecheck + lint clean.

**Remaining risk**
- The 1,440-line PlannerShell remains a composition point; the UX
  restructure (Phase 5) will pull more of it into controllers.

**Commit**
- Pending at phase close.

## 2026-08-05 — Diagnostics aggregation (SB-028)

**Goal**
One honest diagnostics snapshot: app version, offline readiness, storage
usage/persistence, and provider health — no invented "all good" claims.

**Repository evidence**
- `src/lib/domain/diagnostics.ts`: DiagnosticsSnapshot + summarizeStorage +
  providerLabel; 3 tests (storage honesty, provider labels, readiness
  warnings).
- UI panel wiring deferred to the Phase 5 UX pass; the aggregation layer is
  testable without React.

**Verification**
- 1199 unit tests total; typecheck + lint clean.

**Commit**
- Pending.

## 2026-08-05 — Phase 5 UX (bounded slices)

**Goal**
SB-025 (mobile flow stages), SB-028 (diagnostics panel wired), with the
desktop three-pane editor (SB-026) deferred per the spec's cut rule — the
existing map + route-rack + profile surfaces stay coherent, and the stage
indicator makes the flow explicit without a risky mid-session rebuild.

**Repository evidence**
- PlannerDeck now labels the mobile planning stage explicitly
  (Search → Choose → Edit → Prepare) in both the expanded header and the
  minimized header; the view model exposes routesCount to distinguish Choose
  from Prepare. Component tests cover Search and Prepare.
- ProfilePanel reads/writes the versioned RiderSettings store (earlier
  commit) and gained a Diagnostics toggle that collects the live snapshot
  (readiness + storage + provider health) and renders DiagnosticsPanel.
- `src/lib/client/diagnostics.ts` collector never fabricates values;
  `DiagnosticsPanel` states exactly what is known.

**Verification**
- 1201 unit tests pass; critical e2e 30/30 (the Free Ride journey fixture's
  expiresAt is now dynamic after the SB-030 guard); typecheck + lint clean.

**Deferred (recorded, not dropped)**
- SB-026 desktop three-pane workspace (Builder | Map | Inspect) — the largest
  remaining UI item; existing surfaces already provide the content.

**Commit**
- Pending.

## 2026-08-05 — Phase 6 (bounded slice): accepted-fragment traversal validation (SB-031)

**Goal**
The acceptance route must actually traverse the suggested road, and a failed
conversion is surfaced honestly instead of claiming success (SB-031).

**Repository evidence**
- `fragmentTraversalRatio(routeGeometry, fragment)` in free-ride.ts reuses
  the geometry-overlap scorer; handleFreeRideAccept now warns when the
  routed path covers <50% of the suggested fragment and only claims success
  when it does.
- Graph-backed candidate generation (SB-029 — routing each curvature
  fragment through the provider) and learning calibration remain deferred:
  candidates are real curvature-database segments labeled Experimental, and
  the signed model already carries confidence tiers for calibration.

**Verification**
- 3 new SB-031 tests; 14 Free Ride tests total; typecheck + lint clean.

**Commit**
- Pending.

## 2026-08-06 — Phase 3 part 2: corridor rebuild + download-control wiring

**Goal**
The "Rebuild now" corridor control in RegionDownloadsPanel was a no-op
(`onBuildCorridor` never passed), and the panel duplicated the
download-mode picker that PlannerDeck's OfflinePackModal already owns.
Per the disposition ("wire or remove"), wire the rebuild and remove the
redundant picker.

**Repository evidence**
- `RegionDownloadsPanel.tsx`: dropped `onDownloadModeChange` prop, local
  `downloadMode` state, and the duplicate `DownloadModePicker` render; the
  corridor-rebuild prompt now calls `onBuildCorridor` (already stubbed via
  `handleCorridorRebuild`).
- `PlannerShell.tsx`: extracted the offline-pack save into
  `saveOfflinePack(route, options)` (shared by `onSaveOffline`), added
  `handleBuildCorridor` (resolves the pending route stub against the current
  route list and re-runs the pack save), and passed `onBuildCorridor` to the
  panel.

**Verification**
- 2 new region-downloads-panel tests (prompt appears when a downloaded
  region is newer; "Rebuild now" passes the pending route); full suite
  176 files / 1209 passed | 1 skipped; typecheck + lint clean.

**Deferred**
- Phase 3 regional offline E2E still open; Phases 4–7 pending.

**Commit**
- Pending.

## 2026-08-12 — P32 real WebAuthn identity ceremony and CSRF boundary

**Goal**
Replace the injected passkey verifier seam with a real WebAuthn server/browser
ceremony while keeping the local rider path account-free.

**Repository evidence**
- `@simplewebauthn/server` and `@simplewebauthn/browser` 13.3.0 now back
  registration and discoverable authentication under `/api/identity/*`.
- The server verifies the configured origin/RP ID, presence, user verification,
  one-time challenge, stored public key, and monotonic signature counter before
  issuing the existing signed session.
- Community and sync cookie mutations use the shared CSRF boundary; bearer
  clients remain supported. Profile exposes optional Create/Use passkey
  actions without gating planning or riding.

**Verification**
- the validation host Node 24 focused identity: 10 files / 30 tests passed.
- Full Vitest: 201 files / 1,282 passed / 1 skipped.
- Standard browser profiles: 32/32; critical Chromium/WebKit: 30/30;
  PWA: 2/2; memory soak: 10/10 cycles; real GraphHopper fixture: 5/5.
- Lint, typecheck, build, and `git diff --check` passed. The real-router run
  explicitly started the fixture and set `GRAPHHOPPER_URL`.

**Open gates**
- Physical authenticator/iOS passkey UI, authenticated browser publish/sync,
  external riders, production edge/origin, field rides, and sync recovery
  remain unproven. `npm audit --omit=dev` reports four high advisories; no
  forced dependency upgrade was applied.

**Commit**
- Pending in the dirty worktree; prior design and plan commits are `9150d28`
  and `a381d5d`.
